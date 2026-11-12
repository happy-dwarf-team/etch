#include "socket_server.hpp"

#include <winsock2.h>
#include <ws2tcpip.h>

#include <windows.h>
#include <bcrypt.h>

#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <system_error>

namespace etch {
namespace {

constexpr DWORD kHandshakeMs = 5000;  // the first line must come within this
constexpr std::size_t kMaxFirstLine = 256;
constexpr int kMaxHandshaking = 16;  // connections that have not been let in yet; more are dropped without a word

struct Server {
    std::string pipe_name;
    const Host* host = nullptr;
    LogFn log;
    std::string token;
    std::atomic<bool> serving{false};  // one client at a time, like the pipe; taken only after the handshake
    std::atomic<int> handshaking{0};
};

bool SendAll(SOCKET socket, std::string_view data) {
    while (!data.empty()) {
        const int n = send(socket, data.data(), static_cast<int>(data.size()), 0);
        if (n <= 0) return false;
        data.remove_prefix(static_cast<std::size_t>(n));
    }
    return true;
}

// One connected client's end: writes from the serving thread and from other threads (a job's late answer) take
// turns, and stop once the client is gone.
struct Link {
    std::mutex mutex;
    SOCKET socket = INVALID_SOCKET;
    bool open = true;

    bool WriteLine(const std::string& line) {
        const std::lock_guard lock(mutex);
        return open && SendAll(socket, line + "\n");
    }

