// The load of the save a start continues (spec section 6, H7, etch#596): the game reaches its main
// menu first (`anvil-game.ready`) and loads the save after it. In any playset that turns
// achievements off (any mod with gameplay files, Anbennar) the game's notice "Achievements can no
// longer be earned" holds the load until its Ok is clicked; the plugin knows the notice by its
// title and answers it. Another confirm window is left to the player.

import type { ConfirmAnswer, Ping } from './pipe.ts';

/** The button of the achievements notice the plugin answers (`confirm`). */
export const NOTICE_OK = 'DefaultConfirm/AgreeButton';
/** How long a start from a save may take to load it, the notice included (about 100 s in Anbennar, H7). */
export const LOAD_TIMEOUT_MS = 300_000;
/** How long another confirm window may stay open before the wait gives up on it, as in Tongs. */
export const HELD_GRACE_MS = 2_000;
/** How often the wait looks at the game. */
export const LOAD_POLL_MS = 500;

/** The game as the wait sees it. */
export interface LoadingGame {
  readonly alive: boolean;
  ping(timeoutMs?: number): Promise<Pick<Ping, 'gameSession'>>;
  confirm(path: string, timeoutMs?: number): Promise<ConfirmAnswer>;
}

/** How the wait ended, after `ms` milliseconds. */
export type SaveLoad =
  /** The save is loaded; `answered` the Enters posted to the achievements notice. */
  | { readonly kind: 'loaded'; readonly ms: number; readonly answered: number }
  /** Another confirm window holds the load: the player answers it. Its title is game or mod text. */
  | { readonly kind: 'held'; readonly ms: number; readonly title: string }
  /** No game session after `LOAD_TIMEOUT_MS`. */
  | { readonly kind: 'timeout'; readonly ms: number; readonly answered: number }
  /** The game ended while it loaded. */
  | { readonly kind: 'exited'; readonly ms: number }
  /** The start was cancelled. */
  | { readonly kind: 'cancelled'; readonly ms: number };

export interface SaveLoadOptions {
  readonly signal?: AbortSignal | undefined;
  readonly timeoutMs?: number;
  readonly graceMs?: number;
  readonly pollMs?: number;
  /** Called once, at the first Enter posted to the achievements notice, with its title. */
  readonly onAnswered?: (title: string) => void;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * Waits until the started game has loaded its save, answering the achievements notice whenever it
 * shows. Never throws: a ping or `confirm` that fails (the main thread busy with the load, no
 * `tongs.ui`) is tried again on the next look.
 */
export async function awaitSaveLoad(
  game: LoadingGame,
  options: SaveLoadOptions = {},
): Promise<SaveLoad> {
  const now = options.now ?? (() => performance.now());
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = options.timeoutMs ?? LOAD_TIMEOUT_MS;
  const graceMs = options.graceMs ?? HELD_GRACE_MS;
  const started = now();
  let answered = 0;
  let heldSince: number | undefined;
  for (;;) {
    const ms = () => now() - started;
    if (options.signal?.aborted === true) return { kind: 'cancelled', ms: ms() };
    if (!game.alive) return { kind: 'exited', ms: ms() };
    const ping = await game.ping().catch(() => undefined);
    if (ping?.gameSession !== undefined) return { kind: 'loaded', ms: ms(), answered };
    if (ms() >= timeoutMs) return { kind: 'timeout', ms: ms(), answered };
    const answer = await game.confirm(NOTICE_OK).catch(() => undefined);
    if (answer?.pressed === true) {
      if (answered === 0) options.onAnswered?.(answer.title ?? '');
      answered++;
      heldSince = undefined;
    } else if (answer !== undefined && !answer.found && answer.title !== undefined) {
      heldSince ??= now();
      if (now() - heldSince >= graceMs) return { kind: 'held', ms: ms(), title: answer.title };
    } else if (answer !== undefined) {
      heldSince = undefined;
    }
    await sleep(options.pollMs ?? LOAD_POLL_MS);
  }
}
