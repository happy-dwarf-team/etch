#include "session.hpp"

#include <windows.h>

namespace etch {

bool IsSessionId(std::string_view id) {
    if (id.size() != kSessionLength) return false;
    for (const char c : id) {
        if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
    }
    return true;
}

SessionLookup ReadSessionId() {
    SessionLookup lookup;
    wchar_t buffer[64] = {};
    SetLastError(ERROR_SUCCESS);  // an empty value returns 0 too, without an error
    const DWORD length = GetEnvironmentVariableW(kSessionVariable, buffer, static_cast<DWORD>(std::size(buffer)));
    if (length == 0 && GetLastError() == ERROR_ENVVAR_NOT_FOUND) return lookup;
    lookup.present = true;
    if (length >= std::size(buffer)) return lookup;  // too long to be an id
    std::string id;
    for (DWORD i = 0; i < length; ++i) {
        if (buffer[i] > 0x7F) return lookup;
        id += static_cast<char>(buffer[i]);
    }
    if (IsSessionId(id)) lookup.id = std::move(id);
    return lookup;
}

std::wstring PipeName(std::string_view id) {
    std::wstring name = L"\\\\.\\pipe\\etch-host-";
    for (const char c : id) name += static_cast<wchar_t>(c);
    return name;
}

std::uint64_t ProcessStartMs() {
    FILETIME created{}, exited{}, kernel{}, user{};
    if (!GetProcessTimes(GetCurrentProcess(), &created, &exited, &kernel, &user)) return 0;
    const std::uint64_t ticks = (static_cast<std::uint64_t>(created.dwHighDateTime) << 32) | created.dwLowDateTime;
    constexpr std::uint64_t kUnixEpochTicks = 116444736000000000ULL;  // 1970-01-01 in 100 ns since 1601
    if (ticks < kUnixEpochTicks) return 0;
    return (ticks - kUnixEpochTicks) / 10000;
}

}  // namespace etch
