// `pnpm media <step>`: the Etch website's media pipeline (etch-website docs/spec.md section 8,
// docs/media.md). Local only, on the maintainer's Windows machine with EU4 1.37.5 installed.
//
//   pnpm media capture [--scene ID]... [--recorder gfxcapture|playwright] [--ffmpeg PATH]
//                      [--game PATH] [--work DIR]
//
// --scene takes the scene ids (hero, preview, pin, outline, problems, resolution, playset), also
// separated by commas; all scenes by default. --recorder picks how loops are recorded: FFmpeg's
// lossless gfxcapture master (default) or Playwright's recordVideo. --ffmpeg is FFmpeg 8.1 or newer
// (default: ffmpeg on the PATH; ffprobe beside it). --game sets etch.gamePath (default: found
// through Steam, or $env:ETCH_GAME_PATH). --work is the short folder for VS Code and its profiles
// (default: %TEMP%\etch-media).
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { capture, type Recorder } from './capture.ts';
import { LOOP_IDS, STILL_IDS, type SceneId } from './manifest.ts';

const SCENE_IDS: readonly SceneId[] = [...LOOP_IDS, ...STILL_IDS];
const repository = path.join(import.meta.dirname, '..', '..', '..');

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    scene: { type: 'string', multiple: true },
    recorder: { type: 'string', default: 'gfxcapture' },
    ffmpeg: { type: 'string' },
    game: { type: 'string' },
    work: { type: 'string' },
  },
});

const [step] = positionals;
if (step !== 'capture') {
  fail(
    step === 'publish'
      ? 'pnpm media publish is not built yet (etch#89).'
      : 'Usage: pnpm media capture [--scene ID]... [--recorder gfxcapture|playwright]',
  );
}
const scenes = (values.scene ?? [])
  .flatMap((value) => value.split(','))
  .map((value) => value.trim())
  .filter(Boolean);
for (const scene of scenes) {
  if (!SCENE_IDS.includes(scene as SceneId)) {
    fail(`Unknown scene "${scene}"; the scenes are ${SCENE_IDS.join(', ')}.`);
  }
}
const recorder = values.recorder;
if (recorder !== 'gfxcapture' && recorder !== 'playwright') {
  fail(`--recorder is gfxcapture or playwright, not "${recorder}".`);
}
const ffmpeg = values.ffmpeg ?? 'ffmpeg';
const ffprobe =
  values.ffmpeg === undefined
    ? 'ffprobe'
    : path.join(path.dirname(values.ffmpeg), `ffprobe${path.extname(values.ffmpeg)}`);
const game = values.game ?? process.env['ETCH_GAME_PATH']?.trim();

const out = await capture({
  repository,
  scenes: scenes.length === 0 ? SCENE_IDS : (scenes as SceneId[]),
  recorder: recorder satisfies Recorder,
  ffmpeg,
  ffprobe,
  work: values.work ?? path.join(tmpdir(), 'etch-media'),
  gamePath: game === undefined || game === '' ? undefined : game,
});
console.log(`Done: ${out}. Look at every frame before anything is published.`);
