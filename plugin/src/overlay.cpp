#include "overlay.hpp"

#include <d3d9.h>

#include <algorithm>
#include <atomic>
#include <memory>
#include <mutex>

namespace etch::overlay {
namespace {

constexpr std::size_t kCreateDevice = 16;    // IDirect3D9
constexpr std::size_t kCreateDeviceEx = 20;  // IDirect3D9Ex
constexpr std::size_t kPresent = 17;         // IDirect3DDevice9
constexpr std::size_t kPresentEx = 121;      // IDirect3DDevice9Ex

using Create9Fn = IDirect3D9*(WINAPI)(UINT);
using Create9ExFn = HRESULT(WINAPI)(UINT, IDirect3D9Ex**);
using CreateDeviceFn = HRESULT(STDMETHODCALLTYPE)(IDirect3D9*, UINT, D3DDEVTYPE, HWND, DWORD, D3DPRESENT_PARAMETERS*,
                                                  IDirect3DDevice9**);
using CreateDeviceExFn = HRESULT(STDMETHODCALLTYPE)(IDirect3D9Ex*, UINT, D3DDEVTYPE, HWND, DWORD,
                                                    D3DPRESENT_PARAMETERS*, D3DDISPLAYMODEEX*, IDirect3DDevice9Ex**);
using PresentFn = HRESULT(STDMETHODCALLTYPE)(IDirect3DDevice9*, const RECT*, const RECT*, HWND, const RGNDATA*);
using PresentExFn = HRESULT(STDMETHODCALLTYPE)(IDirect3DDevice9Ex*, const RECT*, const RECT*, HWND, const RGNDATA*,
                                               DWORD);

// A hook placed once, at the first object's method; another object of the
// same class shares it (as anvil-overlay does).
template <class Sig>
struct MethodHook {
    anvil::FunctionHook<Sig> hook;
    void* at = nullptr;
};

anvil::FunctionHook<Create9Fn> g_create9;
anvil::FunctionHook<Create9ExFn> g_create9ex;
MethodHook<CreateDeviceFn> g_create_device;
MethodHook<CreateDeviceExFn> g_create_device_ex;
MethodHook<PresentFn> g_present;
MethodHook<PresentFn> g_present_other;  // a device of another class (Ex) has its own Present
MethodHook<PresentExFn> g_present_ex;
std::mutex g_hook_mutex;
std::atomic<bool> g_device_seen{false};
std::atomic<bool> g_drawn{false};

// What Present draws, and its textures.
std::mutex g_frame_mutex;
Frame g_frame;
std::atomic<bool> g_on{false};

void* Slot(void* object, std::size_t index) { return (*static_cast<void***>(object))[index]; }

template <class Sig, class D>
void HookAt(MethodHook<Sig>& method, void* address, D detour, const char* what) {
    if (method.hook.active()) return;
    try {
        anvil::Host{}.hook_at(method.hook, address, detour);
        method.at = address;
    } catch (const std::exception& e) {
        anvil::Host{}.warn("cannot hook {}: {}; pick mode draws no outline", what, e.what());
    }
}

std::wstring Wide(const std::string& text) {
    if (text.empty()) return {};
    const int size = MultiByteToWideChar(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), nullptr, 0);
    std::wstring out(static_cast<std::size_t>(size), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), out.data(), size);
    return out;
}

// A text drawn by GDI into a texture: white on a dark, slightly see-through
// box. Kept until the text, the device or the font size changes.
struct TextTexture {
    IDirect3DDevice9* device = nullptr;
    IDirect3DTexture9* texture = nullptr;
    std::string text;
    int font_px = 0;
    int width = 0, height = 0;          // of the text box
    int tex_width = 0, tex_height = 0;  // of the texture (powers of two)

    void Release() {
        if (texture != nullptr) texture->Release();
        texture = nullptr;
        device = nullptr;
        text.clear();
    }

