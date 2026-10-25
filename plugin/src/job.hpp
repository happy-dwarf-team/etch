#pragma once

// A preview job (docs/plugin-protocol.md, "Preview job"; spec section 4): on
// the game's main thread, close the wrapper the last job left open, reload both
// preview copies (and textures and localisation when asked), open the black
// wrapper; capture the crop in the next Present; open the white wrapper on the
// main thread; capture again; then, on a worker thread, turn the two crops into
// straight RGBA (etch#22) and write it to the file the webview reads.
//
// The runner knows the game only through Env, so the tests drive it with fake
// frames, Presents and console answers.

#include "console.hpp"
#include "json.hpp"

#include <atomic>
#include <cstdint>
#include <functional>
#include <optional>
#include <string>
#include <vector>

namespace etch {

// A rectangle of the screen, in pixels.
struct Rect {
    std::uint32_t x = 0;
    std::uint32_t y = 0;
    std::uint32_t width = 0;
    std::uint32_t height = 0;
};

struct JobRequest {
    std::vector<std::string> reload;    // the preview copies' file names, for `reload`
    std::vector<std::string> textures;  // `texturefile` values as the .gfx writes them, for `reloadtexture`
    bool localisation = false;          // `reloadloc` too
    std::string black;                  // the wrapper window over black, for `window open`
    std::string white;                  // the wrapper window over white
    Rect crop;                          // from the offline renderer's layout
    std::string output;                 // an absolute path ending in .tga, UTF-8
};

// Reads the members of a `job` request into `out`; the error text when one is
// missing or wrong.
std::optional<std::string> ReadJobRequest(const json::Value& request, JobRequest& out);

// Pixels as a 32-bit back buffer holds them: B, G, R, A (or X) bytes per pixel,
// rows top first, no padding.
struct Bgra {
    std::uint32_t width = 0;
    std::uint32_t height = 0;
    std::vector<std::uint8_t> pixels;
};

// Straight colour and alpha from one crop over black and the same crop over
// white (etch#22): over black B = c·a, over white W = c·a + 255·(1 − a), so
// a = 255 − (W − B) per channel, averaged over the three, and c = B / a. Both
// crops must have one size. The result is B, G, R, A bytes.
Bgra RecoverStraight(const Bgra& black, const Bgra& white);

// An uncompressed 32-bit TGA of BGRA pixels, rows top first.
std::string TgaFile(const Bgra& image);

// One console line a job ran.
struct CommandRecord {
    std::string line;
    bool success = false;
    std::string text;
    double ms = 0;
};

struct JobResult {
    std::string error;  // empty when the job succeeded
    std::string message;
    Rect crop;  // as captured: the request's, clamped to the back buffer
    std::string output;
    std::uint64_t black_frame = 0;  // the frame counter when each crop was taken
    std::uint64_t white_frame = 0;
    std::vector<CommandRecord> commands;
    // Milliseconds: waiting for the main thread, the first step's console
    // calls, the black and the white capture (from arming to the copied crop),
    // the recovery, writing the file, and all of it from the request.
    double queued_ms = 0;
    double commands_ms = 0;
    double black_ms = 0;
    double white_ms = 0;
    double recover_ms = 0;
    double write_ms = 0;
    double total_ms = 0;
};

// The answer line to a finished job.
std::string JobAnswer(std::uint64_t id, const JobResult& result);

// A crop the Present hook copied out of the back buffer.
struct Grab {
    std::string error;  // empty when it worked
    Rect crop;          // clamped to the back buffer
    Bgra image;
};

struct Refusal {
    std::string code;
    std::string message;
};

// Runs one job at a time.
class JobRunner {
public:
    // A capture not taken this many frames after its window opened fails.
    static constexpr std::uint64_t kCaptureFrames = 10;

    struct Env {
        std::function<ConsoleResult(const std::vector<std::string>& tokens)> console;  // main thread
        // Queues work for the main thread after its next frame; false when it cannot.
        std::function<bool(std::function<void()> work)> run_on_main;
        // Runs work on a worker thread.
        std::function<void(std::function<void()> work)> run_later;
        std::function<double()> now_ms;
        std::function<std::uint64_t()> frame;
        // Writes a whole file; false and a reason when it cannot.
        std::function<bool(const std::string& path, const std::string& bytes, std::string& error)> write_file;
    };

    explicit JobRunner(Env env) : env_(std::move(env)) {}

    // Any thread. Starts a job, or says why not: `busy` while one runs,
    // `game_fault` after a console call faulted.
    std::optional<Refusal> Start(JobRequest request, std::function<void(const JobResult&)> done);

    // Whether a Present should grab: cheap enough for every Present.
    bool Capturing() const;

    // The Present thread, before the game's Present: grabs the armed crop.
    void OnPresent(const std::function<Grab(const Rect& crop)>& grab);

    // The main thread, after each frame: fails a capture that never came.
    void OnFrame(std::uint64_t frame);

private:
    enum State : int { kIdle, kQueued, kCaptureBlack, kGrabBlack, kBetween, kCaptureWhite, kGrabWhite, kFinishing };

    void Commands();
    void OpenWhite();
    void Compose();
    // Runs one line on the main thread and records it; false when it faulted.
    bool Run(std::vector<std::string> tokens, ConsoleResult& result);
    // Any thread that owns the job (state kFinishing or about to be): hands
    // the result to `done` on a worker thread.
    void Fail(std::string code, std::string message);
    void Faulted(const ConsoleResult& result);
    void Refused(const char* code);
    void Finish();
    void Arm(State capture);

    Env env_;
    std::atomic<int> state_{kIdle};
    std::atomic<bool> faulted_{false};
    std::atomic<std::uint64_t> armed_frame_{0};

    // Owned by whichever thread runs the job's current step.
    JobRequest request_;
    std::function<void(const JobResult&)> done_;
    JobResult result_;
    Bgra black_;
    Bgra white_;
    double started_ = 0;
    double armed_at_ = 0;
    // Main thread: the wrapper the last job left open, closed before the next
    // reload (a reload of an open window's file crashes the game, etch#22).
    std::string open_;
};

}  // namespace etch
