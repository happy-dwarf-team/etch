#pragma once

// The session pipe's protocol (docs/plugin-protocol.md): one JSON object per
// line each way, a handshake that agrees on kProtocolVersion, then requests
// answered by id. This part knows nothing of pipes or of the game, so the tests
// drive it directly.

#include "json.hpp"
#include "live.hpp"
#include "pick.hpp"

#include <cstddef>
#include <cstdint>
#include <functional>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>

namespace etch {

// Bumped whenever a request or an answer changes in a way an older Etch would
// misread; the extension and the plugin ship together, so there is no
// negotiation beyond refusing a different number.
inline constexpr std::uint64_t kProtocolVersion = 2;

// The longest request line, without its "\n".
inline constexpr std::size_t kMaxLine = 64 * 1024;

// Writes one answer line (without "\n") to the connection it belongs to, from
// any thread; does nothing once that client is gone.
using Send = std::function<void(const std::string& line)>;

// The greeted client that the plugin's pushes (picks and pick mode changes)
// go to: one at a time, the latest greeted. Any thread.
class Pushes {
public:
    void Attach(const void* owner, Send send);
    void Detach(const void* owner);
    // False when no greeted client is connected.
    bool Push(const std::string& line);

private:
    std::mutex mutex_;
    const void* owner_ = nullptr;
    Send send_;
};

// What the protocol reads from the game and the process.
struct Host {
    std::function<bool()> ready;           // anvil-game.ready was published
    std::function<std::uint64_t()> frame;  // the game's frame counter, 0 before the first frame
    std::uint32_t pid = 0;
    std::uint64_t process_start_ms = 0;
    std::string session;  // the session id the pipe is named after
    std::string plugin_version;
    // The game's window takes messages (not hung): it does while the game
    // loads a save and draws its loading screen. Any thread.
    std::function<bool()> responding;
    // The running game session; nullopt in the main menu. Any thread.
    std::function<std::optional<GameSession>()> game_session;
    bool tree = false;            // tongs.ui was found: reloads check the stale windows
    LiveJobs* jobs = nullptr;     // the reloads and saves; null leaves them refused
    PickControl* pick = nullptr;  // pick mode and snapshots; null leaves them refused
    Pushes* pushes = nullptr;     // where the greeted client is registered for pushes
};

struct Reply {
    std::string line;    // the answer, without "\n"; empty when it comes later through Send
    bool close = false;  // disconnect the client after sending it
};

// The protocol state of one connected client; a new client starts again with
// the handshake.
class Connection {
public:
    // `send` carries what is written later, from another thread: the answers
    // to reloads and saves, which come when the main thread ran them.
    explicit Connection(const Host& host, Send send = {}) : host_(host), send_(std::move(send)) {}
    ~Connection();
    Connection(const Connection&) = delete;
    Connection& operator=(const Connection&) = delete;

    Reply Handle(std::string_view line);
    // The answer to a line longer than kMaxLine, after which the client is
    // disconnected (the rest of the line cannot be told from the next request).
    Reply LineTooLong() const;

private:
    Reply Hello(std::uint64_t id, const json::Value& request);
    Reply Ping(std::uint64_t id) const;
    Reply Reload(std::uint64_t id, const json::Value& request);
    Reply Save(std::uint64_t id);
    Reply Confirm(std::uint64_t id, const json::Value& request);
    Reply PickMode(std::uint64_t id, const json::Value& request);
    Reply Snapshot(std::uint64_t id, const json::Value& request);

    const Host& host_;
    Send send_;
    bool greeted_ = false;
};

}  // namespace etch
