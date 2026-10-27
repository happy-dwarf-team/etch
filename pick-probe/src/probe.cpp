// etch-pick-probe: a throwaway Anvil plugin for the live checks of pick mode
// (happy-dwarf-team/etch#171). Not Etch's plugin and never shipped: it does
// only what the checks need, and logs every step to a JSONL file.
//
//   - Ctrl+Shift+E in the game window turns pick mode on and off (window
//     procedure subclass); Esc is never touched.
//   - In pick mode it drops the mouse button and wheel messages and the mouse
//     part of WM_INPUT, and eu4.exe's GetAsyncKeyState/GetKeyState read the
//     mouse buttons as up.
//   - Each frame in pick mode it reads the hovered widget and its ancestors
//     through Tongs' tongs.ui service, with the definition's game path and its
//     line (definition +0xA0, read only for a live definition).
//   - A left click is recorded in the window procedure and handled on the next
//     frame: the hovered chain with paths, every visible widget whose rect
//     holds the pointer, then AllowSetForegroundWindow and `code -g file:line`,
//     and a watcher thread that logs when VS Code takes the foreground.
//
// Settings: probe.txt next to the DLL, `key=value` lines, read again when it
// changes: log, root (repeatable; the first root holding the game path wins),
// code (path to code.cmd), open, allow_foreground, swallow_mouse, swallow_key.
#include <anvil/anvil.hpp>
#include <anvil/anvil_game.h>

#include "tongs_ui.h"

#include <windows.h>

#include <atomic>
#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {

const AnvilGameService* g_game = nullptr;
const TongsUiService* g_ui = nullptr;

// ---- settings -------------------------------------------------------------------

struct Settings {
    std::wstring log;
    std::vector<std::wstring> roots;
    std::wstring code;
    bool open = true;
    bool allow_foreground = true;
    bool swallow_mouse = true;
    bool swallow_key = true;
};

std::mutex g_settings_mutex;
Settings g_settings;
std::wstring g_settings_path;
FILETIME g_settings_time{};
std::atomic<bool> g_swallow_mouse{true};
std::atomic<bool> g_swallow_key{true};
std::atomic<bool> g_strip_mk{true};
std::atomic<std::uint64_t> g_mk_stripped{0};
std::atomic<std::uint64_t> g_mouse_polls_blocked{0};

std::wstring Widen(const std::string& s) {
    if (s.empty()) return {};
    const int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), nullptr, 0);
    std::wstring w(static_cast<size_t>(n), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), w.data(), n);
    return w;
}

std::string Narrow(const std::wstring& w) {
    if (w.empty()) return {};
    const int n = WideCharToMultiByte(CP_UTF8, 0, w.data(), static_cast<int>(w.size()), nullptr, 0, nullptr, nullptr);
    std::string s(static_cast<size_t>(n), '\0');
    WideCharToMultiByte(CP_UTF8, 0, w.data(), static_cast<int>(w.size()), s.data(), n, nullptr, nullptr);
    return s;
}

void ReloadSettingsIfChanged() {
    WIN32_FILE_ATTRIBUTE_DATA data{};
    if (!GetFileAttributesExW(g_settings_path.c_str(), GetFileExInfoStandard, &data)) return;
    if (CompareFileTime(&data.ftLastWriteTime, &g_settings_time) == 0) return;
    g_settings_time = data.ftLastWriteTime;
    Settings s;
    FILE* f = _wfopen(g_settings_path.c_str(), L"rb");
    if (f == nullptr) return;
    char line[2048];
    while (fgets(line, sizeof(line), f) != nullptr) {
        std::string l(line);
        while (!l.empty() && (l.back() == '\n' || l.back() == '\r' || l.back() == ' ')) l.pop_back();
        const size_t eq = l.find('=');
        if (l.empty() || l[0] == '#' || eq == std::string::npos) continue;
        const std::string k = l.substr(0, eq);
        const std::string v = l.substr(eq + 1);
        if (k == "log") s.log = Widen(v);
        else if (k == "root") s.roots.push_back(Widen(v));
        else if (k == "code") s.code = Widen(v);
        else if (k == "open") s.open = v == "1";
        else if (k == "allow_foreground") s.allow_foreground = v == "1";
        else if (k == "swallow_mouse") s.swallow_mouse = v == "1";
        else if (k == "swallow_key") s.swallow_key = v == "1";
        else if (k == "strip_mk") g_strip_mk.store(v == "1");
    }
    fclose(f);
    g_swallow_mouse.store(s.swallow_mouse);
    g_swallow_key.store(s.swallow_key);
    std::lock_guard lock(g_settings_mutex);
    g_settings = std::move(s);
}

