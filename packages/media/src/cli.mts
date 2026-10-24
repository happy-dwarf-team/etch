// `pnpm media <step>`: the Etch website's media pipeline (etch-website docs/spec.md section 8,
// docs/media.md). Local only, on the maintainer's Windows machine with EU4 1.37.5 installed.
//
//   pnpm media capture [--scene ID]... [--recorder gfxcapture|playwright] [--ffmpeg PATH]
//                      [--game PATH] [--work DIR]
//   pnpm media publish --site PATH [--etch VERSION]
//
// --scene takes the scene ids (hero, preview, pin, outline, problems, resolution, playset), also
// separated by commas; all scenes by default. --recorder picks how loops are recorded: FFmpeg's
// lossless gfxcapture master (default) or Playwright's recordVideo. --ffmpeg is FFmpeg 8.1 or newer
// (default: ffmpeg on the PATH; ffprobe beside it). --game sets etch.gamePath (default: found
// through Steam, or $env:ETCH_GAME_PATH). --work is the short folder for VS Code and its profiles
// (default: %TEMP%\etch-media).
//
// publish uploads the loops of packages/media/out/v<version>/ to the media bucket and then writes
// the posters, stills and src/data/media.json into the etch-website checkout at --site. --etch
// picks the capture folder (default: the extension's current version). The upload token comes
// from the user environment variables HAPPYDWARF_MEDIA_ACCESS_KEY_ID and
// HAPPYDWARF_MEDIA_SECRET_ACCESS_KEY.
import { S3Client } from '@aws-sdk/client-s3';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { capture, type Recorder } from './capture.ts';
import { MEDIA_BUCKET } from './config.ts';
import { LOOP_IDS, STILL_IDS, type SceneId } from './manifest.ts';
import { credentials, publish, r2Bucket } from './publish.ts';

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
    site: { type: 'string' },
    etch: { type: 'string' },
  },
});

const [step] = positionals;
if (step === 'publish') {
  if (values.site === undefined) fail('Usage: pnpm media publish --site PATH [--etch VERSION]');
  const version =
    values.etch ??
    (
      JSON.parse(
        await readFile(path.join(repository, 'packages', 'extension', 'package.json'), 'utf8'),
      ) as { version: string }
    ).version;
  // Missing credentials stop the run before anything is read or written.
  let token: ReturnType<typeof credentials>;
  try {
    token = credentials(process.env);
  } catch (error) {
    fail((error as Error).message);
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: MEDIA_BUCKET.endpoint,
    credentials: token,
  });
  try {
    await publish({
      capture: path.join(repository, 'packages', 'media', 'out', `v${version}`),
      site: path.resolve(values.site),
      bucket: r2Bucket(client),
    });
  } catch (error) {
    fail(`Publishing stopped: ${(error as Error).message}`);
  } finally {
    client.destroy();
  }
  console.log(
    'Done. Run npm run check:media in the site, then open its pull request (team-pr); nothing was committed.',
  );
  process.exit(0);
}
if (step !== 'capture') {
  fail(
    'Usage: pnpm media capture [--scene ID]... [--recorder gfxcapture|playwright]\n' +
      '       pnpm media publish --site PATH [--etch VERSION]',
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