    bool Make(IDirect3DDevice9* on, const std::string& wanted, int px) {
        if (texture != nullptr && device == on && text == wanted && font_px == px) return true;
        Release();
        const std::wstring wide = Wide(wanted);
        HDC dc = CreateCompatibleDC(nullptr);
        if (dc == nullptr) return false;
        HFONT font = CreateFontW(-px, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                                 CLIP_DEFAULT_PRECIS, ANTIALIASED_QUALITY, DEFAULT_PITCH, L"Segoe UI");
        const HGDIOBJ old_font = SelectObject(dc, font);
        RECT measure{0, 0, 4096, 4096};
        DrawTextW(dc, wide.c_str(), static_cast<int>(wide.size()), &measure, DT_CALCRECT | DT_NOPREFIX);
        const int pad = std::max(4, px / 3);
        width = measure.right + 2 * pad;
        height = measure.bottom + 2 * pad;
        tex_width = 1;
        while (tex_width < width) tex_width *= 2;
        tex_height = 1;
        while (tex_height < height) tex_height *= 2;
        BITMAPINFO info{};
        info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
        info.bmiHeader.biWidth = tex_width;
        info.bmiHeader.biHeight = -tex_height;  // top-down
        info.bmiHeader.biPlanes = 1;
        info.bmiHeader.biBitCount = 32;
        info.bmiHeader.biCompression = BI_RGB;
        void* bits = nullptr;
        HBITMAP bitmap = CreateDIBSection(dc, &info, DIB_RGB_COLORS, &bits, nullptr, 0);
        bool ok = bitmap != nullptr && bits != nullptr;
        if (ok) {
            const HGDIOBJ old_bitmap = SelectObject(dc, bitmap);
            auto* pixels = static_cast<std::uint32_t*>(bits);
            std::fill(pixels, pixels + static_cast<std::size_t>(tex_width) * static_cast<std::size_t>(tex_height),
                      0x00181818u);
            SetBkMode(dc, TRANSPARENT);
            SetTextColor(dc, RGB(255, 255, 255));
            RECT at{pad, pad, width - pad, height - pad};
            DrawTextW(dc, wide.c_str(), static_cast<int>(wide.size()), &at, DT_NOPREFIX);
            GdiFlush();
            ok = Upload(on, pixels);
            SelectObject(dc, old_bitmap);
        }
        if (bitmap != nullptr) DeleteObject(bitmap);
        SelectObject(dc, old_font);
        DeleteObject(font);
        DeleteDC(dc);
        if (!ok) return false;
        device = on;
        text = wanted;
        font_px = px;
        return true;
    }

    bool Upload(IDirect3DDevice9* on, const std::uint32_t* pixels) {
        // Managed textures survive a device reset; an Ex device has none, and a
        // dynamic one there needs no care at reset either.
        HRESULT hr = on->CreateTexture(static_cast<UINT>(tex_width), static_cast<UINT>(tex_height), 1, 0,
                                       D3DFMT_A8R8G8B8, D3DPOOL_MANAGED, &texture, nullptr);
        if (FAILED(hr)) {
            hr = on->CreateTexture(static_cast<UINT>(tex_width), static_cast<UINT>(tex_height), 1, D3DUSAGE_DYNAMIC,
                                   D3DFMT_A8R8G8B8, D3DPOOL_DEFAULT, &texture, nullptr);
        }
        if (FAILED(hr) || texture == nullptr) {
            texture = nullptr;
            return false;
        }
        D3DLOCKED_RECT locked;
        if (FAILED(texture->LockRect(0, &locked, nullptr, 0))) return false;
        for (int y = 0; y < tex_height; ++y) {
            auto* row = reinterpret_cast<std::uint32_t*>(static_cast<std::uint8_t*>(locked.pBits) +
                                                         static_cast<std::size_t>(y) * locked.Pitch);
            for (int x = 0; x < tex_width; ++x) {
                const std::uint32_t p = pixels[static_cast<std::size_t>(y) * tex_width + x] & 0x00FFFFFFu;
                const bool inside = x < width && y < height;
                row[x] = inside ? (0xE6000000u | p) : 0u;
            }
        }
        texture->UnlockRect(0);
        return true;
    }
};

TextTexture g_label;
TextTexture g_badge;

struct Vertex {
    float x, y, z, rhw;
    D3DCOLOR color;
    float u, v;
};
constexpr DWORD kFvf = D3DFVF_XYZRHW | D3DFVF_DIFFUSE | D3DFVF_TEX1;

void Quad(std::vector<Vertex>& out, float x, float y, float w, float h, D3DCOLOR color, float u1 = 0, float v1 = 0) {
    const float l = x - 0.5f, t = y - 0.5f, r = x + w - 0.5f, b = y + h - 0.5f;
    out.push_back({l, t, 0, 1, color, 0, 0});
    out.push_back({r, t, 0, 1, color, u1, 0});
    out.push_back({l, b, 0, 1, color, 0, v1});
    out.push_back({r, t, 0, 1, color, u1, 0});
    out.push_back({r, b, 0, 1, color, u1, v1});
    out.push_back({l, b, 0, 1, color, 0, v1});
}

