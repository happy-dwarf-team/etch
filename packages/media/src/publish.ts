// `pnpm media publish --site <etch-website checkout>` (etch-website docs/spec.md section 8.8):
// uploads a capture's loops to the media bucket, checks every one, and only then writes the
// posters, the stills and `src/data/media.json` into the site's checkout. It commits nothing.
import { HeadObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { pngSize } from './capture.ts';
import { CACHE_CONTROL, CREDENTIAL_VARIABLES, MASTER, MEDIA_BUCKET } from './config.ts';
import {
  LOOP_IDS,
  STILL_IDS,
  type DraftLoop,
  type DraftManifest,
  type DraftSource,
  type LoopId,
  type StillId,
} from './manifest.ts';

/** What `HeadObject` tells about a key. */
export interface StoredObject {
  readonly bytes: number;
  readonly type: string;
}

/** The two calls publishing makes to the media bucket. */
export interface Bucket {
  /** Puts the object only if its key is new (`If-None-Match: *`); `false` when the key exists. */
  create(key: string, body: Uint8Array, type: string): Promise<boolean>;
  /** The object's size and type, or `undefined` when the key does not exist. */
  head(key: string): Promise<StoredObject | undefined>;
}

/** The R2 S3 API's credentials, from the user environment variables. */
export function credentials(env: NodeJS.ProcessEnv): {
  accessKeyId: string;
  secretAccessKey: string;
} {
  const accessKeyId = env[CREDENTIAL_VARIABLES.accessKeyId]?.trim() ?? '';
  const secretAccessKey = env[CREDENTIAL_VARIABLES.secretAccessKey]?.trim() ?? '';
  const missing = [
    accessKeyId === '' ? CREDENTIAL_VARIABLES.accessKeyId : undefined,
    secretAccessKey === '' ? CREDENTIAL_VARIABLES.secretAccessKey : undefined,
  ].filter((name) => name !== undefined);
  if (missing.length > 0) {
    throw new Error(
      `Set the user environment variable${missing.length > 1 ? 's' : ''} ${missing.join(' and ')} ` +
        "to the media bucket's upload token (docs/media.md), then open a new terminal.",
    );
  }
  return { accessKeyId, secretAccessKey };
}

/** The HTTP status of an AWS SDK error, if it has one. */
function httpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('$metadata' in error)) return undefined;
  const metadata = error.$metadata as { httpStatusCode?: number } | undefined;
  return metadata?.httpStatusCode;
}

/** The media bucket through the R2 S3 API. */
export function r2Bucket(
  client: Pick<S3Client, 'send'>,
  bucket: string = MEDIA_BUCKET.name,
): Bucket {
  return {
    async create(key, body, type) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentLength: body.byteLength,
            ContentType: type,
            CacheControl: CACHE_CONTROL,
            IfNoneMatch: '*',
          }),
        );
        return true;
      } catch (error) {
        if (httpStatus(error) === 412) return false;
        throw error;
      }
    },
    async head(key) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { bytes: head.ContentLength ?? -1, type: head.ContentType ?? '' };
      } catch (error) {
        if (httpStatus(error) === 404) return undefined;
        throw error;
      }
    },
  };
}

/** The first 8 hex digits of the file's SHA-256, the `<hash8>` in its key. */
export function hash8(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 8);
}

/** The bucket key of one loop file: `etch/v<version>/<scene>.<hash8>.<webm|mp4>`. */
export function mediaKey(version: string, scene: LoopId, hash: string, file: string): string {
  return `${MEDIA_BUCKET.prefix}/v${version}/${scene}.${hash}${path.extname(file)}`;
}

/** A `type` without its parameters: `video/webm; codecs="vp9"` → `video/webm`. */
export function mediaType(type: string): string {
  return (type.split(';')[0] ?? '').trim().toLowerCase();
}

export interface PublishedSource {
  readonly src: string;
  readonly type: string;
  readonly bytes: number;
}

