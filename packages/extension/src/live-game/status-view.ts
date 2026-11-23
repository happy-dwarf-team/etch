// What the live game shows in the status bar and in its menu (etch#648, P2.7), state by state,
// without VS Code: the live game's item names its state with its own icon, a click opens the
// menu, and stopping is one item of it with what it does, never the click itself. While pick mode
// is on, a second item says so, so that the player knows why clicks in the game pick widgets.
import type { LiveGameState } from './live-game.ts';

/** A status bar item's text, with `$(icon)`s, and its tooltip. */
export interface StatusText {
  readonly text: string;
  readonly tooltip: string;
}

/** What an item of the live game's menu does. */
export type LiveMenuAction = 'pick' | 'snapshot' | 'saves' | 'log' | 'restart' | 'stop' | 'later';

/** An item of the menu, or a line between groups of items. */
export type LiveMenuItem =
  | {
      readonly action: LiveMenuAction;
      readonly label: string;
      /** A codicon's name. */
      readonly icon: string;
      readonly description?: string;
    }
  | { readonly separator: true };

/** The live game's menu: a title with its state, and its items, the one to choose first first. */
export interface LiveMenu {
  readonly title: string;
  readonly items: readonly LiveMenuItem[];
}

/** What the menu shows besides the state: pick mode and the playset's mod. */
export interface LiveMenuContext {
  readonly pickOn: boolean;
  /** The pick mode key, such as `Ctrl+Shift+E`. */
  readonly pickKey: string;
  /** The edited mod's name, or `undefined` before a start. */
  readonly mod: string | undefined;
}

const CLICK = 'Click for the Live Game menu.';

/** The live game's status bar item; `undefined` when it is stopped, busy elsewhere or failed. */
export function liveStatus(state: LiveGameState): StatusText | undefined {
  switch (state.status) {
    case 'starting':
      return {
        text: '$(loading~spin) Live game: starting',
        tooltip: `Etch starts EU4 with your mod's playset. ${CLICK}`,
      };
    case 'ready':
      return {
        text: '$(vm-running) Live game',
        tooltip: `The live game is ready: each file you save goes into it. ${CLICK}`,
      };
    case 'stale':
      return {
        text: '$(warning) Live game: restart needed',
        tooltip: `Restart needed: ${state.reasons.join('; ')}. Reloads wait until the restart. ${CLICK}`,
      };
    case 'restarting':
      return {
        text: '$(loading~spin) Live game: restarting',
        tooltip: `The live game restarts: ${state.reason}. ${CLICK}`,
      };
    case 'stopping':
      return {
        text: '$(loading~spin) Live game: stopping',
        tooltip: 'Etch saves the live game as autosave.eu4, then closes it.',
      };
    default:
      return undefined;
  }
}

/** The pick mode item, while pick mode is on in a running live game; a click turns it off. */
export function pickStatus(
  state: LiveGameState,
  pickOn: boolean,
  pickKey: string,
): StatusText | undefined {
  if (!pickOn || (state.status !== 'ready' && state.status !== 'stale')) return undefined;
  return {
    text: '$(target) Pick mode',
    tooltip:
      'Pick mode is on: click a widget in the game to open its definition here. ' +
      `Click to turn it off, or press ${pickKey} in the game.`,
  };
}

/** The live game's menu in a state; `undefined` when it is not running. */
export function liveMenu(state: LiveGameState, context: LiveMenuContext): LiveMenu | undefined {
  const of = context.mod === undefined ? '' : ` · ${context.mod}`;
  const log: LiveMenuItem = { action: 'log', label: "Show the Live Game's Log", icon: 'output' };
  const stop: LiveMenuItem = {
    action: 'stop',
    label: 'Stop the Live Game',
    icon: 'debug-stop',
    description: 'saves autosave.eu4, then closes EU4',
  };
  const pick: LiveMenuItem = {
    action: 'pick',
    label: context.pickOn ? 'Turn Pick Mode Off' : 'Turn Pick Mode On',
    icon: 'target',
    description: `click a widget in the game to find it here · ${context.pickKey} in the game`,
  };
  const saves: LiveMenuItem = {
    action: 'saves',
    label: "Open the Live Game's Saves Folder",
    icon: 'folder-opened',
  };
  const separator: LiveMenuItem = { separator: true };
  switch (state.status) {
    case 'starting':
    case 'restarting':
      return {
        title: `Live Game: ${state.status === 'starting' ? 'starting' : `restarting (${state.reason})`}${of}`,
        items: [log, { ...stop, description: 'stops the start' }],
      };
    case 'ready':
      return {
        title: `Live Game: ready (${(state.readyMs / 1000).toFixed(1)} s)${of}`,
        items: [
          pick,
          {
            action: 'snapshot',
            label: 'Snapshot from the Live Game',
            icon: 'device-camera',
            description: 'of the previewed window',
          },
          saves,
          log,
          separator,
          {
            action: 'restart',
            label: 'Restart the Live Game',
            icon: 'debug-restart',
            description: 'saves autosave.eu4, then starts EU4 again',
          },
          stop,
        ],
      };
    case 'stale':
      return {
        title: `Live Game: restart needed${of}`,
        items: [
          {
            action: 'restart',
            label: 'Restart Now',
            icon: 'debug-restart',
            description: state.reasons.join('; '),
          },
          {
            action: 'later',
            label: 'Later',
            icon: 'clock',
            description: 'reloads wait until the restart',
          },
          separator,
          pick,
          saves,
          log,
          stop,
        ],
      };
    case 'stopping':
      return { title: `Live Game: stopping${of}`, items: [log] };
    default:
      return undefined;
  }
}