// The four sides of a box, 2 px wide, dashed or not.
void Outline(std::vector<Vertex>& out, const Box& box) {
    constexpr float kWidth = 2;
    const auto x = static_cast<float>(box.x), y = static_cast<float>(box.y);
    const auto w = static_cast<float>(std::max(box.width, 1)), h = static_cast<float>(std::max(box.height, 1));
    if (!box.dashed) {
        Quad(out, x, y, w, kWidth, box.color);
        Quad(out, x, y + h - kWidth, w, kWidth, box.color);
        Quad(out, x, y, kWidth, h, box.color);
        Quad(out, x + w - kWidth, y, kWidth, h, box.color);
        return;
    }
    constexpr float kDash = 8, kGap = 6;
    for (float d = 0; d < w; d += kDash + kGap) {
        const float len = std::min(kDash, w - d);
        Quad(out, x + d, y, len, kWidth, box.color);
        Quad(out, x + d, y + h - kWidth, len, kWidth, box.color);
    }
    for (float d = 0; d < h; d += kDash + kGap) {
        const float len = std::min(kDash, h - d);
        Quad(out, x, y + d, kWidth, len, box.color);
        Quad(out, x + w - kWidth, y + d, kWidth, len, box.color);
    }
}

void DrawText(IDirect3DDevice9* device, TextTexture& text, int x, int y) {
    if (text.texture == nullptr) return;
    std::vector<Vertex> quad;
    Quad(quad, static_cast<float>(x), static_cast<float>(y), static_cast<float>(text.tex_width),
         static_cast<float>(text.tex_height), 0xFFFFFFFFu, 1, 1);
    device->SetTexture(0, text.texture);
    device->SetTextureStageState(0, D3DTSS_COLOROP, D3DTOP_MODULATE);
    device->SetTextureStageState(0, D3DTSS_ALPHAOP, D3DTOP_MODULATE);
    device->DrawPrimitiveUP(D3DPT_TRIANGLELIST, 2, quad.data(), sizeof(Vertex));
}