export interface PublishedLoop {
  readonly width: number;
  readonly height: number;
  readonly duration: number;
  readonly poster: string;
  /** VP9 WebM first, H.264 MP4 second. */
  readonly sources: readonly [PublishedSource, PublishedSource];
}

/** The site's media manifest, `src/data/media.json` (etch-website docs/spec.md section 5.2). */
export interface MediaManifest {
  readonly schemaVersion: 1;
  readonly etch: string;
  readonly loops: Record<LoopId, PublishedLoop>;
  readonly stills: Record<StillId, string>;
}

export interface PublishOptions {
  /** The capture folder, `packages/media/out/v<version>/`. */
  readonly capture: string;
  /** The etch-website checkout that receives the manifest, posters and stills. */
  readonly site: string;
  readonly bucket: Bucket;
  readonly log?: (line: string) => void;
}

/** Reads the capture's draft manifest and checks it describes a whole set of files. */
async function readDraft(capture: string): Promise<DraftManifest> {
  const file = path.join(capture, 'media.draft.json');
  const text = await readFile(file, 'utf8').catch(() => undefined);
  if (text === undefined) {
    throw new Error(`${file} does not exist: run pnpm media capture first, or pass --etch.`);
  }
  const json = JSON.parse(text) as { schemaVersion?: unknown; draft?: unknown };
  if (json.schemaVersion !== 1 || json.draft !== true) {
    throw new Error(`${file} is not a draft media manifest of schema version 1.`);
  }
  const draft = json as DraftManifest;
  if (path.basename(capture) !== `v${draft.etch}`) {
    throw new Error(`${file} is for Etch ${draft.etch}, not the folder ${path.basename(capture)}.`);
  }
  const missing = [
    ...LOOP_IDS.filter((id) => draft.loops[id] === undefined),
    ...STILL_IDS.filter((id) => draft.stills[id] === undefined),
  ];
  if (missing.length > 0) {
    throw new Error(
      `The capture lacks ${missing.join(', ')}; the site needs every scene. ` +
        `Capture them with pnpm media capture --scene ${missing.join(',')}.`,
    );
  }
  return draft;
}

/** Checks every image is a 2560 × 1440 PNG named after its scene (section 8.6). */
async function checkImages(capture: string, files: readonly string[]): Promise<void> {
  for (const file of files) {
    const header = (await readFile(path.join(capture, file))).subarray(0, 24);
    const { width, height } = pngSize(header);
    if (width !== MASTER.width || height !== MASTER.height) {
      throw new Error(
        `${file} is ${String(width)} × ${String(height)}, not ${String(MASTER.width)} × ${String(MASTER.height)}.`,
      );
    }
  }
}

/** Checks the folder is an etch-website checkout. */
async function checkSite(site: string): Promise<void> {
  const manifest = await readFile(path.join(site, 'package.json'), 'utf8').catch(() => undefined);
  const name =
    manifest === undefined ? undefined : (JSON.parse(manifest) as { name?: string }).name;
  if (name !== 'etch-website') {
    throw new Error(
      `${site} is not an etch-website checkout (no package.json named etch-website).`,
    );
  }
}

/** An object of every scene's entry, in the order given. */
function byId<K extends string, V>(entries: readonly (readonly [K, V])[]): Record<K, V> {
  return Object.fromEntries(entries) as Record<K, V>;
}

/** One loop file, read and checked, with its bucket key. */
interface LoopFile {
  readonly source: DraftSource;
  readonly body: Uint8Array;
  /** The media type stored as the object's `Content-Type`, without the `codecs` parameter. */
  readonly type: string;
  readonly key: string;
}

/** Uploads one loop file unless its key exists with the same size and type; returns its URL. */
async function upload(
  bucket: Bucket,
  key: string,
  body: Uint8Array,
  type: string,
  log: (line: string) => void,
): Promise<string> {
  if (await bucket.create(key, body, type)) {
    log(`Uploaded ${key} (${String(body.byteLength)} bytes).`);
  } else {
    const stored = await bucket.head(key);
    if (!matches(stored, body.byteLength, type)) {
      throw new Error(
        `${key} is already in the bucket with ${describe(stored)}, not ${String(body.byteLength)} bytes of ${type}. ` +
          'A key never changes: find out what uploaded it before going on.',
      );
    }
    log(`Kept ${key}: already in the bucket with the same size and type.`);
  }
  return `${MEDIA_BUCKET.origin}/${key}`;
}

