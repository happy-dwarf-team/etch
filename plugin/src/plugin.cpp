// Etch's Anvil plugin: the live game's end of the session pipe
// (docs/plugin-protocol.md, ADR 0005). It answers Etch's handshake and pings
// and runs the live game's reloads and saves on the main thread (v2
// specification section 6), reading the widget tree through Tongs' tongs.ui.
// Its pick mode (section 7) outlines the widget under the pointer, swallows
// the click and tells Etch which definition to open, with a live snapshot of
// the window.
//
// It does nothing unless Etch started the game: Etch puts ETCH_HOST_SESSION
// into the environment of the game process, and the plugin serves
// \\.\pipe\etch-host-<id> for it. Without the variable the plugin only logs
// that it is idle, so a copy that ends up in a player's own game is harmless.

#include "console.hpp"
#include "live.hpp"
#include "overlay.hpp"
#include "pick.hpp"
#include "pipe_server.hpp"
#include "protocol.hpp"
#include "session.hpp"

#include <anvil/anvil.hpp>
#include <anvil/anvil_game.h>
#include <tongs/tongs_ui.h>

#include "settings.gen.hpp"
#include "symbols.gen.hpp"

#include <windows.h>
#include <windowsx.h>

#include <algorithm>
#include <atomic>
#include <cstdlib>
#include <cwctype>
#include <memory>
#include <mutex>
#include <string>
#include <utility>