Settings CurrentSettings() {
    std::lock_guard lock(g_settings_mutex);
    return g_settings;
}

// ---- log ----------------------------------------------------------------------------

std::mutex g_log_mutex;

double NowMs() {
    static const LARGE_INTEGER freq = [] {
        LARGE_INTEGER f;
        QueryPerformanceFrequency(&f);
        return f;
    }();
    LARGE_INTEGER c;
    QueryPerformanceCounter(&c);
    return static_cast<double>(c.QuadPart) * 1000.0 / static_cast<double>(freq.QuadPart);
}

std::string Json(const std::string& s) {
    std::string out = "\"";
    for (const unsigned char c : s) {
        if (c == '"' || c == '\\') {
            out += '\\';
            out += static_cast<char>(c);
        } else if (c < 0x20) {
            char buf[8];
            std::snprintf(buf, sizeof(buf), "\\u%04x", c);
            out += buf;
        } else {
            out += static_cast<char>(c);
        }
    }
    return out + "\"";
}

std::string JsonOrNull(const char* s) { return s == nullptr ? "null" : Json(s); }

// One line: {"t":<qpc ms>,"wall":<unix ms>,"ev":"<event>",<fields>}
void Log(const char* event, const std::string& fields) {
    FILETIME ft;
    GetSystemTimePreciseAsFileTime(&ft);
    const auto wall = ((static_cast<std::uint64_t>(ft.dwHighDateTime) << 32) | ft.dwLowDateTime) / 10000 -
                      11644473600000ull;
    char head[128];
    std::snprintf(head, sizeof(head), "{\"t\":%.3f,\"wall\":%llu,\"ev\":\"%s\"", NowMs(),
                  static_cast<unsigned long long>(wall), event);
    std::string line = head;
    if (!fields.empty()) line += "," + fields;
    line += "}\n";
    const std::wstring path = CurrentSettings().log;
    if (path.empty()) return;
    std::lock_guard lock(g_log_mutex);
    FILE* f = _wfopen(path.c_str(), L"ab");
    if (f == nullptr) return;
    fwrite(line.data(), 1, line.size(), f);
    fclose(f);
}

// ---- reading the game ---------------------------------------------------------------

