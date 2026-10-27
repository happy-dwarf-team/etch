#pragma once

// What pick mode draws over the game (v2 specification section 7): the
// hovered widget outlined, its top-level window dashed, a label beside the
// pointer and a badge at the top, drawn in IDirect3DDevice9::Present over the
// finished frame, the game's interface and tooltips included.
//
// The plugin loads in Anvil's main phase, alongside the game's start-up, so it
// hooks Direct3DCreate9(Ex) for the device the game creates after it; should
// the game have created it first, Present is found through a throwaway device
// once the game is ready (all devices of a kind share one Present).

#include <anvil/anvil.hpp>

#include <windows.h>

#include <cstdint>
#include <string>
#include <vector>

namespace etch::overlay {

struct Box {
    int x = 0, y = 0, width = 0, height = 0;
    std::uint32_t color = 0;  // ARGB
    bool dashed = false;
};

struct Frame {
    bool on = false;
    std::vector<Box> boxes;
    std::string label;  // UTF-8, lines split by \n; drawn beside (label_x, label_y)
    int label_x = 0, label_y = 0;
    std::string badge;  // UTF-8, drawn at the top centre
    std::uint32_t badge_color = 0;
};

// Hooks Direct3DCreate9(Ex); false (after logging why) when it cannot.
bool Install(const anvil::Host& host);

// On the main thread once the game is ready: when no device was seen, finds
// Present through a throwaway device. False when nothing can be drawn.
bool EnsureHooked();

// What the next Present draws; any thread. A frame with `on` false draws
// nothing and costs Present one atomic read.
void Show(Frame frame);

// Whether the hook drew at least one frame, for the log.
bool Seen();

}  // namespace etch::overlay
