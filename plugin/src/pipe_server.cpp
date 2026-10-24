#include "pipe_server.hpp"

#include <windows.h>
#include <sddl.h>

#include <memory>

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

bool WriteLine(HANDLE pipe, const std::string& line) {
    const std::string text = line + "\n";
    DWORD written = 0;
    return WriteFile(pipe, text.data(), static_cast<DWORD>(text.size()), &written, nullptr) && written == text.size();
}

// Serves one client until it disconnects or the protocol closes the connection.
void ServeClient(Server& server) {
    Connection connection(*server.host);
    std::string pending;
    char chunk[4096];
    for (;;) {
        for (std::size_t eol; (eol = pending.find('\n')) != std::string::npos;) {
            if (eol > kMaxLine) {
                WriteLine(server.pipe, connection.LineTooLong().line);
                return;
            }
            const Reply reply = connection.Handle(std::string_view(pending).substr(0, eol));
            pending.erase(0, eol + 1);
            if (!WriteLine(server.pipe, reply.line) || reply.close) return;
        }
        if (pending.size() > kMaxLine) {
            WriteLine(server.pipe, connection.LineTooLong().line);
            return;
        }
        DWORD read = 0;
        if (!ReadFile(server.pipe, chunk, sizeof chunk, &read, nullptr) || read == 0) return;
        pending.append(chunk, read);
    }
}

DWORD WINAPI ServerThread(void* param) {
    Server& server = *static_cast<Server*>(param);
    for (;;) {
        const bool connected = ConnectNamedPipe(server.pipe, nullptr) || GetLastError() == ERROR_PIPE_CONNECTED;
        if (connected) {
            server.log(LogLevel::Info, "Etch connected");
            ServeClient(server);
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
    server->pipe = CreateNamedPipeW(name.c_str(), PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE,
                                    PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS, 1,
                                    kBufferSize, kBufferSize, 0, &security);
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
