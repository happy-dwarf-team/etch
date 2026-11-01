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
#include <memory>
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
    bool on_screen = true;  // its rect meets the game window's client area
};

// The game session, as anvil-game last reported it.
struct GameSession {
    bool ironman = false;
    bool multiplayer = false;
    std::uint64_t number = 0;
};

// The province view as Tongs' tongs.navigation reads it (H8).
struct ProvinceView {
    std::int32_t selected = 0;        // the province the selection holds; 0: none (it stays when the view closes)
    std::int32_t shown = 0;           // the province the view shows; 0: none (it stays too)
    bool view_shown = false;          // the province view's window `provinceview` is shown
    bool colonisation_shown = false;  // `colonisationpanel`, which shows a province without an owner
    bool views_open = false;          // a view of the session (the country view, the ledger...) is shown

    // The province on screen: `shown` while one of the two windows is, else 0.
    std::int32_t OnScreen() const { return view_shown || colonisation_shown ? shown : 0; }
    // The window that shows it: "provinceview", "colonisationpanel", or empty.
    std::string_view Window() const;
};

// open_province's flags and outcomes (Tongs' tongs_navigation.h), which plugin.cpp checks against it.
inline constexpr std::uint32_t kKeepViews = 0x1;  // leave a shown view of the session open
inline constexpr std::uint32_t kNoCamera = 0x2;   // select only, as a click on the map: the camera stays
inline constexpr std::uint32_t kOpened = 0;

// An outcome's name in the answers: "opened", Tongs' refusals ("terra_incognita", "discover", ...),
// or "outcome_<n>" for one this plugin does not know (a refusal, as the header says).
std::string OutcomeName(std::uint32_t outcome);

// Selecting a province again, after a restart or a reload (H8).
struct Reselect {
    std::int32_t province = 0;
    // "opened"; one of Tongs' refusals; "moved_on" (the player selected a province or opened a
    // view first, so nothing is forced); "not_shown" (called, but the view did not show it, or
    // after a reload the view no longer showed it); "no_navigation" (tongs.navigation is missing).
    std::string outcome;
    std::string window;  // the window that shows it after an "opened"
};

struct ReloadRequest {
    std::vector<std::string> lines;        // console lines, each one AllowedLine accepts
    std::vector<std::string> check;        // game paths whose top-level windows are checked
    std::vector<std::string> close;        // windows closed through the game before the lines
    std::vector<std::string> keep_hidden;  // windows closed again when the lines showed them
    // Select the province the view showed before the lines again after them, when the view
    // still shows it: the game's rebuild leaves the province's name blank (H8).
    bool reselect = false;
};

// Reads the members of a `reload` request into `out`; the error text when one
// is missing or wrong.
std::optional<std::string> ReadReloadRequest(const json::Value& request, ReloadRequest& out);

// Splits a console line the live game may run into its tokens: `reload
// <name>.gui`, `reloadloc` or `reloadtexture <texture>`. Anything else is
// refused with the reason, among them `reload guianim` (it crashed the game),
// `reload texture` (a 1.3 s freeze) and `reload assets` (not checked), H10.
std::optional<std::string> AllowedLine(std::string_view line, std::vector<std::string>& tokens);

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
    bool menu_undone = false;               // the Escape opened the game's menu, which was closed again
    bool tree = false;                      // tongs.ui read the windows; without it no stale check
    StaleCheck stale;
    std::vector<Root> visible;  // the visible top-level windows after the job that have a file
    std::size_t roots_before = 0;
    std::size_t roots_after = 0;
    std::optional<Reselect> reselected;  // with `reselect`, when the view showed a province before
    double queued_ms = 0;                // from the request to the main thread
    double run_ms = 0;                   // on the main thread
};

std::string ReloadAnswer(std::uint64_t id, const ReloadResult& result);

struct ReselectResult {
    std::string error;
    std::string message;
    Reselect reselect;
    double queued_ms = 0;
};

std::string ReselectAnswer(std::uint64_t id, const ReselectResult& result);

// Frames after open_province before the plugin checks that the view shows the province.
inline constexpr int kShowFrames = 2;

struct SaveResult {
    std::string error;
    std::string message;
    LineResult line;
    double queued_ms = 0;
};

std::string SaveAnswer(std::uint64_t id, const SaveResult& result);

