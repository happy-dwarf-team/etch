// The session pipe end to end, in this process: a client connects the way Etch
// does and talks to the server the plugin starts.

#include "json.hpp"
#include "pipe_server.hpp"
#include "session.hpp"

#include <windows.h>

#include <atomic>
#include <cassert>
#include <cstdio>
#include <functional>
#include <memory>
#include <optional>
#include <string>

namespace {

std::atomic<std::uint64_t> g_frame{0};
int g_errors_logged = 0;

void Log(etch::LogLevel level, const std::string& message) {
    if (level == etch::LogLevel::Error) ++g_errors_logged;
    std::printf("  [server] %s\n", message.c_str());
}

std::wstring g_name;

class Client {
public:
    Client() {
        assert(WaitNamedPipeW(g_name.c_str(), 5000));
        pipe_ = CreateFileW(g_name.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, 0, nullptr);
        assert(pipe_ != INVALID_HANDLE_VALUE);
    }
    ~Client() { Close(); }
    Client(const Client&) = delete;
    Client& operator=(const Client&) = delete;

    void Close() {
        if (pipe_ != INVALID_HANDLE_VALUE) CloseHandle(pipe_);
        pipe_ = INVALID_HANDLE_VALUE;
    }

    void Send(const std::string& text) {
        DWORD written = 0;
        assert(WriteFile(pipe_, text.data(), static_cast<DWORD>(text.size()), &written, nullptr));
        assert(written == text.size());
    }

    // The next answer line, or "" when the server closed the connection.
    std::string ReadLine() {
        for (;;) {
            const std::size_t eol = pending_.find('\n');
            if (eol != std::string::npos) {
                std::string line = pending_.substr(0, eol);
                pending_.erase(0, eol + 1);
                return line;
            }
            char chunk[4096];
            DWORD read = 0;
            if (!ReadFile(pipe_, chunk, sizeof chunk, &read, nullptr) || read == 0) return "";
            pending_.append(chunk, read);
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
    HANDLE pipe_ = INVALID_HANDLE_VALUE;
    std::string pending_;
};

void TestOneServerPerName(const etch::Host& host) {
    const int before = g_errors_logged;
    assert(!etch::StartPipeServer(g_name, host, Log));
    assert(g_errors_logged == before + 1);
}

void TestHandshakeAndPing() {
    Client c;
    etch::json::Value a = c.Request(R"({"id":1,"type":"hello","protocol":1})");
    assert(a.Find("ok")->AsBool() == true);
    assert(a.Find("pid")->AsUint() == GetCurrentProcessId());
    g_frame = 77;
    a = c.Request(R"({"id":2,"type":"ping"})");
    assert(a.Find("id")->AsUint() == 2u);
    assert(a.Find("frame")->AsUint() == 77u);
    // Two requests in one write, answered in order.
    c.Send("{\"id\":3,\"type\":\"ping\"}\n{\"id\":4,\"type\":\"ping\"}\n");
    assert(Client::Parse(c.ReadLine()).Find("id")->AsUint() == 3u);
    assert(Client::Parse(c.ReadLine()).Find("id")->AsUint() == 4u);
    // A request split over writes.
    c.Send("{\"id\":5,\"ty");
    c.Send("pe\":\"ping\"}\n");
    assert(Client::Parse(c.ReadLine()).Find("id")->AsUint() == 5u);
}

void TestOneClientAtATime() {
    Client first;
    assert(first.Request(R"({"id":1,"type":"hello","protocol":1})").Find("ok")->AsBool() == true);
    HANDLE second = CreateFileW(g_name.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, 0, nullptr);
    assert(second == INVALID_HANDLE_VALUE && GetLastError() == ERROR_PIPE_BUSY);
    first.Close();
    // The next client starts again with the handshake.
    Client next;
    assert(next.Request(R"({"id":1,"type":"ping"})").Find("error")->AsString() == "handshake_required");
}

void TestClosingAnswers() {
    {
        Client c;
        const etch::json::Value a = c.Request(R"({"id":1,"type":"hello","protocol":99})");
        assert(a.Find("error")->AsString() == "protocol_mismatch");
        assert(c.ReadLine().empty());  // disconnected
    }
    {
        Client c;
        c.Send(std::string(etch::kMaxLine + 1, 'x'));
        const etch::json::Value a = Client::Parse(c.ReadLine());
        assert(a.Find("error")->AsString() == "line_too_long");
        assert(c.ReadLine().empty());
    }
    {
        // Exactly kMaxLine bytes is still a line (and here not JSON).
        Client c;
        c.Send(std::string(etch::kMaxLine, ' ') + "\n");
        assert(Client::Parse(c.ReadLine()).Find("error")->AsString() == "bad_json");
    }
}

}  // namespace

int main() {
    // A name of its own, so parallel test runs do not meet.
    char id[33] = {};
    std::snprintf(id, sizeof id, "%08lx%024llx", GetCurrentProcessId(),
                  static_cast<unsigned long long>(GetTickCount64()));
    assert(etch::IsSessionId(id));
    g_name = etch::PipeName(id);

    etch::Host& host = *new etch::Host;  // used by the server thread until the process ends
    host.ready = [] { return true; };
    host.frame = [] { return g_frame.load(); };
    host.pid = GetCurrentProcessId();
    host.process_start_ms = etch::ProcessStartMs();
    host.session = id;
    host.plugin_version = "0.0.0";
    assert(etch::StartPipeServer(g_name, host, Log));

    TestOneServerPerName(host);
    TestHandshakeAndPing();
    TestOneClientAtATime();
    TestClosingAnswers();
    std::puts("pipe_server: ok");
    std::fflush(stdout);
    // Not `return`: exit() would destroy statics while the server thread still runs.
    ExitProcess(0);
}
