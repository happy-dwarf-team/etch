// Messages between the texture preview (src/texture-preview.ts) and its webview script
// (webview/texture.ts). Types only, so that both sides can import them.

import type { TextureSummary } from '@etch/renderer/inspect';

/** Messages from the texture webview. */
export type TextureWebviewMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'shown'; readonly summary: TextureSummary }
  | { readonly type: 'failed'; readonly message: string };

/** Messages to the texture webview. */
export interface TextureHostMessage {
  readonly type: 'texture';
  readonly name: string;
  readonly bytes: Uint8Array;
}
