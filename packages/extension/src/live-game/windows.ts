// What the live game needs from Windows that Node does not offer (spec sections 1 and 6): a
// process's identity (PID, image path, creation time), closing a process only after that identity
// is checked again through the same handle, finding the game's CrashReporter.exe, and keeping the
// game's window behind VS Code without minimising it. Node has no Win32 bindings and Etch ships no
// native code besides the game plugin, so one Windows PowerShell 5.1 process per call compiles a
// small C# class and answers in JSON on stdout. The rules are the EU4 engine lab's verified
// sessions (scripts/lib/LabProcess.psm1).
import { spawn, type ChildProcess } from 'node:child_process';

/** Who a process is: equal identities are the same process, compared exactly. */
export interface ProcessIdentity {
  readonly pid: number;
  /** The full image path, without a `\\?\` prefix. */
  readonly imagePath: string;
  /** Creation time as a UTC FILETIME (100 ns since 1601), in decimal: it exceeds 2^53. */
  readonly creationFileTime: string;
}

/** What `stopVerified` did. Only `terminated` and `already-exited` leave no such process running. */
export type StopOutcome =
  | 'terminated'
  | 'already-exited'
  | 'identity-mismatch-not-closed'
  | 'terminate-failed'
  | 'still-alive';

/** The game's top-level window, as `keepBehind` found and left it. */
export interface GameWindow {
  readonly found: boolean;
  readonly iconic: boolean;
  /** The game's window was the foreground window and was sent behind. */
  readonly wasForeground: boolean;
  /** Client size in pixels. */
  readonly width: number;
  readonly height: number;
}

/** The creation time in Unix milliseconds, as the plugin's `process_start_ms` reports it. */
export function creationUnixMs(identity: ProcessIdentity): number {
  return Number((BigInt(identity.creationFileTime) - 116444736000000000n) / 10000n);
}

export function sameIdentity(a: ProcessIdentity, b: ProcessIdentity): boolean {
  return (
    a.pid === b.pid &&
    a.creationFileTime === b.creationFileTime &&
    normalizePath(a.imagePath) === normalizePath(b.imagePath)
  );
}

