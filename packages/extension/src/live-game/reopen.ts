// Reopening the province view after a restart (H8, docs/live-game.md, "Reopening the view"): the
// province on screen, remembered from the plugin's pings by province id with the game session it
// was seen in, and the rule that says whether the save a restart continues is that game. The
// plugin makes the selection itself, and refuses it when the player came first.
import type { Ping, ProvinceWindow, Reselected } from './pipe.ts';

/** The province the player last had on screen, in the game session it was seen in. */
export interface RememberedProvince {
  readonly province: number;
  readonly window: ProvinceWindow;
  /** The game session's number in its process (1 for the first). */
  readonly session: number;
  /** When Etch first saw that session: a save written since belongs to it. */
  readonly sessionSinceMs: number;
  /** The save the process started from, for its first session: that session continues it. */
  readonly startSave: string | undefined;
}

/** The save a restart continues: its file name and when it was written. */
export interface RestartSave {
  readonly name: string;
  readonly modifiedMs: number;
}

/**
 * How much earlier than Etch's first sight of a session a save may be written and still count as
 * the session's: pings come every second, and the game writes the save's time when it finishes.
 */
export const SESSION_SLACK_MS = 2_000;

/**
 * Follows the pings of one game process. A province on screen is remembered; a ping in the same
 * session with none on screen forgets it (the player closed the view: nothing is forced); a ping of
 * another session forgets it too (the player loaded another game).
 */
export class ProvinceMemory {
  private readonly startSave: string | undefined;
  private session: { readonly number: number; readonly sinceMs: number } | undefined;
  private shown: RememberedProvince | undefined;

  /** `startSave`: the save the process was started with, `undefined` for the main menu. */
  constructor(startSave: string | undefined) {
    this.startSave = startSave;
  }

  observe(ping: Ping, nowMs = Date.now()): void {
    const session = ping.gameSession;
    if (session === undefined) {
      this.session = undefined;
      this.shown = undefined;
      return;
    }
    if (this.session?.number !== session.number) {
      this.session = { number: session.number, sinceMs: nowMs };
      this.shown = undefined;
    }
    const view = ping.provinceView;
    this.shown =
      view === undefined
        ? undefined
        : {
            province: view.province,
            window: view.window,
            session: session.number,
            sessionSinceMs: this.session.sinceMs,
            startSave: session.number === 1 ? this.startSave : undefined,
          };
  }

  /** The province on screen at the last ping. */
  get remembered(): RememberedProvince | undefined {
    return this.shown;
  }
}

/** Whether a restart that continues `save` reopens `remembered`, or why not. */
export function restartReopens(
  remembered: RememberedProvince | undefined,
  save: RestartSave | undefined,
): { readonly reopen: true } | { readonly reopen: false; readonly why: string } {
  if (remembered === undefined) return { reopen: false, why: 'no province was on screen' };
  if (save === undefined) return { reopen: false, why: 'the restart continues no save' };
  // A save written in that session (the restart's own autosave, a monthly autosave, the player's
  // save), or the save the session itself continued.
  if (save.modifiedMs >= remembered.sessionSinceMs - SESSION_SLACK_MS) return { reopen: true };
  if (remembered.startSave !== undefined && remembered.startSave === save.name) {
    return { reopen: true };
  }
  return {
    reopen: false,
    why: `${save.name} is not the game the province was shown in (another save was loaded since)`,
  };
}

/** What the player is told when a restart did not reopen the province view; `undefined` when it did. */
export function reselectedMessage(r: Reselected): string | undefined {
  switch (r.outcome) {
    case 'opened':
      return undefined;
    case 'moved_on':
      return 'you selected a province or opened a view first';
    case 'terra_incognita':
      return 'it is in terra incognita in this save';
    case 'not_selectable':
      return 'the game does not select it';
    case 'selection_blocked':
      return 'the game selects no province now';
    case 'discover':
      return "opening it would make you discover its owner's capital, a change of the game";
    case 'no_navigation':
      return 'the pinned Tongs cannot select a province';
    case 'not_shown':
      return 'the game did not show it';
    default:
      return `the game answered ${r.outcome}`;
  }
}
