// `pnpm media <step>`: the Etch website's media pipeline (etch-website docs/spec.md section 8,
// docs/media.md). Local only, on the maintainer's Windows machine with EU4 1.37.5 installed.
//
//   pnpm media capture [--clip ID]... [--save PATH] [--profile PATH] [--reedit] [--ffmpeg PATH]
//                      [--game PATH] [--work DIR]
//   pnpm media publish --site PATH [--etch VERSION] [--keep ID]...
//   pnpm media evidence SCENARIO.json [--before CHECKOUT] [--record] [--ffmpeg PATH] [--game PATH]
//                       [--work DIR]
//
// --clip takes the clip ids (hero, preview, views, data, zoom, outline, problems, profile, names,
// reload, pick, snapshot), also separated by commas; all of them by default. profile shows --profile,
// a CSV of Anvil's script profiler, as the newest profile. --save is a non-ironman save of the base
// game: every take's preview shows its province Kaluga as sample data (the Russia save of 17 March
// 1719), and reload, pick and snapshot share one take that starts EU4 and plays it, copied into the
// run first. hero is cut from the preview, reload and pick clips. --reedit edits and renders the clips
// again from their takes' logs and masters, without new takes. --ffmpeg is FFmpeg 8.1 or newer
// (default: ffmpeg on the PATH; ffprobe beside it). --game sets etch.gamePath (default: found
// through Steam, or $env:ETCH_GAME_PATH). --work is the short folder for VS Code and its profiles
// (default: %TEMP%\etch-media).
//
// publish uploads the loops of packages/media/out/v<version>/ to the media bucket and then writes
// the posters and src/data/media.json into the etch-website checkout at --site. --etch picks the
// capture folder (default: the extension's current version). --keep takes clip ids whose loop
// stays the one the site shows, with the Etch version it was captured for (a new take that shows
// an Etch bug); the capture need not have them. The upload token comes from the user
// environment variables HAPPYDWARF_MEDIA_ACCESS_KEY_ID and HAPPYDWARF_MEDIA_SECRET_ACCESS_KEY.
//
// evidence runs a scenario's steps in VS Code with this checkout's Etch, and with --before also
// with another checkout's, and writes the screenshots, the recording (--record) and an Evidence
// section into packages/media/out/evidence/<scenario>/ (docs/media.md, "Evidence for a pull
// request"). --work defaults to C:\etch-evidence, outside the user's folder.
import { S3Client } from '@aws-sdk/client-s3';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { findGameInSteam, systemEnvironment } from '@etch/core/playset';
import { capture } from './capture.ts';
import { MEDIA_BUCKET } from './config.ts';
import { attachments, defaultWork, evidence, parseScenario } from './evidence.ts';
import { CLIP_IDS, type ClipId } from './manifest.ts';
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
    keep: { type: 'string', multiple: true },
    reedit: { type: 'boolean', default: false },
    ffmpeg: { type: 'string' },
    game: { type: 'string' },
    work: { type: 'string' },
    site: { type: 'string' },
    etch: { type: 'string' },
    save: { type: 'string' },
    profile: { type: 'string' },
    before: { type: 'string' },
    record: { type: 'boolean', default: false },
  },
});

/** Clip ids, separated by commas or spaces: PowerShell passes `--clip a,b` as one argument `a b`. */
function clipIds(values: readonly string[] | undefined): ClipId[] {
  const ids = (values ?? [])
    .flatMap((value) => value.split(/[\s,]+/))
    .map((value) => value.trim())
    .filter(Boolean);
  for (const id of ids) {
    if (!CLIP_IDS.includes(id as ClipId)) {
      fail(`Unknown clip "${id}"; the clips are ${CLIP_IDS.join(', ')}.`);
    }
  }
  return ids as ClipId[];
}

const [step] = positionals;

/** The EU4 folder: --game, ETCH_GAME_PATH or Steam's. */
async function gameFolder(): Promise<string> {
  const game =
    values.game ??
    (process.env['ETCH_GAME_PATH']?.trim() || undefined) ??
    (await findGameInSteam(systemEnvironment()));
  if (game === undefined || game === '') {
    fail('EU4 was not found through Steam; pass --game or set ETCH_GAME_PATH.');
  }
  return game;
}

if (step === 'evidence') {
  const file = positionals[1];
  if (file === undefined) {
    fail(
      'Usage: pnpm media evidence SCENARIO.json [--before CHECKOUT] [--record] [--ffmpeg PATH] [--game PATH] [--work DIR]',
    );
  }
  const scenarioFile = path.resolve(typedIn, file);
  let scenario: ReturnType<typeof parseScenario>;
  try {
    scenario = parseScenario(
      await readFile(scenarioFile, 'utf8'),
      scenarioFile,
      path.join(repository, 'packages', 'media', 'demo-mod'),
    );
  } catch (error) {
    fail((error as Error).message);
  }
  try {
    const { markdown, file: written } = await evidence({
      scenario,
      after: repository,
      before: values.before === undefined ? undefined : path.resolve(typedIn, values.before),
      record: values.record,
      ffmpeg: values.ffmpeg ?? 'ffmpeg',
      work: values.work ?? defaultWork(),
      gamePath: await gameFolder(),
      out: path.join(repository, 'packages', 'media', 'out', 'evidence', scenario.name),
    });
    console.log(`\nDone: ${written}. Look at every picture, then post it:`);
    console.log(
      `  gh pr comment <n> --body-file ${written} ${attachments(markdown)
        .map((attached) => `--attach ${attached}`)
        .join(' ')}`,
    );
  } catch (error) {
    fail(`Evidence stopped: ${(error as Error).message}`);
  }
  process.exit(0);
}
if (step === 'publish') {
  if (values.site === undefined) {
    fail('Usage: pnpm media publish --site PATH [--etch VERSION] [--keep ID]...');
  }
  const keep = clipIds(values.keep);
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
      keep,
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
    'Usage: pnpm media capture [--clip ID]... [--save PATH] [--profile PATH] [--reedit]\n' +
      '       pnpm media publish --site PATH [--etch VERSION] [--keep ID]...\n' +
      '       pnpm media evidence SCENARIO.json [--before CHECKOUT] [--record]',
  );
}
const clips = clipIds(values.clip);
const chosen = clips.length === 0 ? [...CLIP_IDS] : clips;
if (!values.reedit && values.save === undefined) {
  fail(
    "The takes show a save's province and the live clips play it: pass --save PATH (a base-game save, not ironman).",
  );
}
if (!values.reedit && chosen.includes('profile') && values.profile === undefined) {
  fail(
    "The profile clip shows a script profile: pass --profile PATH (a CSV of Anvil's script profiler).",
  );
}
const ffmpeg = values.ffmpeg ?? 'ffmpeg';
const ffprobe =
  values.ffmpeg === undefined
    ? 'ffprobe'
    : path.join(path.dirname(values.ffmpeg), `ffprobe${path.extname(values.ffmpeg)}`);
// The takes override base-game files, so the game folder is needed before VS Code starts.
const game = await gameFolder();

const out = await capture({
  repository,
  clips: chosen,
  ffmpeg,
  ffprobe,
  work: values.work ?? path.join(tmpdir(), 'etch-media'),
  gamePath: game,
  reedit: values.reedit,
  ...(values.save === undefined ? {} : { save: path.resolve(typedIn, values.save) }),
  ...(values.profile === undefined ? {} : { profile: path.resolve(typedIn, values.profile) }),
});
console.log(`Done: ${out}. Look at every frame before anything is published.`);