// The definition's line: widget +0xB0 is the definition, definition +0xA0 the
// reader's line counter when the factory built it (Etch research pick-mode,
// claim 3). Only called for widgets whose definition Tongs reports live.
bool ReadDefinitionLine(std::uint64_t widget, int* line, std::uint64_t* definition) {
    __try {
        const auto def = *reinterpret_cast<const std::uint64_t*>(widget + 0xB0);
        *definition = def;
        if (def == 0) return false;
        *line = *reinterpret_cast<const int*>(def + 0xA0);
        return true;
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}

struct Seen {
    std::uint64_t id = 0;
    std::uint32_t type = 0, flags = 0;
    std::int32_t parent = -1, x = 0, y = 0, w = 0, h = 0;
    std::string name, path, text;
    bool has_path = false, has_text = false, has_file = false;
    std::string file;
    int line = -1;
    std::uint64_t definition = 0;
};

Seen Copy(const TongsUiWidget* w) {
    Seen s;
    s.id = w->id;
    s.type = w->type;
    s.flags = w->flags;
    s.parent = w->parent;
    s.x = w->x;
    s.y = w->y;
    s.w = w->width;
    s.h = w->height;
    s.name = w->name != nullptr ? w->name : "";
    s.has_path = w->path != nullptr;
    if (s.has_path) s.path = w->path;
    s.has_text = w->text != nullptr;
    if (s.has_text) s.text = w->text;
    s.has_file = TONGS_UI_WIDGET_HAS(w, definition_file) && w->definition_file != nullptr;
    if (s.has_file) {
        s.file = w->definition_file;
        ReadDefinitionLine(w->id, &s.line, &s.definition);
    }
    return s;
}

std::string Describe(const Seen& s) {
    char head[256];
    std::snprintf(head, sizeof(head),
                  "{\"id\":\"0x%llX\",\"type\":%u,\"flags\":%u,\"rect\":[%d,%d,%d,%d],\"def\":\"0x%llX\",\"line\":%d,",
                  static_cast<unsigned long long>(s.id), s.type, s.flags, s.x, s.y, s.w, s.h,
                  static_cast<unsigned long long>(s.definition), s.line);
    std::string out = head;
    out += "\"name\":" + Json(s.name);
    out += ",\"file\":" + (s.has_file ? Json(s.file) : std::string("null"));
    if (s.has_path) out += ",\"path\":" + Json(s.path);
    if (s.has_text) out += ",\"text\":" + Json(s.text.substr(0, 60));
    return out + "}";
}

int Collect(void* context, const TongsUiWidget* widget) {
    static_cast<std::vector<Seen>*>(context)->push_back(Copy(widget));
    return 1;
}

std::string Chain(const std::vector<Seen>& chain) {
    std::string out = "[";
    for (size_t i = 0; i < chain.size(); ++i) out += (i ? "," : "") + Describe(chain[i]);
    return out + "]";
}

// ---- pick mode state ------------------------------------------------------------------

std::atomic<bool> g_pick{false};
std::atomic<double> g_click_at{0.0};  // window procedure time of an unhandled left button down
std::atomic<int> g_click_x{0}, g_click_y{0};
std::atomic<std::uint32_t> g_wndproc_thread{0};
std::atomic<bool> g_eat_e_up{false};
std::atomic<bool> g_eat_char{false};
HWND g_window = nullptr;
WNDPROC g_original = nullptr;
std::uint64_t g_last_hovered = 1;  // never a widget address: logs the first hover

const char* MouseName(UINT m) {
    switch (m) {
    case WM_LBUTTONDOWN: return "WM_LBUTTONDOWN";
    case WM_LBUTTONUP: return "WM_LBUTTONUP";
    case WM_LBUTTONDBLCLK: return "WM_LBUTTONDBLCLK";
    case WM_RBUTTONDOWN: return "WM_RBUTTONDOWN";
    case WM_RBUTTONUP: return "WM_RBUTTONUP";
    case WM_RBUTTONDBLCLK: return "WM_RBUTTONDBLCLK";
    case WM_MBUTTONDOWN: return "WM_MBUTTONDOWN";
    case WM_MBUTTONUP: return "WM_MBUTTONUP";
    case WM_MBUTTONDBLCLK: return "WM_MBUTTONDBLCLK";
    case WM_XBUTTONDOWN: return "WM_XBUTTONDOWN";
    case WM_XBUTTONUP: return "WM_XBUTTONUP";
    case WM_XBUTTONDBLCLK: return "WM_XBUTTONDBLCLK";
    case WM_MOUSEWHEEL: return "WM_MOUSEWHEEL";
    case WM_MOUSEHWHEEL: return "WM_MOUSEHWHEEL";
    default: return nullptr;
    }
}

void LogRawDevices(const char* when) {
    RAWINPUTDEVICE devices[16];
    UINT count = 16;
    const UINT got = GetRegisteredRawInputDevices(devices, &count, sizeof(RAWINPUTDEVICE));
    std::string raw = "[";
    for (UINT i = 0; got != static_cast<UINT>(-1) && i < got; ++i) {
        char buf[96];
        std::snprintf(buf, sizeof(buf), "%s{\"page\":%u,\"usage\":%u,\"flags\":\"0x%lX\"}", i ? "," : "", devices[i].usUsagePage,
                      devices[i].usUsage, devices[i].dwFlags);
        raw += buf;
    }
    raw += "]";
    Log("raw_input_devices", std::string("\"when\":\"") + when + "\",\"devices\":" + raw);
}

// Modifiers as the key messages this window procedure saw left them: posted
// messages do not change GetKeyState, real input changes both.
std::atomic<bool> g_msg_ctrl{false}, g_msg_shift{false}, g_msg_alt{false};

bool Held(int vk) {
    const bool by_message = vk == VK_CONTROL ? g_msg_ctrl.load() : vk == VK_SHIFT ? g_msg_shift.load() : g_msg_alt.load();
    return by_message || (GetKeyState(vk) & 0x8000) != 0;
}

// The first few messages of each kind the game window gets, whatever the mode.
std::atomic<int> g_seen_counts[8];
void Diagnose(UINT message, WPARAM wparam, LPARAM lparam) {
    int kind = -1;
    std::string extra;
    switch (message) {
    case WM_KEYDOWN: kind = 0; break;
    case WM_SYSKEYDOWN: kind = 1; break;
    case WM_CHAR: kind = 2; break;
    case WM_LBUTTONDOWN: kind = 3; break;
    case WM_MOUSEMOVE: kind = 4; break;
    case WM_MOUSEWHEEL: kind = 5; break;
    case WM_INPUT: {
        RAWINPUTHEADER header{};
        UINT size = sizeof(header);
        if (GetRawInputData(reinterpret_cast<HRAWINPUT>(lparam), RID_HEADER, &header, &size, sizeof(header)) == sizeof(header)) {
            kind = header.dwType == RIM_TYPEMOUSE ? 6 : 7;
        }
        break;
    }
    default: return;
    }
    if (kind < 0 || g_seen_counts[kind].fetch_add(1) >= 3) return;
    char buf[160];
    std::snprintf(buf, sizeof(buf), "\"msg\":\"0x%X\",\"kind\":%d,\"wparam\":\"0x%llX\",\"lparam\":\"0x%llX\"", message, kind,
                  static_cast<unsigned long long>(wparam), static_cast<unsigned long long>(lparam));
    Log("seen", buf);
}

LRESULT CALLBACK WindowProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
    const auto tid = GetCurrentThreadId();
    if (g_wndproc_thread.exchange(tid) != tid) {
        Log("wndproc_thread", "\"thread\":" + std::to_string(tid) + ",\"main\":" +
                                  std::to_string(g_game != nullptr ? g_game->main_thread_id() : 0));
    }
    Diagnose(message, wparam, lparam);
    if (message == WM_KEYDOWN || message == WM_SYSKEYDOWN || message == WM_KEYUP || message == WM_SYSKEYUP) {
        const bool down = message == WM_KEYDOWN || message == WM_SYSKEYDOWN;
        if (wparam == VK_CONTROL) g_msg_ctrl.store(down);
        if (wparam == VK_SHIFT) g_msg_shift.store(down);
        if (wparam == VK_MENU) g_msg_alt.store(down);
    }
    if (message == WM_KILLFOCUS) {
        g_msg_ctrl.store(false);
        g_msg_shift.store(false);
        g_msg_alt.store(false);
    }
    if (message == WM_KEYDOWN || message == WM_SYSKEYDOWN) {
        const bool repeat = (lparam & (1 << 30)) != 0;
        if (wparam == 'E' && Held(VK_CONTROL) && Held(VK_SHIFT) && !Held(VK_MENU)) {
            if (!repeat) {
                const bool on = !g_pick.load();
                g_pick.store(on);
                g_last_hovered = 1;
                LogRawDevices("pick");
                Log("pick", std::string("\"on\":") + (on ? "true" : "false") + ",\"swallowed\":" +
                                (g_swallow_key.load() ? "true" : "false"));
            }
            if (g_swallow_key.load()) {
                g_eat_e_up.store(true);
                g_eat_char.store(true);
                return 0;
            }
        } else if (g_pick.load()) {
            Log("key", "\"vk\":" + std::to_string(wparam) + ",\"repeat\":" + (repeat ? "true" : "false"));
        }
    }
    if ((message == WM_KEYUP || message == WM_SYSKEYUP) && wparam == 'E' && g_eat_e_up.exchange(false)) return 0;
    if (message == WM_CHAR && g_eat_char.exchange(false) && (wparam == 0x05 || wparam == 'E' || wparam == 'e')) return 0;
    if (g_pick.load() && g_swallow_mouse.load()) {
        if (const char* name = MouseName(message)) {
            if (message == WM_LBUTTONDOWN) {
                g_click_x.store(static_cast<short>(LOWORD(lparam)));
                g_click_y.store(static_cast<short>(HIWORD(lparam)));
                g_click_at.store(NowMs());
            }
            Log("swallow", std::string("\"msg\":\"") + name + "\",\"mk_stripped\":" + std::to_string(g_mk_stripped.load()) +
                               ",\"mouse_polls_blocked\":" + std::to_string(g_mouse_polls_blocked.load()));
            return 0;
        }
        // SDL 2.0.4 compares the MK_* bits of every mouse message's wParam with its own
        // button state and makes the missing presses and releases from them
        // (WIN_CheckWParamMouseButtons), so a move with a button held would click.
        if (message == WM_MOUSEMOVE && g_strip_mk.load()) {
            const WPARAM stripped = wparam & ~static_cast<WPARAM>(MK_LBUTTON | MK_RBUTTON | MK_MBUTTON | MK_XBUTTON1 | MK_XBUTTON2);
            if (stripped != wparam) {
                g_mk_stripped.fetch_add(1);
                wparam = stripped;
            }
        }
        if (message == WM_INPUT) {
            RAWINPUTHEADER header{};
            UINT size = sizeof(header);
            if (GetRawInputData(reinterpret_cast<HRAWINPUT>(lparam), RID_HEADER, &header, &size, sizeof(header)) ==
                    sizeof(header) &&
                header.dwType == RIM_TYPEMOUSE) {
                return DefWindowProcW(window, message, wparam, lparam);
            }
        }
    }
    return g_original != nullptr ? CallWindowProcW(g_original, window, message, wparam, lparam)
                                 : DefWindowProcW(window, message, wparam, lparam);
}

