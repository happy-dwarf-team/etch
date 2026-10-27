#pragma once

// Pick mode (v2 specification section 7, etch#158, docs/pick-mode-checks.md):
// the parts that do not need the game, so the tests drive them directly. The
// hotkey, which mouse messages the game window may still see, the stack of
// widgets under the pointer, the label, and the pick and snapshot that go to
// Etch over the pipe. plugin.cpp wires them to the window procedure, tongs.ui
// and the device.

#include "json.hpp"

#include <cstdint>
#include <functional>
#include <map>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace etch {

// A widget as tongs.ui visited it, copied (its strings live only for the visit).
struct UiWidget {
    std::uint64_t id = 0;
    std::uint32_t type = 0;   // TongsUiType
    std::uint32_t flags = 0;  // TONGS_UI_VISIBLE ...
    int parent = -1;          // index among the same read's widgets, -1 for a top-level window
    int x = 0, y = 0, width = 0, height = 0;
    std::string name;
    std::string path;  // empty when the read gave none
    std::string text;
    bool has_text = false;
    std::string file;        // the definition's game path; empty when stale or unknown
    std::uint32_t line = 0;  // the line of the `{` that opens the definition (H2), 0 when unknown

    bool Visible() const { return (flags & 0x1u) != 0; }
    bool Enabled() const { return (flags & 0x2u) != 0; }
    bool Checked() const { return (flags & 0x4u) != 0; }
    bool Stale() const { return (flags & 0x8u) != 0; }
    bool Holds(int px, int py) const { return px >= x && py >= y && px < x + width && py < y + height; }
};

// The pipe's `type` of a TongsUiType: window, button, icon, text, listbox,
// checkbox, editbox or other.
std::string_view TypeName(std::uint32_t type);

// A hotkey: a virtual key with its modifiers, as Anvil's key settings encode
// them (the key in bits 0-7, 0x100 Shift, 0x200 Ctrl, 0x400 Alt).
struct HotKey {
    unsigned vk = 0;
    bool ctrl = false;
    bool shift = false;
    bool alt = false;

    bool operator==(const HotKey&) const = default;
    std::int64_t Code() const;
    static HotKey FromCode(std::int64_t code);
};

inline constexpr std::string_view kDefaultPickKey = "Ctrl+Shift+E";

// "Ctrl+Shift+E", "Alt+F9", "Ctrl+5": modifiers (Ctrl, Shift, Alt, in any
// order and case) and one key: a letter, a digit or F1-F24. nullopt for
// anything else, or for a key without Ctrl or Alt (it would take a key the
// game uses).
std::optional<HotKey> ParseKey(std::string_view text);
std::string FormatKey(const HotKey& key);

// What the game window may see of a mouse message in pick mode (H6). Buttons
// (down, up, double click, all five) and the wheels are dropped; a left button
// down is also the pick, and a wheel turn steps through the stack. Every other
// mouse message passes with the MK_* button bits of its wParam cleared:
// SDL 2.0.4 rebuilds the clicks it missed from them.
enum class MouseAction { Pass, Drop, Pick, Wheel };
struct MouseFilter {
    MouseAction action = MouseAction::Pass;
    std::uint64_t wparam = 0;  // for Pass: the wParam to pass on
    int wheel = 0;             // for Wheel: +1 a notch away from the user (up), -1 towards
};
// `message` and `wparam` as the window procedure got them; only mouse messages
// (WM_MOUSEFIRST..WM_MOUSELAST) are asked about.
MouseFilter FilterMouse(std::uint32_t message, std::uint64_t wparam);
bool IsMouseMessage(std::uint32_t message);

// The visible widgets under a point, the one to pick first: the hovered widget,
// then those inside it (a button's own text), smallest first, then its parents,
// nearest first, then any other widget whose rectangle holds the point,
// smallest first (a map icon under the window, last: the game keeps no order
// between top-level windows that tongs.ui gives). Top-level windows that cover
// the whole screen (`menubar`, `floating_buttons`, H5) and everything that is
// hidden are left out. Indices into `widgets`.
std::vector<std::size_t> StackAt(const std::vector<UiWidget>& widgets, int x, int y, int screen_width,
                                 int screen_height, std::uint64_t hovered);

