// PROTOTYPE for happy-dwarf-team/etch#21, throwaway, never merged.
//
// Question: can a plugin copy the frame in which a window opened by
// `window open` is drawn, while the game sits unfocused, and what does the
// copy plus crop cost at 3440x1440? Also: when is the plugin's pipe up
// compared with the game's readiness?
//
// Getting the device is anvil-overlay's way (Direct3DCreate9(Ex) exports ->
// CreateDevice(Ex) -> the device's methods). The device's Present, the swap
// chain's Present and EndScene are hooked; EndScene only counts.
//
// Pipe \\.\pipe\etch-proto, one text line per request, one JSON line back:
//   ping
//   capture full|crop X Y W H PATH   copy at the next Present, write a 32-bit BMP
// full: GetRenderTargetData of the whole back buffer, then the crop is copied
// out of the locked surface. crop: StretchRect of the rectangle into a small
// render target first, then GetRenderTargetData of that.
#include <anvil/anvil.hpp>
#include <anvil/anvil_game.h>

#include <windows.h>
#include <d3d9.h>

#include <algorithm>
#include <atomic>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <string>
#include <vector>

namespace {

constexpr size_t kCreateDevice = 16;    // IDirect3D9
constexpr size_t kCreateDeviceEx = 20;  // IDirect3D9Ex
constexpr size_t kPresent = 17;         // IDirect3DDevice9
constexpr size_t kEndScene = 42;
constexpr size_t kSwapPresent = 3;      // IDirect3DSwapChain9

using Create9Fn = IDirect3D9*(WINAPI)(UINT);
using Create9ExFn = HRESULT(WINAPI)(UINT, IDirect3D9Ex**);
using CreateDeviceFn = HRESULT(STDMETHODCALLTYPE)(IDirect3D9*, UINT, D3DDEVTYPE, HWND, DWORD, D3DPRESENT_PARAMETERS*,
                                                  IDirect3DDevice9**);
using CreateDeviceExFn = HRESULT(STDMETHODCALLTYPE)(IDirect3D9Ex*, UINT, D3DDEVTYPE, HWND, DWORD,
                                                    D3DPRESENT_PARAMETERS*, D3DDISPLAYMODEEX*, IDirect3DDevice9Ex**);
using PresentFn = HRESULT(STDMETHODCALLTYPE)(IDirect3DDevice9*, const RECT*, const RECT*, HWND, const RGNDATA*);
using SwapPresentFn = HRESULT(STDMETHODCALLTYPE)(IDirect3DSwapChain9*, const RECT*, const RECT*, HWND, const RGNDATA*,
                                                 DWORD);
using EndSceneFn = HRESULT(STDMETHODCALLTYPE)(IDirect3DDevice9*);

template <class Sig> struct MethodHook {
    anvil::FunctionHook<Sig> hook;
    void* at = nullptr;
};

anvil::FunctionHook<Create9Fn> g_create9;
anvil::FunctionHook<Create9ExFn> g_create9ex;
MethodHook<CreateDeviceFn> g_create_device;
MethodHook<CreateDeviceExFn> g_create_device_ex;
MethodHook<PresentFn> g_present;
MethodHook<SwapPresentFn> g_swap_present;
MethodHook<EndSceneFn> g_end_scene;
std::mutex g_hook_mutex;

const AnvilGameService* g_game = nullptr;
LARGE_INTEGER g_freq;

double now_ms() {
    LARGE_INTEGER t;
    QueryPerformanceCounter(&t);
    return 1000.0 * static_cast<double>(t.QuadPart) / static_cast<double>(g_freq.QuadPart);
}

// Milliseconds since the process was created (GetProcessTimes), the clock of
// the launcher's measurements.
double since_creation_ms() {
    FILETIME c, e, k, u, now;
    GetProcessTimes(GetCurrentProcess(), &c, &e, &k, &u);
    GetSystemTimePreciseAsFileTime(&now);
    const auto v = [](FILETIME f) { return (static_cast<unsigned long long>(f.dwHighDateTime) << 32) | f.dwLowDateTime; };
    return static_cast<double>(v(now) - v(c)) / 1e4;
}

std::atomic<double> g_ready_ms{-1}, g_pipe_ms{-1}, g_device_ms{-1}, g_first_present_ms{-1};
std::atomic<unsigned long long> g_presents{0}, g_swap_presents{0}, g_end_scenes{0};
std::atomic<unsigned long long> g_frames{0}, g_presents_at_last_frame{0};
std::atomic<unsigned> g_frames_with_0{0}, g_frames_with_1{0}, g_frames_with_more{0};
std::atomic<HWND> g_window{nullptr};
std::atomic<IDirect3DDevice9*> g_device{nullptr};

// ---- capture ------------------------------------------------------------------

struct Request {
    bool crop_first = false;
    RECT rect{};
};
struct Result {
    std::string error;
    const char* kind = "";
    unsigned long long frame = 0;
    double wait_ms = 0, prep_ms = 0, readback_ms = 0, copy_ms = 0, total_ms = 0;
    UINT bb_w = 0, bb_h = 0, w = 0, h = 0;
    unsigned format = 0, msaa = 0;
    bool created_sysmem = false, foreground = false, iconic = false;
    std::vector<unsigned char> pixels;
};
Request g_req;
Result g_res;
double g_armed_at = 0;
// 0 idle, 1 armed, 3 the Present hook is copying, 2 done.
std::atomic<int> g_cap_state{0};
HANDLE g_cap_done = nullptr;
IDirect3DSurface9* g_sysmem = nullptr;  // cached; Present thread only
D3DSURFACE_DESC g_sysmem_desc{};

IDirect3DSurface9* sysmem_surface(IDirect3DDevice9* device, UINT w, UINT h, D3DFORMAT format, bool& created) {
    created = false;
    if (g_sysmem && g_sysmem_desc.Width == w && g_sysmem_desc.Height == h && g_sysmem_desc.Format == format) return g_sysmem;
    if (g_sysmem) g_sysmem->Release();
    g_sysmem = nullptr;
    if (FAILED(device->CreateOffscreenPlainSurface(w, h, format, D3DPOOL_SYSTEMMEM, &g_sysmem, nullptr))) return nullptr;
    g_sysmem->GetDesc(&g_sysmem_desc);
    created = true;
    return g_sysmem;
}

void capture(IDirect3DDevice9* device, IDirect3DSurface9* back_buffer, const char* kind) {
    Result& r = g_res;
    r = Result{};
    r.kind = kind;
    const double t0 = now_ms();
    r.wait_ms = t0 - g_armed_at;
    r.frame = g_game ? g_game->frame_number() : 0;
    HWND window = g_window.load();
    r.foreground = window != nullptr && GetForegroundWindow() == window;
    r.iconic = window != nullptr && IsIconic(window);
    D3DSURFACE_DESC d{};
    back_buffer->GetDesc(&d);
    r.bb_w = d.Width;
    r.bb_h = d.Height;
    r.format = static_cast<unsigned>(d.Format);
    r.msaa = static_cast<unsigned>(d.MultiSampleType);
    RECT c = g_req.rect;
    c.left = std::max<LONG>(0, c.left);
    c.top = std::max<LONG>(0, c.top);
    c.right = std::min<LONG>(static_cast<LONG>(d.Width), c.right);
    c.bottom = std::min<LONG>(static_cast<LONG>(d.Height), c.bottom);
    if (c.right <= c.left || c.bottom <= c.top) {
        r.error = "empty rectangle after clamping to the back buffer";
        return;
    }
    r.w = static_cast<UINT>(c.right - c.left);
    r.h = static_cast<UINT>(c.bottom - c.top);
    if (d.Format != D3DFMT_X8R8G8B8 && d.Format != D3DFMT_A8R8G8B8) {
        r.error = "back buffer format is not 32-bit";
        return;
    }

    IDirect3DSurface9* temp = nullptr;  // the small crop, or the resolved multisampled buffer
    IDirect3DSurface9* source = back_buffer;
    RECT lock = c;
    if (g_req.crop_first) {
        if (FAILED(device->CreateRenderTarget(r.w, r.h, d.Format, D3DMULTISAMPLE_NONE, 0, FALSE, &temp, nullptr)) ||
            FAILED(device->StretchRect(back_buffer, &c, temp, nullptr, D3DTEXF_NONE))) {
            r.error = "CreateRenderTarget/StretchRect of the crop failed";
            if (temp) temp->Release();
            return;
        }
        source = temp;
        lock = RECT{0, 0, static_cast<LONG>(r.w), static_cast<LONG>(r.h)};
    } else if (d.MultiSampleType != D3DMULTISAMPLE_NONE) {
        if (FAILED(device->CreateRenderTarget(d.Width, d.Height, d.Format, D3DMULTISAMPLE_NONE, 0, FALSE, &temp, nullptr)) ||
            FAILED(device->StretchRect(back_buffer, nullptr, temp, nullptr, D3DTEXF_NONE))) {
            r.error = "resolving the multisampled back buffer failed";
            if (temp) temp->Release();
            return;
        }
        source = temp;
    }
    D3DSURFACE_DESC sd{};
    source->GetDesc(&sd);
    IDirect3DSurface9* sys = sysmem_surface(device, sd.Width, sd.Height, sd.Format, r.created_sysmem);
    const double t1 = now_ms();
    r.prep_ms = t1 - t0;
    if (!sys || FAILED(device->GetRenderTargetData(source, sys))) {
        r.error = "GetRenderTargetData failed";
        if (temp) temp->Release();
        return;
    }
    const double t2 = now_ms();
    r.readback_ms = t2 - t1;
    D3DLOCKED_RECT locked{};
    if (FAILED(sys->LockRect(&locked, &lock, D3DLOCK_READONLY))) {
        r.error = "LockRect failed";
        if (temp) temp->Release();
        return;
    }
    r.pixels.resize(static_cast<size_t>(r.w) * r.h * 4);
    for (UINT y = 0; y < r.h; ++y) {
        std::memcpy(r.pixels.data() + static_cast<size_t>(y) * r.w * 4,
                    static_cast<const unsigned char*>(locked.pBits) + static_cast<size_t>(y) * locked.Pitch, r.w * 4);
    }
    sys->UnlockRect();
    if (temp) temp->Release();
    const double t3 = now_ms();
    r.copy_ms = t3 - t2;
    r.total_ms = t3 - t0;
}

// Called by every Present hook before the game's Present; the frame is complete here.
void maybe_capture(IDirect3DDevice9* device, IDirect3DSurface9* back_buffer, const char* kind) {
    int armed = 1;
    if (!g_cap_state.compare_exchange_strong(armed, 3)) return;
    try {
        capture(device, back_buffer, kind);
    } catch (...) {
        g_res.error = "exception while copying";
    }
    g_cap_state.store(2);
    SetEvent(g_cap_done);
}

void count_present() {
    double unset = -1;
    g_first_present_ms.compare_exchange_strong(unset, since_creation_ms());
}

HRESULT STDMETHODCALLTYPE on_present(IDirect3DDevice9* device, const RECT* a, const RECT* b, HWND w,
                                     const RGNDATA* dirty) noexcept {
    g_presents.fetch_add(1);
    count_present();
    if (g_cap_state.load() == 1) {
        IDirect3DSurface9* bb = nullptr;
        if (SUCCEEDED(device->GetBackBuffer(0, 0, D3DBACKBUFFER_TYPE_MONO, &bb))) {
            maybe_capture(device, bb, "device.Present");
            bb->Release();
        }
    }
    return g_present.hook.next(device, a, b, w, dirty);
}

HRESULT STDMETHODCALLTYPE on_swap_present(IDirect3DSwapChain9* chain, const RECT* a, const RECT* b, HWND w,
                                          const RGNDATA* dirty, DWORD flags) noexcept {
    g_swap_presents.fetch_add(1);
    count_present();
    if (g_cap_state.load() == 1) {
        IDirect3DSurface9* bb = nullptr;
        IDirect3DDevice9* device = nullptr;
        if (SUCCEEDED(chain->GetDevice(&device)) && SUCCEEDED(chain->GetBackBuffer(0, D3DBACKBUFFER_TYPE_MONO, &bb))) {
            maybe_capture(device, bb, "swapchain.Present");
        }
        if (bb) bb->Release();
        if (device) device->Release();
    }
    return g_swap_present.hook.next(chain, a, b, w, dirty, flags);
}

HRESULT STDMETHODCALLTYPE on_end_scene(IDirect3DDevice9* device) noexcept {
    g_end_scenes.fetch_add(1);
    return g_end_scene.hook.next(device);
}

// ---- getting the device (anvil-overlay's way) ---------------------------------------

void* slot(void* object, size_t index) { return (*static_cast<void***>(object))[index]; }

template <class Sig, class D> bool hook_at(MethodHook<Sig>& method, void* address, D detour, const char* what) {
    if (method.hook.active()) return method.at == address;
    try {
        anvil::Host{}.hook_at(method.hook, address, detour);
        method.at = address;
        return true;
    } catch (const std::exception& e) {
        anvil::Host{}.warn("cannot hook {} at {}: {}", what, address, e.what());
        return false;
    }
}

void on_device(IDirect3DDevice9* device, HWND focus, const D3DPRESENT_PARAMETERS* p) {
    std::lock_guard lock(g_hook_mutex);
    hook_at(g_present, slot(device, kPresent), on_present, "IDirect3DDevice9::Present");
    hook_at(g_end_scene, slot(device, kEndScene), on_end_scene, "IDirect3DDevice9::EndScene");
    IDirect3DSwapChain9* chain = nullptr;
    if (SUCCEEDED(device->GetSwapChain(0, &chain)) && chain) {
        hook_at(g_swap_present, slot(chain, kSwapPresent), on_swap_present, "IDirect3DSwapChain9::Present");
        chain->Release();
    }
    HWND window = p != nullptr && p->hDeviceWindow != nullptr ? p->hDeviceWindow : focus;
    g_window.store(window);
    g_device.store(device);
    g_device_ms.store(since_creation_ms());
    anvil::Host{}.info("device {} window {} back buffer {}x{} format {} msaa {} windowed {} swap effect {}",
                       static_cast<void*>(device), static_cast<void*>(window), p ? p->BackBufferWidth : 0,
                       p ? p->BackBufferHeight : 0, p ? static_cast<unsigned>(p->BackBufferFormat) : 0,
                       p ? static_cast<unsigned>(p->MultiSampleType) : 0, p ? p->Windowed : 0,
                       p ? static_cast<unsigned>(p->SwapEffect) : 0);
}

HRESULT STDMETHODCALLTYPE on_create_device(IDirect3D9* d3d, UINT adapter, D3DDEVTYPE type, HWND focus, DWORD flags,
                                           D3DPRESENT_PARAMETERS* p, IDirect3DDevice9** out) noexcept {
    const HRESULT hr = g_create_device.hook.next(d3d, adapter, type, focus, flags, p, out);
    if (SUCCEEDED(hr) && out && *out) {
        try {
            on_device(*out, focus, p);
        } catch (...) {
        }
    }
    return hr;
}

HRESULT STDMETHODCALLTYPE on_create_device_ex(IDirect3D9Ex* d3d, UINT adapter, D3DDEVTYPE type, HWND focus, DWORD flags,
                                              D3DPRESENT_PARAMETERS* p, D3DDISPLAYMODEEX* mode,
                                              IDirect3DDevice9Ex** out) noexcept {
    const HRESULT hr = g_create_device_ex.hook.next(d3d, adapter, type, focus, flags, p, mode, out);
    if (SUCCEEDED(hr) && out && *out) {
        try {
            on_device(*out, focus, p);
        } catch (...) {
        }
    }
    return hr;
}

void wrap(IDirect3D9* d3d, bool ex) {
    if (!d3d) return;
    std::lock_guard lock(g_hook_mutex);
    hook_at(g_create_device, slot(d3d, kCreateDevice), on_create_device, "IDirect3D9::CreateDevice");
    if (ex) hook_at(g_create_device_ex, slot(d3d, kCreateDeviceEx), on_create_device_ex, "IDirect3D9Ex::CreateDeviceEx");
}

IDirect3D9* WINAPI on_create9(UINT version) noexcept {
    IDirect3D9* d3d = g_create9.next(version);
    try {
        wrap(d3d, false);
    } catch (...) {
    }
    return d3d;
}

HRESULT WINAPI on_create9ex(UINT version, IDirect3D9Ex** out) noexcept {
    const HRESULT hr = g_create9ex.next(version, out);
    if (SUCCEEDED(hr) && out) {
        try {
            wrap(*out, true);
        } catch (...) {
        }
    }
    return hr;
}

// ---- pipe ---------------------------------------------------------------------------

std::string num(double v) {
    char b[32];
    std::snprintf(b, sizeof b, "%.3f", v);
    return b;
}

std::string escape(const std::string& s) {
    std::string out;
    for (char c : s) {
        if (c == '"' || c == '\\') out += '\\';
        if (static_cast<unsigned char>(c) >= 0x20) out += c;
    }
    return out;
}

std::string ping() {
    HWND window = g_window.load();
    RECT wr{};
    if (window) GetWindowRect(window, &wr);
    std::string out = "{\"ok\":true,\"command\":\"ping\",\"pid\":" + std::to_string(GetCurrentProcessId());
    out += ",\"ready\":" + std::string(g_game && g_game->ready() ? "true" : "false");
    out += ",\"ready_ms\":" + num(g_ready_ms.load()) + ",\"pipe_ms\":" + num(g_pipe_ms.load()) +
           ",\"device_ms\":" + num(g_device_ms.load()) + ",\"first_present_ms\":" + num(g_first_present_ms.load()) +
           ",\"now_ms\":" + num(since_creation_ms());
    out += ",\"frame\":" + std::to_string(g_game ? g_game->frame_number() : 0);
    out += ",\"presents\":" + std::to_string(g_presents.load()) + ",\"swap_presents\":" + std::to_string(g_swap_presents.load()) +
           ",\"end_scenes\":" + std::to_string(g_end_scenes.load());
    out += ",\"frames_with_presents\":{\"0\":" + std::to_string(g_frames_with_0.load()) +
           ",\"1\":" + std::to_string(g_frames_with_1.load()) + ",\"more\":" + std::to_string(g_frames_with_more.load()) + "}";
    out += ",\"foreground\":" + std::string(window && GetForegroundWindow() == window ? "true" : "false");
    out += ",\"iconic\":" + std::string(window && IsIconic(window) ? "true" : "false");
    out += ",\"window\":[" + std::to_string(wr.left) + "," + std::to_string(wr.top) + "," + std::to_string(wr.right) + "," +
           std::to_string(wr.bottom) + "]}";
    return out;
}

bool write_bmp(const std::string& path, const Result& r, std::string& error) {
    BITMAPFILEHEADER fh{};
    BITMAPINFOHEADER ih{};
    ih.biSize = sizeof ih;
    ih.biWidth = static_cast<LONG>(r.w);
    ih.biHeight = -static_cast<LONG>(r.h);  // top-down
    ih.biPlanes = 1;
    ih.biBitCount = 32;
    ih.biCompression = BI_RGB;
    fh.bfType = 0x4D42;
    fh.bfOffBits = sizeof fh + sizeof ih;
    fh.bfSize = fh.bfOffBits + static_cast<DWORD>(r.pixels.size());
    HANDLE f = CreateFileA(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (f == INVALID_HANDLE_VALUE) {
        error = "cannot create " + path;
        return false;
    }
    DWORD n = 0;
    const bool ok = WriteFile(f, &fh, sizeof fh, &n, nullptr) && WriteFile(f, &ih, sizeof ih, &n, nullptr) &&
                    WriteFile(f, r.pixels.data(), static_cast<DWORD>(r.pixels.size()), &n, nullptr);
    CloseHandle(f);
    if (!ok) error = "cannot write " + path;
    return ok;
}

std::string capture_command(const std::string& line) {
    char mode[8] = {};
    long x = 0, y = 0, w = 0, h = 0;
    char path[1024] = {};
    if (std::sscanf(line.c_str(), "capture %7s %ld %ld %ld %ld %1023s", mode, &x, &y, &w, &h, path) != 6 ||
        (std::strcmp(mode, "full") != 0 && std::strcmp(mode, "crop") != 0) || w <= 0 || h <= 0) {
        return "{\"ok\":false,\"command\":\"capture\",\"error\":\"usage: capture full|crop X Y W H PATH\"}";
    }
    if (!g_device.load()) return "{\"ok\":false,\"command\":\"capture\",\"error\":\"no device yet\"}";
    g_req.crop_first = std::strcmp(mode, "crop") == 0;
    g_req.rect = RECT{x, y, x + w, y + h};
    ResetEvent(g_cap_done);
    g_armed_at = now_ms();
    const unsigned long long frame_at_request = g_game ? g_game->frame_number() : 0;
    g_cap_state.store(1);
    if (WaitForSingleObject(g_cap_done, 3000) != WAIT_OBJECT_0) {
        int armed = 1;
        if (g_cap_state.compare_exchange_strong(armed, 0)) {
            return "{\"ok\":false,\"command\":\"capture\",\"error\":\"no Present within 3 s\"}";
        }
        WaitForSingleObject(g_cap_done, INFINITE);  // the copy is running
    }
    Result& r = g_res;
    g_cap_state.store(0);
    std::string out = "{\"ok\":" + std::string(r.error.empty() ? "true" : "false") + ",\"command\":\"capture\"";
    if (!r.error.empty()) out += ",\"error\":\"" + escape(r.error) + "\"";
    double write_ms = 0;
    if (r.error.empty()) {
        const double t = now_ms();
        std::string error;
        if (!write_bmp(path, r, error)) out += ",\"write_error\":\"" + escape(error) + "\"";
        write_ms = now_ms() - t;
    }
    out += ",\"mode\":\"" + std::string(mode) + "\",\"kind\":\"" + r.kind + "\"";
    out += ",\"frame_at_request\":" + std::to_string(frame_at_request) + ",\"frame\":" + std::to_string(r.frame);
    out += ",\"wait_ms\":" + num(r.wait_ms) + ",\"prep_ms\":" + num(r.prep_ms) + ",\"readback_ms\":" + num(r.readback_ms) +
           ",\"copy_ms\":" + num(r.copy_ms) + ",\"present_thread_ms\":" + num(r.total_ms) + ",\"write_ms\":" + num(write_ms);
    out += ",\"back_buffer\":[" + std::to_string(r.bb_w) + "," + std::to_string(r.bb_h) + "],\"format\":" +
           std::to_string(r.format) + ",\"msaa\":" + std::to_string(r.msaa);
    out += ",\"size\":[" + std::to_string(r.w) + "," + std::to_string(r.h) + "],\"created_sysmem\":" +
           (r.created_sysmem ? "true" : "false");
    out += ",\"foreground\":" + std::string(r.foreground ? "true" : "false") + ",\"iconic\":" + (r.iconic ? "true" : "false");
    out += ",\"path\":\"" + escape(path) + "\"}";
    return out;
}

std::string handle(const std::string& line) {
    if (line == "ping") return ping();
    if (line.rfind("capture ", 0) == 0) return capture_command(line);
    return "{\"ok\":false,\"error\":\"unknown command\"}";
}

void serve() {
    for (;;) {
        HANDLE pipe = CreateNamedPipeW(L"\\\\.\\pipe\\etch-proto", PIPE_ACCESS_DUPLEX,
                                       PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS, 1,
                                       1 << 16, 1 << 16, 0, nullptr);
        if (pipe == INVALID_HANDLE_VALUE) {
            anvil::Host{}.warn("CreateNamedPipe failed: {}", GetLastError());
            return;
        }
        double unset = -1;
        g_pipe_ms.compare_exchange_strong(unset, since_creation_ms());
        if (!ConnectNamedPipe(pipe, nullptr) && GetLastError() != ERROR_PIPE_CONNECTED) {
            CloseHandle(pipe);
            continue;
        }
        std::string buffer;
        char chunk[4096];
        DWORD n = 0;
        while (ReadFile(pipe, chunk, sizeof chunk, &n, nullptr) && n > 0) {
            buffer.append(chunk, n);
            size_t at;
            while ((at = buffer.find('\n')) != std::string::npos) {
                std::string line = buffer.substr(0, at);
                buffer.erase(0, at + 1);
                if (!line.empty() && line.back() == '\r') line.pop_back();
                std::string answer;
                try {
                    answer = handle(line) + "\n";
                } catch (...) {
                    answer = "{\"ok\":false,\"error\":\"exception\"}\n";
                }
                DWORD written = 0;
                WriteFile(pipe, answer.data(), static_cast<DWORD>(answer.size()), &written, nullptr);
            }
        }
        DisconnectNamedPipe(pipe);
        CloseHandle(pipe);
    }
}

struct EtchCaptureProto : anvil::Plugin {
    void load(anvil::Host& host) override {
        QueryPerformanceFrequency(&g_freq);
        g_cap_done = CreateEventW(nullptr, TRUE, FALSE, nullptr);
        g_game = host.service<AnvilGameService>(ANVIL_GAME_SERVICE, ANVIL_GAME_SERVICE_VERSION);
        if (HMODULE d3d9 = GetModuleHandleW(L"d3d9.dll")) {
            host.hook_at(g_create9, reinterpret_cast<void*>(GetProcAddress(d3d9, "Direct3DCreate9")), on_create9);
            host.hook_at(g_create9ex, reinterpret_cast<void*>(GetProcAddress(d3d9, "Direct3DCreate9Ex")), on_create9ex);
        } else {
            host.warn("d3d9.dll is not loaded: no capture");
        }
        host.subscribe(ANVIL_GAME_EVENT_READY, [] {
            g_ready_ms.store(since_creation_ms());
            anvil::Host{}.info("ready at {} ms after process creation", g_ready_ms.load());
        });
        host.subscribe(ANVIL_GAME_EVENT_FRAME, [] {
            const unsigned long long presents = g_presents.load() + g_swap_presents.load();
            const unsigned long long delta = presents - g_presents_at_last_frame.exchange(presents);
            if (g_frames.fetch_add(1) > 0) (delta == 0 ? g_frames_with_0 : delta == 1 ? g_frames_with_1 : g_frames_with_more)++;
        });
        CreateThread(nullptr, 0, [](void*) -> DWORD { serve(); return 0; }, nullptr, 0, nullptr);
        host.info("PROTOTYPE etch#21: Direct3DCreate9(Ex) hooked, pipe \\\\.\\pipe\\etch-proto");
    }
};

}  // namespace

ANVIL_PLUGIN(EtchCaptureProto)