using KeyStateFn = SHORT(WINAPI)(int);
anvil::FunctionHook<KeyStateFn> g_async_key_state;
anvil::FunctionHook<KeyStateFn> g_key_state;

bool BlockedKey(int vk) {
    const bool button = vk == VK_LBUTTON || vk == VK_RBUTTON || vk == VK_MBUTTON || vk == VK_XBUTTON1 || vk == VK_XBUTTON2;
    if (button && g_pick.load(std::memory_order_relaxed) && g_swallow_mouse.load(std::memory_order_relaxed)) {
        g_mouse_polls_blocked.fetch_add(1, std::memory_order_relaxed);
        return true;
    }
    return false;
}
SHORT WINAPI OnAsyncKeyState(int vk) noexcept { return BlockedKey(vk) ? 0 : g_async_key_state.next(vk); }
SHORT WINAPI OnKeyState(int vk) noexcept { return BlockedKey(vk) ? 0 : g_key_state.next(vk); }

struct FoundWindows {
    std::vector<HWND> windows;
};

BOOL CALLBACK EnumOne(HWND window, LPARAM context) {
    DWORD pid = 0;
    GetWindowThreadProcessId(window, &pid);
    if (pid == GetCurrentProcessId() && IsWindowVisible(window) && GetWindow(window, GW_OWNER) == nullptr) {
        reinterpret_cast<FoundWindows*>(context)->windows.push_back(window);
    }
    return TRUE;
}

