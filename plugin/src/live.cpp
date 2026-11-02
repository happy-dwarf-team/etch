#include "live.hpp"

#include <algorithm>
#include <iterator>
#include <memory>
#include <set>
#include <utility>

namespace etch {
namespace {

constexpr std::size_t kMaxItems = 64;   // lines, files or windows in one request
constexpr std::size_t kMaxToken = 260;  // a file name or a texture path

char Lower(char c) { return c >= 'A' && c <= 'Z' ? static_cast<char>(c - 'A' + 'a') : c; }

bool EqualNoCase(std::string_view a, std::string_view b) {
    if (a.size() != b.size()) return false;
    for (std::size_t i = 0; i < a.size(); ++i) {
        if (Lower(a[i]) != Lower(b[i])) return false;
    }
    return true;
}

bool EndsWithNoCase(std::string_view text, std::string_view suffix) {
    return text.size() >= suffix.size() && EqualNoCase(text.substr(text.size() - suffix.size()), suffix);
}

// A game path as the game compares it: lower case, `/`, no doubled slashes.
std::string PathKey(std::string_view path) {
    std::string out;
    for (const char c : path) {
        const char s = c == '\\' ? '/' : Lower(c);
        if (s == '/' && !out.empty() && out.back() == '/') continue;
        out += s;
    }
    return out;
}

// Printable ASCII without spaces: one console token.
bool IsToken(std::string_view text) {
    if (text.empty() || text.size() > kMaxToken) return false;
    for (const char c : text) {
        const auto u = static_cast<unsigned char>(c);
        if (u <= 0x20 || u > 0x7E) return false;
    }
    return true;
}

std::vector<std::string_view> Split(std::string_view line) {
    std::vector<std::string_view> out;
    std::size_t at = 0;
    while (at < line.size()) {
        while (at < line.size() && line[at] == ' ') ++at;
        std::size_t end = at;
        while (end < line.size() && line[end] != ' ') ++end;
        if (end > at) out.push_back(line.substr(at, end - at));
        at = end;
    }
    return out;
}

// Reads an optional array of strings, each accepted by `valid`.
std::optional<std::string> ReadStrings(const json::Value& request, std::string_view key, bool required,
                                       bool (*valid)(std::string_view), std::vector<std::string>& out) {
    const json::Value* member = request.Find(key);
    if (member == nullptr) {
        if (required) return "\"" + std::string(key) + "\" is missing";
        return std::nullopt;
    }
    const std::vector<json::Value>* items = member->AsArray();
    if (items == nullptr || items->size() > kMaxItems || (required && items->empty())) {
        return "\"" + std::string(key) + "\" must be an array of 1 to " + std::to_string(kMaxItems) + " strings";
    }
    for (const json::Value& item : *items) {
        const std::optional<std::string_view> text = item.AsString();
        if (!text || !valid(*text)) return "\"" + std::string(key) + "\" holds a value that is not allowed";
        out.emplace_back(*text);
    }
    return std::nullopt;
}

bool AnyLine(std::string_view) { return true; }

const Root* FindRoot(const std::vector<Root>& roots, std::string_view name) {
    for (const Root& root : roots) {
        if (EqualNoCase(root.name, name)) return &root;
    }
    return nullptr;
}

json::Writer Ok(std::uint64_t id) {
    json::Writer w;
    w.Uint("id", id).Bool("ok", true);
    return w;
}

std::string Error(std::uint64_t id, std::string_view code, std::string_view message) {
    json::Writer w;
    return w.Uint("id", id).Bool("ok", false).Str("error", code).Str("message", message).Finish();
}

std::string LineJson(const LineResult& line) {
    json::Writer w;
    return w.Str("line", line.line).Bool("success", line.success).Str("text", line.text).Fixed("ms", line.ms).Finish();
}

std::string LinesJson(const std::vector<LineResult>& lines) {
    std::string out = "[";
    for (const LineResult& line : lines) {
        if (out.size() > 1) out += ',';
        out += LineJson(line);
    }
    return out + "]";
}

std::string NamesJson(const std::vector<std::string>& names) {
    std::string out = "[";
    for (const std::string& name : names) {
        if (out.size() > 1) out += ',';
        out += json::Quote(name);
    }
    return out + "]";
}

std::string ReselectJson(const Reselect& r) {
    json::Writer w;
    w.Uint("province", static_cast<std::uint64_t>(r.province)).Str("outcome", r.outcome);
    if (r.window.empty()) {
        w.Null("window");
    } else {
        w.Str("window", r.window);
    }
    return w.Finish();
}

}  // namespace

std::string_view ProvinceView::Window() const {
    if (view_shown) return "provinceview";
    if (colonisation_shown) return "colonisationpanel";
    return {};
}

std::string OutcomeName(std::uint32_t outcome) {
    // TongsNavigationOutcome, in its order.
    static constexpr std::string_view kNames[] = {
        "opened",   "not_in_game", "unknown_province", "not_selectable", "terra_incognita", "selection_blocked",
        "discover", "suspended",   "tripped",          "faulted",        "read_failed",
    };
    if (outcome < std::size(kNames)) return std::string(kNames[outcome]);
    return "outcome_" + std::to_string(outcome);
}

std::optional<std::string> AllowedLine(std::string_view line, std::vector<std::string>& tokens) {
    tokens.clear();
    const std::vector<std::string_view> parts = Split(line);
    if (parts.empty()) return "an empty console line";
    for (const std::string_view part : parts) {
        if (!IsToken(part)) return "a console line holds a token that is not printable ASCII or too long";
    }
    const std::string_view command = parts[0];
    if (EqualNoCase(command, "reloadloc") && parts.size() == 1) {
        tokens.emplace_back("reloadloc");
        return std::nullopt;
    }
    if (EqualNoCase(command, "reload") && parts.size() == 2) {
        // Only .gui files: never `guianim`, `texture`, `assets` or the other
        // reload targets (H10), and no folder, which `reload` does not take.
        const std::string_view name = parts[1];
        if (!EndsWithNoCase(name, ".gui") || name.size() == 4 || name.find('/') != std::string_view::npos ||
            name.find('\\') != std::string_view::npos) {
            return "reload takes a .gui file name only";
        }
        tokens = {"reload", std::string(name)};
        return std::nullopt;
    }
    if (EqualNoCase(command, "reloadtexture") && parts.size() == 2) {
        tokens = {"reloadtexture", std::string(parts[1])};
        return std::nullopt;
    }
    return "the live game runs reload <file>.gui, reloadloc and reloadtexture <texture> only";
}

bool IsConfirmPath(std::string_view path) { return path == "DefaultConfirm/AgreeButton"; }

std::optional<std::string> ReadReloadRequest(const json::Value& request, ReloadRequest& out) {
    out = {};
    if (auto error = ReadStrings(request, "lines", true, AnyLine, out.lines)) return error;
    std::vector<std::string> tokens;
    for (const std::string& line : out.lines) {
        if (auto error = AllowedLine(line, tokens)) return *error + ": " + json::Quote(line);
    }
    if (auto error = ReadStrings(request, "check", false, IsToken, out.check)) return error;
    if (auto error = ReadStrings(request, "close", false, IsToken, out.close)) return error;
    if (auto error = ReadStrings(request, "keep_hidden", false, IsToken, out.keep_hidden)) return error;
    if (const json::Value* reselect = request.Find("reselect")) {
        const std::optional<bool> value = reselect->AsBool();
        if (!value) return "\"reselect\" must be true or false";
        out.reselect = *value;
    }
    return std::nullopt;
}

StaleCheck CompareRoots(const std::vector<Root>& before, const std::vector<Root>& after,
                        const std::vector<std::string>& files) {
    std::set<std::string> keys;
    for (const std::string& file : files) keys.insert(PathKey(file));
    std::set<std::uint64_t> built;
    StaleCheck out;
    for (const Root& root : before) {
        if (!root.file.empty() && keys.contains(PathKey(root.file)) && built.insert(root.id).second) ++out.checked;
    }
    for (const Root& root : after) {
        if (built.contains(root.id)) out.stale.push_back(root);
    }
    return out;
}

std::string ReloadAnswer(std::uint64_t id, const ReloadResult& result) {
    if (!result.error.empty()) {
        json::Writer w;
        return w.Uint("id", id)
            .Bool("ok", false)
            .Str("error", result.error)
            .Str("message", result.message)
            .Raw("lines", LinesJson(result.lines))
            .Finish();
    }
    json::Writer w = Ok(id);
    w.Raw("lines", LinesJson(result.lines))
        .Raw("closed", NamesJson(result.closed))
        .Raw("hidden_again", NamesJson(result.hidden_again))
        .Bool("menu_undone", result.menu_undone)
        .Bool("tree", result.tree);
    if (result.tree) {
        std::string stale = "[";
        for (const Root& root : result.stale.stale) {
            if (stale.size() > 1) stale += ',';
            json::Writer s;
            stale += s.Str("name", root.name).Bool("visible", root.visible).Finish();
        }
        stale += "]";
        std::string visible = "[";
        for (const Root& root : result.visible) {
            if (visible.size() > 1) visible += ',';
            json::Writer v;
            visible += v.Str("name", root.name).Str("file", root.file).Finish();
        }
        visible += "]";
        json::Writer roots;
        w.Uint("checked", result.stale.checked)
            .Raw("stale", stale)
            .Raw("visible", visible)
            .Raw("roots", roots.Uint("before", result.roots_before).Uint("after", result.roots_after).Finish());
    }
    if (result.reselected) w.Raw("reselected", ReselectJson(*result.reselected));
    return w.Fixed("queued_ms", result.queued_ms).Fixed("run_ms", result.run_ms).Finish();
}

std::string ReselectAnswer(std::uint64_t id, const ReselectResult& result) {
    if (!result.error.empty()) return Error(id, result.error, result.message);
    std::string line = Ok(id).Fixed("queued_ms", result.queued_ms).Finish();
    line.pop_back();
    std::string members = ReselectJson(result.reselect);
    return line + "," + members.substr(1);
}

std::string SaveAnswer(std::uint64_t id, const SaveResult& result) {
    if (!result.error.empty()) return Error(id, result.error, result.message);
    return Ok(id)
        .Bool("success", result.line.success)
        .Str("text", result.line.text)
        .Fixed("ms", result.line.ms)
        .Fixed("queued_ms", result.queued_ms)
        .Finish();
}

std::string ConfirmAnswer(std::uint64_t id, const ConfirmResult& result) {
    if (!result.error.empty()) return Error(id, result.error, result.message);
    json::Writer w = Ok(id);
    w.Bool("found", result.press.found).Bool("pressed", result.press.pressed);
    return w.Fixed("queued_ms", result.queued_ms).Finish();
}

std::optional<Refusal> LiveJobs::Begin() {
    if (faulted_.load()) {
        return Refusal{"console_broken", "a console call faulted earlier; the live game needs a restart"};
    }
    if (const std::optional<GameSession> session = env_.session ? env_.session() : std::nullopt) {
        if (session->multiplayer) return Refusal{"not_available", "reload is not available in multiplayer"};
        if (session->ironman) return Refusal{"not_available", "reload does not work in ironman"};
    }
    bool idle = false;
    if (!busy_.compare_exchange_strong(idle, true)) return Refusal{"busy", "another job of the live game runs"};
    return std::nullopt;
}

bool LiveJobs::Run(const std::vector<std::string>& tokens, LineResult& record, std::string& error,
                   std::string& message) {
    for (const std::string& token : tokens) record.line += (record.line.empty() ? "" : " ") + token;
    const double started = env_.now_ms();
    const ConsoleResult answer = env_.console(tokens);
    record.ms = env_.now_ms() - started;
    record.success = answer.success;
    record.text = answer.text;
    if (answer.faulted) {
        faulted_.store(true);
        error = "console_fault";
        message = "the game's console faulted (exception " + std::to_string(answer.fault_code) + ")";
        return false;
    }
    if (!answer.called) {
        error = "no_console";
        message = "the game's console is not set up yet";
        return false;
    }
    return true;
}

// One reload through its two steps: the windows closed first, then (a frame
// later when a close was a posted click, which the game takes in its next
// frame) the lines, the windows closed again and the stale check.
struct LiveJobs::ReloadState {
    ReloadRequest request;
    ReloadResult result;
    std::optional<std::vector<Root>> before;
    std::optional<ProvinceView> view_before;  // with `reselect`
    std::function<void(const ReloadResult&)> done;
    double started = 0;
};

bool LiveJobs::CloseWindow(const std::string& name, ReloadResult& result, bool& pressed) {
    pressed = false;
    if (env_.press) {
        // The console's `window close` closes only windows `window open` opened (live): Escape
        // closes the topmost panel, as the player's would.
        pressed = env_.press(name, Key::Escape).pressed;
        return pressed;
    }
    result.lines.emplace_back();
    return Run({"window", "close", name}, result.lines.back(), result.error, result.message);
}

void LiveJobs::ReloadFirst(const std::shared_ptr<ReloadState>& state) {
    ReloadResult& result = state->result;
    state->before = env_.roots();
    if (state->request.reselect && env_.province_view) state->view_before = env_.province_view();
    const std::optional<std::vector<Root>>& before = state->before;
    result.tree = before.has_value();
    if (before) result.roots_before = before->size();
    bool waits = false;
    for (const std::string& name : state->request.close) {
        // Without the tree a close is sent anyway: closing a window that is not open does nothing.
        const Root* root = before ? FindRoot(*before, name) : nullptr;
        if (before && (root == nullptr || !root->visible)) continue;
        bool pressed = false;
        const bool closed = CloseWindow(name, result, pressed);
        if (!result.error.empty()) return Finish(state);
        if (closed) result.closed.push_back(name);
        waits = waits || pressed;
    }
    if (!waits) return ReloadRest(state);
    if (!AfterFrames(kKeyFrames, [this, state] { ReloadRest(state); })) {
        result.error = "no_main_thread";
        result.message = "the game's main thread does not take work";
        Finish(state);
    }
}

void LiveJobs::ReloadRest(const std::shared_ptr<ReloadState>& state) {
    ReloadResult& result = state->result;
    const std::optional<std::vector<Root>>& before = state->before;
    std::vector<std::string> tokens;
    for (const std::string& text : state->request.lines) {
        AllowedLine(text, tokens);
        result.lines.emplace_back();
        if (!Run(tokens, result.lines.back(), result.error, result.message)) return Finish(state);
    }
    std::optional<std::vector<Root>> after = env_.roots();
    bool keys = false;
    if (before && after) {
        bool reread = false;
        for (const std::string& name : state->request.keep_hidden) {
            const Root* was = FindRoot(*before, name);
            const Root* now = FindRoot(*after, name);
            // A rebuilt window off screen needs no Escape, which would open the game's menu.
            if ((was != nullptr && was->visible) || now == nullptr || !now->visible || !now->on_screen) continue;
            bool pressed = false;
            const bool closed = CloseWindow(name, result, pressed);
            if (!result.error.empty()) return Finish(state);
            if (closed) result.hidden_again.push_back(name);
            reread = reread || (closed && !pressed);
            keys = keys || pressed;
        }
        if (reread) after = env_.roots();
    }
    if (keys) {
        // Before any province was shown, the rebuilt view is visible but in no panel stack: the
        // Escape then opens the game's menu (live, M10). A few frames later that is undone.
        std::optional<std::vector<Root>> pressed_on = after;
        if (AfterFrames(kKeyFrames, [this, state, pressed_on] { ReloadKeysLanded(state, pressed_on); })) return;
    }
    ReloadEnd(state, after);
}

void LiveJobs::ReloadKeysLanded(const std::shared_ptr<ReloadState>& state,
                                const std::optional<std::vector<Root>>& pressed_on) {
    ReloadResult& result = state->result;
    std::optional<std::vector<Root>> after = env_.roots();
    if (after && pressed_on) {
        const Root* was = FindRoot(*pressed_on, kGameMenu);
        const Root* now = FindRoot(*after, kGameMenu);
        if ((was == nullptr || !was->visible) && now != nullptr && now->visible) {
            bool pressed = false;
            CloseWindow(std::string(kGameMenu), result, pressed);
            result.hidden_again.clear();
            result.menu_undone = true;
            if (!pressed) after = env_.roots();
        }
    }
    ReloadEnd(state, after ? after : pressed_on);
}

void LiveJobs::ReloadEnd(const std::shared_ptr<ReloadState>& state, const std::optional<std::vector<Root>>& after) {
    ReloadResult& result = state->result;
    const std::optional<std::vector<Root>>& before = state->before;
    result.tree = before.has_value() && after.has_value();
    if (result.tree) {
        result.stale = CompareRoots(*before, *after, state->request.check);
        result.roots_after = after->size();
        for (const Root& root : *after) {
            // A window closed again by a key closes in a later frame.
            const bool closing = std::find(result.hidden_again.begin(), result.hidden_again.end(), root.name) !=
                                     result.hidden_again.end() ||
                                 (result.menu_undone && root.name == kGameMenu);
            if (root.visible && !root.file.empty() && !closing) result.visible.push_back(root);
        }
    }
    ReselectAfterReload(*state);
    Finish(state);
}

void LiveJobs::ReselectAfterReload(ReloadState& state) {
    if (!state.request.reselect) return;
    const std::int32_t province = state.view_before ? state.view_before->OnScreen() : 0;
    if (province <= 0) return;  // no province on screen before: nothing to bring back
    Reselect& r = state.result.reselected.emplace();
    r.province = province;
    const std::optional<ProvinceView> now = env_.province_view ? env_.province_view() : std::nullopt;
    if (!now || !env_.open_province) {
        r.outcome = "no_navigation";
        return;
    }
    // The rebuild selects the view's province itself (0x1345F40) and then clears the name it
    // caches, which the next refresh of the view sets again: selecting the same province once
    // more is the player's click on it, which changes no province and posts nothing.
    if (now->OnScreen() != province) {
        r.outcome = "not_shown";
        return;
    }
    const std::optional<std::uint32_t> outcome = env_.open_province(province, kKeepViews | kNoCamera);
    r.outcome = outcome ? OutcomeName(*outcome) : "no_navigation";
    if (outcome && *outcome == kOpened) r.window = std::string(now->Window());
}

bool LiveJobs::AfterFrames(int frames, std::function<void()> work) {
    if (frames <= 0) {
        work();
        return true;
    }
    return env_.run_on_main([this, frames, work = std::move(work)]() mutable {
        if (!AfterFrames(frames - 1, std::move(work))) work();
    });
}

void LiveJobs::Finish(const std::shared_ptr<ReloadState>& state) {
    state->result.run_ms = env_.now_ms() - state->started;
    busy_.store(false);
    env_.run_later([state] { state->done(state->result); });
}

std::optional<Refusal> LiveJobs::Reload(ReloadRequest request, std::function<void(const ReloadResult&)> done) {
    if (auto refused = Begin()) return refused;
    const double asked = env_.now_ms();
    auto state = std::make_shared<ReloadState>();
    state->request = std::move(request);
    state->done = std::move(done);
    const bool queued = env_.run_on_main([this, state, asked] {
        state->started = env_.now_ms();
        state->result.queued_ms = state->started - asked;
        // The session may have changed while the job waited.
        const std::optional<GameSession> session = env_.session ? env_.session() : std::nullopt;
        if (session && (session->multiplayer || session->ironman)) {
            state->result.error = "not_available";
            state->result.message =
                session->multiplayer ? "reload is not available in multiplayer" : "reload does not work in ironman";
            return Finish(state);
        }
        ReloadFirst(state);
    });
    if (!queued) {
        busy_.store(false);
        return Refusal{"no_main_thread", "the game's main thread does not take work"};
    }
    return std::nullopt;
}

std::optional<Refusal> LiveJobs::Save(std::function<void(const SaveResult&)> done) {
    if (auto refused = Begin()) return refused;
    const double asked = env_.now_ms();
    const bool queued = env_.run_on_main([this, asked, done = std::move(done)] {
        auto result = std::make_shared<SaveResult>();
        result->queued_ms = env_.now_ms() - asked;
        // `savegame` answers but writes nothing; `autosave` writes save games/autosave.eu4 (live).
        Run({"autosave"}, result->line, result->error, result->message);
        busy_.store(false);
        env_.run_later([result, done] { done(*result); });
    });
    if (!queued) {
        busy_.store(false);
        return Refusal{"no_main_thread", "the game's main thread does not take work"};
    }
    return std::nullopt;
}

std::optional<Refusal> LiveJobs::Confirm(std::string path, std::function<void(const ConfirmResult&)> done) {
    bool idle = false;
    if (!busy_.compare_exchange_strong(idle, true)) return Refusal{"busy", "another job of the live game runs"};
    const double asked = env_.now_ms();
    const bool queued = env_.run_on_main([this, path = std::move(path), asked, done = std::move(done)] {
        auto result = std::make_shared<ConfirmResult>();
        result->queued_ms = env_.now_ms() - asked;
        if (env_.press) {
            result->press = env_.press(path, Key::Enter);
        } else {
            result->error = "no_tree";
            result->message = "tongs.ui is missing, so the button cannot be found";
        }
        busy_.store(false);
        env_.run_later([result, done] { done(*result); });
    });
    if (!queued) {
        busy_.store(false);
        return Refusal{"no_main_thread", "the game's main thread does not take work"};
    }
    return std::nullopt;
}

std::optional<Refusal> LiveJobs::ReselectProvince(std::int32_t province,
                                                  std::function<void(const ReselectResult&)> done) {
    bool idle = false;
    if (!busy_.compare_exchange_strong(idle, true)) return Refusal{"busy", "another job of the live game runs"};
    const double asked = env_.now_ms();
    auto result = std::make_shared<ReselectResult>();
    result->reselect.province = province;
    const auto finish = [this, result, done] {
        busy_.store(false);
        env_.run_later([result, done] { done(*result); });
    };
    const bool queued = env_.run_on_main([this, asked, result, finish] {
        result->queued_ms = env_.now_ms() - asked;
        Reselect& r = result->reselect;
        const std::optional<ProvinceView> view = env_.province_view ? env_.province_view() : std::nullopt;
        if (!view || !env_.open_province) {
            r.outcome = "no_navigation";
            return finish();
        }
        // The player came first: a province selected (even with its view closed again), the
        // province view or another view open. Nothing is forced over it.
        if (view->selected != 0 || view->shown != 0 || view->OnScreen() != 0 || view->views_open) {
            r.outcome = "moved_on";
            return finish();
        }
        // No view to close (checked above, in this frame); the camera moves, as a province link's.
        const std::optional<std::uint32_t> outcome = env_.open_province(r.province, kKeepViews);
        r.outcome = outcome ? OutcomeName(*outcome) : "no_navigation";
        if (!outcome || *outcome != kOpened) return finish();
        const bool checked = AfterFrames(kShowFrames, [this, result, finish] {
            Reselect& shown = result->reselect;
            const std::optional<ProvinceView> after = env_.province_view();
            if (after && after->OnScreen() == shown.province) {
                shown.window = std::string(after->Window());
            } else {
                shown.outcome = "not_shown";
            }
            finish();
        });
        if (!checked) {
            r.outcome = "not_shown";
            finish();
        }
    });
    if (!queued) {
        busy_.store(false);
        return Refusal{"no_main_thread", "the game's main thread does not take work"};
    }
    return std::nullopt;
}

}  // namespace etch