namespace {

const AnvilGameService* g_game = nullptr;
const TongsUiService* g_ui = nullptr;
// The game's console, through which the live game reloads (v2 specification
// section 6), as Etch 1.x's preview jobs did.
etch::ConsoleAddresses g_console;
LARGE_INTEGER g_frequency{};

// The game session as anvil-game last published it, for the pipe thread.
std::atomic<bool> g_in_session{false};
std::atomic<bool> g_ironman{false};
std::atomic<bool> g_multiplayer{false};
std::atomic<std::uint64_t> g_session_number{0};
// The game's main window, once found.
std::atomic<HWND> g_window{nullptr};

// Never destroyed: the pipe thread reads it for the rest of the process.
etch::Host& HostState() {
    static etch::Host& host = *new etch::Host;
    return host;
}

void Log(etch::LogLevel level, const std::string& message) {
    const anvil::Host host;
    switch (level) {
        case etch::LogLevel::Info:
            host.info("{}", message);
            break;
        case etch::LogLevel::Warn:
            host.warn("{}", message);
            break;
        case etch::LogLevel::Error:
            host.error("{}", message);
            break;
    }
}

double NowMs() {
    LARGE_INTEGER now;
    QueryPerformanceCounter(&now);
    return 1000.0 * static_cast<double>(now.QuadPart) / static_cast<double>(g_frequency.QuadPart);
}

bool RunOnMain(std::function<void()> work) {
    auto* queued = new std::function<void()>(std::move(work));
    const AnvilResult result = g_game->run_on_main_thread(
        [](void* context) {
            const std::unique_ptr<std::function<void()>> run(static_cast<std::function<void()>*>(context));
            (*run)();
        },
        queued);
    if (result == ANVIL_OK) return true;
    delete queued;
    return false;
}

void CALLBACK RunQueued(PTP_CALLBACK_INSTANCE, void* context) {
    const std::unique_ptr<std::function<void()>> run(static_cast<std::function<void()>*>(context));
    (*run)();
}

void RunLater(std::function<void()> work) {
    auto* queued = new std::function<void()>(std::move(work));
    // No pool thread: run it here rather than lose an answer.
    if (!TrySubmitThreadpoolCallback(RunQueued, queued, nullptr)) RunQueued(nullptr, queued);
}

std::optional<etch::GameSession> CurrentSession() {
    if (!g_in_session.load()) return std::nullopt;
    return etch::GameSession{g_ironman.load(), g_multiplayer.load(), g_session_number.load()};
}

// The top-level windows, hidden and stale ones too, through tongs.ui on the
// main thread.
std::optional<std::vector<etch::Root>> ReadRoots() {
    if (g_ui == nullptr) return std::nullopt;
    std::vector<etch::Root> roots;
    const AnvilResult result = g_ui->find(
        "*", TONGS_UI_HIDDEN | TONGS_UI_STALE,
        [](void* context, const TongsUiWidget* widget) -> int {
            if (widget->parent != -1) return 1;
            etch::Root root;
            root.id = widget->id;
            root.name = widget->name != nullptr ? widget->name : "";
            const bool stale = (widget->flags & TONGS_UI_IS_STALE) != 0;
            if (!stale && TONGS_UI_WIDGET_HAS(widget, definition_file) && widget->definition_file != nullptr) {
                root.file = widget->definition_file;
            }
            root.visible = (widget->flags & TONGS_UI_VISIBLE) != 0;
            static_cast<std::vector<etch::Root>*>(context)->push_back(std::move(root));
            return 1;
        },
        &roots, nullptr);
    if (result != ANVIL_OK) return std::nullopt;
    return roots;
}

// The game's main window: the visible top-level window of the main thread.
HWND GameWindow() {
    HWND window = g_window.load();
    if (window != nullptr && IsWindow(window)) return window;
    const DWORD thread = g_game->main_thread_id();
    if (thread == 0) return nullptr;
    window = nullptr;
    EnumThreadWindows(
        thread,
        [](HWND candidate, LPARAM found) -> BOOL {
            if (!IsWindowVisible(candidate) || GetWindow(candidate, GW_OWNER) != nullptr) return TRUE;
            *reinterpret_cast<HWND*>(found) = candidate;
            return FALSE;
        },
        reinterpret_cast<LPARAM>(&window));
    if (window != nullptr) g_window.store(window);
    return window;
}

// Posts a key to the game's window when the first widget `selector` names is
// visible: the key down now and up a frame later, as a key the player presses
// (the game takes key messages through SDL's event queue).
etch::PressResult Press(const std::string& selector, etch::Key key) {
    etch::PressResult out;
    const HWND window = GameWindow();
    if (g_ui == nullptr || window == nullptr) return out;
    g_ui->find(
        selector.c_str(), 0,
        [](void* context, const TongsUiWidget* widget) -> int {
            if ((widget->flags & TONGS_UI_MATCH) == 0 || (widget->flags & TONGS_UI_VISIBLE) == 0) return 1;
            static_cast<etch::PressResult*>(context)->found = true;
            return 0;
        },
        &out, nullptr);
    if (!out.found) return out;
    const WPARAM vk = key == etch::Key::Enter ? VK_RETURN : VK_ESCAPE;
    const LPARAM scan = static_cast<LPARAM>(MapVirtualKeyW(static_cast<UINT>(vk), MAPVK_VK_TO_VSC)) << 16;
    out.pressed = PostMessageW(window, WM_KEYDOWN, vk, scan | 1) != 0;
    if (!out.pressed) return out;
    const LPARAM up = scan | 1 | (static_cast<LPARAM>(0xC0000000u));
    if (!RunOnMain([window, vk, up] { PostMessageW(window, WM_KEYUP, vk, up); })) {
        PostMessageW(window, WM_KEYUP, vk, up);
    }
    return out;
}

// Never destroyed, like the host: jobs end on pool threads.
etch::LiveJobs& Jobs() {
    static etch::LiveJobs& jobs = *new etch::LiveJobs({
        .console = [](const std::vector<std::string>& tokens) { return etch::CallConsole(g_console, tokens); },
        .roots = ReadRoots,
        .session = CurrentSession,
        .run_on_main = RunOnMain,
        .run_later = RunLater,
        .now_ms = NowMs,
        .press = Press,
    });
    return jobs;
}

// ---- Pick mode (v2 specification section 7, docs/pick-mode-checks.md) ----------

constexpr std::uint32_t kOutline = 0xFF2BD9FFu;     // the widget under the pointer
constexpr std::uint32_t kWindowLine = 0xFFFFB000u;  // its top-level window, dashed
constexpr std::uint32_t kStaleLine = 0xFFFF3B30u;   // a stale widget
constexpr std::size_t kHoverSamples = 100000;

struct PickState {
    std::atomic<bool> on{false};
    std::atomic<std::int64_t> key{0};
    std::mutex mutex;  // sources and editor, set from the pipe thread
    etch::Sources sources;
    DWORD editor_pid = 0;
    std::wstring editor_title;  // lowercase
    // From the window procedure to the frame handler, both on the main thread.
    bool click = false;
    POINT click_at{};
    double click_ms = 0;
    std::uint64_t click_unix_ms = 0;
    int wheel = 0;
    // The frame handler's own.
    std::uint64_t hovered = 0;
    std::vector<etch::UiWidget> stack_read;  // the visible tree the stack was taken from
    std::vector<std::size_t> stack;
    std::size_t stack_index = 0;
    POINT stack_at{};
    bool shown = false;
    std::uint64_t seq = 0;
    std::vector<double> hover_ms;
    std::uint64_t picks = 0;
    // The window procedure's own: the modifiers from key messages, the
    // swallowed hotkey until its key goes up, and how the hotkey was matched
    // (GetKeyState or key messages: an open point of the pick mode checks).
    bool ctrl = false, shift = false, alt = false;
    unsigned swallow_vk = 0;
    std::uint32_t by_key_state = 0, by_messages = 0;
    std::atomic<std::uint32_t> button_polls{0};
};

// Never destroyed: the window procedure and the import replacements read it to the end.
PickState& Pick() {
    static PickState& state = *new PickState;
    return state;
}

WNDPROC g_previous_proc = nullptr;
HWND g_subclassed = nullptr;
anvil::FunctionHook<SHORT(WINAPI)(int)> g_async_key_state;
anvil::FunctionHook<SHORT(WINAPI)(int)> g_key_state;

etch::UiWidget Copy(const TongsUiWidget* w) {
    etch::UiWidget out;
    out.id = w->id;
    out.type = w->type;
    out.flags = w->flags;
    out.parent = w->parent;
    out.x = w->x;
    out.y = w->y;
    out.width = w->width;
    out.height = w->height;
    out.name = w->name != nullptr ? w->name : "";
    if (w->path != nullptr) out.path = w->path;
    out.has_text = w->text != nullptr;
    if (out.has_text) out.text = w->text;
    const bool stale = (w->flags & TONGS_UI_IS_STALE) != 0;
    // Both come from a live definition only, never from a stale widget's (H4 of the reload checks).
    if (!stale && TONGS_UI_WIDGET_HAS(w, definition_file) && w->definition_file != nullptr) {
        out.file = w->definition_file;
        if (TONGS_UI_WIDGET_HAS(w, definition_line)) out.line = w->definition_line;
    }
    return out;
}

int CopyInto(void* context, const TongsUiWidget* widget) {
    static_cast<std::vector<etch::UiWidget>*>(context)->push_back(Copy(widget));
    return 1;
}

// Every widget, each after its parent, with paths: the whole tree (10-19 ms).
std::optional<std::vector<etch::UiWidget>> ReadTree(std::uint32_t flags) {
    if (g_ui == nullptr) return std::nullopt;
    std::vector<etch::UiWidget> widgets;
    widgets.reserve(20000);
    if (g_ui->find("//*", flags, CopyInto, &widgets, nullptr) != ANVIL_OK) return std::nullopt;
    return widgets;
}

// The hovered widget, then its parents, without paths: cheap enough for every frame.
std::vector<etch::UiWidget> ReadHovered() {
    std::vector<etch::UiWidget> chain;
    if (g_ui != nullptr && TONGS_UI_HAS(g_ui, hovered)) g_ui->hovered(TONGS_UI_STALE, CopyInto, &chain);
    return chain;
}

void Push(const std::string& line) {
    if (HostState().pushes != nullptr) HostState().pushes->Push(line);
}

std::wstring LowerWide(std::wstring text) {
    for (wchar_t& c : text) c = static_cast<wchar_t>(std::towlower(c));
    return text;
}

std::wstring Wide(std::string_view text) {
    if (text.empty()) return {};
    const int size = MultiByteToWideChar(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), nullptr, 0);
    std::wstring out(static_cast<std::size_t>(size), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), out.data(), size);
    return out;
}

