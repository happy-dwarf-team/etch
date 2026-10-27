// Etch's Anvil plugin: the live game's end of the session pipe
// (docs/plugin-protocol.md, ADR 0005). It answers Etch's handshake and pings
// and runs the live game's reloads and saves on the main thread (v2
// specification section 6), reading the widget tree through Tongs' tongs.ui.
//
// It does nothing unless Etch started the game: Etch puts ETCH_HOST_SESSION
// into the environment of the game process, and the plugin serves
// \\.\pipe\etch-host-<id> for it. Without the variable the plugin only logs
// that it is idle, so a copy that ends up in a player's own game is harmless.

#include "console.hpp"
#include "live.hpp"
#include "pipe_server.hpp"
#include "protocol.hpp"
#include "session.hpp"

#include <anvil/anvil.hpp>
#include <anvil/anvil_game.h>
#include <tongs/tongs_ui.h>

#include "symbols.gen.hpp"

#include <windows.h>

#include <atomic>
#include <memory>
#include <string>

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

// Never destroyed, like the host: jobs end on pool threads.
etch::LiveJobs& Jobs() {
    static etch::LiveJobs& jobs = *new etch::LiveJobs({
        .console = [](const std::vector<std::string>& tokens) { return etch::CallConsole(g_console, tokens); },
        .roots = ReadRoots,
        .session = CurrentSession,
        .run_on_main = RunOnMain,
        .run_later = RunLater,
        .now_ms = NowMs,
    });
    return jobs;
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
