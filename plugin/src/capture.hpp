#pragma once

// The game host's capture (spec section 4, etch#21): hooks Direct3DCreate9(Ex)
// in the early phase, then the device's Present, and copies a crop of the
// back buffer there with a StretchRect into a small render target and a
// readback of only that. Never a full-frame readback.

#include "job.hpp"

#include <windows.h>
#include <d3d9.h>

#include <anvil/anvil.hpp>

namespace etch::capture {

// Called on the Present thread before the game's Present, with the frame
// complete in the back buffer.
using PresentFn = void (*)(IDirect3DDevice9* device);

// Hooks Direct3DCreate9 and Direct3DCreate9Ex of d3d9.dll; false, after a
// warning, when d3d9.dll is not loaded yet.
bool Install(const anvil::Host& host, PresentFn on_present);

// Whether the game's device was created and its Present is hooked.
bool HasDevice();

// Copies `crop`, clamped to the back buffer, out of the device's back buffer.
// Present thread only.
Grab GrabCrop(IDirect3DDevice9* device, const Rect& crop);

}  // namespace etch::capture
