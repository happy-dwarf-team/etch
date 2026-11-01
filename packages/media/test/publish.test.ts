import { HeadObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CACHE_CONTROL, CREDENTIAL_VARIABLES, MEDIA_TYPES } from '../src/config.ts';
import { draftManifest, STILL_IDS } from '../src/manifest.ts';
import {
  credentials,
  hash8,
  mediaKey,
  publish,
  r2Bucket,
  type Bucket,
  type StoredObject,
} from '../src/publish.ts';

/** A PNG header of the given size; enough for `pngSize`. */
function png(width: number, height: number): Uint8Array {
  const header = new Uint8Array(32);
  header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  header.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(header.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return header;
}

/** A bucket in memory that honours `If-None-Match: *`. */
class FakeBucket implements Bucket {
  readonly objects = new Map<string, StoredObject & { body: Uint8Array }>();
  readonly calls: string[] = [];

  create(key: string, body: Uint8Array, type: string): Promise<boolean> {
    this.calls.push(`put ${key}`);
    if (this.objects.has(key)) return Promise.resolve(false);
    this.objects.set(key, { bytes: body.byteLength, type, body });
    return Promise.resolve(true);
  }

  head(key: string): Promise<StoredObject | undefined> {
    this.calls.push(`head ${key}`);
    const object = this.objects.get(key);
    return Promise.resolve(object && { bytes: object.bytes, type: object.type });
  }
}

const WEBM = new TextEncoder().encode('webm bytes');
const MP4 = new TextEncoder().encode('mp4 bytes, a few more');
const sha8 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex').slice(0, 8);

let root: string;
let capture: string;
let site: string;
const lines: string[] = [];
const log = (line: string) => lines.push(line);

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'etch-publish-'));
  capture = path.join(root, 'out', 'v0.3.0');
  site = path.join(root, 'site');
  await mkdir(capture, { recursive: true });
  await mkdir(site);
  await writeFile(path.join(site, 'package.json'), JSON.stringify({ name: 'etch-website' }));
  await writeFile(path.join(capture, 'hero.webm'), WEBM);
  await writeFile(path.join(capture, 'hero.mp4'), MP4);
  for (const id of ['hero', ...STILL_IDS]) {
    await writeFile(path.join(capture, `${id}.png`), png(2560, 1440));
  }
  const draft = draftManifest(
    '0.3.0',
    {
      hero: {
        width: 1920,
        height: 1080,
        duration: 9.366,
        webmBytes: WEBM.byteLength,
        mp4Bytes: MP4.byteLength,
      },
    },
    STILL_IDS,
  );
  await writeFile(path.join(capture, 'media.draft.json'), JSON.stringify(draft));
  lines.length = 0;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** The files publishing wrote into the site, if any. */
async function siteFiles(): Promise<string[]> {
  const assets = await readdir(path.join(site, 'src', 'assets', 'media')).catch(() => []);
  const data = await readdir(path.join(site, 'src', 'data')).catch(() => []);
  return [...assets, ...data].sort();
}

