#pragma once

// The session pipe's protocol (docs/plugin-protocol.md): one JSON object per
// line each way, a handshake that agrees on kProtocolVersion, then requests
// answered by id. This part knows nothing of pipes or of the game, so the tests
// drive it directly.

#include "json.hpp"

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>
#include <string_view>

namespace etch {

// Bumped whenever a request or an answer changes in a way an older Etch would
// misread; the extension and the plugin ship together, so there is no
// negotiation beyond refusing a different number.
inline constexpr std::uint64_t kProtocolVersion = 1;

// The longest request line, without its "\n".
inline constexpr std::size_t kMaxLine = 64 * 1024;

// What the protocol reads from the game and the process.
struct Host {
    std::function<bool()> ready;           // anvil-game.ready was published
    std::function<std::uint64_t()> frame;  // the game's frame counter, 0 before the first frame
    std::uint32_t pid = 0;
    std::uint64_t process_start_ms = 0;
    std::string session;  // the session id the pipe is named after
    std::string plugin_version;
};

struct Reply {
    std::string line;    // the answer, without "\n"
    bool close = false;  // disconnect the client after sending it
};

// The protocol state of one connected client; a new client starts again with
// the handshake.
class Connection {
public:
    explicit Connection(const Host& host) : host_(host) {}

    Reply Handle(std::string_view line);
    // The answer to a line longer than kMaxLine, after which the client is
    // disconnected (the rest of the line cannot be told from the next request).
    Reply LineTooLong() const;

private:
    Reply Hello(std::uint64_t id, const json::Value& request);
    Reply Ping(std::uint64_t id) const;

    const Host& host_;
    bool greeted_ = false;
};

}  // namespace etch
