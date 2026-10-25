// The game-side builds the VSIX carries (ADR 0003, ADR 0004, etch#46): the pin file
// pins/game-builds.json, the release archives it pins, the files taken from them, their licences,
// and the THIRD-PARTY-NOTICES.md and game/manifest.json that packaging writes. pins/README.md
// describes the format. Only build scripts and tests use this; it is not bundled.
import { createHash } from 'node:crypto';
import { crc32, inflateRawSync } from 'node:zlib';
import { Checker, ID, SHA256, field, type CorpusProblem } from '@etch/core/corpus';

export const PINS_FORMAT_VERSION = 1;

/** The licences anything inside the VSIX may have (ADR 0004). */
export const ALLOWED_LICENSES = [
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BSL-1.0',
] as const;
export type AllowedLicense = (typeof ALLOWED_LICENSES)[number];

export interface GameBuildPins {
  readonly formatVersion: typeof PINS_FORMAT_VERSION;
  /** The only game build the game host starts (ADR 0003). */
  readonly game: { readonly version: string; readonly exeSha256: string };
  readonly builds: readonly PinnedBuild[];
}

export interface PinnedBuild {
  /** Lowercase id, also the `build` of its files in game/manifest.json. */
  readonly id: string;
  readonly name: string;
  /** The release tag, `vX.Y.Z`. */
  readonly tag: string;
  /** The release asset, a zip on the team's GitHub releases. */
  readonly url: string;
  /** Uppercase SHA-256 of the asset. */
  readonly sha256: string;
  /** Folder of the game folder the archive's paths go under, ending in `/`; none for the game folder. */
  readonly into?: string;
  /** Archive paths taken unchanged; one ending in `/` takes every file under it. */
  readonly files: readonly string[];
  /** The build's own licence first, then each component compiled into it. */
  readonly licenses: readonly PinnedLicense[];
}

export interface PinnedLicense {
  readonly component: string;
  readonly spdx: AllowedLicense;
  /** The archive path of the licence text; it must be one of the files taken. */
  readonly file: string;
}

export interface PinsResult {
  readonly pins?: GameBuildPins;
  readonly problems: readonly CorpusProblem[];
}

const TAG = /^v\d+\.\d+\.\d+$/;
const RELEASE_URL =
  /^https:\/\/github\.com\/happy-dwarf-team\/([a-z0-9-]+)\/releases\/download\/(v\d+\.\d+\.\d+)\/[A-Za-z0-9._-]+\.zip$/;
const VERSION = /^\d+\.\d+\.\d+$/;

/** A relative `/`-separated path with no empty, `.` or `..` part. */
export function isSafePath(path: string): boolean {
  if (path === '' || path.includes('\\') || path.includes(':')) return false;
  const parts = path.replace(/\/$/, '').split('/');
  return parts.every((part) => part !== '' && part !== '.' && part !== '..');
}

/** Checks the pin file's JSON; every problem is reported with where it is. */
export function parsePins(value: unknown): PinsResult {
  const c = new Checker();
  const root = c.object(value, '', ['formatVersion', 'game', 'builds']);
  if (root === undefined) return { problems: c.problems };
  if (root['formatVersion'] !== PINS_FORMAT_VERSION) {
    c.fail('formatVersion', `Expected ${String(PINS_FORMAT_VERSION)}.`);
  }
  const gameJson = c.object(root['game'], 'game', ['version', 'exeSha256']);
  const game =
    gameJson === undefined
      ? undefined
      : {
          version: c.string(gameJson['version'], 'game.version', VERSION, 'a version x.y.z'),
          exeSha256: c.string(
            gameJson['exeSha256'],
            'game.exeSha256',
            SHA256,
            'an uppercase SHA-256',
          ),
        };
  const builds = c.array(root['builds'], 'builds', (v, at) => parseBuild(c, v, at), true);
  if (builds !== undefined) {
    c.unique(
      builds.map((b) => b.id),
      (i) => `builds[${String(i)}].id`,
      'build id',
    );
  }
  if (
    c.problems.length > 0 ||
    game?.version === undefined ||
    game.exeSha256 === undefined ||
    builds === undefined
  ) {
    return { problems: c.problems };
  }
  return {
    pins: {
      formatVersion: PINS_FORMAT_VERSION,
      game: { version: game.version, exeSha256: game.exeSha256 },
      builds,
    },
    problems: [],
  };
}