describe('publishing', () => {
  it('uploads the loops under content-hashed keys, then writes the manifest and images', async () => {
    const bucket = new FakeBucket();
    const manifest = await publish({ capture, site, bucket, log });

    const webmKey = `etch/v0.3.0/hero.${sha8(WEBM)}.webm`;
    const mp4Key = `etch/v0.3.0/hero.${sha8(MP4)}.mp4`;
    expect(bucket.calls).toEqual([
      `put ${webmKey}`,
      `put ${mp4Key}`,
      `head ${webmKey}`,
      `head ${mp4Key}`,
    ]);
    expect(bucket.objects.get(webmKey)).toMatchObject({
      bytes: WEBM.byteLength,
      type: 'video/webm',
    });
    expect(bucket.objects.get(mp4Key)).toMatchObject({ bytes: MP4.byteLength, type: 'video/mp4' });

    const written = JSON.parse(
      await readFile(path.join(site, 'src', 'data', 'media.json'), 'utf8'),
    ) as unknown;
    expect(written).toEqual(manifest);
    expect(manifest).toEqual({
      schemaVersion: 1,
      etch: '0.3.0',
      loops: {
        hero: {
          width: 1920,
          height: 1080,
          duration: 9.366,
          poster: 'hero.png',
          sources: [
            {
              src: `https://media.happydwarf.dev/${webmKey}`,
              type: MEDIA_TYPES.webm,
              bytes: WEBM.byteLength,
            },
            {
              src: `https://media.happydwarf.dev/${mp4Key}`,
              type: MEDIA_TYPES.mp4,
              bytes: MP4.byteLength,
            },
          ],
        },
      },
      stills: {
        preview: 'preview.png',
        views: 'views.png',
        data: 'data.png',
        zoom: 'zoom.png',
        outline: 'outline.png',
        problems: 'problems.png',
      },
    });
    // The keys the site's schema accepts (etch-website src/lib/media-manifest.ts).
    const [webm, mp4] = manifest.loops.hero.sources;
    expect(webm.src).toMatch(
      /^https:\/\/media\.happydwarf\.dev\/etch\/v0\.3\.0\/hero\.[0-9a-f]{8}\.webm$/,
    );
    expect(mp4.src).toMatch(
      /^https:\/\/media\.happydwarf\.dev\/etch\/v0\.3\.0\/hero\.[0-9a-f]{8}\.mp4$/,
    );
    expect(await siteFiles()).toEqual(
      [...['hero', ...STILL_IDS].map((id) => `${id}.png`), 'media.json'].sort(),
    );
  });

  it('keeps keys already in the bucket with the same size and type, so it can run again', async () => {
    const bucket = new FakeBucket();
    const first = await publish({ capture, site, bucket, log });
    lines.length = 0;
    const again = await publish({ capture, site, bucket, log });
    expect(again).toEqual(first);
    expect(lines.filter((line) => line.startsWith('Kept '))).toHaveLength(2);
    expect(lines.some((line) => line.startsWith('Uploaded '))).toBe(false);
  });

  it('fails when an existing key differs, and writes nothing into the site', async () => {
    const bucket = new FakeBucket();
    const key = mediaKey('0.3.0', 'hero', hash8(MP4), 'hero.mp4');
    bucket.objects.set(key, { bytes: 1, type: 'video/mp4', body: new Uint8Array(1) });
    await expect(publish({ capture, site, bucket, log })).rejects.toThrow(
      /already in the bucket with 1 bytes of video\/mp4/,
    );
    expect(await siteFiles()).toEqual([]);
  });

  it('fails when an upload does not read back, and writes nothing into the site', async () => {
    const bucket = new FakeBucket();
    bucket.head = () => Promise.resolve(undefined);
    await expect(publish({ capture, site, bucket, log })).rejects.toThrow(/reads back as nothing/);
    expect(await siteFiles()).toEqual([]);
  });

  it('checks the capture and the site before the first upload', async () => {
    const bucket = new FakeBucket();
    await rm(path.join(capture, 'zoom.png'));
    const draft = JSON.parse(await readFile(path.join(capture, 'media.draft.json'), 'utf8')) as {
      stills: Record<string, string>;
    };
    delete draft.stills['zoom'];
    await writeFile(path.join(capture, 'media.draft.json'), JSON.stringify(draft));
    await expect(publish({ capture, site, bucket, log })).rejects.toThrow(
      /lacks zoom.*--scene zoom/,
    );

    await writeFile(
      path.join(capture, 'media.draft.json'),
      JSON.stringify({ ...draft, stills: { ...draft.stills, zoom: 'zoom.png' } }),
    );
    await writeFile(path.join(capture, 'zoom.png'), png(1280, 720));
    await expect(publish({ capture, site, bucket, log })).rejects.toThrow(/zoom.png is 1280 × 720/);

    await writeFile(path.join(capture, 'zoom.png'), png(2560, 1440));
    await writeFile(path.join(capture, 'hero.webm'), 'other bytes, other size');
    await expect(publish({ capture, site, bucket, log })).rejects.toThrow(/hero.webm has 23 bytes/);

    await writeFile(path.join(site, 'package.json'), JSON.stringify({ name: 'etch' }));
    await expect(publish({ capture, site, bucket, log })).rejects.toThrow(
      /not an etch-website checkout/,
    );
    expect(bucket.calls).toEqual([]);
    expect(await siteFiles()).toEqual([]);
  });

  it('refuses a draft whose version is not its folder', async () => {
    const other = path.join(root, 'out', 'v0.4.0');
    await mkdir(other);
    await writeFile(
      path.join(other, 'media.draft.json'),
      await readFile(path.join(capture, 'media.draft.json')),
    );
    await expect(publish({ capture: other, site, bucket: new FakeBucket(), log })).rejects.toThrow(
      /for Etch 0.3.0, not the folder v0.4.0/,
    );
  });
});

