/// <reference types="node" />
/**
 * A stand-in for a game with Tongs, for the capture driver's tests: top-level windows that keys
 * and clicks open and Escape closes, widget trees, and screenshots written as PNG files whose
 * pixels a test can make change from one shot to the next.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng } from '../../src/corpus/index.ts';
import type { Tongs, TongsAnswer } from '../../src/corpus/driver/tongs.ts';
import type { CursorState, MouseCursor, ScreenRect } from '../../src/corpus/driver/view.ts';

export interface FakeWindow {
  readonly name: string;
  /** Opened by this key or by a click on this selector. */
  readonly openedBy?: { key: string } | { click: string };
  /** Children of the window, all visible. */
  readonly children?: readonly string[];
}

export class FakeGame implements Tongs {
  readonly calls: string[] = [];
  readonly open: string[];
  /** Called for each screenshot with its number from 1; returns the grey level of pixel 0. */
  pixel: (shot: number) => number = () => 0;
  inGame: boolean;
  paused = true;
  gameCalls = 0;
  pid = 4242;
  /** The Tongs release the game answers `ping` with. */
  version = '0.14.1';
  /** The session in the state of a game, from Tongs 0.19. */
  session: number | undefined;
  escapeOpens: string | undefined;
  /** How many more `ui click` commands are refused as `covered`. */
  covered = 0;
  private shots = 0;

  readonly windows: readonly FakeWindow[];
  readonly folder: string;
  readonly size: { width: number; height: number };

  constructor(
    windows: readonly FakeWindow[],
    start: readonly string[],
    folder: string,
    size = { width: 4, height: 2 },
    inGame = false,
  ) {
    this.windows = windows;
    this.folder = folder;
    this.size = size;
    this.open = [...start];
    this.inGame = inGame;
  }

  private state(): Record<string, unknown> {
    return this.inGame
      ? {
          in_game: true,
          paused: this.paused,
          game_calls_total: this.gameCalls,
          pid: this.pid,
          ...(this.session !== undefined ? { session: this.session } : {}),
        }
      : { in_game: false, pid: this.pid };
  }

  private widget(name: string): Record<string, unknown> {
    const window = this.windows.find((w) => w.name === name);
    const rect = { x: 0, y: 0, w: 2, h: 2 };
    return {
      name,
      path: name,
      type: 'window',
      visible: true,
      rect,
      click_point: { x: 1, y: 1 },
      ...(window?.children !== undefined
        ? {
            children: window.children.map((child) => ({
              name: child,
              path: `${name}/${child}`,
              type: 'button',
              visible: true,
              rect: { x: 2, y: 0, w: 2, h: 2 },
              click_point: { x: 3, y: 1 },
              enabled: true,
            })),
          }
        : {}),
    };
  }

  call(command: string): Promise<TongsAnswer> {
    this.calls.push(command);
    this.onCall?.(command);
    return Promise.resolve(this.answer(command));
  }

  /** Called with each command before it is answered, for a test to act in the middle of a view. */
  onCall: ((command: string) => void) | undefined;

  /** Called when a `ui click` hits a child of an open window (`window/child`). */
  onClick: ((selector: string) => void) | undefined;

  /** The child `window/child` of an open window, as `ui find` reports it. */
  private openChild(selector: string): Record<string, unknown> | undefined {
    const [window = '', child, ...more] = selector.split('/');
    if (child === undefined || more.length > 0 || !this.open.includes(window)) return undefined;
    const children = (this.widget(window)['children'] ?? []) as Record<string, unknown>[];
    return children.find((c) => c['name'] === child);
  }

  close(): void {
    this.calls.push('close');
  }