export function normalizePath(path: string): string {
  return path
    .replace(/^\\\\\?\\/, '')
    .replace(/\//g, '\\')
    .toLowerCase();
}

/** The identity of a running process, `undefined` when there is none (or it cannot be queried). */
export async function processIdentity(pid: number): Promise<ProcessIdentity | undefined> {
  const answer = await helper<{ identity: ProcessIdentity | null }>({ op: 'identity', pid });
  return answer.identity ?? undefined;
}

/**
 * Closes a process only after its PID, image path and creation time match `expected`, checked
 * through the handle it is then terminated with, so a reused PID is never closed.
 */
export async function stopVerified(
  expected: ProcessIdentity,
  timeoutMs = 10_000,
): Promise<StopOutcome> {
  const answer = await helper<{ outcome: StopOutcome }>({
    op: 'stop',
    expected,
    timeoutMs,
  });
  return answer.outcome;
}

/**
 * The live processes named `imageName` (such as `CrashReporter.exe`) that `parent` started, also
 * after the parent exited: their parent PID is the parent's and they were created after it, so a
 * stale parent PID of an older process does not match.
 */
export async function childProcesses(
  parent: ProcessIdentity,
  imageName: string,
): Promise<ProcessIdentity[]> {
  const answer = await helper<{ children: ProcessIdentity[] }>({
    op: 'children',
    parent,
    imageName,
  });
  return answer.children;
}

/**
 * Keeps the game's window behind the other windows without minimising it: restores it without
 * activating it when it is minimised, and sends it to the bottom of the Z order, giving the
 * foreground back to `foreground` (VS Code's window) when the game took it. Checks the game's
 * identity first and does nothing to another process.
 */
export async function keepBehind(
  game: ProcessIdentity,
  foreground: string | undefined,
): Promise<GameWindow> {
  const answer = await helper<{ window: GameWindow }>({
    op: 'behind',
    expected: game,
    foreground: foreground ?? '0',
  });
  return answer.window;
}

/** The current foreground window's handle in decimal, to give the foreground back to it later. */
export async function foregroundWindow(): Promise<string | undefined> {
  const answer = await helper<{ hwnd: string }>({ op: 'foreground' });
  return answer.hwnd === '0' ? undefined : answer.hwnd;
}

// ---- The helper process ----------------------------------------------------------------------

/**
 * One Windows PowerShell process that compiles the helper once and answers one JSON line per
 * request line, so that the checks during a start cost milliseconds, not a compile each. It ends
 * after a minute without requests and is started again on the next one.
 */
class WindowsHelper {
  private child: ChildProcess | undefined;
  private lines: string[] = [];
  /** The request waiting for a line, and the helper process it waits on. */
  private waiting: { child: ChildProcess; resolve: (line: string | undefined) => void } | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private idle: NodeJS.Timeout | undefined;

  request<T>(request: object): Promise<T> {
    const next = this.queue.then(() => this.send<T>(request));
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Ends the helper process; a later request starts it again. */
  close(): void {
    if (this.idle !== undefined) clearTimeout(this.idle);
    this.idle = undefined;
    this.child?.stdin?.end();
    this.child = undefined;
  }

  private async send<T>(request: object): Promise<T> {
    if (process.platform !== 'win32') throw new Error('The live game runs on Windows only.');
    if (this.idle !== undefined) clearTimeout(this.idle);
    const child = this.child ?? (await this.start());
    child.stdin?.write(`${JSON.stringify(request)}\n`);
    const line = await this.nextLine(child, HELPER_TIMEOUT_MS);
    this.idle = setTimeout(() => {
      this.close();
    }, HELPER_IDLE_MS);
    this.idle.unref();
    if (line === undefined) {
      child.kill();
      if (this.child === child) this.child = undefined;
      throw new Error('The Windows helper did not answer.');
    }
    const answer = JSON.parse(line) as { error?: string } & T;
    if (answer.error !== undefined) throw new Error(`The Windows helper failed: ${answer.error}`);
    return answer;
  }

  private async start(): Promise<ChildProcess> {
    const child = spawn(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        Buffer.from(HELPER_SCRIPT, 'utf16le').toString('base64'),
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    this.child = child;
    this.lines = [];
    let buffered = '';
    let errors = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffered += chunk;
      for (let end = buffered.indexOf('\n'); end >= 0; end = buffered.indexOf('\n')) {
        const line = buffered.slice(0, end).trim();
        buffered = buffered.slice(end + 1);
        if (!line.startsWith('{')) continue;
        if (this.waiting?.child === child) this.waiting.resolve(line);
        else if (this.child === child) this.lines.push(line);
      }
    });
    child.stderr.on('data', (chunk: string) => {
      errors += chunk;
    });
    // A helper that was given up on may exit while its successor starts: only its own request
    // hears of it.
    const ended = () => {
      if (this.child === child) this.child = undefined;
      if (this.waiting?.child === child) this.waiting.resolve(undefined);
    };
    child.once('exit', ended);
    child.once('error', ended);
    // The helper does not keep Node alive between requests.
    child.unref();
    for (const stream of [child.stdin, child.stdout, child.stderr]) {
      (stream as unknown as { unref?: () => void } | null)?.unref?.();
    }
    const ready = await this.nextLine(child, HELPER_TIMEOUT_MS);
    if (ready === undefined) {
      child.kill();
      if (this.child === child) this.child = undefined;
      throw new Error(
        `The Windows helper did not start${errors === '' ? '' : `: ${errors.trim()}`}`,
      );
    }
    return child;
  }

  private nextLine(child: ChildProcess, timeoutMs: number): Promise<string | undefined> {
    const queued = this.lines.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiting = undefined;
        resolve(undefined);
      }, timeoutMs);
      this.waiting = {
        child,
        resolve: (line) => {
          clearTimeout(timer);
          this.waiting = undefined;
          resolve(line);
        },
      };
    });
  }
}

const HELPER_TIMEOUT_MS = 30_000;
const HELPER_IDLE_MS = 60_000;
const windowsHelper = new WindowsHelper();