void SubclassGameWindow() {
    FoundWindows found;
    EnumWindows(EnumOne, reinterpret_cast<LPARAM>(&found));
    std::string list = "[";
    HWND chosen = nullptr;
    for (HWND w : found.windows) {
        wchar_t cls[128] = {};
        GetClassNameW(w, cls, 128);
        DWORD pid = 0;
        const DWORD tid = GetWindowThreadProcessId(w, &pid);
        char buf[64];
        std::snprintf(buf, sizeof(buf), "{\"hwnd\":\"%p\",\"thread\":%lu,", static_cast<void*>(w), tid);
        list += (list.size() > 1 ? "," : "") + std::string(buf) + "\"class\":" + Json(Narrow(cls)) + "}";
        if (chosen == nullptr && std::wstring(cls) == L"SDL_app") chosen = w;
    }
    list += "]";
    if (chosen == nullptr) return;  // not created yet: the next frame tries again
    LogRawDevices("subclass");
    g_original = reinterpret_cast<WNDPROC>(SetWindowLongPtrW(chosen, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(&WindowProc)));
    g_window = chosen;
    DWORD pid = 0;
    const DWORD tid = GetWindowThreadProcessId(chosen, &pid);
    Log("subclassed", "\"windows\":" + list + ",\"window_thread\":" + std::to_string(tid) + ",\"main_thread\":" +
                          std::to_string(g_game->main_thread_id()) + ",\"ok\":" + (g_original != nullptr ? "true" : "false"));
}

// ---- the pick -----------------------------------------------------------------------------