// The only buttons `confirm` clicks: Anbennar's achievements prompt, which
// shows before a save loads (live check H7).
bool IsConfirmPath(std::string_view path);

// Frames a posted key takes to land: it goes up a frame after it went down,
// and the game takes it in its next frame.
inline constexpr int kKeyFrames = 4;

// The game's Esc menu (menubar.gui), which an Escape opens when no panel is
// open to close.
inline constexpr std::string_view kGameMenu = "menu";

// The keys the live game presses for the player: Enter, which answers a
// prompt with its default button, and Escape, which closes the topmost panel.
// Keys, not clicks: the game's interface takes the pointer from the real
// cursor (GetCursorPos, pick mode checks), which Etch never moves.
enum class Key { Enter, Escape };

// A key posted to the game's window while a widget was on screen.
struct PressResult {
    bool found = false;    // the widget is there and visible
    bool pressed = false;  // the key was posted
};

struct ConfirmResult {
    std::string error;
    std::string message;
    PressResult press;
    double queued_ms = 0;
};

std::string ConfirmAnswer(std::uint64_t id, const ConfirmResult& result);

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
        // Posts `key` to the game's window when a visible widget matches `selector`; main thread.
        std::function<PressResult(const std::string& selector, Key key)> press;
        // The province view now; nullopt without tongs.navigation or when it cannot read. Main thread.
        std::function<std::optional<ProvinceView>()> province_view;
        // tongs.navigation's open_province: its outcome, nullopt without the service. Main thread.
        std::function<std::optional<std::uint32_t>(std::int32_t province, std::uint32_t flags)> open_province;
    };

    explicit LiveJobs(Env env) : env_(std::move(env)) {}

    // Any thread. Starts a job, or says why not: `busy` while one runs,
    // `not_available` in ironman and multiplayer (the console refuses them,
    // and Etch never goes around it), `console_broken` after a console call
    // faulted. `done` is called once, on a worker thread.
    std::optional<Refusal> Reload(ReloadRequest request, std::function<void(const ReloadResult&)> done);
    // Saves the loaded game through the game's `autosave`, which writes
    // `save games/autosave.eu4` after the console answers.
    std::optional<Refusal> Save(std::function<void(const SaveResult&)> done);
    // Answers the prompt whose button is `path` (IsConfirmPath) with Enter when
    // it is on screen; `busy` while another job runs.
    std::optional<Refusal> Confirm(std::string path, std::function<void(const ConfirmResult&)> done);
    // After a restart (H8): opens the view of `province` as the game's province links do, moving
    // the camera, only while the player has selected no province and has no view open; then
    // checks that the view shows it. `busy` while another job runs.
    std::optional<Refusal> ReselectProvince(std::int32_t province, std::function<void(const ReselectResult&)> done);

    // Whether a job waits for or runs on the main thread: the game does not
    // draw while it saves, so a ping says so.
    bool Busy() const { return busy_.load(); }

private:
    struct ReloadState;
    std::optional<Refusal> Begin();
    void ReloadFirst(const std::shared_ptr<ReloadState>& state);
    void ReloadRest(const std::shared_ptr<ReloadState>& state);
    void ReloadKeysLanded(const std::shared_ptr<ReloadState>& state,
                          const std::optional<std::vector<Root>>& pressed_on);
    void ReloadEnd(const std::shared_ptr<ReloadState>& state, const std::optional<std::vector<Root>>& after);
    // With `reselect`: selects the province shown before the lines again, while the view shows it.
    void ReselectAfterReload(ReloadState& state);
    void Finish(const std::shared_ptr<ReloadState>& state);
    // Runs `work` on the main thread `frames` frames from now; false when it cannot be queued.
    bool AfterFrames(int frames, std::function<void()> work);
    // Closes a top-level window through the game; false when it was not closed (or a console
    // call failed: result.error says so). `pressed`: the close is a key a later frame takes.
    bool CloseWindow(const std::string& name, ReloadResult& result, bool& pressed);
    // Runs one line on the main thread and records it; false when it faulted.
    bool Run(const std::vector<std::string>& tokens, LineResult& record, std::string& error, std::string& message);

    Env env_;
    std::atomic<bool> busy_{false};
    std::atomic<bool> faulted_{false};
};

}  // namespace etch
