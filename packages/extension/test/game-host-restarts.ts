// Local only, part of the game host run (game-host.ts): the watchdog against the real game host
// (spec section 4, etch#51). A saved `.gfx` file restarts it once, also when it is saved twice,
// and the preview keeps the last image marked as stale meanwhile; an ended game and a hung one
// (its main thread suspended, so that only the plugin's pipe thread answers) are crashes it
// restarts from; the third crash in five minutes stops it with the end of error.log until a
// manual start. Only the game host process this run started is suspended or ended, each time
// after its PID, path and creation time are checked.
import * as assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { EtchApi } from '../src/extension.ts';
import type { GameHostState } from '../src/game-host/index.ts';
import {
  processIdentity,
  sameIdentity,
  stopVerified,
  type ProcessIdentity,
} from '../src/game-host/windows.ts';
import { nextImage } from './game-host-jobs.ts';

/** The next state of `status`; a state outside `allowed` rejects. */
function nextState(
  api: EtchApi,
  status: GameHostState['status'],
  timeoutMs: number,
  allowed: readonly GameHostState['status'][] = ['ready', 'restarting', 'starting', status],
): Promise<GameHostState> {
  const { gameHost } = api;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listener.dispose();
      reject(new Error(`the game host is ${gameHost.state.status}, not ${status}`));
    }, timeoutMs);
    const listener = gameHost.onDidChangeState((state) => {
      if (state.status === status) {
        clearTimeout(timer);
        listener.dispose();
        resolve(state);
      } else if (!allowed.includes(state.status)) {
        clearTimeout(timer);
        listener.dispose();
        reject(new Error(`the game host went ${JSON.stringify(state)}`));
      }
    });
  });
}

/** Every state the game host goes through while `work` and the wait after it run. */
async function statesDuring(
  api: EtchApi,
  work: () => Promise<void>,
): Promise<{ states: GameHostState[]; stop(): void }> {
  const states: GameHostState[] = [];
  const listener = api.gameHost.onDidChangeState((state) => states.push(state));
  await work();
  return {
    states,
    stop: () => {
      listener.dispose();
    },
  };
}

/** The running game host's identity, checked again against Windows. */
async function verifiedGame(api: EtchApi): Promise<ProcessIdentity> {
  const running = api.gameHost.running;
  assert.ok(running, 'the game host runs');
  const now = await processIdentity(running.identity.pid);
  assert.ok(now !== undefined && sameIdentity(now, running.identity), 'the game host is ours');
  return running.identity;
}

/**
 * Suspends the main thread (the first created) of the verified game host, as a game stuck in its
 * own code. PowerShell's C#, as the extension's own helper; nothing else is touched.
 */
async function suspendMainThread(game: ProcessIdentity): Promise<void> {
  const script = `
$PSModuleAutoLoadingPreference = 'None'
Import-Module ([IO.Path]::Combine($PSHOME, 'Modules', 'Microsoft.PowerShell.Utility', 'Microsoft.PowerShell.Utility.psd1'))
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class EtchSuspend {
  [StructLayout(LayoutKind.Sequential)] struct ThreadEntry { public uint size, usage, id, owner; public int basePri, deltaPri; public uint flags; }
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32.dll")] static extern bool Thread32First(IntPtr snap, ref ThreadEntry e);
  [DllImport("kernel32.dll")] static extern bool Thread32Next(IntPtr snap, ref ThreadEntry e);
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenThread(uint access, bool inherit, uint id);
  [DllImport("kernel32.dll")] static extern bool GetThreadTimes(IntPtr t, out long created, out long exited, out long kernel, out long user);
  [DllImport("kernel32.dll")] static extern int SuspendThread(IntPtr t);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  public static uint SuspendMain(uint pid) {
    IntPtr snap = CreateToolhelp32Snapshot(4, 0);
    ThreadEntry e = new ThreadEntry(); e.size = (uint)Marshal.SizeOf(typeof(ThreadEntry));
    uint main = 0; long first = long.MaxValue;
    for (bool ok = Thread32First(snap, ref e); ok; ok = Thread32Next(snap, ref e)) {
      if (e.owner != pid) continue;
      IntPtr t = OpenThread(0x0800, false, e.id);
      if (t == IntPtr.Zero) continue;
      long created, exited, kernel, user;
      if (GetThreadTimes(t, out created, out exited, out kernel, out user) && created < first) { first = created; main = e.id; }
      CloseHandle(t);
    }
    CloseHandle(snap);
    IntPtr h = OpenThread(0x0002, false, main);
    if (h == IntPtr.Zero || SuspendThread(h) < 0) throw new Exception("not suspended");
    CloseHandle(h);
    return main;
  }
}
'@
[EtchSuspend]::SuspendMain(${String(game.pid)})`;
  const thread = await new Promise<string>((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true },
      (error, stdout) => {
        if (error) reject(new Error(`the main thread was not suspended: ${error.message}`));
        else resolve(stdout.trim());
      },
    );
  });
  console.log(`[etch] suspended thread ${thread} of game host PID ${String(game.pid)}`);
}