// VS Code's window, brought forward by the game, which is the foreground
// process while the player clicks in it (H8): the window of the editor's
// process whose title names the workspace, else its topmost one.
bool BringEditorForward() {
    struct Search {
        DWORD pid = 0;
        std::wstring title;
        HWND named = nullptr;
        HWND any = nullptr;
    } search;
    {
        PickState& p = Pick();
        const std::lock_guard lock(p.mutex);
        search.pid = p.editor_pid;
        search.title = p.editor_title;
    }
    if (search.pid == 0) return false;
    EnumWindows(
        [](HWND window, LPARAM context) -> BOOL {
            auto& s = *reinterpret_cast<Search*>(context);
            if (!IsWindowVisible(window) || GetWindow(window, GW_OWNER) != nullptr) return TRUE;
            DWORD owner = 0;
            GetWindowThreadProcessId(window, &owner);
            if (owner != s.pid) return TRUE;
            if (s.any == nullptr) s.any = window;
            wchar_t text[512];
            const int length = GetWindowTextW(window, text, 512);
            const std::wstring title = LowerWide(std::wstring(text, static_cast<std::size_t>(std::max(length, 0))));
            if (!s.title.empty() && title.find(s.title) != std::wstring::npos) {
                s.named = window;
                return FALSE;
            }
            return TRUE;
        },
        reinterpret_cast<LPARAM>(&search));
    const HWND target = search.named != nullptr ? search.named : search.any;
    if (target == nullptr) return false;
    if (IsIconic(target)) ShowWindow(target, SW_RESTORE);
    return SetForegroundWindow(target) != 0;
}

