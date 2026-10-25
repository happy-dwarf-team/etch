#pragma once

// The game's console, called directly (etch#21): the main menu has the console
// manager but no game session, so Etch runs `reload`, `window open` and the
// rest through the game's own dispatcher, the way the console window would.
// Main thread only.

#include <cstdint>
#include <string>
#include <vector>

namespace etch {

// What a console call needs from the game: verified addresses (symbols.toml).
struct ConsoleAddresses {
    // Where the game keeps its console manager; the pointer is null until the
    // console is first used (it is set in the main menu, etch#21).
    void* const* manager = nullptr;
    // (manager, result, tokens) -> result: runs one tokenised line.
    void* dispatch = nullptr;
    // The game's std::string destructor, for the result's text.
    void* string_free = nullptr;
};

struct ConsoleResult {
    bool called = false;   // false: no manager yet, nothing ran
    bool faulted = false;  // the game's code raised a structured exception
    std::uint32_t fault_code = 0;
    bool success = false;  // the dispatcher's success byte
    std::string text;      // its answer, such as "Window opened"
};

// Runs one console line, already split into tokens. A structured exception
// from the game's code is caught and reported; after one the game's state is
// unknown, and the caller stops using the console.
ConsoleResult CallConsole(const ConsoleAddresses& game, const std::vector<std::string>& tokens);

}  // namespace etch
