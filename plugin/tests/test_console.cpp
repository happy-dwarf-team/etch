// The console call against a fake dispatcher with the game's layouts: tokens
// in, success byte and text out, the text freed with the given destructor, and
// a structured exception caught.

#include "console.hpp"

#include <cassert>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

namespace {

struct RawString {
    union {
        char buffer[16];
        const char* pointer;
    };
    std::uint64_t size;
    std::uint64_t capacity;
};

struct RawVector {
    RawString* begin;
    RawString* end;
    RawString* capacity_end;
};

struct RawResult {
    std::uint8_t success;
    std::uint8_t padding[7];
    RawString text;
};

std::vector<std::string> g_seen;
void* g_manager_seen = nullptr;
int g_freed = 0;

std::string Text(const RawString& s) {
    return std::string(s.capacity >= 16 ? s.pointer : s.buffer, static_cast<std::size_t>(s.size));
}

void SetText(RawString& s, const std::string& text) {
    std::memset(&s, 0, sizeof s);
    s.size = text.size();
    if (text.size() < 16) {
        std::memcpy(s.buffer, text.c_str(), text.size() + 1);
        s.capacity = 15;
    } else {
        char* heap = new char[text.size() + 1];
        std::memcpy(heap, text.c_str(), text.size() + 1);
        s.pointer = heap;
        s.capacity = text.size();
    }
}

RawResult* FakeDispatch(void* manager, RawResult* result, RawVector* tokens) {
    g_manager_seen = manager;
    g_seen.clear();
    for (RawString* t = tokens->begin; t != tokens->end; ++t) g_seen.push_back(Text(*t));
    if (g_seen[0] == "crash") {
        volatile int* null = nullptr;
        *null = 1;
    }
    result->success = g_seen[0] == "window" ? 1 : 0;
    SetText(result->text, g_seen[0] == "window" ? "Window opened" : "a longer answer than sixteen bytes");
    return result;
}

void FakeFree(RawString* text) {
    ++g_freed;
    if (text->capacity >= 16) delete[] text->pointer;
}

}  // namespace

int main() {
    int manager_object = 0;
    void* manager = &manager_object;
    etch::ConsoleAddresses game;
    game.manager = &manager;
    game.dispatch = reinterpret_cast<void*>(&FakeDispatch);
    game.string_free = reinterpret_cast<void*>(&FakeFree);

    // A short and a long token, the result text inline.
    etch::ConsoleResult r = etch::CallConsole(game, {"window", "open", "etch_countrydiplomacyview_backdrop"});
    assert(r.called && !r.faulted && r.success);
    assert(r.text == "Window opened");
    assert(g_manager_seen == manager);
    assert((g_seen == std::vector<std::string>{"window", "open", "etch_countrydiplomacyview_backdrop"}));
    assert(g_freed == 1);

    // The result text on the heap, freed by the game's destructor.
    r = etch::CallConsole(game, {"reload", "etch_goto.gui"});
    assert(r.called && !r.success);
    assert(r.text == "a longer answer than sixteen bytes");
    assert(g_freed == 2);

    // An access violation in the game's code is caught; nothing is freed.
    r = etch::CallConsole(game, {"crash"});
    assert(r.called && r.faulted);
    assert(r.fault_code == 0xC0000005u);
    assert(g_freed == 2);

    // No manager yet: nothing runs.
    manager = nullptr;
    r = etch::CallConsole(game, {"reload", "etch_goto.gui"});
    assert(!r.called && !r.faulted);
    assert(etch::CallConsole(game, {}).called == false);

    std::puts("console: ok");
    return 0;
}
