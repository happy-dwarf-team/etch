// Local only: one start of the real game host, when ETCH_GAME_HOST_PATH names the game folder:
//   $env:ETCH_GAME_HOST_PATH = 'C:\Program Files (x86)\Steam\steamapps\common\Europa Universalis IV'
//   pnpm --filter etch test
// It needs the pinned builds staged in game/ (pnpm pins). The install is created in the test VS
// Code's own global storage without the confirmation, the preview switches to the game host, which
// must get ready behind VS Code without being minimised; switching back stops it after the idle
// time, and the install is removed. The game's folder, the player's profile and mods are only read.
// CI never sets ETCH_GAME_HOST_PATH: it has no game (ADR 0004).
import * as assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { EtchApi } from '../src/extension.ts';
import type { GameHostState } from '../src/game-host/index.ts';
import { prepareInstall } from '../src/game-host/install.ts';
import { testGameHostJobs } from './game-host-jobs.ts';
import { processIdentity } from '../src/game-host/windows.ts';

function waitFor(
  api: EtchApi,
  status: GameHostState['status'],
  timeoutMs: number,
): Promise<GameHostState> {
  const { gameHost } = api;
  if (gameHost.state.status === status) return Promise.resolve(gameHost.state);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listener.dispose();
      reject(new Error(`the game host is ${gameHost.state.status}, not ${status}`));
    }, timeoutMs);
    const listener = gameHost.onDidChangeState((state) => {
      if (state.status === 'failed') {
        clearTimeout(timer);
        listener.dispose();
        reject(new Error(`the game host failed: ${state.message}`));
      } else if (state.status === status) {
        clearTimeout(timer);
        listener.dispose();
        resolve(state);
      }
    });
  });
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function testGameHost(api: EtchApi, gamePath: string): Promise<void> {
  const extension = vscode.extensions.getExtension<EtchApi>('happy-dwarf-team.etch');
  assert.ok(extension);
  const mod = path.join(await mkdtemp(path.join(tmpdir(), 'etch-game-host-')), 'etch_host');
  await mkdir(path.join(mod, 'interface'), { recursive: true });
  await writeFile(path.join(mod, 'descriptor.mod'), 'name="Etch game host test"\n');
  const copy = path.join(mod, 'interface', 'countrydiplomacyview.gui');
  await copyFile(path.join(gamePath, 'interface', 'countrydiplomacyview.gui'), copy);
  // A texture and a localisation key of the window in the mod before the game host starts, which
  // the jobs then change on disk.
  const texture = path.join(mod, 'gfx', 'interface', 'country_diplomacy_view_bg_top.dds');
  await mkdir(path.dirname(texture), { recursive: true });
  await copyFile(
    path.join(gamePath, 'gfx', 'interface', 'country_diplomacy_view_bg_top.dds'),
    texture,
  );
  const localisation = path.join(mod, 'localisation', 'replace', 'etch_test_l_english.yml');
  await mkdir(path.dirname(localisation), { recursive: true });
  await writeFile(localisation, '﻿l_english:\n HEADER_DIPLOMACY:0 "Etch test"\n');
  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', gamePath, vscode.ConfigurationTarget.Global);
  try {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(copy));
    await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
    const { preview, gameHost } = api;
    preview.open();
    await preview.idle();

    // The install as the confirmation would create it, so that no modal dialog waits.
    const layout = gameHost.install.layout;
    await prepareInstall({
      layout,
      gameFolder: gamePath,
      buildsFolder: path.join(extension.extensionPath, 'game'),
      mods: [],
      display: { width: 1920, height: 1080, language: 'english' },
    });

    const switched = Date.now();
    preview.setBackend('game-host');
    assert.equal(preview.backend, 'game-host');
    const ready = await waitFor(api, 'ready', 180_000);
    assert.ok(ready.status === 'ready');
    const running = gameHost.running;
    assert.ok(running, 'the game host runs');
    console.log(
      `[etch] game host ready ${String(ready.readyMs)} ms after creation, ` +
        `${String(Date.now() - switched)} ms after the switch; times ${JSON.stringify(running.times)}; ` +
        `window ${JSON.stringify(running.window)}`,
    );
    assert.ok(
      preview.notices.some((n) => n.message.startsWith('The game host draws the preview')),
      'the preview says the game host runs',
    );
    assert.ok(running.window.found, "the game's window was found");
    assert.equal(running.window.iconic, false, 'the game host is not minimised');

    const first = await running.ping();
    await delay(3_000);
    const second = await running.ping();
    assert.ok(second.frame > first.frame, 'the game draws frames behind VS Code');
    const later = await running.keepBehind();
    console.log(
      `[etch] game host after 3 s: frames ${String(first.frame)} → ${String(second.frame)}, ` +
        `window ${JSON.stringify(later)}`,
    );
    assert.equal(later.iconic, false, 'the game host stays restored');

    await testGameHostJobs(api, { gui: copy, texture, localisation });

    // Switching away starts the idle timer; it stops the game host after it.
    gameHost.setIdleTime(2_000);
    preview.setBackend('offline');
    await waitFor(api, 'stopped', 60_000);
    assert.equal(gameHost.running, undefined);
    assert.equal(
      await processIdentity(running.identity.pid),
      undefined,
      'the game process is gone',
    );
    console.log('[etch] game host stopped after the idle time');

    await vscode.commands.executeCommand('etch.removeGameHostInstall');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
  }
}
