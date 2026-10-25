#include "capture.hpp"

#include <algorithm>
#include <atomic>
#include <cstring>
#include <mutex>

namespace etch::capture {
namespace {

// Slots of the Direct3D 9 interfaces' vtables.
constexpr std::size_t kCreateDevice = 16;    // IDirect3D9
constexpr std::size_t kCreateDeviceEx = 20;  // IDirect3D9Ex
constexpr std::size_t kPresent = 17;         // IDirect3DDevice9

using Create9Fn = IDirect3D9*(WINAPI)(UINT);
using Create9ExFn = HRESULT(WINAPI)(UINT, IDirect3D9Ex**);
using CreateDeviceFn = HRESULT(STDMETHODCALLTYPE)(IDirect3D9*, UINT, D3DDEVTYPE, HWND, DWORD, D3DPRESENT_PARAMETERS*,
                                                  IDirect3DDevice9**);
using CreateDeviceExFn = HRESULT(STDMETHODCALLTYPE)(IDirect3D9Ex*, UINT, D3DDEVTYPE, HWND, DWORD,
                                                    D3DPRESENT_PARAMETERS*, D3DDISPLAYMODEEX*, IDirect3DDevice9Ex**);
using DevicePresentFn = HRESULT(STDMETHODCALLTYPE)(IDirect3DDevice9*, const RECT*, const RECT*, HWND, const RGNDATA*);

anvil::FunctionHook<Create9Fn> g_create9;
anvil::FunctionHook<Create9ExFn> g_create9ex;
anvil::FunctionHook<CreateDeviceFn> g_create_device;
anvil::FunctionHook<CreateDeviceExFn> g_create_device_ex;
anvil::FunctionHook<DevicePresentFn> g_present;
std::mutex g_hook_mutex;  // devices may be created on any thread
std::atomic<bool> g_device{false};
PresentFn g_on_present = nullptr;

// The system-memory copy of the last crop size; it survives a device reset.
IDirect3DSurface9* g_sysmem = nullptr;
D3DSURFACE_DESC g_sysmem_desc{};

void* Slot(void* object, std::size_t index) { return (*static_cast<void***>(object))[index]; }

template <class Sig, class D>
void HookAt(anvil::FunctionHook<Sig>& hook, void* address, D detour, const char* what) {
    if (hook.active()) return;  // every device of the process shares one implementation
    try {
        anvil::Host{}.hook_at(hook, address, detour);
    } catch (const std::exception& e) {
        anvil::Host{}.warn("cannot hook {}: {}; the game host cannot capture", what, e.what());
    }
}

HRESULT STDMETHODCALLTYPE OnPresent(IDirect3DDevice9* device, const RECT* source, const RECT* dest, HWND window,
                                    const RGNDATA* dirty) noexcept {
    if (g_on_present != nullptr) {
        try {
            g_on_present(device);
        } catch (...) {
        }
    }
    return g_present.next(device, source, dest, window, dirty);
}

void OnDevice(IDirect3DDevice9* device, const D3DPRESENT_PARAMETERS* p) {
    const std::lock_guard lock(g_hook_mutex);
    HookAt(g_present, Slot(device, kPresent), OnPresent, "IDirect3DDevice9::Present");
    g_device.store(g_present.active());
    anvil::Host{}.info("Direct3D 9 device: back buffer {}x{}, format {}, multisampling {}", p ? p->BackBufferWidth : 0,
                       p ? p->BackBufferHeight : 0, p ? static_cast<unsigned>(p->BackBufferFormat) : 0,
                       p ? static_cast<unsigned>(p->MultiSampleType) : 0);
}

HRESULT STDMETHODCALLTYPE OnCreateDevice(IDirect3D9* d3d, UINT adapter, D3DDEVTYPE type, HWND focus, DWORD flags,
                                         D3DPRESENT_PARAMETERS* p, IDirect3DDevice9** out) noexcept {
    const HRESULT hr = g_create_device.next(d3d, adapter, type, focus, flags, p, out);
    if (SUCCEEDED(hr) && out != nullptr && *out != nullptr) {
        try {
            OnDevice(*out, p);
        } catch (...) {
        }
    }
    return hr;
}

HRESULT STDMETHODCALLTYPE OnCreateDeviceEx(IDirect3D9Ex* d3d, UINT adapter, D3DDEVTYPE type, HWND focus, DWORD flags,
                                           D3DPRESENT_PARAMETERS* p, D3DDISPLAYMODEEX* mode,
                                           IDirect3DDevice9Ex** out) noexcept {
    const HRESULT hr = g_create_device_ex.next(d3d, adapter, type, focus, flags, p, mode, out);
    if (SUCCEEDED(hr) && out != nullptr && *out != nullptr) {
        try {
            OnDevice(*out, p);
        } catch (...) {
        }
    }
    return hr;
}

void Wrap(IDirect3D9* d3d, bool ex) {
    if (d3d == nullptr) return;
    const std::lock_guard lock(g_hook_mutex);
    HookAt(g_create_device, Slot(d3d, kCreateDevice), OnCreateDevice, "IDirect3D9::CreateDevice");
    if (ex) HookAt(g_create_device_ex, Slot(d3d, kCreateDeviceEx), OnCreateDeviceEx, "IDirect3D9Ex::CreateDeviceEx");
}

IDirect3D9* WINAPI OnCreate9(UINT version) noexcept {
    IDirect3D9* d3d = g_create9.next(version);
    try {
        Wrap(d3d, false);
    } catch (...) {
    }
    return d3d;
}

HRESULT WINAPI OnCreate9Ex(UINT version, IDirect3D9Ex** out) noexcept {
    const HRESULT hr = g_create9ex.next(version, out);
    if (SUCCEEDED(hr) && out != nullptr) {
        try {
            Wrap(*out, true);
        } catch (...) {
        }
    }
    return hr;
}

IDirect3DSurface9* SysmemSurface(IDirect3DDevice9* device, UINT width, UINT height, D3DFORMAT format) {
    if (g_sysmem != nullptr && g_sysmem_desc.Width == width && g_sysmem_desc.Height == height &&
        g_sysmem_desc.Format == format) {
        return g_sysmem;
    }
    if (g_sysmem != nullptr) g_sysmem->Release();
    g_sysmem = nullptr;
    if (FAILED(device->CreateOffscreenPlainSurface(width, height, format, D3DPOOL_SYSTEMMEM, &g_sysmem, nullptr))) {
        g_sysmem = nullptr;
        return nullptr;
    }
    g_sysmem->GetDesc(&g_sysmem_desc);
    return g_sysmem;
}

}  // namespace

bool Install(const anvil::Host& host, PresentFn on_present) {
    g_on_present = on_present;
    HMODULE d3d9 = GetModuleHandleW(L"d3d9.dll");
    if (d3d9 == nullptr) {
        host.warn("d3d9.dll is not loaded in the early phase: the game host cannot capture");
        return false;
    }
    host.hook_at(g_create9, reinterpret_cast<void*>(GetProcAddress(d3d9, "Direct3DCreate9")), OnCreate9);
    host.hook_at(g_create9ex, reinterpret_cast<void*>(GetProcAddress(d3d9, "Direct3DCreate9Ex")), OnCreate9Ex);
    return true;
}

bool HasDevice() { return g_device.load(); }

Grab GrabCrop(IDirect3DDevice9* device, const Rect& crop) {
    Grab out;
    IDirect3DSurface9* back_buffer = nullptr;
    if (FAILED(device->GetBackBuffer(0, 0, D3DBACKBUFFER_TYPE_MONO, &back_buffer)) || back_buffer == nullptr) {
        out.error = "the back buffer cannot be read";
        return out;
    }
    D3DSURFACE_DESC desc{};
    back_buffer->GetDesc(&desc);
    const UINT right = std::min<UINT>(desc.Width, crop.x + crop.width);
    const UINT bottom = std::min<UINT>(desc.Height, crop.y + crop.height);
    if (desc.Format != D3DFMT_A8R8G8B8 && desc.Format != D3DFMT_X8R8G8B8) {
        back_buffer->Release();
        out.error = "the back buffer is not 32-bit (format " + std::to_string(static_cast<unsigned>(desc.Format)) + ")";
        return out;
    }
    if (crop.x >= right || crop.y >= bottom) {
        back_buffer->Release();
        out.error = "the crop lies outside the " + std::to_string(desc.Width) + "x" + std::to_string(desc.Height) +
                    " back buffer";
        return out;
    }
    out.crop = Rect{crop.x, crop.y, right - crop.x, bottom - crop.y};
    const RECT source{static_cast<LONG>(crop.x), static_cast<LONG>(crop.y), static_cast<LONG>(right),
                      static_cast<LONG>(bottom)};
    // A render target in the default pool would have to be released before a
    // device reset, so it lives for one capture only.
    IDirect3DSurface9* target = nullptr;
    const bool copied = SUCCEEDED(device->CreateRenderTarget(out.crop.width, out.crop.height, desc.Format,
                                                             D3DMULTISAMPLE_NONE, 0, FALSE, &target, nullptr)) &&
                        SUCCEEDED(device->StretchRect(back_buffer, &source, target, nullptr, D3DTEXF_NONE));
    back_buffer->Release();
    IDirect3DSurface9* sysmem = copied ? SysmemSurface(device, out.crop.width, out.crop.height, desc.Format) : nullptr;
    D3DLOCKED_RECT locked{};
    if (sysmem == nullptr || FAILED(device->GetRenderTargetData(target, sysmem)) ||
        FAILED(sysmem->LockRect(&locked, nullptr, D3DLOCK_READONLY))) {
        if (target != nullptr) target->Release();
        out.error = "copying the crop out of the back buffer failed";
        return out;
    }
    out.image.width = out.crop.width;
    out.image.height = out.crop.height;
    const std::size_t row = static_cast<std::size_t>(out.crop.width) * 4;
    out.image.pixels.resize(row * out.crop.height);
    for (UINT y = 0; y < out.crop.height; ++y) {
        std::memcpy(out.image.pixels.data() + y * row,
                    static_cast<const std::uint8_t*>(locked.pBits) + y * locked.Pitch, row);
    }
    sysmem->UnlockRect();
    target->Release();
    return out;
}

}  // namespace etch::capture