void Draw(IDirect3DDevice9* device) {
    if (!g_on.load(std::memory_order_acquire)) return;
    if (device->TestCooperativeLevel() != D3D_OK) return;
    Frame frame;
    {
        const std::lock_guard lock(g_frame_mutex);
        if (!g_frame.on) return;
        frame = g_frame;
    }
    IDirect3DStateBlock9* block = nullptr;
    if (FAILED(device->CreateStateBlock(D3DSBT_ALL, &block)) || block == nullptr) return;
    IDirect3DSurface9* old_target = nullptr;
    IDirect3DSurface9* back = nullptr;
    device->GetRenderTarget(0, &old_target);
    if (FAILED(device->GetBackBuffer(0, 0, D3DBACKBUFFER_TYPE_MONO, &back)) || back == nullptr) {
        if (old_target != nullptr) old_target->Release();
        block->Release();
        return;
    }
    D3DSURFACE_DESC desc{};
    back->GetDesc(&desc);
    device->SetRenderTarget(0, back);
    const int screen_w = static_cast<int>(desc.Width), screen_h = static_cast<int>(desc.Height);
    const int font_px = std::clamp(screen_h / 68, 13, 28);
    const bool label = g_label.Make(device, frame.label, font_px);
    const bool badge = g_badge.Make(device, frame.badge, font_px);
    if (SUCCEEDED(device->BeginScene())) {
        const D3DVIEWPORT9 viewport{0, 0, desc.Width, desc.Height, 0, 1};
        device->SetViewport(&viewport);
        device->SetVertexShader(nullptr);
        device->SetPixelShader(nullptr);
        device->SetFVF(kFvf);
        device->SetRenderState(D3DRS_ZENABLE, D3DZB_FALSE);
        device->SetRenderState(D3DRS_ZWRITEENABLE, FALSE);
        device->SetRenderState(D3DRS_STENCILENABLE, FALSE);
        device->SetRenderState(D3DRS_SCISSORTESTENABLE, FALSE);
        device->SetRenderState(D3DRS_ALPHATESTENABLE, FALSE);
        device->SetRenderState(D3DRS_ALPHABLENDENABLE, TRUE);
        device->SetRenderState(D3DRS_SRCBLEND, D3DBLEND_SRCALPHA);
        device->SetRenderState(D3DRS_DESTBLEND, D3DBLEND_INVSRCALPHA);
        device->SetRenderState(D3DRS_BLENDOP, D3DBLENDOP_ADD);
        device->SetRenderState(D3DRS_CULLMODE, D3DCULL_NONE);
        device->SetRenderState(D3DRS_LIGHTING, FALSE);
        device->SetRenderState(D3DRS_FOGENABLE, FALSE);
        device->SetRenderState(D3DRS_SRGBWRITEENABLE, FALSE);
        device->SetRenderState(D3DRS_COLORWRITEENABLE, 0xF);
        device->SetRenderState(D3DRS_FILLMODE, D3DFILL_SOLID);
        device->SetTextureStageState(0, D3DTSS_COLORARG1, D3DTA_TEXTURE);
        device->SetTextureStageState(0, D3DTSS_COLORARG2, D3DTA_DIFFUSE);
        device->SetTextureStageState(0, D3DTSS_ALPHAARG1, D3DTA_TEXTURE);
        device->SetTextureStageState(0, D3DTSS_ALPHAARG2, D3DTA_DIFFUSE);
        device->SetTextureStageState(1, D3DTSS_COLOROP, D3DTOP_DISABLE);
        device->SetTextureStageState(1, D3DTSS_ALPHAOP, D3DTOP_DISABLE);
        device->SetSamplerState(0, D3DSAMP_MINFILTER, D3DTEXF_POINT);
        device->SetSamplerState(0, D3DSAMP_MAGFILTER, D3DTEXF_POINT);
        device->SetSamplerState(0, D3DSAMP_MIPFILTER, D3DTEXF_NONE);

        std::vector<Vertex> lines;
        for (const Box& box : frame.boxes) Outline(lines, box);
        if (!lines.empty()) {
            device->SetTexture(0, nullptr);
            device->SetTextureStageState(0, D3DTSS_COLOROP, D3DTOP_SELECTARG2);
            device->SetTextureStageState(0, D3DTSS_ALPHAOP, D3DTOP_SELECTARG2);
            device->DrawPrimitiveUP(D3DPT_TRIANGLELIST, static_cast<UINT>(lines.size() / 3), lines.data(),
                                    sizeof(Vertex));
        }
        if (badge) {
            const int bx = (screen_w - g_badge.width) / 2, by = std::max(4, screen_h / 90);
            std::vector<Vertex> border;
            Outline(border, {bx - 2, by - 2, g_badge.width + 4, g_badge.height + 4, frame.badge_color, false});
            device->SetTexture(0, nullptr);
            device->SetTextureStageState(0, D3DTSS_COLOROP, D3DTOP_SELECTARG2);
            device->SetTextureStageState(0, D3DTSS_ALPHAOP, D3DTOP_SELECTARG2);
            device->DrawPrimitiveUP(D3DPT_TRIANGLELIST, static_cast<UINT>(border.size() / 3), border.data(),
                                    sizeof(Vertex));
            DrawText(device, g_badge, bx, by);
        }
        if (label) {
            // Beside the pointer, kept on the screen (guibounds' label is cut off at the edge, H1).
            int lx = frame.label_x + 24, ly = frame.label_y + 24;
            if (lx + g_label.width > screen_w) lx = std::max(0, frame.label_x - 16 - g_label.width);
            if (ly + g_label.height > screen_h) ly = std::max(0, frame.label_y - 16 - g_label.height);
            DrawText(device, g_label, lx, ly);
        }
        device->EndScene();
        g_drawn.store(true, std::memory_order_release);
    }
    device->SetRenderTarget(0, old_target);
    if (old_target != nullptr) old_target->Release();
    back->Release();
    block->Apply();
    block->Release();
}

HRESULT STDMETHODCALLTYPE OnPresent(IDirect3DDevice9* device, const RECT* source, const RECT* dest, HWND window,
                                    const RGNDATA* dirty) noexcept {
    try {
        Draw(device);
    } catch (...) {
    }
    return g_present.hook.next(device, source, dest, window, dirty);
}

HRESULT STDMETHODCALLTYPE OnPresentOther(IDirect3DDevice9* device, const RECT* source, const RECT* dest, HWND window,
                                         const RGNDATA* dirty) noexcept {
    try {
        Draw(device);
    } catch (...) {
    }
    return g_present_other.hook.next(device, source, dest, window, dirty);
}

HRESULT STDMETHODCALLTYPE OnPresentEx(IDirect3DDevice9Ex* device, const RECT* source, const RECT* dest, HWND window,
                                      const RGNDATA* dirty, DWORD flags) noexcept {
    try {
        Draw(device);
    } catch (...) {
    }
    return g_present_ex.hook.next(device, source, dest, window, dirty, flags);
}

