// What the live scene needs from the Windows desktop that Playwright does not reach (etch-website
// docs/spec.md section 8.5): the live game's window, placing it beside VS Code, and the real pointer,
// moved with SetCursorPos and clicked with SendInput as a hand would, so the game's cursor shows in
// the master and pick mode sees a real click. One Windows PowerShell 5.1 process compiles a small C# class
// and answers one JSON line per request line, as Etch's own Windows helper does
// (packages/extension/src/live-game/windows.ts).
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

/** A rectangle in screen pixels. */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface WindowInfo {
  /** The handle, in decimal, as FFmpeg's `gfxcapture=hwnd=` takes it. */
  readonly hwnd: string;
  /** What `gfxcapture` records: the window's visible frame, without the invisible resize border. */
  readonly frame: ScreenRect;
  /** The client area. */
  readonly client: ScreenRect;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class Desktop {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly lines: string[] = [];
  private waiting: ((line: string | undefined) => void) | undefined;
  private errors = '';

  private constructor(child: ChildProcessWithoutNullStreams) {
    this.child = child;
    let buffered = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffered += chunk;
      for (let end = buffered.indexOf('\n'); end >= 0; end = buffered.indexOf('\n')) {
        const line = buffered.slice(0, end).trim();
        buffered = buffered.slice(end + 1);
        if (!line.startsWith('{')) continue;
        if (this.waiting === undefined) this.lines.push(line);
        else this.waiting(line);
      }
    });
    child.stderr.on('data', (chunk: string) => (this.errors += chunk));
    child.once('exit', () => this.waiting?.(undefined));
  }

  static async start(): Promise<Desktop> {
    const child = spawn(
      'powershell.exe',
      [
        ...['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass'],
        ...['-EncodedCommand', Buffer.from(SCRIPT, 'utf16le').toString('base64')],
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const desktop = new Desktop(child);
    if ((await desktop.next(30_000)) === undefined) {
      child.kill();
      throw new Error(`the desktop helper did not start: ${desktop.errors.trim()}`);
    }
    return desktop;
  }

  private next(timeoutMs: number): Promise<string | undefined> {
    const queued = this.lines.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting = undefined;
        resolve(undefined);
      }, timeoutMs);
      this.waiting = (line) => {
        clearTimeout(timer);
        this.waiting = undefined;
        resolve(line);
      };
    });
  }

  private async request<T>(request: object): Promise<T> {
    this.child.stdin.write(`${JSON.stringify(request)}\n`);
    const line = await this.next(30_000);
    if (line === undefined) throw new Error(`the desktop helper did not answer: ${this.errors}`);
    const answer = JSON.parse(line) as { error?: string } & T;
    if (answer.error !== undefined) throw new Error(`the desktop helper failed: ${answer.error}`);
    return answer;
  }

  /** The largest visible top-level window of a process. */
  async windowOf(pid: number): Promise<WindowInfo | undefined> {
    const answer = await this.request<{ window: WindowInfo | null }>({ op: 'window', pid });
    return answer.window ?? undefined;
  }

  /** A window by its handle. */
  async window(hwnd: string): Promise<WindowInfo> {
    const answer = await this.request<{ window: WindowInfo | null }>({ op: 'window', hwnd });
    if (answer.window === null) throw new Error(`window ${hwnd} is gone`);
    return answer.window;
  }

  /** Moves a window, keeping its size, so its client area's top left corner is at `to`. */
  async placeClient(hwnd: string, to: Point): Promise<WindowInfo> {
    await this.request({ op: 'place', hwnd, x: to.x, y: to.y });
    return this.window(hwnd);
  }

  async cursor(): Promise<Point> {
    return (await this.request<{ cursor: Point }>({ op: 'cursor' })).cursor;
  }

  /** Moves the real pointer to `to` in about `ms`, easing in and out, as a hand would. */
  async movePointer(to: Point, ms: number): Promise<void> {
    const from = await this.cursor();
    const steps = Math.max(1, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      await this.request({
        op: 'move',
        x: Math.round(from.x + (to.x - from.x) * eased),
        y: Math.round(from.y + (to.y - from.y) * eased),
      });
      await sleep(ms / steps);
    }
  }

  /** Clicks the left button where the pointer is, with SendInput. */
  async click(): Promise<void> {
    await this.request({ op: 'click' });
  }

  /** Presses a shortcut with SendInput, as typed: `SCAN.ctrl, SCAN.shift, SCAN.e`. */
  async keys(...scans: number[]): Promise<void> {
    await this.request({ op: 'keys', scans });
  }

  /** Brings a window to the front; false when Windows refused. */
  async focus(hwnd: string): Promise<boolean> {
    return (await this.request<{ ok: boolean }>({ op: 'focus', hwnd })).ok;
  }

  close(): void {
    this.child.stdin.end();
  }
}