// The game's window to the front, for Etch: Toggle Pick Mode from VS Code. VS
// Code is in front then, so Windows' foreground lock may refuse the game; a
// key event of the game's own process lifts it, as the last input.
bool BringGameForward() {
    const HWND window = GameWindow();
    if (window == nullptr) return false;
    if (GetForegroundWindow() == window) return true;
    if (IsIconic(window)) ShowWindow(window, SW_RESTORE);
    if (SetForegroundWindow(window)) return true;
    keybd_event(VK_MENU, 0, KEYEVENTF_EXTENDEDKEY, 0);
    keybd_event(VK_MENU, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    return SetForegroundWindow(window) != 0;
}

double Percentile(std::vector<double> samples, double q) {
    if (samples.empty()) return 0;
    std::sort(samples.begin(), samples.end());
    const auto at = static_cast<std::size_t>(q * static_cast<double>(samples.size() - 1) + 0.5);
    return samples[std::min(at, samples.size() - 1)];
}

void SetPick(bool on, const char* why) {
    PickState& p = Pick();
    if (p.on.exchange(on) == on) return;
    anvil::Host{}.info("pick mode {} ({})", on ? "on" : "off", why);
    etch::json::Writer w;
    const std::string line = w.Str("event", "pick_mode").Bool("on", on).Finish();
    RunLater([line] { Push(line); });
}

// Swallows the hotkey, and in pick mode the mouse buttons and the wheel (H6).
LRESULT CALLBACK PickProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
    PickState& p = Pick();
    switch (message) {
        case WM_KEYDOWN:
        case WM_SYSKEYDOWN: {
            const auto vk = static_cast<unsigned>(wparam);
            if (vk == VK_CONTROL || vk == VK_LCONTROL || vk == VK_RCONTROL) p.ctrl = true;
            if (vk == VK_SHIFT || vk == VK_LSHIFT || vk == VK_RSHIFT) p.shift = true;
            if (vk == VK_MENU || vk == VK_LMENU || vk == VK_RMENU) p.alt = true;
            const etch::HotKey key = etch::HotKey::FromCode(p.key.load(std::memory_order_relaxed));
            const bool repeat = (lparam & (1 << 30)) != 0;
            if (key.vk != 0 && vk == key.vk && !repeat) {
                const auto held = [](int k) { return (GetKeyState(k) & 0x8000) != 0; };
                const bool by_state =
                    held(VK_CONTROL) == key.ctrl && held(VK_SHIFT) == key.shift && held(VK_MENU) == key.alt;
                const bool by_messages = p.ctrl == key.ctrl && p.shift == key.shift && p.alt == key.alt;
                if (by_state || by_messages) {
                    ++(by_state ? p.by_key_state : p.by_messages);
                    p.swallow_vk = vk;
                    SetPick(!p.on.load(), by_state ? "the hotkey" : "the hotkey, from key messages");
                    return 0;
                }
            }
            if (p.swallow_vk != 0 && vk == p.swallow_vk) return 0;  // its repeats
            break;
        }
        case WM_KEYUP:
        case WM_SYSKEYUP: {
            const auto vk = static_cast<unsigned>(wparam);
            if (vk == VK_CONTROL || vk == VK_LCONTROL || vk == VK_RCONTROL) p.ctrl = false;
            if (vk == VK_SHIFT || vk == VK_LSHIFT || vk == VK_RSHIFT) p.shift = false;
            if (vk == VK_MENU || vk == VK_LMENU || vk == VK_RMENU) p.alt = false;
            if (p.swallow_vk != 0 && vk == p.swallow_vk) {
                p.swallow_vk = 0;
                return 0;
            }
            break;
        }
        case WM_CHAR:
        case WM_SYSCHAR:
            if (p.swallow_vk != 0) return 0;  // the character the hotkey made (Ctrl+E is 0x05)
            break;
        case WM_KILLFOCUS:
            p.ctrl = p.shift = p.alt = false;
            break;
        default:
            break;
    }
    if (p.on.load(std::memory_order_relaxed) && etch::IsMouseMessage(message)) {
        const etch::MouseFilter filter = etch::FilterMouse(message, wparam);
        switch (filter.action) {
            case etch::MouseAction::Pick:
                if (!p.click) {
                    p.click = true;
                    p.click_at = {GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam)};
                    p.click_ms = NowMs();
                    p.click_unix_ms = etch::UnixMs();
                }
                return 0;
            case etch::MouseAction::Drop:
                return 0;
            case etch::MouseAction::Wheel:
                p.wheel += filter.wheel;
                return 0;
            case etch::MouseAction::Pass:
                wparam = static_cast<WPARAM>(filter.wparam);
                break;
        }
    }
    return g_previous_proc != nullptr ? CallWindowProcW(g_previous_proc, window, message, wparam, lparam)
                                      : DefWindowProcW(window, message, wparam, lparam);
}

