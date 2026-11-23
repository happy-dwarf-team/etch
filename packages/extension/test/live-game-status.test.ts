import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LiveGameState } from '../src/live-game/live-game.ts';
import {
  liveMenu,
  liveStatus,
  pickStatus,
  spokenText,
  type LiveMenuItem,
} from '../src/live-game/status-view.ts';

const ready: LiveGameState = { status: 'ready', pid: 4242, readyMs: 41_234 };
const stale: LiveGameState = {
  status: 'stale',
  pid: 4242,
  reasons: ['a new font file needs a restart'],
};
const context = { pickOn: false, pickKey: 'Ctrl+Shift+E', mod: 'etch-demo-mod' };

/** A menu's items as text: `label (description)`, `---` for a separator. */
function rows(items: readonly LiveMenuItem[]): string[] {
  return items.map((item) =>
    'separator' in item
      ? '---'
      : `${item.label}${item.description === undefined ? '' : ` (${item.description})`}`,
  );
}

describe('the live game in the status bar', () => {
  it('names each state with its own icon', () => {
    const states: LiveGameState[] = [
      { status: 'starting' },
      ready,
      stale,
      { status: 'restarting', reason: 'the game crashed' },
      { status: 'stopping' },
    ];
    expect(states.map((state) => liveStatus(state)?.text)).toEqual([
      '$(loading~spin) Live game: starting',
      '$(vm-running) Live game',
      '$(warning) Live game: restart needed',
      '$(loading~spin) Live game: restarting',
      '$(loading~spin) Live game: stopping',
    ]);
    expect(liveStatus(stale)?.tooltip).toContain(
      'Restart needed: a new font file needs a restart.',
    );
  });

  it('shows no item while no live game runs in this window', () => {
    for (const state of [
      { status: 'stopped' },
      { status: 'busy' },
      { status: 'failed', message: 'no game folder' },
    ] satisfies LiveGameState[]) {
      expect(liveStatus(state)).toBeUndefined();
      expect(liveMenu(state, context)).toBeUndefined();
    }
  });

  it('shows pick mode as an item of its own while it is on', () => {
    expect(pickStatus(ready, false, 'Ctrl+Shift+E')).toBeUndefined();
    const on = pickStatus(ready, true, 'Alt+F2');
    expect(on?.text).toBe('$(target) Pick mode');
    expect(on?.tooltip).toContain('press Alt+F2 in the game');
    expect(pickStatus(stale, true, 'Ctrl+Shift+E')?.text).toBe('$(target) Pick mode');
    expect(pickStatus({ status: 'stopping' }, true, 'Ctrl+Shift+E')).toBeUndefined();
  });

  it('gives screen readers the texts without the icons', () => {
    expect(spokenText('$(vm-running) Live game')).toBe('Live game');
    expect(spokenText('$(loading~spin) Live game: starting')).toBe('Live game: starting');
    expect(spokenText('$(target) Pick mode')).toBe('Pick mode');
  });
});

describe("the live game's menu", () => {
  it('offers pick mode first and Stop last, with what Stop does, when ready', () => {
    const menu = liveMenu(ready, context);
    expect(menu?.title).toBe('Live Game: ready (41.2 s) · etch-demo-mod');
    expect(rows(menu?.items ?? [])).toEqual([
      'Turn Pick Mode On (click a widget in the game to find it here · Ctrl+Shift+E in the game)',
      'Snapshot from the Live Game (of the previewed window)',
      "Open the Live Game's Saves Folder",
      "Show the Live Game's Log",
      '---',
      'Restart the Live Game (saves autosave.eu4, then starts EU4 again)',
      'Stop the Live Game (saves autosave.eu4, then closes EU4)',
    ]);
    expect(rows(liveMenu(ready, { ...context, pickOn: true })?.items ?? [])[0]).toMatch(
      /^Turn Pick Mode Off/,
    );
  });

  it('offers the planned restart first when the game needs one', () => {
    const menu = liveMenu(stale, context);
    expect(menu?.title).toBe('Live Game: restart needed · etch-demo-mod');
    expect(rows(menu?.items ?? []).slice(0, 3)).toEqual([
      'Restart Now (a new font file needs a restart)',
      'Later (reloads wait until the restart)',
      '---',
    ]);
    expect(rows(menu?.items ?? []).at(-1)).toBe(
      'Stop the Live Game (saves autosave.eu4, then closes EU4)',
    );
  });

  it('offers the log and stopping the start while it starts', () => {
    expect(rows(liveMenu({ status: 'starting' }, context)?.items ?? [])).toEqual([
      "Show the Live Game's Log",
      'Stop the Live Game (stops the start)',
    ]);
    expect(liveMenu({ status: 'starting' }, { ...context, mod: undefined })?.title).toBe(
      'Live Game: starting',
    );
    expect(rows(liveMenu({ status: 'stopping' }, context)?.items ?? [])).toEqual([
      "Show the Live Game's Log",
    ]);
  });
});

describe('the Command Palette', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as {
    contributes: {
      commands: { command: string; title: string }[];
      menus: { commandPalette: { command: string; when: string }[] };
    };
  };
  const when = new Map(
    manifest.contributes.menus.commandPalette.map((entry) => [entry.command, entry.when]),
  );

  it('offers Start only while no live game runs, and Stop only while one does', () => {
    expect(when.get('etch.startLiveGame')).toBe('!etch.liveGame.running');
    expect(when.get('etch.removePrivateInstall')).toBe('!etch.liveGame.running');
    expect(when.get('etch.stopLiveGame')).toBe('etch.liveGame.running');
  });

  it('offers the commands that act on the game only while it takes them', () => {
    for (const command of [
      'etch.restartLiveGame',
      'etch.togglePickMode',
      'etch.snapshotFromLiveGame',
      'etch.runSelection',
      'etch.runSelectionInProvince',
      'etch.checkSelectionAsTrigger',
      'etch.checkFileInLiveGame',
    ]) {
      expect(when.get(command), command).toMatch(/^etch\.liveGame\.canRun\b/);
    }
  });

  it('names the live game "the Live Game" in every title', () => {
    const titles = manifest.contributes.commands.map((command) => command.title);
    for (const title of titles.filter((t) => /live game/i.test(t))) {
      expect(title, title).toMatch(/the Live Game/);
    }
  });
});