  private answer(command: string): TongsAnswer {
    const ok = (fields: Record<string, unknown> = {}): TongsAnswer => ({ ok: true, ...fields });
    const [verb = '', ...rest] = command.split(' ');
    if (command === 'ping')
      return ok({ version: this.version, pid: this.pid, process_start_ms: 1000 });
    if (command === 'state') return ok(this.state());
    if (command === 'window') {
      return ok({ ...this.size, screen_x: 0, screen_y: 0, dpi: 96, minimized: false });
    }
    if (verb === 'frames' || verb === 'move') return ok(this.state());
    if (verb === 'ui' && rest[0] === 'find') {
      const name = rest[1] ?? '';
      const child = this.openChild(name);
      const matches =
        child !== undefined
          ? [child]
          : this.open.filter((w) => w === name).map((w) => this.widget(w));
      return ok({ count: matches.length, truncated: false, matches });
    }
    if (command.startsWith('ui tree depth=0')) {
      return ok({ truncated: false, widgets: this.open.map((name) => this.widget(name)) });
    }
    if (command.startsWith('ui tree ')) {
      const root = rest[1] ?? '';
      if (!this.windows.some((w) => w.name === root)) return { ok: false, error: 'not_found' };
      const shown = this.open.includes(root);
      return ok({ truncated: false, widgets: [{ ...this.widget(root), visible: shown }] });
    }
    if (verb === 'key') {
      const key = rest[0] ?? '';
      if (key === 'escape') {
        if (this.escapeOpens !== undefined) this.open.push(this.escapeOpens);
        else if (this.open.length > 1) this.open.pop();
      } else {
        const opened = this.windows.find(
          (w) => w.openedBy !== undefined && 'key' in w.openedBy && w.openedBy.key === key,
        );
        if (opened !== undefined && !this.open.includes(opened.name)) this.open.push(opened.name);
      }
      return ok(this.state());
    }
    if (command.startsWith('ui click ')) {
      const selector = rest[1] ?? '';
      if (this.covered > 0) {
        this.covered--;
        return { ok: false, error: 'covered', covered_by: 'menu/menu' };
      }
      const child = this.openChild(selector);
      if (child !== undefined) {
        this.onClick?.(selector);
        return ok({ clicked: selector, ...this.state() });
      }
      const opened = this.windows.find(
        (w) => w.openedBy !== undefined && 'click' in w.openedBy && w.openedBy.click === selector,
      );
      if (opened === undefined) return { ok: false, error: 'not_found' };
      this.open.push(opened.name);
      return ok({ clicked: opened.name, ...this.state() });
    }
    if (verb === 'screenshot') {
      this.shots++;
      const path = join(this.folder, `${rest[0] ?? 'shot'}.png`);
      const { width, height } = this.size;
      const rgba = new Uint8Array(width * height * 4).fill(255);
      rgba[0] = this.pixel(this.shots);
      writeFileSync(path, encodePng({ width, height, data: rgba }));
      return ok({ path, width, height, method: 'PrintWindow' });
    }
    return { ok: false, error: `unknown command ${command}` };
  }
}

const FREE: ScreenRect = { left: 0, top: 0, right: 6000, bottom: 1440 };

/** The real mouse cursor as Windows keeps it: `pin` confines it to one pixel, `release` frees it. */
export class FakeMouse implements MouseCursor {
  x = 2000;
  y = 100;
  clip: ScreenRect = FREE;
  readonly pins: string[] = [];
  releases = 0;

  /** While the screen is locked Windows refuses every call (Win32 error 203). */
  locked = false;

  read(): Promise<CursorState> {
    return Promise.resolve(
      this.locked
        ? { unavailable: 'GetCursorPos failed: Win32 error 203' }
        : { x: this.x, y: this.y, clip: this.clip },
    );
  }

  pin(x: number, y: number): Promise<CursorState> {
    if (this.locked)
      return Promise.resolve({ unavailable: 'SetCursorPos failed: Win32 error 203' });
    this.pins.push(`${String(x)},${String(y)}`);
    this.x = x;
    this.y = y;
    this.clip = { left: x, top: y, right: x + 1, bottom: y + 1 };
    return this.read();
  }

  release(): Promise<void> {
    this.releases++;
    this.clip = FREE;
    return Promise.resolve();
  }

  /** What Win+L or Ctrl+Alt+Del does: Windows clears the clip, and the user moves the mouse. */
  takeBack(): void {
    this.clip = FREE;
    this.x = 3000;
  }

  /** Win+L: the clip is gone and, until the user unlocks, Windows answers nothing. */
  lock(): void {
    this.takeBack();
    this.locked = true;
  }
}