// On the main thread: the game's window gets the pick procedure.
void Subclass() {
    const HWND window = GameWindow();
    if (window == nullptr || window == g_subclassed) return;
    const auto previous =
        reinterpret_cast<WNDPROC>(SetWindowLongPtrW(window, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(&PickProc)));
    if (previous == nullptr) {
        anvil::Host{}.warn("cannot subclass the game window (error {}): no pick mode", GetLastError());
        return;
    }
    g_previous_proc = previous;
    g_subclassed = window;
    anvil::Host{}.info("pick mode key {}", etch::FormatKey(etch::HotKey::FromCode(Pick().key.load())));
}

// In pick mode the game's own polling reads the mouse buttons as up (H6, a guard).
bool BlockedButton(int vk) {
    const bool button =
        vk == VK_LBUTTON || vk == VK_RBUTTON || vk == VK_MBUTTON || vk == VK_XBUTTON1 || vk == VK_XBUTTON2;
    if (!button || !Pick().on.load(std::memory_order_relaxed)) return false;
    Pick().button_polls.fetch_add(1, std::memory_order_relaxed);
    return true;
}
SHORT WINAPI OnAsyncKeyState(int vk) noexcept { return BlockedButton(vk) ? 0 : g_async_key_state.next(vk); }
SHORT WINAPI OnKeyState(int vk) noexcept { return BlockedButton(vk) ? 0 : g_key_state.next(vk); }

void LogPickStats(PickState& p) {
    anvil::Host{}.info(
        "pick mode left: {} picks; hovered read median {:.3f} ms, p90 {:.3f} ms, max {:.3f} ms over {} frames; "
        "hotkey by GetKeyState {}, by key messages {}; mouse buttons polled {} times",
        p.picks, Percentile(p.hover_ms, 0.5), Percentile(p.hover_ms, 0.9), Percentile(p.hover_ms, 1.0),
        p.hover_ms.size(), p.by_key_state, p.by_messages, p.button_polls.load());
    p.hover_ms.clear();
}

