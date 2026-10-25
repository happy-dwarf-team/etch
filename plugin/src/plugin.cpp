// Etch's Anvil plugin: the game host's end of the session pipe
// (docs/plugin-protocol.md, ADR 0003). It answers Etch's requests and runs its
// preview jobs: console calls on the main thread, crops captured in Present.
//
// It does nothing unless Etch started the game: Etch puts ETCH_HOST_SESSION
// into the environment of the game host process, and the plugin serves
// \\.\pipe\etch-host-<id> for it. Without the variable the plugin only logs
// that it is idle, so a copy that ends up in a player's own game is harmless.

#include "capture.hpp"
#include "console.hpp"
#include "job.hpp"
#include "pipe_server.hpp"
#include "protocol.hpp"
#include "session.hpp"

#include <anvil/anvil.hpp>
#include <anvil/anvil_game.h>

#include "symbols.gen.hpp"

#include <windows.h>

#include <algorithm>
#include <functional>
#include <memory>

namespace {

const AnvilGameService* g_game = nullptr;
etch::ConsoleAddresses g_console;
LARGE_INTEGER g_frequency{};

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
    // No pool thread: run it here rather than lose a job's answer.
    if (!TrySubmitThreadpoolCallback(RunQueued, queued, nullptr)) RunQueued(nullptr, queued);
}

bool WriteWholeFile(const std::string& path, const std::string& bytes, std::string& error) {
    const int length =
        MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, path.data(), static_cast<int>(path.size()), nullptr, 0);
    std::wstring wide(static_cast<std::size_t>(std::max(length, 0)), L'\0');
    if (length <= 0 || MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, path.data(), static_cast<int>(path.size()),
                                           wide.data(), length) != length) {
        error = "the output path is not UTF-8";
        return false;
    }
    HANDLE file = CreateFileW(wide.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) {
        error = "cannot create " + path + " (error " + std::to_string(GetLastError()) + ")";
        return false;
    }
    DWORD written = 0;
    const bool ok =
        WriteFile(file, bytes.data(), static_cast<DWORD>(bytes.size()), &written, nullptr) && written == bytes.size();
    if (!ok) error = "cannot write " + path + " (error " + std::to_string(GetLastError()) + ")";
    CloseHandle(file);
    return ok;
}

// Never destroyed, like the host: jobs end on pool threads.
etch::JobRunner& Runner() {
    static etch::JobRunner& runner = *new etch::JobRunner({
        .console = [](const std::vector<std::string>& tokens) { return etch::CallConsole(g_console, tokens); },
        .run_on_main = RunOnMain,
        .run_later = RunLater,
        .now_ms = NowMs,
        .frame = [] { return static_cast<std::uint64_t>(g_game->frame_number()); },
        .write_file = WriteWholeFile,
    });
    return runner;
}

void OnPresent(IDirect3DDevice9* device) {
    etch::JobRunner& runner = Runner();
    if (!runner.Capturing()) return;
    runner.OnPresent([device](const etch::Rect& crop) { return etch::capture::GrabCrop(device, crop); });
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
        QueryPerformanceFrequency(&g_frequency);
        g_console.manager = reinterpret_cast<void* const*>(
            host.game().image_base + static_cast<std::uintptr_t>(sym::console_manager_get.manager));
        g_console.dispatch = host.address(sym::console_dispatch);
        g_console.string_free = host.address(sym::string_free);
        // Before the game creates its device: the capture hooks Direct3DCreate9(Ex).
        const bool capture = etch::capture::Install(host, OnPresent);
        host.subscribe(ANVIL_GAME_EVENT_FRAME, [](const void* payload) {
            const auto* frame = static_cast<const AnvilGameFrame*>(payload);
            if (frame != nullptr) Runner().OnFrame(frame->number);
        });

        etch::Host& state = HostState();
        state.ready = [] { return g_game->ready() != 0; };
        state.frame = [] { return static_cast<std::uint64_t>(g_game->frame_number()); };
        state.pid = GetCurrentProcessId();
        state.process_start_ms = etch::ProcessStartMs();
        state.session = *session.id;
        state.plugin_version = ETCH_PLUGIN_VERSION;
        state.start_job = [capture](etch::JobRequest request,
                                    std::function<void(const etch::JobResult&)> done) -> std::optional<etch::Refusal> {
            if (!capture || !etch::capture::HasDevice()) {
                return etch::Refusal{"no_capture", "the game's Direct3D 9 device is not hooked; see anvil.log"};
            }
            return Runner().Start(std::move(request), std::move(done));
        };
        // A pipe that cannot be created leaves the game running without Etch;
        // Etch sees no handshake and stops the game host itself.
        etch::StartPipeServer(etch::PipeName(*session.id), state, Log);
    }
};

}  // namespace

ANVIL_PLUGIN(EtchPlugin)
