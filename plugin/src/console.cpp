#include "console.hpp"

#include <windows.h>

#include <cstring>

namespace etch {
namespace {

constexpr std::uint64_t kMaxText = 1 << 20;  // a longer result text is taken as garbage

// The game's MSVC std::string and std::vector<std::string>, built by hand so
// that the plugin's own STL does not matter: a 16-byte buffer or a pointer,
// the size, the capacity (15 = inline); three pointers. The same layout Tongs
// uses for the same dispatcher.
struct RawString {
    union {
        char buffer[16];
        const char* pointer;
    };
    std::uint64_t size;
    std::uint64_t capacity;
};
static_assert(sizeof(RawString) == 0x20);

struct RawVector {
    RawString* begin;
    RawString* end;
    RawString* capacity_end;
};
static_assert(sizeof(RawVector) == 0x18);

// The dispatcher's result: a success byte and the text at +8.
struct RawResult {
    std::uint8_t success;
    std::uint8_t padding[7];
    RawString text;
};
static_assert(sizeof(RawResult) == 0x28);

using DispatchFn = RawResult* (*)(void* manager, RawResult* result, RawVector* tokens);
using StringFreeFn = void (*)(RawString* text);

// No C++ objects with destructors here: the bodies run under __try. Any
// structured exception that leaves the game's code ends here, so nothing
// unwinds into the game's frame.
bool ReadPointer(void* const* at, void** out, std::uint32_t* code) {
    __try {
        *out = *at;
        return true;
    } __except (*code = GetExceptionCode(), EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}

bool Dispatch(DispatchFn fn, void* manager, RawResult* result, RawVector* tokens, std::uint32_t* code) {
    __try {
        fn(manager, result, tokens);
        return true;
    } __except (*code = GetExceptionCode(), EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}

bool CopyText(const RawString* text, char* out, std::size_t size, std::uint32_t* code) {
    __try {
        const char* data = text->capacity >= 16 ? text->pointer : text->buffer;
        std::memcpy(out, data, size);
        return true;
    } __except (*code = GetExceptionCode(), EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}

bool FreeText(StringFreeFn fn, RawString* text, std::uint32_t* code) {
    __try {
        fn(text);
        return true;
    } __except (*code = GetExceptionCode(), EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}

}  // namespace

ConsoleResult CallConsole(const ConsoleAddresses& game, const std::vector<std::string>& tokens) {
    ConsoleResult out;
    void* manager = nullptr;
    if (tokens.empty() || game.manager == nullptr) return out;
    if (!ReadPointer(game.manager, &manager, &out.fault_code)) {
        out.faulted = true;
        return out;
    }
    if (manager == nullptr) return out;
    out.called = true;
    // Inline copies of short tokens, pointers into `tokens` for long ones. The
    // dispatcher only reads them and copies what it passes on.
    std::vector<RawString> strings(tokens.size());
    for (std::size_t i = 0; i < tokens.size(); ++i) {
        RawString& s = strings[i];
        std::memset(&s, 0, sizeof s);
        s.size = tokens[i].size();
        if (s.size < 16) {
            std::memcpy(s.buffer, tokens[i].c_str(), tokens[i].size() + 1);
            s.capacity = 15;
        } else {
            s.pointer = tokens[i].c_str();
            s.capacity = s.size;
        }
    }
    RawVector vector{strings.data(), strings.data() + strings.size(), strings.data() + strings.size()};
    RawResult result;
    std::memset(&result, 0, sizeof result);
    if (!Dispatch(reinterpret_cast<DispatchFn>(game.dispatch), manager, &result, &vector, &out.fault_code)) {
        out.faulted = true;
        return out;  // the result may be half built; it is not freed
    }
    out.success = result.success != 0;
    const RawString& text = result.text;
    if (text.size <= text.capacity && text.size <= kMaxText) {
        out.text.resize(static_cast<std::size_t>(text.size));
        if (!CopyText(&text, out.text.data(), out.text.size(), &out.fault_code)) out.text.clear();
    }
    if (!FreeText(reinterpret_cast<StringFreeFn>(game.string_free), &result.text, &out.fault_code)) {
        out.faulted = true;
    }
    return out;
}

}  // namespace etch
