// Etch's Anvil plugin: the game host's end of the session pipe
// (docs/plugin-protocol.md, ADR 0003).
//
// It does nothing unless Etch started the game: Etch puts ETCH_HOST_SESSION
// into the environment of the game host process, and the plugin serves
// \\.\pipe\etch-host-<id> for it. Without the variable the plugin only logs
// that it is idle, so a copy that ends up in a player's own game is harmless.

#include "pipe_server.hpp"
#include "protocol.hpp"
#include "session.hpp"

#include <anvil/anvil.hpp>
#include <anvil/anvil_game.h>

#include <windows.h>

namespace {

const AnvilGameService* g_game = nullptr;

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
        etch::Host& state = HostState();
        state.ready = [] { return g_game->ready() != 0; };
        state.frame = [] { return static_cast<std::uint64_t>(g_game->frame_number()); };
        state.pid = GetCurrentProcessId();
        state.process_start_ms = etch::ProcessStartMs();
        state.session = *session.id;
        state.plugin_version = ETCH_PLUGIN_VERSION;
        // A pipe that cannot be created leaves the game running without Etch;
        // Etch sees no handshake and stops the game host itself.
        etch::StartPipeServer(etch::PipeName(*session.id), state, Log);
    }
};

}  // namespace

ANVIL_PLUGIN(EtchPlugin)
