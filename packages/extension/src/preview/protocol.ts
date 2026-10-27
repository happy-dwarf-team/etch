// The messages between the extension host and the preview webview (ADR 0001, etch#8). Plain data
// only: they cross postMessage. The webview script (webview/main.ts) imports these types too, so
// this file imports nothing at run time.

import type { ResolutionSource } from '@etch/core';
import type { DrawList, DrawRect } from '@etch/core/draw-list';

/** A notice shown above the preview, such as a game that was not found. */
export interface Notice {
  readonly severity: 'error' | 'warning' | 'information';
  readonly message: string;
}

/** What the preview's toolbar and notices show. */
export interface ViewState {
  /** The previewed window's name, or what the preview waits for. */
  readonly title: string;
  /** The `.gui` file of the previewed window, game-relative when the playset reads it. */
  readonly file: string;
  readonly pinned: boolean;
  /** Whether there is a window that could be pinned. */
  readonly pinnable: boolean;
  /** The preview resolution as `1920×1080`, and where it came from (spec section 6). */
  readonly resolution: { readonly text: string; readonly source: ResolutionSource };
  readonly notices: readonly Notice[];
  /** `View ▾`: the previewed window's views and selectors; none without a window profile. */
  readonly menu?: ViewMenu;
}

/** Where a selector's value came from (core's `SelectorSource`). */
export type SelectorSourceName = 'auto' | 'save' | 'live' | 'you' | 'default';

/** `View ▾` (spec section 4, etch#159 variant D). */
export interface ViewMenu {
  /** The toolbar's label: the view, and how many hand toggles apply ("Own province · 1 by hand"). */
  readonly label: string;
  readonly views: readonly {
    readonly id: string;
    readonly label: string;
    /** A view of the mod project's file, such as one Save as view wrote. */
    readonly mine: boolean;
    readonly current: boolean;
  }[];
  readonly selectors: readonly {
    readonly id: string;
    readonly label: string;
    readonly kind: 'resolution' | 'data' | 'ui' | 'scripted';
    readonly value: string;
    readonly source: SelectorSourceName;
    readonly values: readonly { readonly id: string; readonly label: string }[];
    readonly note?: string;
  }[];
  readonly handToggles: number;
  /** Whether Save as view can write: the preview has a mod project. */
  readonly canSave: boolean;
}

/** What a click in `View ▾` asks for. */
export type ViewAction =
  | { readonly kind: 'chooseView'; readonly id: string }
  | { readonly kind: 'select'; readonly selector: string; readonly value: string }
  /** A data selector follows the save again; another goes back to its default. */
  | { readonly kind: 'release'; readonly selector: string }
  | { readonly kind: 'resetToggles' }
  /** Save as view; the name is asked for when the action does not give it. */
  | { readonly kind: 'saveView'; readonly label?: string }
  | { readonly kind: 'openProfile' };

/**
 * What the preview keeps across a window reload (the webview's state, which VS Code gives the
 * panel serializer): the previewed window and whether it is pinned.
 */
export interface PreviewMemento {
  /** The `.gui` file, as a URI string. */
  readonly uri: string;
  /** The window's name; `index`, its place among the file's definitions, when it has none. */
  readonly window: string | undefined;
  readonly index: number;
  readonly pinned: boolean;
}

/** A point of the preview screen, in pixels. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Messages the extension host posts to the webview. */
export type HostMessage =
  /**
   * Draw a window. `list.textures` are webview URIs. `probes` asks for the straight RGBA of
   * those pixels after the paint, for tests.
   */
  | {
      readonly type: 'draw';
      readonly id: number;
      readonly list: DrawList;
      readonly probes?: readonly Point[];
    }
  | { readonly type: 'state'; readonly state: ViewState }
  /**
   * Outline the widget under the pointer, with its path and rect, and the widget highlighted from
   * the source or the outline (etch#37). A missing one is not outlined.
   */
  | {
      readonly type: 'overlay';
      readonly hover?: { readonly rect: DrawRect; readonly text: string };
      readonly selected?: DrawRect;
    }
  /** Forget textures that changed on disk, so the next draw fetches them again. */
  | { readonly type: 'invalidate'; readonly urls: readonly string[] }
  /** Keep this as the webview's state, for the next window reload. */
  | { readonly type: 'remember'; readonly memento: PreviewMemento };

/** A texture the webview could not load, as `@etch/renderer` reports it. */
export interface TextureFailure {
  readonly url: string;
  readonly code: string;
  readonly message: string;
}

/** Messages the webview posts to the extension host. */
export type WebviewMessage =
  | { readonly type: 'ready' }
  | {
      readonly type: 'painted';
      readonly id: number;
      /** False when a later draw arrived before this one's textures loaded. */
      readonly painted: boolean;
      readonly problems: readonly TextureFailure[];
      /** Indices of draws left out because a texture they use is missing. */
      readonly skipped: readonly number[];
      /** The RGBA of each requested probe, in the order asked. */
      readonly pixels?: readonly (readonly number[])[];
      /** When the pixels were drawn, in milliseconds since the Unix epoch. */
      readonly at: number;
    }
  /** Drawing failed, for example because the webview has no WebGL2. */
  | { readonly type: 'failed'; readonly id?: number; readonly message: string }
  /** The pointer moved over the preview screen, in its pixels; no point when it left. */
  | { readonly type: 'pointer'; readonly point?: Point }
  | { readonly type: 'click'; readonly point: Point }
  | { readonly type: 'pin'; readonly pinned: boolean }
  /** The monitor's resolution in device pixels, at start and when it changes. */
  | {
      readonly type: 'monitor';
      readonly screen: { readonly width: number; readonly height: number };
    }
  /** The resolution button was clicked: choose the preview resolution. */
  | { readonly type: 'resolution' }
  /** The live game's button was clicked: start it with the preview's playset. */
  | { readonly type: 'startLiveGame' }
  /** A click in `View ▾`. */
  | { readonly type: 'view'; readonly action: ViewAction };
