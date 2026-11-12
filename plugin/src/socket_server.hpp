#pragma once

#include "pipe_server.hpp"

#include <filesystem>
#include <string>
#include <string_view>

namespace etch {

// Wine and Proton keep named pipes inside the wineserver, so Etch's extension, a native Linux process, cannot open
// the session pipe. Under Wine the plugin also serves the session on a socket on 127.0.0.1, which the extension
// reaches directly (docs/plugin-protocol.md, "Finding the pipe on Linux"). Like the pipe it exists only for the
// session Etch started, and it is never started on Windows.

// True when this process runs under Wine or Proton (ntdll exports wine_get_version only there).
bool RunningUnderWine();

// The folder the session's state file goes to: `configured` when it is not empty (a Unix path such as
// /home/me/.local/state/etch is reached through Wine's Z: drive; Etch passes the folder it made, mode 0700, in
// ETCH_HOST_BRIDGE_DIR), else etch/ in the XDG state folder ($XDG_STATE_HOME, else ~/.local/state), found through
// WINEHOMEDIR. Empty when the host's home cannot be found.
std::filesystem::path BridgeFolder(const std::string& configured);

// The owner of the TCP connection between `server_port` and `client_port` on 127.0.0.1, read from the text of
// /proc/net/tcp: the uid of the client's own socket and of the server's end (-1: not listed). Exposed for the tests.
struct PeerUids {
    long client = -1;
    long server = -1;
};
PeerUids ProcNetTcpUids(std::string_view table, int server_port, int client_port);

// Serves the session on 127.0.0.1 on a free port and writes {"port": N, "token": "...", "pid": N} to
// <folder>/<pipe_name>.json. A client sends one line, `RELAY <token> <pipe_name>`, and is answered `OK` or
// `ERR <reason>`; from then on it speaks the protocol of docs/plugin-protocol.md. One client at a time, like the pipe
// (a second one is answered `ERR busy`); a client that does not send its line within five seconds is cut off, and a
// client of another Linux user is refused. Returns false, after logging why, when it could not start.
bool StartSocketServer(const std::string& pipe_name, const Host& host, LogFn log, const std::filesystem::path& folder);

}  // namespace etch