describe('credentials', () => {
  it('come from the two user environment variables and never appear in the error', () => {
    expect(
      credentials({
        [CREDENTIAL_VARIABLES.accessKeyId]: ' id ',
        [CREDENTIAL_VARIABLES.secretAccessKey]: 'secret',
      }),
    ).toEqual({ accessKeyId: 'id', secretAccessKey: 'secret' });
    expect(() => credentials({})).toThrow(
      'HAPPYDWARF_MEDIA_ACCESS_KEY_ID and HAPPYDWARF_MEDIA_SECRET_ACCESS_KEY',
    );
    expect(() => credentials({ [CREDENTIAL_VARIABLES.accessKeyId]: 'leaked-id' })).toThrow(
      /^(?!.*leaked-id).*HAPPYDWARF_MEDIA_SECRET_ACCESS_KEY/,
    );
  });
});

describe('R2 bucket', () => {
  /** An S3 client that records each command and answers with the next reply. */
  function client(...replies: unknown[]) {
    const sent: unknown[] = [];
    const fake = {
      send(command: unknown) {
        sent.push(command);
        const reply = replies.shift();
        return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
      },
    };
    return { sent, fake: fake as unknown as Pick<S3Client, 'send'> };
  }

  /** An AWS SDK service error with an HTTP status. */
  function serviceError(name: string, status: number): Error {
    return Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });
  }

  it('puts only a new key, immutable, with its type', async () => {
    const { sent, fake } = client({}, serviceError('PreconditionFailed', 412));
    const bucket = r2Bucket(fake);
    const body = new Uint8Array([1, 2, 3]);
    expect(await bucket.create('etch/v0.3.0/hero.01234567.webm', body, 'video/webm')).toBe(true);
    expect(await bucket.create('etch/v0.3.0/hero.01234567.webm', body, 'video/webm')).toBe(false);
    const [put] = sent;
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect((put as PutObjectCommand).input).toEqual({
      Bucket: 'happydwarf-media',
      Key: 'etch/v0.3.0/hero.01234567.webm',
      Body: body,
      ContentLength: 3,
      ContentType: 'video/webm',
      CacheControl: CACHE_CONTROL,
      IfNoneMatch: '*',
    });
    expect(CACHE_CONTROL).toBe('public, max-age=31536000, immutable');
  });

  it('reads a key back, and passes on errors that are not a refused put or a missing key', async () => {
    const { sent, fake } = client(
      { ContentLength: 3, ContentType: 'video/webm' },
      serviceError('NotFound', 404),
      serviceError('AccessDenied', 403),
      serviceError('AccessDenied', 403),
    );
    const bucket = r2Bucket(fake);
    expect(await bucket.head('k')).toEqual({ bytes: 3, type: 'video/webm' });
    expect(sent[0]).toBeInstanceOf(HeadObjectCommand);
    expect((sent[0] as HeadObjectCommand).input).toEqual({ Bucket: 'happydwarf-media', Key: 'k' });
    expect(await bucket.head('k')).toBeUndefined();
    await expect(bucket.head('k')).rejects.toThrow('AccessDenied');
    await expect(bucket.create('k', new Uint8Array(1), 'video/mp4')).rejects.toThrow(
      'AccessDenied',
    );
  });
});
