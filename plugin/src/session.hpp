#pragma once

// Which game host start this process is: Etch puts a fresh id into the
// environment of every game it starts, and the plugin serves its pipe under
// that id (docs/plugin-protocol.md, "Finding the pipe").

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

namespace etch {

inline constexpr wchar_t kSessionVariable[] = L"ETCH_HOST_SESSION";
inline constexpr std::size_t kSessionLength = 32;  // lowercase hex: 128 random bits

// A valid session id: exactly kSessionLength characters of [0-9a-f].
bool IsSessionId(std::string_view id);

struct SessionLookup {
    std::optional<std::string> id;  // set when the variable holds a valid id
    bool present = false;           // the variable is set (valid or not)
};

// Reads kSessionVariable from this process's environment.
SessionLookup ReadSessionId();

// \\.\pipe\etch-host-<id>
std::wstring PipeName(std::string_view id);

// The creation time of this process in Unix milliseconds, 0 when unknown.
// With the pid, it tells Etch which process it is talking to.
std::uint64_t ProcessStartMs();

}  // namespace etch