std::wstring Resolve(const Settings& s, const std::string& game_path) {
    for (const auto& root : s.roots) {
        std::filesystem::path p = std::filesystem::path(root) / std::filesystem::path(Widen(game_path));
        std::error_code ec;
        if (std::filesystem::exists(p, ec)) return p.wstring();
    }
    return {};
}

std::string ExeOf(DWORD pid) {
    HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (h == nullptr) return "?";
    wchar_t buf[MAX_PATH];
    DWORD n = MAX_PATH;
    std::string out = "?";
    if (QueryFullProcessImageNameW(h, 0, buf, &n)) out = Narrow(std::filesystem::path(buf).filename().wstring());
    CloseHandle(h);
    return out;
}

// Logs the foreground changes for 15 s after the open: the first window that is
// not the game's, and when VS Code's title names the opened file.
void WatchForeground(double clicked, std::wstring basename) {
    HWND last = GetForegroundWindow();
    bool titled = false;
    const double until = NowMs() + 15000;
    while (NowMs() < until && !titled) {
        HWND fg = GetForegroundWindow();
        if (fg != last) {
            last = fg;
            DWORD pid = 0;
            GetWindowThreadProcessId(fg, &pid);
            wchar_t title[512] = {};
            GetWindowTextW(fg, title, 512);
            char head[96];
            std::snprintf(head, sizeof(head), "\"since_click_ms\":%.1f,\"pid\":%lu,", NowMs() - clicked, pid);
            Log("foreground", head + std::string("\"exe\":") + Json(ExeOf(pid)) + ",\"title\":" + Json(Narrow(title)));
        }
        if (fg != nullptr && fg != g_window) {
            wchar_t title[512] = {};
            GetWindowTextW(fg, title, 512);
            if (std::wstring(title).find(basename) != std::wstring::npos) {
                titled = true;
                char head[64];
                std::snprintf(head, sizeof(head), "\"since_click_ms\":%.1f,", NowMs() - clicked);
                Log("opened", head + std::string("\"title\":") + Json(Narrow(title)));
            }
        }
        Sleep(2);
    }
    if (!titled) {
        HWND fg = GetForegroundWindow();
        DWORD pid = 0;
        GetWindowThreadProcessId(fg, &pid);
        wchar_t title[512] = {};
        GetWindowTextW(fg, title, 512);
        Log("not_opened", "\"foreground_exe\":" + Json(ExeOf(pid)) + ",\"title\":" + Json(Narrow(title)) +
                              ",\"game_foreground\":" + (fg == g_window ? "true" : "false"));
    }
}

void HandleClick(double clicked) {
    const double start = NowMs();
    std::vector<Seen> chain;
    const AnvilResult r = g_ui->hovered(TONGS_UI_STALE | TONGS_UI_PATHS, Collect, &chain);
    const double read = NowMs();
    // Every visible widget whose rect holds the click point (H5), in walk order.
    std::vector<Seen> all;
    const AnvilResult found = g_ui->find("//*", 0, Collect, &all, nullptr);
    const int x = g_click_x.load(), y = g_click_y.load();
    std::vector<Seen> stack;
    for (const auto& s : all) {
        if ((s.flags & TONGS_UI_VISIBLE) && x >= s.x && y >= s.y && x < s.x + s.w && y < s.y + s.h) stack.push_back(s);
    }
    char head[192];
    std::snprintf(head, sizeof(head),
                  "\"queued_ms\":%.2f,\"hovered_ms\":%.2f,\"find_ms\":%.2f,\"result\":%d,\"x\":%d,\"y\":%d,"
                  "\"widgets\":%zu,\"find_result\":%d,",
                  start - clicked, read - start, NowMs() - read, static_cast<int>(r), x, y, all.size(), static_cast<int>(found));
    Log("click", head + std::string("\"chain\":") + Chain(chain) + ",\"under_point\":" + Chain(stack));

    const Settings s = CurrentSettings();
    const Seen* target = nullptr;
    for (const auto& w : chain) {
        if (w.has_file && !w.file.empty()) {
            target = &w;
            break;
        }
    }
    if (!s.open || target == nullptr) {
        Log("no_open", std::string("\"reason\":") + (target == nullptr ? "\"no widget with a file\"" : "\"open=0\""));
        return;
    }
    const std::wstring file = Resolve(s, target->file);
    if (file.empty()) {
        Log("no_open", "\"reason\":\"not under any root\",\"file\":" + Json(target->file));
        return;
    }
    BOOL allowed = FALSE;
    DWORD allow_error = 0;
    if (s.allow_foreground) {
        allowed = AllowSetForegroundWindow(ASFW_ANY);
        if (!allowed) allow_error = GetLastError();
    }
    const std::wstring goto_arg = file + L":" + std::to_wstring(target->line);
    std::wstring cmd = L"cmd.exe /d /c \"\"" + s.code + L"\" -g \"" + goto_arg + L"\"\"";
    STARTUPINFOW si{sizeof(si)};
    PROCESS_INFORMATION pi{};
    const BOOL started = CreateProcessW(nullptr, cmd.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW, nullptr,
                                        nullptr, &si, &pi);
    if (started) {
        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
    }
    char mid[160];
    std::snprintf(mid, sizeof(mid), "\"since_click_ms\":%.1f,\"allow_foreground\":%s,\"allowed\":%s,\"allow_error\":%lu,",
                  NowMs() - clicked, s.allow_foreground ? "true" : "false", allowed ? "true" : "false", allow_error);
    Log("open", mid + std::string("\"goto\":") + Json(Narrow(goto_arg)) + ",\"started\":" + (started ? "true" : "false"));
    std::thread(WatchForeground, clicked, std::filesystem::path(file).filename().wstring()).detach();
}

