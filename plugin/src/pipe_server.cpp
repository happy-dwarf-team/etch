#include "pipe_server.hpp"

#include <windows.h>
#include <sddl.h>

#include <memory>
#include <mutex>

namespace etch {
namespace {

constexpr DWORD kBufferSize = 64 * 1024;

struct Server {
    std::wstring name;
    const Host* host = nullptr;
    LogFn log;
    HANDLE pipe = INVALID_HANDLE_VALUE;
    PSECURITY_DESCRIPTOR descriptor = nullptr;
};

std::string Narrow(const std::wstring& text) {
    std::string out;
    for (const wchar_t c : text) out += c < 0x80 ? static_cast<char>(c) : '?';
    return out;
}

// A DACL granting access only to the user the game runs as (and SYSTEM).
PSECURITY_DESCRIPTOR BuildSecurity() {
    HANDLE token = nullptr;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return nullptr;
    DWORD size = 0;
    GetTokenInformation(token, TokenUser, nullptr, 0, &size);
    auto buffer = std::make_unique<unsigned char[]>(size);
    const bool got = GetTokenInformation(token, TokenUser, buffer.get(), size, &size) != 0;
    CloseHandle(token);
    if (!got) return nullptr;
    LPWSTR sid = nullptr;
    if (!ConvertSidToStringSidW(reinterpret_cast<TOKEN_USER*>(buffer.get())->User.Sid, &sid)) return nullptr;
    const std::wstring sddl = std::wstring(L"D:P(A;;GA;;;") + sid + L")(A;;GA;;;SY)";
    LocalFree(sid);
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.c_str(), SDDL_REVISION_1, &descriptor, nullptr)) {
        return nullptr;
    }
    return descriptor;
}

// Waits for an overlapped operation that ReadFile, WriteFile or
// ConnectNamedPipe started; false when it failed. The pipe is overlapped so
// that a later answer can be written from another thread while the pipe
// thread waits in ReadFile: on a synchronous handle the write would wait for
// the read.
bool Complete(HANDLE pipe, OVERLAPPED& overlapped, BOOL started, DWORD& bytes) {
    if (!started && GetLastError() != ERROR_IO_PENDING) return false;
    return GetOverlappedResult(pipe, &overlapped, &bytes, TRUE) != 0;
}

// One connected client's end: writes from the pipe thread and from other
// threads take turns, and stop once the client is gone.
struct Link {
    std::mutex mutex;
    HANDLE pipe = INVALID_HANDLE_VALUE;
    HANDLE event = nullptr;  // for writes; reads have their own
    bool open = true;

    bool WriteLine(const std::string& line) {
        const std::lock_guard lock(mutex);
        if (!open) return false;
        const std::string text = line + "\n";
        OVERLAPPED overlapped{};
        overlapped.hEvent = event;
        DWORD written = 0;
        const BOOL started = WriteFile(pipe, text.data(), static_cast<DWORD>(text.size()), nullptr, &overlapped);
        return Complete(pipe, overlapped, started, written) && written == text.size();
    }

    void Close() {
        const std::lock_guard lock(mutex);
        open = false;
    }
};

// Serves one client until it disconnects or the protocol closes the connection.
void ServeClient(Server& server, HANDLE read_event) {
    auto link = std::make_shared<Link>();
    link->pipe = server.pipe;
    link->event = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    Connection connection(*server.host, [link](const std::string& line) { link->WriteLine(line); });
    const auto serve = [&] {
        std::string pending;
        char chunk[4096];
        for (;;) {
            for (std::size_t eol; (eol = pending.find('\n')) != std::string::npos;) {
                if (eol > kMaxLine) {
                    link->WriteLine(connection.LineTooLong().line);
                    return;
                }
                const Reply reply = connection.Handle(std::string_view(pending).substr(0, eol));
                pending.erase(0, eol + 1);
                if (!reply.line.empty() && !link->WriteLine(reply.line)) return;
                if (reply.close) return;
            }
            if (pending.size() > kMaxLine) {
                link->WriteLine(connection.LineTooLong().line);
                return;
            }
            OVERLAPPED overlapped{};
            overlapped.hEvent = read_event;
            DWORD read = 0;
            const BOOL started = ReadFile(server.pipe, chunk, sizeof chunk, nullptr, &overlapped);
            if (!Complete(server.pipe, overlapped, started, read) || read == 0) return;
            pending.append(chunk, read);
        }
    };
    serve();
    link->Close();
    // The write event is closed when the last answer that could still come is gone with the link.
    CloseHandle(link->event);
    link->event = nullptr;
}

DWORD WINAPI ServerThread(void* param) {
    Server& server = *static_cast<Server*>(param);
    HANDLE event = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    for (;;) {
        OVERLAPPED overlapped{};
        overlapped.hEvent = event;
        DWORD ignored = 0;
        const BOOL started = ConnectNamedPipe(server.pipe, &overlapped);
        // A client that came between DisconnectNamedPipe and here is connected already.
        const bool connected =
            (!started && GetLastError() == ERROR_PIPE_CONNECTED) || Complete(server.pipe, overlapped, started, ignored);
        if (connected) {
            server.log(LogLevel::Info, "Etch connected");
            ServeClient(server, event);
            server.log(LogLevel::Info, "Etch disconnected");
        }
        FlushFileBuffers(server.pipe);
        DisconnectNamedPipe(server.pipe);
    }
}

}  // namespace

bool StartPipeServer(const std::wstring& name, const Host& host, LogFn log) {
    // Lives for the rest of the process, like the thread that uses it.
    auto server = std::make_unique<Server>();
    server->name = name;
    server->host = &host;
    server->log = std::move(log);
    server->descriptor = BuildSecurity();
    if (!server->descriptor) {
        server->log(LogLevel::Error,
                    "cannot build the pipe's security descriptor (error " + std::to_string(GetLastError()) + ")");
        return false;
    }
    SECURITY_ATTRIBUTES security{sizeof(SECURITY_ATTRIBUTES), server->descriptor, FALSE};
    // One instance, claimed first: nobody else can serve the name, and a second
    // client waits until the first leaves.
    server->pipe =
        CreateNamedPipeW(name.c_str(), PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE | FILE_FLAG_OVERLAPPED,
                         PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS, 1, kBufferSize,
                         kBufferSize, 0, &security);
    if (server->pipe == INVALID_HANDLE_VALUE) {
        server->log(LogLevel::Error, "cannot create " + Narrow(name) + " (error " + std::to_string(GetLastError()) +
                                         "); is another process serving it?");
        LocalFree(server->descriptor);
        return false;
    }
    HANDLE thread = CreateThread(nullptr, 0, ServerThread, server.get(), 0, nullptr);
    if (thread == nullptr) {
        server->log(LogLevel::Error, "cannot start the pipe thread (error " + std::to_string(GetLastError()) + ")");
        CloseHandle(server->pipe);
        LocalFree(server->descriptor);
        return false;
    }
    SetThreadDescription(thread, L"etch pipe");
    CloseHandle(thread);
    server->log(LogLevel::Info, "serving " + Narrow(name) + ", protocol " + std::to_string(kProtocolVersion));
    static_cast<void>(server.release());  // now the thread's
    return true;
}

}  // namespace etch
