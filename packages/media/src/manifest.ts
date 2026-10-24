// The draft media manifest `pnpm media capture` writes beside the files: the Etch site's media
// manifest (etch-website docs/spec.md section 5.2) with local file names where the published one
// has bucket URLs. Publishing (etch#89) uploads the loops and turns it into `src/data/media.json`.
// Only facts about files: captions, alts and order stay in the site's code.
import { MEDIA_TYPES } from './config.ts';

/** The scene ids, the same in bucket keys, file names and the manifest (spec section 8.5). */
export const LOOP_IDS = ['hero'] as const;
export const STILL_IDS = [
  'preview',
  'pin',
  'outline',
  'problems',
  'resolution',
  'playset',
] as const;
export type LoopId = (typeof LOOP_IDS)[number];
export type StillId = (typeof STILL_IDS)[number];
export type SceneId = LoopId | StillId;

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
  readonly schemaVersion: 1;
  readonly draft: true;
  /** The Etch version the set was captured for. */
  readonly etch: string;
  readonly loops: Partial<Record<LoopId, DraftLoop>>;
  readonly stills: Partial<Record<StillId, string>>;
}

export interface CapturedLoop {
  readonly width: number;
  readonly height: number;
  readonly duration: number;
  readonly webmBytes: number;
  readonly mp4Bytes: number;
}

/** The draft manifest of the loops and stills in a capture folder, in the spec's order. */
export function draftManifest(
  etch: string,
  loops: Partial<Record<LoopId, CapturedLoop>>,
  stills: readonly StillId[],
): DraftManifest {
  const draftLoops: Partial<Record<LoopId, DraftLoop>> = {};
  for (const id of LOOP_IDS) {
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
  const draftStills: Partial<Record<StillId, string>> = {};
  for (const id of STILL_IDS) if (stills.includes(id)) draftStills[id] = `${id}.png`;
  return { schemaVersion: 1, draft: true, etch, loops: draftLoops, stills: draftStills };
}