/** Set 1 scan codes of the keys the live take presses. */
export const SCAN = { ctrl: 0x1d, shift: 0x2a, e: 0x12 } as const;

// Windows PowerShell 5.1 runs this, one request per stdin line. Its cmdlets come from
// Microsoft.PowerShell.Utility imported from $PSHOME, with autoloading off (see Etch's windows.ts).
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$PSModuleAutoLoadingPreference = 'None'
Import-Module ([IO.Path]::Combine($PSHOME, 'Modules', 'Microsoft.PowerShell.Utility', 'Microsoft.PowerShell.Utility.psd1'))
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class EtchMediaDesktop {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct Pt { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct MouseInput { public int Dx, Dy; public uint Data, Flags, Time; public IntPtr Extra; }
  [StructLayout(LayoutKind.Sequential)] struct Input { public uint Type; public MouseInput Mouse; }
  [StructLayout(LayoutKind.Sequential)] struct KeyInput { public ushort Vk, Scan; public uint Flags, Time; public IntPtr Extra; }
  // INPUT is 40 bytes on x64 whichever member it holds; the key member sits where the mouse one does.
  [StructLayout(LayoutKind.Explicit, Size = 40)] struct KeyEvent { [FieldOffset(0)] public uint Type; [FieldOffset(8)] public KeyInput Key; }
  [DllImport("user32.dll", SetLastError = true, EntryPoint = "SendInput")] static extern uint SendKeys(uint count, KeyEvent[] inputs, int size);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
  delegate bool EnumProc(IntPtr hwnd, IntPtr param);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc proc, IntPtr param);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out int pid);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hwnd, out Rect rect);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hwnd, ref Pt point);
  [DllImport("user32.dll", SetLastError = true)] static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Pt point);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, Input[] inputs, int size);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out Rect rect, int size);
  public static IntPtr Largest(int pid) {
    IntPtr best = IntPtr.Zero; long area = 0;
    EnumWindows((hwnd, param) => {
      int owner; GetWindowThreadProcessId(hwnd, out owner);
      if (owner != pid || !IsWindowVisible(hwnd)) return true;
      Rect r; GetWindowRect(hwnd, out r);
      long a = (long)(r.Right - r.Left) * (r.Bottom - r.Top);
      if (a > area) { area = a; best = hwnd; }
      return true;
    }, IntPtr.Zero);
    return best;
  }
  public static bool Exists(IntPtr hwnd) { return IsWindow(hwnd); }
  public static Rect Frame(IntPtr hwnd) {
    Rect r;
    // DWMWA_EXTENDED_FRAME_BOUNDS: the visible frame, which Windows.Graphics.Capture records.
    if (DwmGetWindowAttribute(hwnd, 9, out r, Marshal.SizeOf(typeof(Rect))) != 0) GetWindowRect(hwnd, out r);
    return r;
  }
  public static Rect Client(IntPtr hwnd) {
    Rect r; GetClientRect(hwnd, out r);
    Pt p = new Pt(); ClientToScreen(hwnd, ref p);
    r.Left += p.X; r.Right += p.X; r.Top += p.Y; r.Bottom += p.Y;
    return r;
  }
  public static void Place(IntPtr hwnd, int x, int y) {
    Rect w; GetWindowRect(hwnd, out w);
    Rect c = Client(hwnd);
    // SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE
    if (!SetWindowPos(hwnd, IntPtr.Zero, w.Left + x - c.Left, w.Top + y - c.Top, 0, 0, 0x0001 | 0x0004 | 0x0010)) {
      throw new Exception("SetWindowPos failed: " + Marshal.GetLastWin32Error());
    }
  }
  public static Pt Cursor() { Pt p; GetCursorPos(out p); return p; }
  public static void Move(int x, int y) { SetCursorPos(x, y); }
  public static void Click() {
    Input[] inputs = new Input[2];
    inputs[0].Type = 0; inputs[0].Mouse.Flags = 0x0002; // MOUSEEVENTF_LEFTDOWN
    inputs[1].Type = 0; inputs[1].Mouse.Flags = 0x0004; // MOUSEEVENTF_LEFTUP
    if (SendInput(2, inputs, Marshal.SizeOf(typeof(Input))) != 2) {
      throw new Exception("SendInput failed: " + Marshal.GetLastWin32Error());
    }
  }
  // Presses the keys (scan codes) in order and releases them in reverse: a shortcut, as typed.
  public static void Keys(int[] scans) {
    KeyEvent[] events = new KeyEvent[scans.Length * 2];
    for (int i = 0; i < scans.Length; i++) {
      events[i].Type = 1; events[i].Key.Scan = (ushort)scans[i]; events[i].Key.Flags = 0x0008; // KEYEVENTF_SCANCODE
      int up = scans.Length * 2 - 1 - i;
      events[up].Type = 1; events[up].Key.Scan = (ushort)scans[i]; events[up].Key.Flags = 0x0008 | 0x0002; // | KEYEVENTF_KEYUP
    }
    if (SendKeys((uint)events.Length, events, 40) != events.Length) {
      throw new Exception("SendInput failed: " + Marshal.GetLastWin32Error());
    }
  }
  // Brings a window to the front. Windows lets the process that sent the last input do that, so a
  // Shift press and release goes first (Alt, the usual key, would open VS Code's menu).
  public static bool Focus(IntPtr hwnd) {
    Keys(new int[] { 0x2A });
    return SetForegroundWindow(hwnd);
  }
}
'@
function RectOf($r) { return @{ left = $r.Left; top = $r.Top; right = $r.Right; bottom = $r.Bottom } }
function WindowOf([IntPtr]$hwnd) {
  if ($hwnd -eq [IntPtr]::Zero -or -not [EtchMediaDesktop]::Exists($hwnd)) { return $null }
  return @{ hwnd = $hwnd.ToInt64().ToString(); frame = (RectOf ([EtchMediaDesktop]::Frame($hwnd))); client = (RectOf ([EtchMediaDesktop]::Client($hwnd))) }
}
function Answer($request) {
  switch ([string]$request.op) {
    'window' {
      if ($null -ne $request.pid) { $hwnd = [EtchMediaDesktop]::Largest([int]$request.pid) } else { $hwnd = [IntPtr][int64]$request.hwnd }
      return @{ window = (WindowOf $hwnd) }
    }
    'place' { [EtchMediaDesktop]::Place([IntPtr][int64]$request.hwnd, [int]$request.x, [int]$request.y); return @{ ok = $true } }
    'cursor' { $p = [EtchMediaDesktop]::Cursor(); return @{ cursor = @{ x = $p.X; y = $p.Y } } }
    'move' { [EtchMediaDesktop]::Move([int]$request.x, [int]$request.y); return @{ ok = $true } }
    'click' { [EtchMediaDesktop]::Click(); return @{ ok = $true } }
    'keys' { [EtchMediaDesktop]::Keys([int[]]@($request.scans)); return @{ ok = $true } }
    'focus' { return @{ ok = [EtchMediaDesktop]::Focus([IntPtr][int64]$request.hwnd) } }
    default { return @{ error = "unknown request $($request.op)" } }
  }
}
[Console]::Out.WriteLine('{"ready":true}')
while ($null -ne ($line = [Console]::In.ReadLine())) {
  try { $answer = Answer ($line | ConvertFrom-Json) } catch { $answer = @{ error = $_.Exception.Message } }
  [Console]::Out.WriteLine(($answer | ConvertTo-Json -Compress -Depth 5))
}
`;
