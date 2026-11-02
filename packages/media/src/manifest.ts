// The draft media manifest `pnpm media capture` writes beside the files: the Etch site's media
// manifest (etch-website docs/spec.md section 5.2) with local file names where the published one
// has bucket URLs. Publishing (etch#89) uploads the loops and turns it into `src/data/media.json`.
// Only facts about files: captions, alts and order stay in the site's code.
import { MEDIA_TYPES } from './config.ts';

/**
 * The clip ids, the same in bucket keys, file names and the manifest (spec section 8.5): the hero's
 * trailer, the offline preview's six features and the live game's three. Every clip is a loop with
 * its poster.
 */
export const CLIP_IDS = [
  'hero',
  'preview',
  'views',
  'data',
  'zoom',
  'outline',
  'problems',
  'reload',
  'pick',
  'snapshot',
] as const;
export type ClipId = (typeof CLIP_IDS)[number];
/** The clips whose take starts the live game. */
export const LIVE_CLIP_IDS = ['reload', 'pick', 'snapshot'] as const satisfies readonly ClipId[];
/** The clips with a take of their own in the offline preview. */
export const OFFLINE_CLIP_IDS = [
  'preview',
  'views',
  'data',
  'zoom',
  'outline',
  'problems',
] as const satisfies readonly ClipId[];

export interface DraftSource {
  /** The file in the capture folder, e.g. `hero.webm`. */
  readonly file: string;
  readonly type: string;
  readonly bytes: number;
}

export interface DraftLoop {
  readonly width: number;
  readonly height: number;
  /** Seconds. */
  readonly duration: number;
  /** The poster PNG, the loop's first frame. */
  readonly poster: string;
  /** VP9 WebM first, H.264 MP4 second, the order of the page's `<source>`s. */
  readonly sources: readonly [DraftSource, DraftSource];
}

export interface DraftManifest {
  readonly schemaVersion: 2;
  readonly draft: true;
  /** The Etch version the set was captured for. */
  readonly etch: string;
  readonly loops: Partial<Record<ClipId, DraftLoop>>;
}

export interface CapturedLoop {
  readonly width: number;
  readonly height: number;
  readonly duration: number;
  readonly webmBytes: number;
  readonly mp4Bytes: number;
}

/** The draft manifest of the loops in a capture folder, in the spec's order. */
export function draftManifest(
  etch: string,
  loops: Partial<Record<ClipId, CapturedLoop>>,
): DraftManifest {
  const draftLoops: Partial<Record<ClipId, DraftLoop>> = {};
  for (const id of CLIP_IDS) {
    const loop = loops[id];
    if (loop === undefined) continue;
    draftLoops[id] = {
      width: loop.width,
      height: loop.height,
      duration: Math.round(loop.duration * 1000) / 1000,
      poster: `${id}.png`,
      sources: [
        { file: `${id}.webm`, type: MEDIA_TYPES.webm, bytes: loop.webmBytes },
        { file: `${id}.mp4`, type: MEDIA_TYPES.mp4, bytes: loop.mp4Bytes },
      ],
    };
  }
  return { schemaVersion: 2, draft: true, etch, loops: draftLoops };
}