// The click, read on the next frame (H7): the widget the stack points at and
// its parents with paths, files and lines, pushed to Etch with VS Code brought
// forward, then the snapshot of its window.
void PickNow(PickState& p, int width, int height) {
    const double start = NowMs();
    std::optional<std::vector<etch::UiWidget>> read = ReadTree(TONGS_UI_HIDDEN | TONGS_UI_STALE);
    const double read_ms = NowMs() - start;
    if (!read) {
        anvil::Host{}.warn("pick: tongs.ui could not read the widget tree");
        return;
    }
    const std::uint64_t chosen =
        !p.stack.empty() && p.stack_index < p.stack.size() ? p.stack_read[p.stack[p.stack_index]].id : p.hovered;
    const std::vector<std::size_t> stack = etch::StackAt(*read, p.click_at.x, p.click_at.y, width, height, p.hovered);
    if (stack.empty() || p.hovered == 0) {
        anvil::Host{}.info("pick: no widget under the pointer, nothing opened");
        return;
    }
    std::size_t index = 0;
    for (std::size_t i = 0; i < stack.size(); ++i) {
        if ((*read)[stack[i]].id == chosen) index = i;
    }
    const std::vector<std::size_t> chain = etch::ChainOf(*read, stack[index]);
    const etch::UiWidget& picked = (*read)[chain.front()];
    const std::size_t root = chain.back();
    AllowSetForegroundWindow(ASFW_ANY);
    const bool front = BringEditorForward();
    const std::uint64_t seq = ++p.seq;
    const std::string line = etch::PickEvent(seq, *read, chain, index, stack.size(), width, height, front,
                                             {start - p.click_ms, p.click_unix_ms, read_ms});
    ++p.picks;
    anvil::Host{}.info("pick {}: {} {}:{} ({} of {} under the pointer), read {:.1f} ms, editor {}", seq, picked.name,
                       picked.file.empty() ? "?" : picked.file, picked.line, index + 1, stack.size(), read_ms,
                       front ? "in front" : "not brought forward");
    RunLater([line, widgets = std::move(*read), root, width, height, read_ms, seq] {
        Push(line);
        etch::json::Writer w;
        w.Str("event", "snapshot").Uint("seq", seq);
        if (widgets[root].Stale()) {
            Push(w.Str("error", "stale").Finish());
            return;
        }
        std::string event = w.Finish();
        event.pop_back();
        Push(event + "," + etch::SnapshotOf(widgets, root, width, height, read_ms).members + "}");
    });
}

// Every frame while pick mode is on: the hovered widget, the wheel's stack,
// the outline and label for Present, and a waiting click.
void OnFrame() {
    PickState& p = Pick();
    if (!p.on.load(std::memory_order_relaxed)) {
        if (p.shown) {
            etch::overlay::Show({});
            p.shown = false;
            p.stack.clear();
            p.stack_read.clear();
            LogPickStats(p);
        }
        p.click = false;
        p.wheel = 0;
        return;
    }
    Subclass();
    const HWND window = GameWindow();
    if (window == nullptr || g_ui == nullptr) return;
    RECT client{};
    GetClientRect(window, &client);
    const int width = client.right - client.left, height = client.bottom - client.top;
    POINT cursor{};
    GetCursorPos(&cursor);
    ScreenToClient(window, &cursor);

    const double start = NowMs();
    const std::vector<etch::UiWidget> chain = ReadHovered();
    if (p.hover_ms.size() < kHoverSamples) p.hover_ms.push_back(NowMs() - start);
    const std::uint64_t hovered = chain.empty() ? 0 : chain.front().id;
    if (hovered != p.hovered || std::abs(cursor.x - p.stack_at.x) > 2 || std::abs(cursor.y - p.stack_at.y) > 2) {
        p.hovered = hovered;
        p.stack.clear();
        p.stack_read.clear();
        p.stack_index = 0;
    }
    const int wheel = std::exchange(p.wheel, 0);
    if (wheel != 0 && hovered != 0) {
        if (p.stack.empty()) {
            if (std::optional<std::vector<etch::UiWidget>> read = ReadTree(0)) {
                p.stack_read = std::move(*read);
                p.stack = etch::StackAt(p.stack_read, cursor.x, cursor.y, width, height, hovered);
                p.stack_at = cursor;
            }
        }
        if (!p.stack.empty()) {
            const auto last = static_cast<int>(p.stack.size()) - 1;
            p.stack_index = static_cast<std::size_t>(std::clamp(static_cast<int>(p.stack_index) - wheel, 0, last));
        }
    }

    std::vector<const etch::UiWidget*> shown;
    if (!p.stack.empty() && p.stack_index > 0) {
        for (const std::size_t i : etch::ChainOf(p.stack_read, p.stack[p.stack_index])) {
            shown.push_back(&p.stack_read[i]);
        }
    } else {
        for (const etch::UiWidget& w : chain) shown.push_back(&w);
    }
    etch::overlay::Frame frame;
    frame.on = true;
    if (!shown.empty()) {
        const etch::UiWidget& w = *shown.front();
        frame.boxes.push_back({w.x, w.y, w.width, w.height, w.Stale() ? kStaleLine : kOutline, false});
        if (shown.size() > 1) {
            const etch::UiWidget& top = *shown.back();
            frame.boxes.push_back({top.x, top.y, top.width, top.height, kWindowLine, true});
        }
    }
    {
        const std::lock_guard lock(p.mutex);
        frame.label = etch::LabelText(shown, p.sources, p.stack_index, p.stack.size());
    }
    frame.label_x = cursor.x;
    frame.label_y = cursor.y;
    frame.badge = etch::BadgeText(etch::HotKey::FromCode(p.key.load()));
    frame.badge_color = kOutline;
    etch::overlay::Show(std::move(frame));
    p.shown = true;

    if (std::exchange(p.click, false)) PickNow(p, width, height);
}