// `index`, then its parents up to its top-level window.
std::vector<std::size_t> ChainOf(const std::vector<UiWidget>& widgets, std::size_t index);

// Which mod supplies each interface file of the playset, by game path compared
// ignoring case: what the label names. A path no mod supplies is the game's.
class Sources {
public:
    void Set(std::map<std::string, std::string> by_path);
    std::string_view Of(std::string_view game_path) const;

private:
    std::map<std::string, std::string> by_path_;  // lowercase, forward slashes
};

// The widget path of a chain (picked widget first) from the names alone, with
// the middle shortened when it is long: `provinceview/…/province_window/culture`.
std::string ShortPath(const std::vector<const UiWidget*>& chain);

// The label beside the outline: name, kind and size; `<mod> › <file>:<line>`;
// the shortened path; the place in the stack when there is more than one
// widget under the pointer. Over nothing: "not a GUI widget".
std::string LabelText(const std::vector<const UiWidget*>& chain, const Sources& sources, std::size_t stack_index,
                      std::size_t stack_size);

// The badge at the top of the screen.
std::string BadgeText(const HotKey& key);

// The `pick` push (docs/plugin-protocol.md): the picked widget and its parents
// with paths, files and lines, the game window's size, and the times.
// The system clock in Unix milliseconds.
std::uint64_t UnixMs();

struct PickTimes {
    double click_to_frame_ms = 0;     // from the click in the window procedure to the read
    std::uint64_t click_unix_ms = 0;  // the click by the system clock, which Etch compares with its own
    double read_ms = 0;               // the whole-tree read on the main thread
};
std::string PickEvent(std::uint64_t seq, const std::vector<UiWidget>& widgets, const std::vector<std::size_t>& chain,
                      std::size_t stack_index, std::size_t stack_size, int screen_width, int screen_height, bool front,
                      const PickTimes& times);

// The live snapshot of one top-level window (spec section 7, etch#170): every
// widget of it, hidden ones too, with path, type, flags, text and rectangle;
// stale widgets are left out and counted. Members only, for a push or an answer.
struct Snapshot {
    std::size_t widgets = 0;
    std::size_t stale = 0;
    std::string members;  // `"window":...,"widgets":[...]...` without braces
};
Snapshot SnapshotOf(const std::vector<UiWidget>& widgets, std::size_t root, int screen_width, int screen_height,
                    double read_ms);

// The top-level window a snapshot is taken of: the visible one of that name
// (ignoring case), else nullopt. `stale` says the visible one is stale.
std::optional<std::size_t> FindRoot(const std::vector<UiWidget>& widgets, std::string_view name, bool& stale);

// What a `pick_mode` request asks for: turning pick mode on or off (absent:
// leave it), the hotkey, the playset's sources, and bringing the game to the
// front; the error text when a member is wrong.
struct PickModeRequest {
    std::optional<bool> on;
    std::optional<HotKey> key;
    std::optional<std::map<std::string, std::string>> sources;
    bool front = false;
    // VS Code's window, which the game brings forward after a pick: the process
    // and a title fragment (the workspace's name).
    std::uint32_t editor_pid = 0;
    std::string editor_title;
};
std::optional<std::string> ReadPickModeRequest(const json::Value& request, PickModeRequest& out);

struct PickModeAnswer {
    bool on = false;
    HotKey key;
    bool front = false;  // the game window was brought to the front (only when asked)
};

struct SnapshotResult {
    std::string error;  // empty when it was taken
    std::string message;
    std::string members;  // SnapshotOf's members
    double queued_ms = 0;
};

// What the protocol asks of pick mode; plugin.cpp provides it.
struct PickControl {
    // Any thread: applies a `pick_mode` request at once.
    std::function<PickModeAnswer(const PickModeRequest&)> mode;
    // Any thread: takes a snapshot of the visible top-level window `window` on
    // the main thread; `done` is called once, on a worker thread. A refusal
    // comes back at once instead (`no_tree`, `no_main_thread`).
    std::function<std::optional<std::string>(std::string window, std::function<void(const SnapshotResult&)> done)>
        snapshot;
    // Any thread: whether pick mode is on.
    std::function<bool()> on;
};

}  // namespace etch