export async function testGameHostRestarts(api: EtchApi, mod: string): Promise<void> {
  const { gameHost, preview } = api;
  assert.equal(gameHost.state.status, 'ready', 'the game host is ready before the restarts');
  const first = await verifiedGame(api);

  // A .gfx file saved twice in a row: one restart, the last image stale meanwhile.
  const gfx = path.join(mod, 'interface', 'etch_watchdog_test.gfx');
  const saved = Date.now();
  const restarting = nextState(api, 'restarting', 10_000);
  const watched = await statesDuring(api, async () => {
    await writeFile(gfx, 'spriteTypes = {\n}\n');
    await new Promise((resolve) => setTimeout(resolve, 100));
    await writeFile(gfx, 'spriteTypes = {\n\t# saved again\n}\n');
    const state = await restarting;
    console.log(`[etch] restart: ${JSON.stringify(state)}`);
    await preview.idle();
    assert.ok(preview.staleImage, 'the preview shows the last image as stale');
    assert.ok(
      preview.notices.some((n) => n.message.startsWith('The game host restarts')),
      'the preview says the game host restarts',
    );
    const image = nextImage(api, 120_000);
    image.catch(() => undefined);
    await nextState(api, 'ready', 120_000);
    const readyAt = Date.now();
    const paint = await image;
    // A second restart would come within a few seconds of the first one's end.
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    console.log(
      `[etch] .gfx saved twice → ready ${String(readyAt - saved)} ms, image ${String(paint.at - saved)} ms`,
    );
  });
  watched.stop();
  assert.equal(
    watched.states.filter((s) => s.status === 'ready').length,
    1,
    `one restart for both saves: ${JSON.stringify(watched.states)}`,
  );
  assert.equal(preview.staleImage, false, 'the new image is not stale');
  assert.notEqual((await verifiedGame(api)).pid, first.pid, 'a new game process');
  await rm(gfx, { force: true });
  // The deletion restarts it too.
  await nextState(api, 'restarting', 10_000);
  await nextState(api, 'ready', 120_000);

  // A game that ends by itself: a crash, restarted from.
  const ended = await verifiedGame(api);
  const crash1 = nextState(api, 'restarting', 10_000);
  assert.equal(await stopVerified(ended), 'terminated');
  console.log(`[etch] crash 1: ${JSON.stringify(await crash1)}`);
  await nextState(api, 'ready', 120_000);

  // A hung game: its main thread stops, the plugin's pipe thread still answers pings.
  const hung = await verifiedGame(api);
  const suspended = Date.now();
  const crash2 = nextState(api, 'restarting', 30_000);
  await suspendMainThread(hung);
  const state = await crash2;
  console.log(
    `[etch] crash 2 after ${String(Date.now() - suspended)} ms: ${JSON.stringify(state)}`,
  );
  assert.ok(
    state.status === 'restarting' && state.reason.includes('frame counter stayed'),
    'a stuck frame counter is a hang',
  );
  await nextState(api, 'ready', 120_000);
  assert.equal(await processIdentity(hung.pid), undefined, 'the hung game was closed');

  // The third crash in five minutes stops the game host until a manual start.
  const last = await verifiedGame(api);
  const failed = nextState(api, 'failed', 30_000, ['restarting', 'failed']);
  assert.equal(await stopVerified(last), 'terminated');
  const stopped = await failed;
  console.log(`[etch] crash 3: ${JSON.stringify(stopped)}`);
  assert.ok(stopped.status === 'failed' && /crashed 3 times in 5 minutes/.test(stopped.message));
  assert.match(stopped.message, /error\.log/);
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  assert.equal(gameHost.state.status, 'failed', 'no restart after the crash limit');
  assert.equal(gameHost.running, undefined);
  assert.equal(await processIdentity(last.pid), undefined);

  // A manual start: the switch to the game host.
  preview.setBackend('offline');
  const ready = nextState(api, 'ready', 180_000);
  preview.setBackend('game-host');
  await ready;
  console.log('[etch] started again by hand after the crash limit');
}