void HookDevice(IDirect3DDevice9* device, bool ex) {
    const std::lock_guard lock(g_hook_mutex);
    void* present = Slot(device, kPresent);
    if (!g_present.hook.active()) {
        HookAt(g_present, present, OnPresent, "IDirect3DDevice9::Present");
    } else if (g_present.at != present) {
        HookAt(g_present_other, present, OnPresentOther, "IDirect3DDevice9::Present of another class");
    }
    if (ex) HookAt(g_present_ex, Slot(device, kPresentEx), OnPresentEx, "IDirect3DDevice9Ex::PresentEx");
    if (!g_device_seen.exchange(true))
        anvil::Host{}.info("Direct3D 9{} device found: pick mode can draw", ex ? "Ex" : "");
}

HRESULT STDMETHODCALLTYPE OnCreateDevice(IDirect3D9* d3d, UINT adapter, D3DDEVTYPE type, HWND focus, DWORD flags,
                                         D3DPRESENT_PARAMETERS* parameters, IDirect3DDevice9** out) noexcept {
    const HRESULT hr = g_create_device.hook.next(d3d, adapter, type, focus, flags, parameters, out);
    if (SUCCEEDED(hr) && out != nullptr && *out != nullptr) {
        try {
            HookDevice(*out, false);
        } catch (...) {
        }
    }
    return hr;
}

HRESULT STDMETHODCALLTYPE OnCreateDeviceEx(IDirect3D9Ex* d3d, UINT adapter, D3DDEVTYPE type, HWND focus, DWORD flags,
                                           D3DPRESENT_PARAMETERS* parameters, D3DDISPLAYMODEEX* mode,
                                           IDirect3DDevice9Ex** out) noexcept {
    const HRESULT hr = g_create_device_ex.hook.next(d3d, adapter, type, focus, flags, parameters, mode, out);
    if (SUCCEEDED(hr) && out != nullptr && *out != nullptr) {
        try {
            HookDevice(*out, true);
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

}  // namespace

bool Install(const anvil::Host& host) {
    // The game's renderer looks both up with GetProcAddress, so the exports
    // themselves are hooked (anvil-overlay's finding).
    HMODULE d3d9 = LoadLibraryW(L"d3d9.dll");
    if (d3d9 == nullptr) {
        host.warn("d3d9.dll cannot be loaded: pick mode draws no outline");
        return false;
    }
    try {
        host.hook_at(g_create9, reinterpret_cast<void*>(GetProcAddress(d3d9, "Direct3DCreate9")), OnCreate9);
        host.hook_at(g_create9ex, reinterpret_cast<void*>(GetProcAddress(d3d9, "Direct3DCreate9Ex")), OnCreate9Ex);
    } catch (const std::exception& e) {
        host.warn("cannot hook Direct3DCreate9(Ex): {}; pick mode draws no outline", e.what());
        return false;
    }
    return true;
}

bool EnsureHooked() {
    if (g_device_seen.load()) return true;
    // The game made its device before the hooks: a throwaway device of the
    // same kind gives Present, which every such device shares.
    anvil::Host{}.warn("no Direct3D 9 device was seen being created; finding Present through a throwaway device");
    HWND window =
        CreateWindowExW(0, L"STATIC", L"etch pick", WS_POPUP, 0, 0, 16, 16, nullptr, nullptr, nullptr, nullptr);
    if (window == nullptr) return false;
    IDirect3D9* d3d = Direct3DCreate9(D3D_SDK_VERSION);
    bool ok = false;
    if (d3d != nullptr) {
        D3DPRESENT_PARAMETERS parameters{};
        parameters.Windowed = TRUE;
        parameters.SwapEffect = D3DSWAPEFFECT_DISCARD;
        parameters.BackBufferFormat = D3DFMT_UNKNOWN;
        parameters.hDeviceWindow = window;
        IDirect3DDevice9* device = nullptr;
        if (SUCCEEDED(d3d->CreateDevice(
                D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, window,
                D3DCREATE_SOFTWARE_VERTEXPROCESSING | D3DCREATE_FPU_PRESERVE | D3DCREATE_NOWINDOWCHANGES, &parameters,
                &device)) &&
            device != nullptr) {
            HookDevice(device, false);  // through OnCreateDevice already, when Direct3DCreate9 was hooked
            device->Release();
            ok = true;
        }
        d3d->Release();
    }
    DestroyWindow(window);
    return ok;
}

void Show(Frame frame) {
    const bool on = frame.on;
    {
        const std::lock_guard lock(g_frame_mutex);
        g_frame = std::move(frame);
    }
    g_on.store(on, std::memory_order_release);
}

bool Seen() { return g_drawn.load(std::memory_order_acquire); }

}  // namespace etch::overlay