function matches(stored: StoredObject | undefined, bytes: number, type: string): boolean {
  return stored?.bytes === bytes && mediaType(stored.type) === type;
}

function describe(stored: StoredObject | undefined): string {
  return stored === undefined
    ? 'nothing'
    : `${String(stored.bytes)} bytes of ${stored.type || '(no type)'}`;
}

/**
 * Publishes one capture: uploads its loops, checks each with `HeadObject`, and then writes the
 * posters, stills and `src/data/media.json` into the site. Returns the manifest written.
 */
export async function publish(options: PublishOptions): Promise<MediaManifest> {
  const log = options.log ?? console.log;
  const draft = await readDraft(options.capture);
  await checkSite(options.site);
  const loops = LOOP_IDS.map((id) => [id, draft.loops[id] as DraftLoop] as const);
  const images = [
    ...loops.map(([, loop]) => loop.poster),
    ...STILL_IDS.map((id) => draft.stills[id] as string),
  ];
  await checkImages(options.capture, images);

  // Every file is read and checked against the draft before the first upload.
  const read = async (id: LoopId, source: DraftSource): Promise<LoopFile> => {
    const body = await readFile(path.join(options.capture, source.file));
    if (body.byteLength !== source.bytes) {
      throw new Error(
        `${source.file} has ${String(body.byteLength)} bytes; the draft says ${String(source.bytes)}. Capture again.`,
      );
    }
    return {
      source,
      body,
      type: mediaType(source.type),
      key: mediaKey(draft.etch, id, hash8(body), source.file),
    };
  };
  const sets = [];
  for (const [id, loop] of loops) {
    const [webm, mp4] = loop.sources;
    sets.push({ id, loop, files: [await read(id, webm), await read(id, mp4)] as const });
  }
  const files = sets.flatMap((set) => set.files);

  const urls = new Map<LoopFile, string>();
  for (const file of files) {
    urls.set(file, await upload(options.bucket, file.key, file.body, file.type, log));
  }
  for (const file of files) {
    const stored = await options.bucket.head(file.key);
    if (!matches(stored, file.body.byteLength, file.type)) {
      throw new Error(
        `${file.key} reads back as ${describe(stored)}, not ${String(file.body.byteLength)} bytes of ${file.type}. Nothing was written to the site.`,
      );
    }
  }
  log(`Checked ${String(files.length)} objects in ${MEDIA_BUCKET.name}.`);

  const published = (file: LoopFile): PublishedSource => ({
    src: urls.get(file) ?? '',
    type: file.source.type,
    bytes: file.source.bytes,
  });
  const manifest: MediaManifest = {
    schemaVersion: 1,
    etch: draft.etch,
    loops: byId(
      sets.map(({ id, loop, files: [webm, mp4] }) => [
        id,
        {
          width: loop.width,
          height: loop.height,
          duration: loop.duration,
          poster: loop.poster,
          sources: [published(webm), published(mp4)],
        },
      ]),
    ),
    stills: byId(STILL_IDS.map((id) => [id, draft.stills[id] as string])),
  };

  const assets = path.join(options.site, 'src', 'assets', 'media');
  const data = path.join(options.site, 'src', 'data');
  await mkdir(assets, { recursive: true });
  await mkdir(data, { recursive: true });
  for (const image of images)
    await copyFile(path.join(options.capture, image), path.join(assets, image));
  await writeFile(path.join(data, 'media.json'), `${JSON.stringify(manifest, null, '\t')}\n`);
  log(`Wrote ${String(images.length)} images and src/data/media.json into ${options.site}.`);
  return manifest;
}