function helper<T>(request: object): Promise<T> {
  return windowsHelper.request<T>(request);
}

/** Ends the helper process, as when the extension is deactivated. */
export function closeWindowsHelper(): void {
  windowsHelper.close();
}

// Windows PowerShell 5.1 runs this, one request per stdin line. Identity is read through a handle opened with
// PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE (and PROCESS_TERMINATE to stop), so the PID
// cannot be reused between the check and TerminateProcess.
//
// The cmdlets it uses come from Microsoft.PowerShell.Utility, imported from $PSHOME by path with
// module autoloading off. Autoloading would look for Add-Type in every module on PSModulePath
// before $PSHOME's, analysing those it has no cache entry for, and write "Preparing modules for
// first use." to stderr: its time grows with the modules installed (a CI runner has Az's and
// PowerShell 7's), a start on a fresh runner once stalled right in it past the start timeout, and
// a module earlier on the path that exports Add-Type would win.
const HELPER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$PSModuleAutoLoadingPreference = 'None'
Import-Module ([IO.Path]::Combine($PSHOME, 'Modules', 'Microsoft.PowerShell.Utility', 'Microsoft.PowerShell.Utility.psd1'))
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class EtchHost {
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetProcessTimes(IntPtr p, out long c, out long e, out long k, out long u);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool QueryFullProcessImageName(IntPtr p, uint flags, StringBuilder name, ref uint size);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr p, out uint code);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr p, uint code);
  [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool Process32FirstW(IntPtr s, ref Entry e);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool Process32NextW(IntPtr s, ref Entry e);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc proc, IntPtr param);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out int pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hwnd, uint cmd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int cmd);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hwnd, out Rect rect);
  delegate bool EnumProc(IntPtr hwnd, IntPtr param);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct Entry {
    public uint Size, Usage, Pid; public IntPtr HeapId; public uint ModuleId, Threads, ParentPid; public int Priority; public uint Flags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string ExeFile;
  }
  const uint Query = 0x1000, Synchronize = 0x00100000, Terminate = 0x0001, StillActive = 259;

  public static string Identity(IntPtr h) {
    var name = new StringBuilder(32768); uint size = (uint)name.Capacity;
    long c, e, k, u;
    if (!QueryFullProcessImageName(h, 0, name, ref size) || !GetProcessTimes(h, out c, out e, out k, out u)) return null;
    string path = name.ToString(); if (path.StartsWith(@"\\?\")) path = path.Substring(4);
    return path + "|" + c.ToString();
  }
  static bool Alive(IntPtr h) { uint code; return !GetExitCodeProcess(h, out code) || code == StillActive; }

  // "pid|path|creation", or null when the process is gone or cannot be opened.
  public static string Of(int pid) {
    IntPtr h = OpenProcess(Query | Synchronize, false, pid);
    if (h == IntPtr.Zero) return null;
    try { if (!Alive(h)) return null; string id = Identity(h); return id == null ? null : pid + "|" + id; }
    finally { CloseHandle(h); }
  }

  public static string Stop(int pid, string path, long creation, uint timeoutMs) {
    IntPtr h = OpenProcess(Query | Synchronize | Terminate, false, pid);
    if (h == IntPtr.Zero) return Of(pid) == null ? "already-exited" : "terminate-failed";
    try {
      if (!Alive(h)) return "already-exited";
      string id = Identity(h);
      if (id == null || !string.Equals(id, path + "|" + creation, StringComparison.OrdinalIgnoreCase)) return "identity-mismatch-not-closed";
      if (!TerminateProcess(h, 1)) return "terminate-failed";
      return WaitForSingleObject(h, timeoutMs) == 0 ? "terminated" : "still-alive";
    }
    finally { CloseHandle(h); }
  }

  public static List<int> Children(int parent, string image) {
    var found = new List<int>();
    IntPtr s = CreateToolhelp32Snapshot(2, 0);
    if (s == new IntPtr(-1)) return found;
    try {
      var e = new Entry(); e.Size = (uint)Marshal.SizeOf(typeof(Entry));
      for (bool ok = Process32FirstW(s, ref e); ok; ok = Process32NextW(s, ref e))
        if (e.ParentPid == (uint)parent && string.Equals(e.ExeFile, image, StringComparison.OrdinalIgnoreCase)) found.Add((int)e.Pid);
    }
    finally { CloseHandle(s); }
    return found;
  }

  public static IntPtr MainWindow(int pid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((hwnd, p) => {
      int owner; GetWindowThreadProcessId(hwnd, out owner);
      if (owner == pid && IsWindowVisible(hwnd) && GetWindow(hwnd, 4) == IntPtr.Zero) { found = hwnd; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  // "found|iconic|wasForeground|width|height" after sending the window to the bottom.
  public static string Behind(int pid, long foreground) {
    IntPtr hwnd = MainWindow(pid);
    if (hwnd == IntPtr.Zero) return "0|0|0|0|0";
    bool iconic = IsIconic(hwnd);
    if (iconic) ShowWindow(hwnd, 4);
    bool wasForeground = GetForegroundWindow() == hwnd;
    // SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE, to HWND_BOTTOM.
    SetWindowPos(hwnd, new IntPtr(1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
    if (wasForeground && foreground != 0) SetForegroundWindow(new IntPtr(foreground));
    Rect r; GetClientRect(hwnd, out r);
    return "1|" + (iconic ? 1 : 0) + "|" + (wasForeground ? 1 : 0) + "|" + (r.Right - r.Left) + "|" + (r.Bottom - r.Top);
  }

  public static long Foreground() { return GetForegroundWindow().ToInt64(); }
}
'@
function Identity([string]$text) {
  if (-not $text) { return $null }
  $p = $text.Split('|')
  return [ordered]@{ pid = [int]$p[0]; imagePath = $p[1]; creationFileTime = $p[2] }
}
function Matches($expected) {
  $id = Identity ([EtchHost]::Of([int]$expected.pid))
  return $null -ne $id -and $id.creationFileTime -eq [string]$expected.creationFileTime -and
    [StringComparer]::OrdinalIgnoreCase.Equals($id.imagePath, [string]$expected.imagePath)
}
function Answer($request) {
switch ($request.op) {
  'identity' { $answer = @{ identity = Identity ([EtchHost]::Of([int]$request.pid)) } }
  'stop' {
    $e = $request.expected
    $answer = @{ outcome = [EtchHost]::Stop([int]$e.pid, [string]$e.imagePath, [int64]$e.creationFileTime, [uint32]$request.timeoutMs) }
  }
  'children' {
    $parent = $request.parent
    $children = @()
    # The parent may have exited already, as a crashed game does once its reporter is up.
    foreach ($childPid in [EtchHost]::Children([int]$parent.pid, [string]$request.imageName)) {
      $id = Identity ([EtchHost]::Of($childPid))
      if ($null -ne $id -and [int64]$id.creationFileTime -ge [int64]$parent.creationFileTime) { $children += $id }
    }
    $answer = @{ children = $children }
  }
  'behind' {
    if (-not (Matches $request.expected)) { $window = '0|0|0|0|0' }
    else { $window = [EtchHost]::Behind([int]$request.expected.pid, [int64]$request.foreground) }
    $w = $window.Split('|')
    $answer = @{ window = [ordered]@{ found = $w[0] -eq '1'; iconic = $w[1] -eq '1'; wasForeground = $w[2] -eq '1'; width = [int]$w[3]; height = [int]$w[4] } }
  }
  'foreground' { $answer = @{ hwnd = [string][EtchHost]::Foreground() } }
  default { $answer = @{ error = "unknown request $($request.op)" } }
}
return $answer
}
[Console]::Out.WriteLine('{"ready":true}')
while ($null -ne ($line = [Console]::In.ReadLine())) {
  try { $answer = Answer ($line | ConvertFrom-Json) } catch { $answer = @{ error = $_.Exception.Message } }
  [Console]::Out.WriteLine(($answer | ConvertTo-Json -Compress -Depth 5))
}
`;