function parseBuild(c: Checker, value: unknown, at: string): PinnedBuild | undefined {
  const json = c.object(
    value,
    at,
    ['id', 'name', 'tag', 'url', 'sha256', 'files', 'licenses'],
    ['into'],
  );
  if (json === undefined) return undefined;
  const before = c.problems.length;
  const id = c.string(json['id'], field(at, 'id'), ID, 'a lowercase id');
  const name = c.string(json['name'], field(at, 'name'));
  const tag = c.string(json['tag'], field(at, 'tag'), TAG, 'a release tag vX.Y.Z');
  const url = c.string(
    json['url'],
    field(at, 'url'),
    RELEASE_URL,
    "a zip on a happy-dwarf-team repository's GitHub release",
  );
  const sha256 = c.string(json['sha256'], field(at, 'sha256'), SHA256, 'an uppercase SHA-256');
  const into =
    json['into'] === undefined
      ? undefined
      : c.string(json['into'], field(at, 'into'), /\/$/, 'a folder ending in /');
  if (into !== undefined && !isSafePath(into)) {
    c.fail(field(at, 'into'), `"${into}" is not a relative path inside the game folder.`);
  }
  const files = c.array(
    json['files'],
    field(at, 'files'),
    (v, fileAt) => {
      const path = c.string(v, fileAt);
      if (path !== undefined && !isSafePath(path)) {
        c.fail(fileAt, `"${path}" is not a relative archive path.`);
        return undefined;
      }
      return path;
    },
    true,
  );
  if (files !== undefined) c.unique(files, (i) => `${field(at, 'files')}[${String(i)}]`, 'path');
  const beforeLicenses = c.problems.length;
  const licenses = c.array(
    json['licenses'],
    field(at, 'licenses'),
    (v, licenseAt) => parseLicense(c, v, licenseAt),
    true,
  );
  const licensesRead = c.problems.length === beforeLicenses;
  const match = url === undefined ? null : RELEASE_URL.exec(url);
  if (match !== null && tag !== undefined && match[2] !== tag) {
    c.fail(field(at, 'url'), `The URL is of the release ${String(match[2])}, not ${tag}.`);
  }
  if (
    licensesRead &&
    licenses !== undefined &&
    name !== undefined &&
    licenses[0]?.component !== name
  ) {
    c.fail(field(at, 'licenses'), `The first licence must be ${name}'s own.`);
  }
  if (
    c.problems.length > before ||
    id === undefined ||
    name === undefined ||
    tag === undefined ||
    url === undefined ||
    sha256 === undefined ||
    files === undefined ||
    licenses === undefined
  ) {
    return undefined;
  }
  return { id, name, tag, url, sha256, ...(into === undefined ? {} : { into }), files, licenses };
}

function parseLicense(c: Checker, value: unknown, at: string): PinnedLicense | undefined {
  const json = c.object(value, at, ['component', 'spdx', 'file']);
  if (json === undefined) return undefined;
  const component = c.string(json['component'], field(at, 'component'));
  const spdx = c.oneOf(json['spdx'], field(at, 'spdx'), ALLOWED_LICENSES);
  const file = c.string(json['file'], field(at, 'file'));
  if (component === undefined || spdx === undefined || file === undefined) return undefined;
  return { component, spdx, file };
}

/** Uppercase hexadecimal SHA-256, as the pin file writes it. */
export function sha256Of(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex').toUpperCase();
}

/**
 * The files of a zip archive by path (directories left out). Reads stored and deflated entries
 * and checks each one's size and CRC-32; anything else (encryption, ZIP64, unsafe paths) throws.
 */
