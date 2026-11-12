// The session socket end to end, in this process: a Winsock client connects the way Etch's extension does on Linux and
// talks to the server the plugin starts under Wine. Nothing here needs a game, and the same test runs on Windows.

#include <winsock2.h>
#include <ws2tcpip.h>

#include "json.hpp"
#include "session.hpp"
#include "socket_server.hpp"

#include <windows.h>

#include <atomic>
#include <cassert>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <thread>
#include <utility>

namespace {

namespace fs = std::filesystem;

std::atomic<std::uint64_t> g_frame{0};
std::string g_pipe_name;
fs::path g_folder;
int g_port = 0;
std::string g_token;

void Log(etch::LogLevel, const std::string& message) { std::printf("  [server] %s\n", message.c_str()); }

// The state file the way the extension reads it: by looking for its keys.
void ReadState() {
    std::ifstream in(g_folder / (std::wstring(g_pipe_name.begin(), g_pipe_name.end()) + L".json"), std::ios::binary);
    assert(in);
    std::stringstream text;
    text << in.rdbuf();
    const std::string json = text.str();
    const auto port_at = json.find("\"port\":");
    assert(port_at != std::string::npos);
    g_port = static_cast<int>(std::strtol(json.c_str() + port_at + 7, nullptr, 10));
    const auto token_at = json.find("\"token\": \"");
    assert(token_at != std::string::npos);
    const auto start = token_at + 10;
    g_token = json.substr(start, json.find('"', start) - start);
    assert(g_port > 0 && g_token.size() == 32);
    assert(json.find("\"pid\":") != std::string::npos);
}

SOCKET Connect() {
    SOCKET s = socket(AF_INET, SOCK_STREAM, 0);
    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_port = htons(static_cast<u_short>(g_port));
    inet_pton(AF_INET, "127.0.0.1", &address.sin_addr);
    assert(connect(s, reinterpret_cast<sockaddr*>(&address), sizeof address) == 0);
    const DWORD timeout_ms = 15000;
    setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, reinterpret_cast<const char*>(&timeout_ms), sizeof timeout_ms);
    return s;
}

class Client {
public:
    explicit Client(SOCKET socket) : socket_(socket) {}
    ~Client() { Close(); }
    Client(const Client&) = delete;
    Client& operator=(const Client&) = delete;
    Client(Client&& other) noexcept : socket_(other.socket_), pending_(std::move(other.pending_)) {
        other.socket_ = INVALID_SOCKET;
    }

    void Close() {
        if (socket_ != INVALID_SOCKET) closesocket(socket_);
        socket_ = INVALID_SOCKET;
    }

    SOCKET Handle() const { return socket_; }

    void Send(const std::string& text) { send(socket_, text.data(), static_cast<int>(text.size()), 0); }

    // The next line, or "" when the server closed the connection.
    std::string ReadLine() {
        for (;;) {
            const std::size_t eol = pending_.find('\n');
            if (eol != std::string::npos) {
                std::string line = pending_.substr(0, eol);
                pending_.erase(0, eol + 1);
                return line;
            }
            char chunk[4096];
            const int got = recv(socket_, chunk, sizeof chunk, 0);
            if (got <= 0) return "";
            pending_.append(chunk, static_cast<std::size_t>(got));
        }
    }

    etch::json::Value Request(const std::string& line) {
        Send(line + "\n");
        return Parse(ReadLine());
    }

    static etch::json::Value Parse(const std::string& line) {
        const auto parsed = etch::json::Parse(line);
        assert(parsed.value);
        return *parsed.value;
    }

private:
    SOCKET socket_;
    std::string pending_;
};

// A connection that has passed the handshake.
Client Login() {
    Client c(Connect());
    c.Send("RELAY " + g_token + " " + g_pipe_name + "\n");
    assert(c.ReadLine() == "OK");
    return c;
}

std::string Ask(const std::string& request) {
    Client c(Connect());
    c.Send(request);
    return c.ReadLine();
}

void TestRefusals() {
    assert(Ask("hello\n") == "ERR bad request");
    assert(Ask("RELAY 00 " + g_pipe_name + "\n") == "ERR bad token");
    assert(Ask("RELAY " + g_token + " tongs\n") == "ERR pipe not served");
    assert(Ask("RELAY " + g_token + " etch-host-0123456789abcdef0123456789abcdef\n") == "ERR pipe not served");
}

