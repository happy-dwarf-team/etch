#include "session.hpp"

#include <windows.h>

#include <cassert>
#include <chrono>
#include <cstdio>

namespace {

void TestIds() {
    assert(etch::IsSessionId("0123456789abcdef0123456789abcdef"));
    assert(!etch::IsSessionId("0123456789ABCDEF0123456789abcdef"));
    assert(!etch::IsSessionId("0123456789abcdef0123456789abcde"));
    assert(!etch::IsSessionId("0123456789abcdef0123456789abcdef0"));
    assert(!etch::IsSessionId("0123456789abcdef0123456789abcdeg"));
    assert(!etch::IsSessionId(""));
    assert(etch::PipeName("0123456789abcdef0123456789abcdef") ==
           L"\\\\.\\pipe\\etch-host-0123456789abcdef0123456789abcdef");
}

void TestEnvironment() {
    SetEnvironmentVariableW(etch::kSessionVariable, nullptr);
    etch::SessionLookup s = etch::ReadSessionId();
    assert(!s.present && !s.id);

    SetEnvironmentVariableW(etch::kSessionVariable, L"fedcba9876543210fedcba9876543210");
    s = etch::ReadSessionId();
    assert(s.present && s.id == "fedcba9876543210fedcba9876543210");

    for (const wchar_t* bad : {L"", L"nope", L"fedcba9876543210fedcba987654321é",
                               L"fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba"}) {
        SetEnvironmentVariableW(etch::kSessionVariable, bad);
        s = etch::ReadSessionId();
        assert(s.present && !s.id);
    }
    SetEnvironmentVariableW(etch::kSessionVariable, nullptr);
}

void TestProcessStart() {
    const std::uint64_t start = etch::ProcessStartMs();
    const auto now = static_cast<std::uint64_t>(
        std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch())
            .count());
    assert(start > 0 && start <= now && now - start < 10 * 60 * 1000);
}

}  // namespace

int main() {
    TestIds();
    TestEnvironment();
    TestProcessStart();
    std::puts("session: ok");
    return 0;
}