void OnFrame() {
    static std::uint64_t frames = 0;
    if (++frames % 30 == 1) ReloadSettingsIfChanged();
    if (g_window == nullptr) {
        SubclassGameWindow();
        return;
    }
    if (g_ui == nullptr) return;
    const double clicked = g_click_at.exchange(0.0);
    if (clicked != 0.0) HandleClick(clicked);
    if (!g_pick.load()) return;
    std::vector<Seen> chain;
    const double start = NowMs();
    const AnvilResult r = g_ui->hovered(TONGS_UI_STALE, Collect, &chain);
    const std::uint64_t top = chain.empty() ? 0 : chain.front().id;
    if (top == g_last_hovered) return;
    g_last_hovered = top;
    POINT p{};
    GetCursorPos(&p);
    ScreenToClient(g_window, &p);
    char head[128];
    std::snprintf(head, sizeof(head), "\"read_ms\":%.3f,\"result\":%d,\"cursor\":[%ld,%ld],\"mouse_polls_blocked\":%llu,",
                  NowMs() - start, static_cast<int>(r), p.x, p.y,
                  static_cast<unsigned long long>(g_mouse_polls_blocked.load()));
    Log("hover", head + std::string("\"chain\":") + Chain(chain));
}

struct PickProbe : anvil::Plugin {
    void load(anvil::Host& host) override {
        wchar_t module[MAX_PATH];
        HMODULE self = nullptr;
        GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                           reinterpret_cast<LPCWSTR>(&OnFrame), &self);
        GetModuleFileNameW(self, module, MAX_PATH);
        g_settings_path = (std::filesystem::path(module).parent_path() / L"probe.txt").wstring();
        ReloadSettingsIfChanged();
        g_game = host.service<AnvilGameService>(ANVIL_GAME_SERVICE, ANVIL_GAME_SERVICE_VERSION);
        g_ui = host.service<TongsUiService>(TONGS_UI_SERVICE, TONGS_UI_SERVICE_VERSION);
        if (g_game == nullptr) throw anvil::Error(ANVIL_ERROR_UNSUPPORTED, "needs anvil-game");
        if (g_ui == nullptr) host.warn("tongs.ui v1 is missing: no hover or pick reads");
        host.replace_import(g_async_key_state, "USER32.dll", "GetAsyncKeyState", OnAsyncKeyState);
        host.replace_import(g_key_state, "USER32.dll", "GetKeyState", OnKeyState);
        host.subscribe(ANVIL_GAME_EVENT_FRAME, [](const void*) { OnFrame(); });
        Log("loaded", std::string("\"tongs_ui\":") + (g_ui != nullptr ? "true" : "false"));
        host.info("etch-pick-probe loaded; settings {}", Narrow(g_settings_path));
    }
};

}  // namespace

ANVIL_PLUGIN(PickProbe)
