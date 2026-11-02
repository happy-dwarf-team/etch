#include "pick.hpp"

#include <windows.h>

#include <algorithm>
#include <cctype>

namespace etch {
namespace {

constexpr std::uint64_t kButtonBits = MK_LBUTTON | MK_RBUTTON | MK_MBUTTON | MK_XBUTTON1 | MK_XBUTTON2;

std::string Lower(std::string_view text) {
    std::string out(text);
    for (char& c : out) {
        c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
        if (c == '\\') c = '/';
    }
    return out;
}

bool EqualsIgnoringCase(std::string_view a, std::string_view b) { return Lower(a) == Lower(b); }

std::string Rect(const UiWidget& w) {
    return "[" + std::to_string(w.x) + "," + std::to_string(w.y) + "," + std::to_string(w.width) + "," +
           std::to_string(w.height) + "]";
}

std::string Screen(int width, int height) {
    json::Writer w;
    return w.Uint("width", static_cast<std::uint64_t>(std::max(width, 0)))
        .Uint("height", static_cast<std::uint64_t>(std::max(height, 0)))
        .Finish();
}

}  // namespace

std::string_view TypeName(std::uint32_t type) {
    switch (type) {
        case 1:
            return "window";
        case 2:
            return "button";
        case 3:
            return "icon";
        case 4:
            return "text";
        case 5:
            return "listbox";
        case 6:
            return "checkbox";
        case 7:
            return "editbox";
        default:
            return "other";
    }
}

std::int64_t HotKey::Code() const {
    return static_cast<std::int64_t>(vk & 0xFF) | (shift ? 0x100 : 0) | (ctrl ? 0x200 : 0) | (alt ? 0x400 : 0);
}

HotKey HotKey::FromCode(std::int64_t code) {
    return {static_cast<unsigned>(code & 0xFF), (code & 0x200) != 0, (code & 0x100) != 0, (code & 0x400) != 0};
}

std::optional<HotKey> ParseKey(std::string_view text) {
    HotKey key;
    while (!text.empty()) {
        const std::size_t plus = text.find('+');
        const std::string part = Lower(text.substr(0, plus));
        text = plus == std::string_view::npos ? std::string_view{} : text.substr(plus + 1);
        const bool last = plus == std::string_view::npos;
        if (!last) {
            if (part == "ctrl" || part == "control") {
                key.ctrl = true;
            } else if (part == "shift") {
                key.shift = true;
            } else if (part == "alt") {
                key.alt = true;
            } else {
                return std::nullopt;
            }
            if (text.empty()) return std::nullopt;  // "Ctrl+" has no key
            continue;
        }
        if (part.size() == 1 && ((part[0] >= 'a' && part[0] <= 'z') || (part[0] >= '0' && part[0] <= '9'))) {
            key.vk = static_cast<unsigned>(std::toupper(static_cast<unsigned char>(part[0])));
        } else if (part.size() >= 2 && part.size() <= 3 && part[0] == 'f') {
            int n = 0;
            for (std::size_t i = 1; i < part.size(); ++i) {
                if (part[i] < '0' || part[i] > '9') return std::nullopt;
                n = n * 10 + (part[i] - '0');
            }
            if (n < 1 || n > 24) return std::nullopt;
            key.vk = static_cast<unsigned>(VK_F1 + n - 1);
        } else {
            return std::nullopt;
        }
    }
    if (key.vk == 0 || (!key.ctrl && !key.alt)) return std::nullopt;
    return key;
}

std::string FormatKey(const HotKey& key) {
    std::string out;
    if (key.ctrl) out += "Ctrl+";
    if (key.shift) out += "Shift+";
    if (key.alt) out += "Alt+";
    if (key.vk >= VK_F1 && key.vk <= VK_F24) {
        out += "F" + std::to_string(key.vk - VK_F1 + 1);
    } else {
        out += static_cast<char>(key.vk);
    }
    return out;
}

bool IsMouseMessage(std::uint32_t message) { return message >= WM_MOUSEFIRST && message <= WM_MOUSELAST; }

MouseFilter FilterMouse(std::uint32_t message, std::uint64_t wparam) {
    switch (message) {
        case WM_LBUTTONDOWN:
            return {MouseAction::Pick, 0, 0};
        case WM_LBUTTONUP:
        case WM_LBUTTONDBLCLK:
        case WM_RBUTTONDOWN:
        case WM_RBUTTONUP:
        case WM_RBUTTONDBLCLK:
        case WM_MBUTTONDOWN:
        case WM_MBUTTONUP:
        case WM_MBUTTONDBLCLK:
        case WM_XBUTTONDOWN:
        case WM_XBUTTONUP:
        case WM_XBUTTONDBLCLK:
        case WM_MOUSEHWHEEL:
            return {MouseAction::Drop, 0, 0};
        case WM_MOUSEWHEEL: {
            const auto delta = static_cast<short>(HIWORD(static_cast<DWORD>(wparam)));
            return {MouseAction::Wheel, 0, delta > 0 ? 1 : delta < 0 ? -1 : 0};
        }
        default:
            // WM_MOUSEMOVE above all: SDL compares these bits with its own state.
            return {MouseAction::Pass, wparam & ~kButtonBits, 0};
    }
}

std::vector<std::size_t> StackAt(const std::vector<UiWidget>& widgets, int x, int y, int screen_width,
                                 int screen_height, std::uint64_t hovered) {
    std::optional<std::size_t> top;
    for (std::size_t i = 0; i < widgets.size() && !top; ++i) {
        if (hovered != 0 && widgets[i].id == hovered) top = i;
    }
    // Where each widget stands to the hovered one: 0 inside it, 1 its parent, 2 anything else.
    std::vector<int> family(widgets.size(), 2);
    std::vector<int> depth(widgets.size(), 0);
    if (top) {
        int d = 0;
        for (const std::size_t i : ChainOf(widgets, *top)) {
            family[i] = 1;
            depth[i] = d++;
        }
        for (std::size_t i = *top + 1; i < widgets.size(); ++i) {
            const int parent = widgets[i].parent;
            if (parent >= 0 &&
                (static_cast<std::size_t>(parent) == *top || family[static_cast<std::size_t>(parent)] == 0)) {
                family[i] = 0;
            }
        }
    }
    std::vector<std::size_t> out;
    for (std::size_t i = 0; i < widgets.size(); ++i) {
        const UiWidget& w = widgets[i];
        if ((top && i == *top) || !w.Visible() || !w.Holds(x, y)) continue;
        const bool whole_screen =
            w.parent == -1 && w.x <= 0 && w.y <= 0 && w.x + w.width >= screen_width && w.y + w.height >= screen_height;
        if (!whole_screen) out.push_back(i);
    }
    const auto area = [&](std::size_t i) {
        return static_cast<std::int64_t>(widgets[i].width) * static_cast<std::int64_t>(widgets[i].height);
    };
    std::stable_sort(out.begin(), out.end(), [&](std::size_t a, std::size_t b) {
        if (family[a] != family[b]) return family[a] < family[b];
        if (family[a] == 1) return depth[a] < depth[b];
        return area(a) < area(b);
    });
    if (top) out.insert(out.begin(), *top);
    return out;
}

std::vector<std::size_t> ChainOf(const std::vector<UiWidget>& widgets, std::size_t index) {
    std::vector<std::size_t> chain;
    for (int i = static_cast<int>(index); i >= 0 && static_cast<std::size_t>(i) < widgets.size();
         i = widgets[static_cast<std::size_t>(i)].parent) {
        chain.push_back(static_cast<std::size_t>(i));
        if (chain.size() > widgets.size()) break;  // never loop on a broken read
    }
    return chain;
}

void Sources::Set(std::map<std::string, std::string> by_path) {
    by_path_.clear();
    for (auto& [path, mod] : by_path) by_path_[Lower(path)] = std::move(mod);
}

std::string_view Sources::Of(std::string_view game_path) const {
    const auto it = by_path_.find(Lower(game_path));
    return it == by_path_.end() ? std::string_view("EU4") : std::string_view(it->second);
}

std::string ShortPath(const std::vector<const UiWidget*>& chain) {
    std::vector<std::string> names;
    for (auto it = chain.rbegin(); it != chain.rend(); ++it) names.push_back((*it)->name.empty() ? "?" : (*it)->name);
    std::string out;
    const auto add = [&](const std::string& part) { out += (out.empty() ? "" : "/") + part; };
    if (names.size() <= 4) {
        for (const std::string& n : names) add(n);
    } else {
        add(names.front());
        add("\xE2\x80\xA6");  // …
        add(names[names.size() - 2]);
        add(names.back());
    }
    return out;
}

std::string LabelText(const std::vector<const UiWidget*>& chain, const Sources& sources, std::size_t stack_index,
                      std::size_t stack_size) {
    if (chain.empty()) return "not a GUI widget";
    const UiWidget& w = *chain.front();
    std::string out = (w.name.empty() ? std::string("(no name)") : w.name) + "  \xC2\xB7  " +
                      std::string(TypeName(w.type)) + "  \xC2\xB7  " + std::to_string(w.width) + "\xC3\x97" +
                      std::to_string(w.height) + "\n";
    if (w.Stale()) {
        out += "stale: a reload freed its definition; opens by name\n";
    } else if (!w.file.empty()) {
        out += std::string(sources.Of(w.file)) + " \xE2\x80\xBA " + w.file;
        if (w.line > 0) out += ":" + std::to_string(w.line);
        out += "\n";
    } else {
        out += "no definition file\n";
    }
    out += ShortPath(chain);
    if (stack_size > 1) {
        out += "\n" + std::to_string(stack_index + 1) + " of " + std::to_string(stack_size) +
               " under the pointer \xC2\xB7 wheel to step";
    }
    return out;
}

std::uint64_t UnixMs() {
    FILETIME now;
    GetSystemTimePreciseAsFileTime(&now);
    const std::uint64_t ticks = (static_cast<std::uint64_t>(now.dwHighDateTime) << 32) | now.dwLowDateTime;
    return (ticks - 116444736000000000ull) / 10000ull;
}

std::string BadgeText(const HotKey& key) { return "Etch pick \xE2\x80\x94 " + FormatKey(key) + " to leave"; }

std::string PickEvent(std::uint64_t seq, const std::vector<UiWidget>& widgets, const std::vector<std::size_t>& chain,
                      std::size_t stack_index, std::size_t stack_size, int screen_width, int screen_height, bool front,
                      const PickTimes& times) {
    std::string items = "[";
    for (const std::size_t i : chain) {
        const UiWidget& w = widgets[i];
        json::Writer item;
        item.Str("name", w.name).Str("type", TypeName(w.type)).Str("path", w.path);
        if (w.file.empty()) {
            item.Null("file");
        } else {
            item.Str("file", w.file);
        }
        item.Uint("line", w.line).Raw("rect", Rect(w)).Bool("visible", w.Visible()).Bool("stale", w.Stale());
        items += (items.size() > 1 ? "," : "") + item.Finish();
    }
    items += "]";
    const std::string window = chain.empty() ? std::string() : widgets[chain.back()].name;
    json::Writer stack;
    json::Writer timing;
    json::Writer w;
    return w.Str("event", "pick")
        .Uint("seq", seq)
        .Str("window", window)
        .Raw("screen", Screen(screen_width, screen_height))
        .Raw("chain", items)
        .Raw("stack", stack.Uint("index", stack_index).Uint("size", stack_size).Finish())
        .Bool("front", front)
        .Raw("timing", timing.Uint("click_unix_ms", times.click_unix_ms)
                           .Fixed("click_to_frame_ms", times.click_to_frame_ms)
                           .Fixed("read_ms", times.read_ms)
                           .Finish())
        .Finish();
}

std::string DateText(const GameDate& date) {
    return std::to_string(date.year) + "." + std::to_string(date.month) + "." + std::to_string(date.day);
}

Snapshot SnapshotOf(const std::vector<UiWidget>& widgets, std::size_t root, int screen_width, int screen_height,
                    const std::optional<GameDate>& date, double read_ms) {
    Snapshot out;
    std::vector<bool> inside(widgets.size(), false);
    std::string items = "[";
    for (std::size_t i = root; i < widgets.size(); ++i) {
        const int parent = widgets[i].parent;
        inside[i] = i == root ||
                    (parent >= 0 && static_cast<std::size_t>(parent) < i && inside[static_cast<std::size_t>(parent)]);
        if (!inside[i]) continue;
        const UiWidget& w = widgets[i];
        if (w.Stale()) {
            ++out.stale;
            continue;
        }
        json::Writer item;
        item.Str("path", w.path)
            .Str("type", TypeName(w.type))
            .Bool("visible", w.Visible())
            .Bool("enabled", w.Enabled())
            .Bool("checked", w.Checked());
        if (w.has_text) {
            item.Str("text", w.text);
            if (!w.markup.empty() && w.markup != w.text) item.Str("markup", w.markup);
        } else {
            item.Null("text");
        }
        item.Raw("rect", Rect(w));
        items += (items.size() > 1 ? "," : "") + item.Finish();
        ++out.widgets;
    }
    items += "]";
    const UiWidget& top = widgets[root];
    std::string members = json::Quote("window") + ":" + json::Quote(top.name) + ",";
    members += json::Quote("file") + ":" + (top.file.empty() ? std::string("null") : json::Quote(top.file)) + ",";
    members += json::Quote("screen") + ":" + Screen(screen_width, screen_height) + ",";
    members += json::Quote("date") + ":" + (date ? json::Quote(DateText(*date)) : std::string("null")) + ",";
    members += json::Quote("widgets") + ":" + items + ",";
    members += json::Quote("stale") + ":" + std::to_string(out.stale) + ",";
    json::Writer ms;
    const std::string read = ms.Fixed("read_ms", read_ms).Finish();
    members += read.substr(1, read.size() - 2);
    out.members = std::move(members);
    return out;
}

std::optional<std::size_t> FindRoot(const std::vector<UiWidget>& widgets, std::string_view name, bool& stale) {
    stale = false;
    std::optional<std::size_t> found;
    for (std::size_t i = 0; i < widgets.size(); ++i) {
        const UiWidget& w = widgets[i];
        if (w.parent != -1 || !w.Visible() || !EqualsIgnoringCase(w.name, name)) continue;
        if (!w.Stale()) {
            stale = false;
            return i;
        }
        if (!found) {
            found = i;
            stale = true;
        }
    }
    return stale ? found : std::nullopt;
}

std::optional<std::string> ReadPickModeRequest(const json::Value& request, PickModeRequest& out) {
    if (const json::Value* on = request.Find("on"); on != nullptr && on->kind() != json::Value::Kind::Null) {
        if (!on->AsBool()) return "\"on\" must be true, false or null";
        out.on = *on->AsBool();
    }
    if (const json::Value* key = request.Find("key"); key != nullptr) {
        const std::optional<std::string_view> text = key->AsString();
        if (!text) return "\"key\" must be a string";
        out.key = ParseKey(*text);
        if (!out.key) return "\"key\" must be Ctrl or Alt with a letter, a digit or F1-F24, such as Ctrl+Shift+E";
    }
    if (const json::Value* sources = request.Find("sources"); sources != nullptr) {
        const auto* members = sources->AsObject();
        if (members == nullptr) return "\"sources\" must be an object of game paths and mod names";
        std::map<std::string, std::string> by_path;
        for (const auto& [path, mod] : *members) {
            const std::optional<std::string_view> name = mod.AsString();
            if (!name) return "\"sources\" must map game paths to mod names";
            by_path.emplace(path, std::string(*name));
        }
        out.sources = std::move(by_path);
    }
    if (const json::Value* front = request.Find("front"); front != nullptr) {
        if (!front->AsBool()) return "\"front\" must be true or false";
        out.front = *front->AsBool();
    }
    if (const json::Value* editor = request.Find("editor"); editor != nullptr) {
        const json::Value* pid = editor->Find("pid");
        const json::Value* title = editor->Find("title");
        const std::optional<std::uint64_t> id = pid != nullptr ? pid->AsUint() : std::nullopt;
        const std::optional<std::string_view> text = title != nullptr ? title->AsString() : std::nullopt;
        if (!id || *id > 0xFFFFFFFFu || !text) return "\"editor\" must have a \"pid\" and a \"title\"";
        out.editor_pid = static_cast<std::uint32_t>(*id);
        out.editor_title = std::string(*text);
    }
    return std::nullopt;
}

}  // namespace etch