export function readZip(zip: Buffer): Map<string, Buffer> {
  const eocdMin = 22;
  let eocd = -1;
  for (let i = zip.length - eocdMin; i >= Math.max(0, zip.length - eocdMin - 0xffff); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip archive: no end of central directory');
  const count = zip.readUInt16LE(eocd + 10);
  let at = zip.readUInt32LE(eocd + 16);
  if (count === 0xffff || at === 0xffffffff) throw new Error('ZIP64 archives are not read');
  const files = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error('broken central directory');
    const flags = zip.readUInt16LE(at + 8);
    const method = zip.readUInt16LE(at + 10);
    const crc = zip.readUInt32LE(at + 16);
    const packedSize = zip.readUInt32LE(at + 20);
    const size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    if (!isSafePath(name)) throw new Error(`unsafe path in the archive: ${name}`);
    if ((flags & 1) !== 0) throw new Error(`encrypted entry: ${name}`);
    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error(`broken local header: ${name}`);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const packed = zip.subarray(start, start + packedSize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(packed);
    else if (method === 8) data = inflateRawSync(packed);
    else throw new Error(`compression method ${String(method)} is not read: ${name}`);
    if (data.length !== size || crc32(data) !== crc) throw new Error(`corrupt entry: ${name}`);
    if (files.has(name)) throw new Error(`duplicate entry: ${name}`);
    files.set(name, data);
  }
  return files;
}

/** One file of the game host install as the VSIX carries it under game/. */
export interface GameFile {
  /** Path relative to the game folder. */
  readonly path: string;
  readonly build: string;
  readonly data: Buffer;
}

/**
 * The archive's files a build takes, at their path in the game folder, and what is wrong: a file
 * entry that matches nothing, a licence file not taken, a licence text that is not its `spdx`, or
 * a licence-like file taken but not declared.
 */
export function takeFiles(
  build: PinnedBuild,
  archive: ReadonlyMap<string, Buffer>,
): { files: GameFile[]; problems: string[] } {
  const problems: string[] = [];
  const taken = new Map<string, Buffer>();
  for (const entry of build.files) {
    const matches = [...archive.keys()].filter((path) =>
      entry.endsWith('/') ? path.startsWith(entry) : path === entry,
    );
    if (matches.length === 0) problems.push(`${build.id}: "${entry}" is not in the archive`);
    for (const path of matches) taken.set(path, archive.get(path) ?? Buffer.alloc(0));
  }
  const declared = new Set(build.licenses.map((l) => l.file));
  for (const license of build.licenses) {
    const text = taken.get(license.file);
    if (text === undefined) {
      problems.push(`${build.id}: the licence file "${license.file}" is not taken`);
      continue;
    }
    const found = detectLicense(text.toString('utf8'));
    if (found !== license.spdx) {
      problems.push(
        `${build.id}: "${license.file}" reads as ${found ?? 'no allowed licence'}, not ${license.spdx}`,
      );
    }
  }
  for (const path of taken.keys()) {
    if (isLicenseFile(path) && !declared.has(path)) {
      problems.push(`${build.id}: "${path}" looks like a licence but is not in licenses`);
    }
  }
  const files = [...taken].map(([path, data]) => ({
    path: `${build.into ?? ''}${path}`,
    build: build.id,
    data,
  }));
  return { files, problems };
}

function isLicenseFile(path: string): boolean {
  const base = path.slice(path.lastIndexOf('/') + 1);
  return /licen[cs]e|copying|notice/i.test(base);
}

/** Which allowed licence a licence text is, by its fixed wording; undefined for any other. */
export function detectLicense(text: string): AllowedLicense | undefined {
  const t = text.replace(/\s+/g, ' ');
  if (t.includes('Boost Software License - Version 1.0')) return 'BSL-1.0';
  if (/Apache License,? Version 2\.0/.test(t)) return 'Apache-2.0';
  if (t.includes('Permission is hereby granted, free of charge, to any person obtaining a copy')) {
    return 'MIT';
  }
  if (t.includes('Redistribution and use in source and binary forms')) {
    return /Neither the name|names of its contributors/.test(t) ? 'BSD-3-Clause' : 'BSD-2-Clause';
  }
  return undefined;
}

/** Install paths that two files share, case-insensitively (the game host install is on NTFS). */
export function clashingPaths(files: readonly GameFile[]): string[] {
  const seen = new Map<string, string>();
  const clashes: string[] = [];
  for (const file of files) {
    const key = file.path.toLowerCase();
    const other = seen.get(key);
    if (other !== undefined) clashes.push(`${file.path} (${other} and ${file.build})`);
    else seen.set(key, file.build);
  }
  return clashes;
}

/** game/manifest.json: what the game host install gets and must keep (etch#48). */
export interface GameManifest {
  readonly formatVersion: typeof PINS_FORMAT_VERSION;
  readonly game: GameBuildPins['game'];
  readonly files: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly build: string;
  }[];
}

export function gameManifest(pins: GameBuildPins, files: readonly GameFile[]): GameManifest {
  return {
    formatVersion: PINS_FORMAT_VERSION,
    game: pins.game,
    files: [...files]
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map((f) => ({ path: f.path, sha256: sha256Of(f.data), build: f.build })),
  };
}

/** The game plugin's folder in the game host install. */
export const PLUGIN_FOLDER = 'anvil/plugins/etch/';

/** THIRD-PARTY-NOTICES.md at the VSIX root: every component inside the VSIX and its licence. */
export function renderNotices(
  pins: GameBuildPins,
  etchVersion: string,
  hasPlugin: boolean,
): string {
  const cell = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
  const rows = [
    `| Etch | ${etchVersion} | MIT | \`LICENSE\` | the extension (\`dist/\`, \`media/icon.png\`)${
      hasPlugin ? `, and the game plugin \`game/${PLUGIN_FOLDER}\`` : ''
    } |`,
  ];
  for (const build of pins.builds) {
    const version = build.tag.slice(1);
    const [own, ...parts] = build.licenses;
    if (own !== undefined) {
      rows.push(
        `| ${cell(own.component)} | ${version} | ${own.spdx} | \`game/${build.into ?? ''}${own.file}\` | ` +
          `pinned build, unchanged from <${build.url}> (SHA-256 \`${build.sha256}\`) |`,
      );
    }
    for (const part of parts) {
      rows.push(
        `| ${cell(part.component)} | | ${part.spdx} | \`game/${build.into ?? ''}${part.file}\` | ` +
          `compiled into ${cell(build.name)} ${version} |`,
      );
    }
  }
  return `# Third-party notices

This file lists every component inside the Etch VSIX and its licence
(ADR 0004). \`pnpm package\` writes it from \`pins/game-builds.json\`.

| Component | Version | Licence | Licence text in the VSIX | Notes |
| --------- | ------- | ------- | ------------------------ | ----- |
${rows.join('\n')}

The game-side builds under \`game/\` are copied byte for byte from their
releases; \`game/manifest.json\` lists each file with its SHA-256. The
extension's bundles contain no third-party code: Etch has no runtime
dependencies, and the build tools (esbuild, TypeScript, \`@vscode/vsce\`) are
not shipped. No game asset is packaged; Etch reads the game's files from the
user's own installation.
`;
}