// A snapshot asked for over the pipe, on the main thread.
void SnapshotNow(const std::string& window, const std::function<void(const etch::SnapshotResult&)>& done,
                 double requested) {
    etch::SnapshotResult result;
    result.queued_ms = NowMs() - requested;
    const HWND game = GameWindow();
    RECT client{};
    if (game != nullptr) GetClientRect(game, &client);
    const double start = NowMs();
    std::optional<std::vector<etch::UiWidget>> read = ReadTree(TONGS_UI_HIDDEN | TONGS_UI_STALE);
    const double read_ms = NowMs() - start;
    bool stale = false;
    const std::optional<std::size_t> root = read ? etch::FindRoot(*read, window, stale) : std::nullopt;
    if (!read) {
        result.error = "no_tree";
        result.message = "tongs.ui could not read the widget tree";
    } else if (!root) {
        result.error = "not_open";
        result.message = window + " is not on screen in the live game";
    } else if (stale) {
        result.error = "stale";
        result.message = window + " on screen is stale: a reload freed its definition";
    }
    if (!result.error.empty()) {
        RunLater([done, result] { done(result); });
        return;
    }
    RunLater([done, result, widgets = std::move(*read), at = *root, client, read_ms]() mutable {
        result.members =
            etch::SnapshotOf(widgets, at, client.right - client.left, client.bottom - client.top, read_ms).members;
        done(result);
    });
}

etch::PickControl& PickControl() {
    static etch::PickControl& control = *new etch::PickControl{
        .mode =
            [](const etch::PickModeRequest& request) {
                PickState& p = Pick();
                if (request.key) p.key.store(request.key->Code());
                {
                    const std::lock_guard lock(p.mutex);
                    if (request.sources) p.sources.Set(*request.sources);
                    if (request.editor_pid != 0) {
                        p.editor_pid = request.editor_pid;
                        p.editor_title = LowerWide(Wide(request.editor_title));
                    }
                }
                if (request.on) SetPick(*request.on, "Etch");
                etch::PickModeAnswer answer;
                answer.on = p.on.load();
                answer.key = etch::HotKey::FromCode(p.key.load());
                if (request.front) answer.front = BringGameForward();
                return answer;
            },
        .snapshot = [](std::string window,
                       std::function<void(const etch::SnapshotResult&)> done) -> std::optional<std::string> {
            if (g_ui == nullptr) return "no_tree";
            const double requested = NowMs();
            if (!RunOnMain([window, done, requested] { SnapshotNow(window, done, requested); })) {
                return "no_main_thread";
            }
            return std::nullopt;
        },
        .on = [] { return Pick().on.load(); },
    };
    return control;
}