    void Close() {
        const std::lock_guard lock(mutex);
        open = false;
        closesocket(socket);
    }
};

// The first line of a connection, read byte by byte so nothing after it is taken.
bool ReadFirstLine(SOCKET socket, std::string& line) {
    line.clear();
    for (char c; line.size() < kMaxFirstLine;) {
        if (recv(socket, &c, 1, 0) != 1) return false;
        if (c == '\n') return true;
        if (c != '\r') line.push_back(c);
    }
    return false;
}

// Compares without stopping at the first difference.
bool SameToken(std::string_view a, std::string_view b) {
    if (a.size() != b.size()) return false;
    unsigned char difference = 0;
    for (std::size_t i = 0; i < a.size(); ++i) difference |= static_cast<unsigned char>(a[i] ^ b[i]);
    return difference == 0;
}

bool RandomToken(std::string& out) {
    unsigned char bytes[16];
    if (BCryptGenRandom(nullptr, bytes, sizeof bytes, BCRYPT_USE_SYSTEM_PREFERRED_RNG) != 0) return false;
    static const char digits[] = "0123456789abcdef";
    out.clear();
    for (const unsigned char b : bytes) {
        out.push_back(digits[b >> 4]);
        out.push_back(digits[b & 15]);
    }
    return true;
}

// Whether the program on the other end of `socket` runs as the same Linux user as this process, so a token that reached
// another user is useless to them. Wine can read the host's /proc; where the table is not there or does not list the
// connection, this answers true and the token alone decides.
bool PeerIsSameUser(SOCKET socket) {
    sockaddr_in local{}, remote{};
    int local_size = sizeof local, remote_size = sizeof remote;
    if (getsockname(socket, reinterpret_cast<sockaddr*>(&local), &local_size) != 0 ||
        getpeername(socket, reinterpret_cast<sockaddr*>(&remote), &remote_size) != 0) {
        return true;
    }
    std::ifstream in(L"Z:\\proc\\net\\tcp", std::ios::binary);
    if (!in) return true;
    std::stringstream text;
    text << in.rdbuf();
    const PeerUids uids = ProcNetTcpUids(text.str(), ntohs(local.sin_port), ntohs(remote.sin_port));
    return uids.client < 0 || uids.server < 0 || uids.client == uids.server;
}

// Reads the handshake line and checks it; returns the reason to refuse, or nullptr when the client may go on.
const char* Handshake(Server& server, SOCKET socket) {
    std::string line;
    char token[129] = {};
    char pipe[129] = {};
    if (!ReadFirstLine(socket, line) || sscanf_s(line.c_str(), "RELAY %128s %128s", token, 129u, pipe, 129u) != 2) {
        return "ERR bad request\n";
    }
    if (!SameToken(server.token, token)) return "ERR bad token\n";
    if (server.pipe_name != pipe) return "ERR pipe not served\n";
    return nullptr;
}

// Serves one authenticated client until it disconnects or the protocol closes the connection.
void ServeClient(Server& server, SOCKET socket) {
    auto link = std::make_shared<Link>();
    link->socket = socket;
    Connection connection(*server.host, [link](const std::string& line) { link->WriteLine(line); });
    std::string pending;
    char chunk[4096];
    for (;;) {
        for (std::size_t eol; (eol = pending.find('\n')) != std::string::npos;) {
            if (eol > kMaxLine) {
                link->WriteLine(connection.LineTooLong().line);
                link->Close();
                return;
            }
            const Reply reply = connection.Handle(std::string_view(pending).substr(0, eol));
            pending.erase(0, eol + 1);
            if (!reply.line.empty() && !link->WriteLine(reply.line)) {
                link->Close();
                return;
            }
            if (reply.close) {
                link->Close();
                return;
            }
        }
        if (pending.size() > kMaxLine) {
            link->WriteLine(connection.LineTooLong().line);
            link->Close();
            return;
        }
        const int got = recv(socket, chunk, sizeof chunk, 0);
        if (got <= 0) {
            link->Close();
            return;
        }
        pending.append(chunk, static_cast<std::size_t>(got));
    }
}

struct ClientArgs {
    Server* server;
    SOCKET socket;
};

DWORD WINAPI ClientThread(void* param) {
    std::unique_ptr<ClientArgs> args(static_cast<ClientArgs*>(param));
    Server& server = *args->server;
    const SOCKET socket = args->socket;
    // Any local process can connect to the port. Until the client has sent the token it holds a thread, so it gets a
    // few seconds for its first line.
    DWORD timeout_ms = kHandshakeMs;
    setsockopt(socket, SOL_SOCKET, SO_RCVTIMEO, reinterpret_cast<const char*>(&timeout_ms), sizeof timeout_ms);
    const char* refusal = nullptr;
    if (!PeerIsSameUser(socket)) {
        // Read the client's line before answering: closing a socket with unread data resets the connection, and the
        // reset can discard the answer in flight.
        std::string ignored;
        ReadFirstLine(socket, ignored);
        refusal = "ERR wrong user\n";
    } else {
        refusal = Handshake(server, socket);
    }
    // The one place is claimed only by a client that was let in, so a program that only connects cannot keep Etch out.
    const bool claimed = refusal == nullptr && !server.serving.exchange(true);
    if (refusal == nullptr && !claimed) refusal = "ERR busy\n";
    if (refusal != nullptr) {
        SendAll(socket, refusal);
        closesocket(socket);
    } else {
        timeout_ms = 0;  // authenticated: a quiet client may stay connected
        setsockopt(socket, SOL_SOCKET, SO_RCVTIMEO, reinterpret_cast<const char*>(&timeout_ms), sizeof timeout_ms);
        if (SendAll(socket, "OK\n")) {
            server.log(LogLevel::Info, "Etch connected (socket)");
            ServeClient(server, socket);
            server.log(LogLevel::Info, "Etch disconnected (socket)");
        } else {
            closesocket(socket);
        }
    }
    if (claimed) server.serving = false;
    --server.handshaking;
    return 0;
}

bool WriteState(const std::filesystem::path& folder, const std::string& pipe_name, int port, const std::string& token) {
    std::error_code error;
    std::filesystem::create_directories(folder, error);
    if (error && !std::filesystem::is_directory(folder)) return false;
    char json[256];
    std::snprintf(json, sizeof json, "{\"port\": %d, \"token\": \"%s\", \"pid\": %lu}\n", port, token.c_str(),
                  GetCurrentProcessId());
    const std::filesystem::path file = folder / (std::wstring(pipe_name.begin(), pipe_name.end()) + L".json");
    std::filesystem::path temporary = file;
    temporary += L".tmp";
    {
        std::ofstream out(temporary, std::ios::binary | std::ios::trunc);
        out << json;
        if (!out.flush()) return false;
    }
    return MoveFileExW(temporary.c_str(), file.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) != 0;
}

}  // namespace

bool RunningUnderWine() {
    const HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
    return ntdll != nullptr && GetProcAddress(ntdll, "wine_get_version") != nullptr;
}

PeerUids ProcNetTcpUids(std::string_view table, int server_port, int client_port) {
    // "  sl: local_address rem_address st tx_queue:rx_queue tr:tm->when retrnsmt uid timeout inode ..."
    const auto port_of = [](const char* address) {
        const char* colon = std::strrchr(address, ':');
        return colon != nullptr ? static_cast<int>(std::strtol(colon + 1, nullptr, 16)) : -1;
    };
    PeerUids uids;
    for (std::size_t start = 0; start < table.size();) {
        std::size_t end = table.find('\n', start);
        if (end == std::string_view::npos) end = table.size();
        const std::string line(table.substr(start, end - start));
        start = end + 1;
        char local[64] = {}, remote[64] = {};
        unsigned state = 0;
        long uid = -1;
        if (sscanf_s(line.c_str(), " %*d: %63s %63s %x %*s %*s %*s %ld", local, 64u, remote, 64u, &state, &uid) != 4) {
            continue;  // the header, or a line of another shape
        }
        if (std::strncmp(local, "0100007F:", 9) != 0 || std::strncmp(remote, "0100007F:", 9) != 0) continue;
        if (port_of(local) == client_port && port_of(remote) == server_port) uids.client = uid;
        if (port_of(local) == server_port && port_of(remote) == client_port) uids.server = uid;
    }
    return uids;
}

std::filesystem::path BridgeFolder(const std::string& configured) {
    // A Unix path (what Etch passes, and what XDG_STATE_HOME holds) is reached through Z:.
    const auto windows_path = [](std::wstring unix) {
        for (wchar_t& c : unix) {
            if (c == L'/') c = L'\\';
        }
        return std::filesystem::path(L"Z:" + unix);
    };
    if (!configured.empty()) {
        std::wstring wide(configured.begin(), configured.end());  // ASCII paths; others go in as Windows paths
        return !wide.empty() && wide.front() == L'/' ? windows_path(wide) : std::filesystem::path(wide);
    }
    // Newer Wine hides the host's XDG_* and HOME from Windows programs and passes them as WINE_HOST_<name>; Wine and
    // Proton both set WINEHOMEDIR, the host's home as an NT path (\??\Z:\home\me).
    const auto env = [](const wchar_t* name) {
        wchar_t value[MAX_PATH] = {};
        const DWORD n = GetEnvironmentVariableW(name, value, MAX_PATH);
        return n > 0 && n < MAX_PATH ? std::wstring(value, n) : std::wstring();
    };
    const auto host = [&](const wchar_t* name, const wchar_t* renamed) {
        std::wstring value = env(name);
        return value.empty() ? env(renamed) : value;
    };
    std::filesystem::path state;
    if (const std::wstring xdg = host(L"XDG_STATE_HOME", L"WINE_HOST_XDG_STATE_HOME"); !xdg.empty()) {
        state = windows_path(xdg);
    } else {
        std::filesystem::path home;
        if (std::wstring nt = env(L"WINEHOMEDIR"); !nt.empty()) {
            if (nt.rfind(L"\\??\\", 0) == 0) nt.erase(0, 4);
            home = nt;
        } else if (const std::wstring unix = host(L"HOME", L"WINE_HOST_HOME"); !unix.empty()) {
            home = windows_path(unix);
        }
        if (home.empty()) return {};
        state = home / L".local" / L"state";
    }
    return state / L"etch";
}

bool StartSocketServer(const std::string& pipe_name, const Host& host, LogFn log, const std::filesystem::path& folder) {
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        log(LogLevel::Error, "socket: Winsock did not start");
        return false;
    }
    // Lives for the rest of the process, like the threads that use it.
    auto server = std::make_unique<Server>();
    server->pipe_name = pipe_name;
    server->host = &host;
    server->log = log;
    if (!RandomToken(server->token)) {
        log(LogLevel::Error, "socket: no random token (BCryptGenRandom failed)");
        return false;
    }
    const SOCKET listener = socket(AF_INET, SOCK_STREAM, 0);
    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);  // loopback only
    address.sin_port = 0;
    int length = sizeof address;
    if (listener == INVALID_SOCKET || bind(listener, reinterpret_cast<sockaddr*>(&address), sizeof address) != 0 ||
        listen(listener, 8) != 0 || getsockname(listener, reinterpret_cast<sockaddr*>(&address), &length) != 0) {
        log(LogLevel::Error, "socket: cannot listen on 127.0.0.1 (error " + std::to_string(WSAGetLastError()) + ")");
        if (listener != INVALID_SOCKET) closesocket(listener);
        return false;
    }
    const int port = ntohs(address.sin_port);
    if (!WriteState(folder, pipe_name, port, server->token)) {
        log(LogLevel::Error, "socket: cannot write the state file in " + folder.string());
        closesocket(listener);
        return false;
    }
    struct Accept {
        Server* server;
        SOCKET listener;
    };
    auto* accept_args = new Accept{server.get(), listener};
    HANDLE thread = CreateThread(
        nullptr, 0,
        [](void* param) -> DWORD {
            std::unique_ptr<Accept> accept_args(static_cast<Accept*>(param));
            Server& s = *accept_args->server;
            for (;;) {
                const SOCKET client = accept(accept_args->listener, nullptr, nullptr);
                if (client == INVALID_SOCKET) return 0;
                if (s.handshaking.fetch_add(1) >= kMaxHandshaking) {
                    --s.handshaking;
                    closesocket(client);
                    continue;
                }
                HANDLE worker = CreateThread(nullptr, 0, ClientThread, new ClientArgs{&s, client}, 0, nullptr);
                if (worker == nullptr) {
                    --s.handshaking;
                    closesocket(client);
                    continue;
                }
                CloseHandle(worker);
            }
        },
        accept_args, 0, nullptr);
    if (thread == nullptr) {
        log(LogLevel::Error, "socket: cannot start the accept thread (error " + std::to_string(GetLastError()) + ")");
        delete accept_args;
        closesocket(listener);
        return false;
    }
    SetThreadDescription(thread, L"etch socket");
    CloseHandle(thread);
    log(LogLevel::Info, "serving 127.0.0.1:" + std::to_string(port) + " for the extension under Wine (" + pipe_name +
                            "), state in " + folder.string() + ", protocol " + std::to_string(kProtocolVersion));
    if (std::ifstream(L"Z:\\proc\\net\\tcp").good()) {
        log(LogLevel::Info, "socket: a client must also be the same Linux user (checked in /proc/net/tcp)");
    } else {
        log(LogLevel::Warn, "socket: /proc/net/tcp is not readable, so only the token protects the socket");
    }
    static_cast<void>(server.release());  // now the threads'
    return true;
}

}  // namespace etch
