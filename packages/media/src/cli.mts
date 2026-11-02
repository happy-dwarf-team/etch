// `pnpm media <step>`: the Etch website's media pipeline (etch-website docs/spec.md section 8,
// docs/media.md). Local only, on the maintainer's Windows machine with EU4 1.37.5 installed.
//
//   pnpm media capture [--clip ID]... [--save PATH] [--reedit] [--ffmpeg PATH] [--game PATH]
//                      [--work DIR]
//   pnpm media publish --site PATH [--etch VERSION]
//
// --clip takes the clip ids (hero, preview, views, data, zoom, outline, problems, reload, pick,
// snapshot), also separated by commas; all of them by default. reload, pick and snapshot share one
// take that starts EU4 and plays --save, a non-ironman save of the base game, copied into the run
// first. hero is cut from the preview, reload and pick clips. --reedit edits and renders the clips
// again from their takes' logs and masters, without new takes. --ffmpeg is FFmpeg 8.1 or newer
// (default: ffmpeg on the PATH; ffprobe beside it). --game sets etch.gamePath (default: found
// through Steam, or $env:ETCH_GAME_PATH). --work is the short folder for VS Code and its profiles
// (default: %TEMP%\etch-media).
//
// publish uploads the loops of packages/media/out/v<version>/ to the media bucket and then writes
// the posters and src/data/media.json into the etch-website checkout at --site. --etch picks the
// capture folder (default: the extension's current version). The upload token comes from the user
// environment variables HAPPYDWARF_MEDIA_ACCESS_KEY_ID and HAPPYDWARF_MEDIA_SECRET_ACCESS_KEY.
import { S3Client } from '@aws-sdk/client-s3';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { findGameInSteam, systemEnvironment } from '@etch/core/playset';
import { capture } from './capture.ts';
import { MEDIA_BUCKET } from './config.ts';
import { CLIP_IDS, LIVE_CLIP_IDS, type ClipId } from './manifest.ts';
import { credentials, publish, r2Bucket } from './publish.ts';

const repository = path.join(import.meta.dirname, '..', '..', '..');
// pnpm runs the script in the repository root; INIT_CWD is where it was typed.
const typedIn = process.env['INIT_CWD'] ?? process.cwd();

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    clip: { type: 'string', multiple: true },
    reedit: { type: 'boolean', default: false },
    ffmpeg: { type: 'string' },
    game: { type: 'string' },
    work: { type: 'string' },
    site: { type: 'string' },
    etch: { type: 'string' },
    save: { type: 'string' },
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
      site: path.resolve(typedIn, values.site),
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
    'Usage: pnpm media capture [--clip ID]... [--save PATH] [--reedit]\n' +
      '       pnpm media publish --site PATH [--etch VERSION]',
  );
}
// Commas or spaces: PowerShell passes `--clip a,b` as one argument `a b`.
const clips = (values.clip ?? [])
  .flatMap((value) => value.split(/[\s,]+/))
  .map((value) => value.trim())
  .filter(Boolean);
for (const clip of clips) {
  if (!CLIP_IDS.includes(clip as ClipId)) {
    fail(`Unknown clip "${clip}"; the clips are ${CLIP_IDS.join(', ')}.`);
  }
}
const chosen = clips.length === 0 ? [...CLIP_IDS] : (clips as ClipId[]);
if (
  !values.reedit &&
  LIVE_CLIP_IDS.some((id) => chosen.includes(id)) &&
  values.save === undefined
) {
  fail('The live clips play a save: pass --save PATH (a base-game save, not ironman).');
}
const ffmpeg = values.ffmpeg ?? 'ffmpeg';
const ffprobe =
  values.ffmpeg === undefined
    ? 'ffprobe'
    : path.join(path.dirname(values.ffmpeg), `ffprobe${path.extname(values.ffmpeg)}`);
// The takes override base-game files, so the game folder is needed before VS Code starts.
const game =
  values.game ??
  (process.env['ETCH_GAME_PATH']?.trim() || undefined) ??
  (await findGameInSteam(systemEnvironment()));
if (game === undefined || game === '') {
  fail('EU4 was not found through Steam; pass --game or set ETCH_GAME_PATH.');
}

const out = await capture({
  repository,
  clips: chosen,
  ffmpeg,
  ffprobe,
  work: values.work ?? path.join(tmpdir(), 'etch-media'),
  gamePath: game,
  reedit: values.reedit,
  ...(values.save === undefined ? {} : { save: path.resolve(typedIn, values.save) }),
});
console.log(`Done: ${out}. Look at every frame before anything is published.`);