struct EtchPlugin : anvil::Plugin {
    void load(anvil::Host& host) override {
        const etch::SessionLookup session = etch::ReadSessionId();
        if (!session.present) {
            host.info("ETCH_HOST_SESSION is not set: the game was not started by Etch, so the plugin stays idle");
            return;
        }
        if (!session.id) {
            host.warn("ETCH_HOST_SESSION is not {} lowercase hex digits: the plugin stays idle", etch::kSessionLength);
            return;
        }
        g_game = host.service<AnvilGameService>(ANVIL_GAME_SERVICE, ANVIL_GAME_SERVICE_VERSION);
        if (g_game == nullptr) {
            host.error("the anvil-game service {} v{} is missing: the plugin stays idle", ANVIL_GAME_SERVICE,
                       ANVIL_GAME_SERVICE_VERSION);
            return;
        }
        // Tongs loads before this plugin (a dependency): without its service
        // the live game still reloads, without the stale-window check.
        g_ui = host.service<TongsUiService>(TONGS_UI_SERVICE, TONGS_UI_SERVICE_VERSION);
        if (g_ui == nullptr || !TONGS_UI_HAS(g_ui, find)) {
            g_ui = nullptr;
            host.warn("the service {} v{} is missing: reloads run without the stale-window check", TONGS_UI_SERVICE,
                      TONGS_UI_SERVICE_VERSION);
        }
        QueryPerformanceFrequency(&g_frequency);
        g_console.manager = reinterpret_cast<void* const*>(
            host.game().image_base + static_cast<std::uintptr_t>(sym::console_manager_get.manager));
        g_console.dispatch = host.address(sym::console_dispatch);
        g_console.string_free = host.address(sym::string_free);
        host.subscribe(ANVIL_GAME_EVENT_SESSION, [](const void* payload) {
            const auto* change = static_cast<const AnvilGameSession*>(payload);
            if (change == nullptr) return;
            g_ironman.store(change->ironman != 0);
            g_multiplayer.store(change->multiplayer != 0);
            g_session_number.store(change->number);
            g_in_session.store(change->change == ANVIL_GAME_SESSION_STARTED);
        });
        // Pick mode needs the widget tree; without tongs.ui it stays off.
        if (g_ui != nullptr) {
            const std::int64_t key = cfg::pick_mode_key.get().code;
            Pick().key.store(key != 0 ? key : etch::ParseKey(etch::kDefaultPickKey)->Code());
            etch::overlay::Install(host);
            host.replace_import(g_async_key_state, "USER32.dll", "GetAsyncKeyState", OnAsyncKeyState);
            host.replace_import(g_key_state, "USER32.dll", "GetKeyState", OnKeyState);
            host.subscribe(ANVIL_GAME_EVENT_READY, [] {
                Subclass();
                if (!etch::overlay::EnsureHooked()) anvil::Host{}.warn("pick mode draws no outline: no Present found");
            });
            host.subscribe(ANVIL_GAME_EVENT_FRAME, [](const void*) { OnFrame(); });
        }

        etch::Host& state = HostState();
        state.ready = [] { return g_game->ready() != 0; };
        state.frame = [] { return static_cast<std::uint64_t>(g_game->frame_number()); };
        state.responding = [] {
            const HWND window = GameWindow();
            return window == nullptr || !IsHungAppWindow(window);
        };
        state.game_session = CurrentSession;
        state.tree = g_ui != nullptr;
        state.jobs = &Jobs();
        state.pick = g_ui != nullptr ? &PickControl() : nullptr;
        state.pushes = new etch::Pushes;  // never destroyed, like the host
        state.pid = GetCurrentProcessId();
        state.process_start_ms = etch::ProcessStartMs();
        state.session = *session.id;
        state.plugin_version = ETCH_PLUGIN_VERSION;
        // A pipe that cannot be created leaves the game running without Etch;
        // Etch sees no handshake and stops the game itself.
        etch::StartPipeServer(etch::PipeName(*session.id), state, Log);
    }
};

}  // namespace

ANVIL_PLUGIN(EtchPlugin)
