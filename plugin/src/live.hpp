#pragma once

// The live game's jobs (docs/plugin-protocol.md, protocol 2; v2 specification
// section 6): a reload or a save, one at a time, on the game's main thread.
//
// A reload closes the windows Etch names, runs its console lines, closes again
// a window the lines showed that was hidden before (a rebuild opens the
// province view, H2), and compares the top-level windows built from the saved
// files before and after the lines: those still alive afterwards were not
// rebuilt and are stale (H3). It compares widget ids, never a liveness read of
// the definitions, which the game's reuse of freed memory makes unsound.
//
// The runner knows the game only through Env, so the tests drive it with fake
// console answers and widget trees.

#include "console.hpp"
#include "json.hpp"

#include <atomic>
#include <cstdint>
#include <functional>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace etch {

// A top-level window of the game's widget tree, as tongs.ui reads it.
struct Root {
    std::uint64_t id = 0;  // its address: the same while it lives
    std::string name;
    std::string file;  // the game path of its definition's file; empty when stale or unknown
    bool visible = false;
};

// The game session, as anvil-game last reported it.
struct GameSession {
    bool ironman = false;
    bool multiplayer = false;
    std::uint64_t number = 0;
};

struct ReloadRequest {
    std::vector<std::string> lines;        // console lines, each one AllowedLine accepts
    std::vector<std::string> check;        // game paths whose top-level windows are checked
    std::vector<std::string> close;        // windows closed through the game before the lines
    std::vector<std::string> keep_hidden;  // windows closed again when the lines showed them
};

// Reads the members of a `reload` request into `out`; the error text when one
// is missing or wrong.
std::optional<std::string> ReadReloadRequest(const json::Value& request, ReloadRequest& out);

// Splits a console line the live game may run into its tokens: `reload
// <name>.gui`, `reloadloc` or `reloadtexture <texture>`. Anything else is
// refused with the reason, among them `reload guianim` (it crashed the game),
// `reload texture` (a 1.3 s freeze) and `reload assets` (not checked), H10.
std::optional<std::string> AllowedLine(std::string_view line, std::vector<std::string>& tokens);

// A save's file name without `.eu4`: letters, digits, `_` and `-`, at most 64.
bool IsSaveName(std::string_view name);

struct StaleCheck {
    std::size_t checked = 0;  // top-level windows built from the files before the lines
    std::vector<Root> stale;  // of those, the ones alive after them, as read after
};

// The windows of `before` built from one of `files` (game paths, compared
// ignoring case and slash direction) that are still in `after`, by id.
StaleCheck CompareRoots(const std::vector<Root>& before, const std::vector<Root>& after,
                        const std::vector<std::string>& files);

// One console line a job ran.
struct LineResult {
    std::string line;
    bool success = false;
    std::string text;
    double ms = 0;
};

struct ReloadResult {
    std::string error;  // empty when the job ran
    std::string message;
    std::vector<LineResult> lines;
    std::vector<std::string> closed;        // windows of `close` that were visible and were closed
    std::vector<std::string> hidden_again;  // windows of `keep_hidden` closed again
    bool tree = false;                      // tongs.ui read the windows; without it no stale check
    StaleCheck stale;
    std::vector<Root> visible;  // the visible top-level windows after the job that have a file
    std::size_t roots_before = 0;
    std::size_t roots_after = 0;
    double queued_ms = 0;  // from the request to the main thread
    double run_ms = 0;     // on the main thread
};

std::string ReloadAnswer(std::uint64_t id, const ReloadResult& result);

struct SaveResult {
    std::string error;
    std::string message;
    LineResult line;
    double queued_ms = 0;
};

std::string SaveAnswer(std::uint64_t id, const SaveResult& result);

struct Refusal {
    std::string code;
    std::string message;
};

// Runs one job at a time.
class LiveJobs {
public:
    struct Env {
        std::function<ConsoleResult(const std::vector<std::string>& tokens)> console;  // main thread
        // The top-level windows, hidden and stale ones too; nullopt without tongs.ui. Main thread.
        std::function<std::optional<std::vector<Root>>()> roots;
        // The running game session; nullopt in the main menu. Any thread.
        std::function<std::optional<GameSession>()> session;
        // Queues work for the main thread after its next frame; false when it cannot.
        std::function<bool(std::function<void()> work)> run_on_main;
        // Runs work on a worker thread.
        std::function<void(std::function<void()> work)> run_later;
        std::function<double()> now_ms;
    };

    explicit LiveJobs(Env env) : env_(std::move(env)) {}

    // Any thread. Starts a job, or says why not: `busy` while one runs,
    // `not_available` in ironman and multiplayer (the console refuses them,
    // and Etch never goes around it), `console_broken` after a console call
    // faulted. `done` is called once, on a worker thread.
    std::optional<Refusal> Reload(ReloadRequest request, std::function<void(const ReloadResult&)> done);
    std::optional<Refusal> Save(std::string name, std::function<void(const SaveResult&)> done);

    // Whether a job waits for or runs on the main thread: the game does not
    // draw while it saves, so a ping says so.
    bool Busy() const { return busy_.load(); }

private:
    std::optional<Refusal> Begin();
    void RunReload(const ReloadRequest& request, ReloadResult& result);
    // Runs one line on the main thread and records it; false when it faulted.
    bool Run(const std::vector<std::string>& tokens, LineResult& record, std::string& error, std::string& message);

    Env env_;
    std::atomic<bool> busy_{false};
    std::atomic<bool> faulted_{false};
};

}  // namespace etch