void TestHandshakeAndPing() {
    Client c = Login();
    etch::json::Value a = c.Request(R"({"id":1,"type":"hello","protocol":2})");
    assert(a.Find("ok")->AsBool() == true);
    assert(a.Find("pid")->AsUint() == GetCurrentProcessId());
    g_frame = 77;
    a = c.Request(R"({"id":2,"type":"ping"})");
    assert(a.Find("id")->AsUint() == 2u && a.Find("frame")->AsUint() == 77u);
    // Two requests in one write, answered in order, and a request split over writes.
    c.Send("{\"id\":3,\"type\":\"ping\"}\n{\"id\":4,\"type\":\"ping\"}\n");
    assert(Client::Parse(c.ReadLine()).Find("id")->AsUint() == 3u);
    assert(Client::Parse(c.ReadLine()).Find("id")->AsUint() == 4u);
    c.Send("{\"id\":5,\"ty");
    c.Send("pe\":\"ping\"}\n");
    assert(Client::Parse(c.ReadLine()).Find("id")->AsUint() == 5u);
}

void TestOneClientAtATime() {
    Client first = Login();
    assert(first.Request(R"({"id":1,"type":"hello","protocol":2})").Find("ok")->AsBool() == true);
    Client second(Connect());  // authenticated, but the place is taken
    second.Send("RELAY " + g_token + " " + g_pipe_name + "\n");
    assert(second.ReadLine() == "ERR busy");
    first.Close();
    // The next client gets the place and starts again with the handshake.
    for (int i = 0; i < 100; ++i) {  // the server thread needs a moment to see the client leave
        Client attempt(Connect());
        attempt.Send("RELAY " + g_token + " " + g_pipe_name + "\n");
        if (attempt.ReadLine() == "OK") {
            assert(attempt.Request(R"({"id":1,"type":"ping"})").Find("error")->AsString() == "handshake_required");
            return;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
    assert(false && "the place was never freed");
}

void TestAProgramThatOnlyConnectsDoesNotKeepEtchOut() {
    Client idle(Connect());  // sends nothing, for the length of this test
    Client c = Login();
    assert(c.Request(R"({"id":1,"type":"hello","protocol":2})").Find("ok")->AsBool() == true);
}

void TestClosingAnswers() {
    {
        Client c = Login();
        const etch::json::Value a = c.Request(R"({"id":1,"type":"hello","protocol":99})");
        assert(a.Find("error")->AsString() == "protocol_mismatch");
        assert(c.ReadLine().empty());  // disconnected
    }
    {
        Client c = Login();
        c.Send(std::string(etch::kMaxLine + 1, 'x'));
        assert(Client::Parse(c.ReadLine()).Find("error")->AsString() == "line_too_long");
        assert(c.ReadLine().empty());
    }
}

void TestSilentClientIsCutOff() {
    Client silent(Connect());
    const auto begin = std::chrono::steady_clock::now();
    assert(silent.ReadLine() == "ERR bad request");  // after its handshake timeout
    const auto waited = std::chrono::duration_cast<std::chrono::seconds>(std::chrono::steady_clock::now() - begin);
    assert(waited.count() >= 3 && waited.count() <= 12);
}

void ClearFolderEnvironment() {
    for (const wchar_t* name : {L"XDG_STATE_HOME", L"WINE_HOST_XDG_STATE_HOME", L"WINEHOMEDIR", L"HOME", L"WINE_HOST_HOME"}) {
        SetEnvironmentVariableW(name, nullptr);
    }
}

void TestFolder() {
    ClearFolderEnvironment();
    assert(etch::BridgeFolder("").empty());  // no idea where the host's home is
    SetEnvironmentVariableW(L"WINEHOMEDIR", L"\\??\\Z:\\home\\me");
    assert(etch::BridgeFolder("") == fs::path(L"Z:\\home\\me\\.local\\state\\etch"));
    SetEnvironmentVariableW(L"XDG_STATE_HOME", L"/data/state");
    assert(etch::BridgeFolder("") == fs::path(L"Z:\\data\\state\\etch"));
    ClearFolderEnvironment();
    SetEnvironmentVariableW(L"WINE_HOST_HOME", L"/home/you");
    assert(etch::BridgeFolder("") == fs::path(L"Z:\\home\\you\\.local\\state\\etch"));
    assert(etch::BridgeFolder("/tmp/x") == fs::path(L"Z:\\tmp\\x"));  // what Etch passes: a Unix path, through Z:
    assert(etch::BridgeFolder("D:\\bridge") == fs::path(L"D:\\bridge"));
    ClearFolderEnvironment();
}

void TestProcNetTcp() {
    const char* table =
        "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n"
        "   0: 00000000:0016 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 11 1 0 100 0 0 10 0\n"
        "   1: 0100007F:A7C1 0100007F:C350 01 00000000:00000000 00:00000000 00000000  1001        0 12 1 0 20 4 28 10 -1\n"
        "   2: 0100007F:C350 0100007F:A7C1 01 00000000:00000000 00:00000000 00000000  1000        0 13 1 0 20 4 29 10 -1\n"
        "   3: 0A00020F:A7C2 0A00020F:C350 01 00000000:00000000 00:00000000 00000000  7777        0 14 1 0 20 4 29 10 -1\n";
    const etch::PeerUids other_user = etch::ProcNetTcpUids(table, 0xC350, 0xA7C1);
    assert(other_user.client == 1001 && other_user.server == 1000);
    assert(etch::ProcNetTcpUids(table, 0xC350, 0x1234).client < 0);
    assert(etch::ProcNetTcpUids(table, 0xC350, 0xA7C2).client < 0);  // only 127.0.0.1 counts
    assert(etch::ProcNetTcpUids("", 1, 2).client < 0);
    // The real table, where there is one (Wine on Linux): it lists this very connection, with the same owner at both ends.
    std::ifstream probe(L"Z:\\proc\\net\\tcp", std::ios::binary);
    if (!probe) {
        std::puts("  skipped the real /proc/net/tcp: not Wine on Linux");
        return;
    }
    Client c = Login();
    sockaddr_in local{};
    int size = sizeof local;
    assert(getsockname(c.Handle(), reinterpret_cast<sockaddr*>(&local), &size) == 0);
    std::ifstream now(L"Z:\\proc\\net\\tcp", std::ios::binary);  // the connection exists now
    std::stringstream text;
    text << now.rdbuf();
    const etch::PeerUids uids = etch::ProcNetTcpUids(text.str(), g_port, ntohs(local.sin_port));
    assert(uids.client >= 0 && uids.server >= 0 && uids.client == uids.server);
}

}  // namespace

int main() {
    WSADATA wsa;
    assert(WSAStartup(MAKEWORD(2, 2), &wsa) == 0);
    char id[33] = {};
    std::snprintf(id, sizeof id, "%08lx%024llx", GetCurrentProcessId(), static_cast<unsigned long long>(GetTickCount64()));
    assert(etch::IsSessionId(id));
    g_pipe_name = std::string("etch-host-") + id;
    g_folder = fs::temp_directory_path() / ("etch-socket-test-" + std::to_string(GetCurrentProcessId()));
    fs::remove_all(g_folder);

    etch::Host& host = *new etch::Host;  // used by the server threads until the process ends
    host.ready = [] { return true; };
    host.frame = [] { return g_frame.load(); };
    host.pid = GetCurrentProcessId();
    host.process_start_ms = etch::ProcessStartMs();
    host.session = id;
    host.plugin_version = "0.0.0";
    assert(etch::StartSocketServer(g_pipe_name, host, Log, g_folder));
    ReadState();

    TestRefusals();
    TestHandshakeAndPing();
    TestOneClientAtATime();
    TestAProgramThatOnlyConnectsDoesNotKeepEtchOut();
    TestClosingAnswers();
    TestFolder();
    TestProcNetTcp();
    TestSilentClientIsCutOff();
    std::error_code ignored;
    fs::remove_all(g_folder, ignored);
    std::puts("socket_server: ok");
    std::fflush(stdout);
    // Not `return`: exit() would destroy statics while the server threads still run.
    ExitProcess(0);
}
