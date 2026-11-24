import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MEDIA_TYPES, workbenchSettings } from '../src/config.ts';
import { HERO_CHAPTERS, heroPosterAt, pngSize } from '../src/capture.ts';
import { CLIPS, HERO_OPEN, heroEdit } from '../src/clips.ts';
import type { EditSpec } from '../src/edit.ts';
import { gfxcaptureArgs, h264Args, posterArgs, vp9Args } from '../src/ffmpeg.ts';
import { LIVE_CLIPS, windowedPdxSettings, windowedSettings } from '../src/live.ts';
import { CLIP_IDS, draftManifest, LIVE_CLIP_IDS, OFFLINE_CLIP_IDS } from '../src/manifest.ts';
import { checkPaint } from '../src/paint.ts';
import { proxyArgs, proxySize } from '../src/render.ts';
import {
  launchArgs,
  newRunFolder,
  ORPHAN_AGE_MS,
  parseCursor,
  removeLeftRuns,
  removeRunFolder,
  RUN_OWNER,
} from '../src/workbench.ts';

/** The value after `flag` in an argument list. */
function after(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
}

describe('clips', () => {
  it('shoots every clip id once: six offline takes, one live take for three, the hero cut from them', () => {
    expect(CLIPS.map((clip) => clip.id)).toEqual([...OFFLINE_CLIP_IDS]);
    expect(LIVE_CLIPS.map((clip) => clip.id)).toEqual([...LIVE_CLIP_IDS]);
    expect(['hero', ...OFFLINE_CLIP_IDS, ...LIVE_CLIP_IDS]).toEqual([...CLIP_IDS]);
  });

  it("cuts the hero's chapters from the open take and four loops, each starting on a frame", () => {
    expect(HERO_CHAPTERS.map(({ chapter }) => chapter)).toEqual([
      'open',
      'type',
      'mesh',
      'reload',
      'pick',
    ]);
    expect(CLIP_IDS).not.toContain(HERO_OPEN.id);
    const part = (id: string, length: number, core: { from: number; to: number }): EditSpec => ({
      id,
      sources: {},
      segments: [{ duration: length, panels: [], captions: [], highlights: [] }],
      core,
    });
    const hero = heroEdit({}, [
      { chapter: 'open', spec: part('open', 9, { from: 0.31, to: 6.62 }) },
      { chapter: 'type', spec: part('preview', 8, { from: 0.5, to: 5.017 }) },
      { chapter: 'pick', spec: { ...part('pick', 12, { from: 1, to: 11.9 }), loopFade: 0.4 } },
    ]);
    // 6.31 s is 189.3 frames, rendered as 189; 4.517 s, 135.51 frames, as 136.
    expect(hero.chapters).toEqual([
      { id: 'open', start: 0 },
      { id: 'type', start: 6.3 },
      { id: 'pick', start: 10.833 },
    ]);
    // The last part stops short of its own dissolve and runs on a dip, faded out.
    const durations = hero.segments.map((segment) => segment.duration);
    for (const [i, seconds] of [6.31, 4.517, 10.8].entries()) {
      expect(durations[i]).toBeCloseTo(seconds, 6);
    }
  });
});

describe('VS Code', () => {
  it('starts with an empty extensions folder at device scale 1, without --disable-extensions', () => {
    const args = launchArgs({
      workspace: 'W',
      file: 'W/interface/etch_demo.gui',
      extensionPath: 'E',
      userData: 'U',
      extensions: 'X',
    });
    expect(args.slice(0, 2)).toEqual(['W', 'W/interface/etch_demo.gui']);
    expect(args).toContain('--extensions-dir=X');
    expect(args).toContain('--extensionDevelopmentPath=E');
    expect(args).toContain('--force-device-scale-factor=1');
    expect(args).not.toContain('--disable-extensions');
  });

  it('gives each window its own run folder beside the shared download, and removes it', async () => {
    const work = await mkdtemp(path.join(tmpdir(), 'etch-work-'));
    try {
      await mkdir(path.join(work, 'vscode'));
      // The single run folder Etch kept before.
      await mkdir(path.join(work, 'run', 'user-data'), { recursive: true });
      const first = await newRunFolder(work);
      const second = await newRunFolder(work);
      expect(first).not.toBe(second);
      expect(path.dirname(first)).toBe(work);
      expect(path.basename(first)).toMatch(/^run-/);
      expect((await readdir(work)).sort()).toEqual(
        [path.basename(first), path.basename(second), 'vscode'].sort(),
      );
      await writeFile(path.join(first, 'settings.json'), '{}');
      await removeRunFolder(first);
      await removeRunFolder(second);
      expect(await readdir(work)).toEqual(['vscode']);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it('removes the run folders of runs that ended without closing, and no one else', async () => {
    const work = await mkdtemp(path.join(tmpdir(), 'etch-work-'));
    try {
      // This process's own run folder, which the next window must not take.
      const own = await newRunFolder(work);
      expect(JSON.parse(await readFile(path.join(own, RUN_OWNER), 'utf8'))).toEqual({
        pid: process.pid,
      });
      const folder = async (name: string, pid?: number): Promise<string> => {
        const run = path.join(work, name);
        await mkdir(path.join(run, 'user-data'), { recursive: true });
        if (pid !== undefined) await writeFile(path.join(run, RUN_OWNER), JSON.stringify({ pid }));
        return run;
      };
      const killed = await folder('run-killed', 1001);
      const running = await folder('run-running', 1002);
      const making = await folder('run-making');
      const old = await folder('run-old');
      const ancient = new Date(Date.now() - 2 * ORPHAN_AGE_MS);
      await utimes(old, ancient, ancient);
      await mkdir(path.join(work, 'vscode'));
      const alive = (pid: number): boolean => pid === 1002 || pid === process.pid;
      expect((await removeLeftRuns(work, alive)).sort()).toEqual([killed, old].sort());
      expect((await readdir(work)).sort()).toEqual(
        [path.basename(own), path.basename(running), path.basename(making), 'vscode'].sort(),
      );
      // A new window sweeps with the real check: a dead pid's folder goes, its own stays.
      await writeFile(path.join(running, RUN_OWNER), JSON.stringify({ pid: 2 ** 31 - 1 }));
      const next = await newRunFolder(work);
      expect((await readdir(work)).sort()).toEqual(
        [path.basename(own), path.basename(making), path.basename(next), 'vscode'].sort(),
      );
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it('seeds the framing settings', () => {
    const settings = workbenchSettings(undefined);
    expect(settings).toMatchObject({
      'workbench.colorTheme': 'Default Dark Modern',
      'editor.fontSize': 18,
      'window.zoomLevel': 0,
      'editor.minimap.enabled': false,
      'breadcrumbs.enabled': false,
      'files.encoding': 'windows1252',
      'etch.previewResolution': '1440x900',
    });
    expect(settings).not.toHaveProperty('etch.gamePath');
    expect(workbenchSettings('D:/EU4')).toHaveProperty(['etch.gamePath'], 'D:/EU4');
  });

  it("reads the cursor from the status bar's text", () => {
    expect(parseCursor('Ln 18, Col 30')).toEqual({ line: 18, column: 30 });
    expect(parseCursor('Ln 9, Col 23 (1 selected)')).toEqual({ line: 9, column: 23 });
    expect(parseCursor('Spaces: 4')).toBeUndefined();
  });
});

describe('paint results', () => {
  it('fails a result the scene does not declare', () => {
    expect(() => {
      checkPaint({ id: 3, result: 'ok' }, []);
    }).not.toThrow();
    expect(() => {
      checkPaint({ id: 3, result: 'problems' }, ['problems']);
    }).not.toThrow();
    expect(() => {
      checkPaint({ id: 3, result: 'problems' }, []);
    }).toThrow(/paint 3 ended "problems"/);
    expect(() => {
      checkPaint({ id: 4, result: 'failed' }, ['problems']);
    }).toThrow(/failed/);
  });
});

describe('FFmpeg', () => {
  it('records the window by its handle, without the pointer, losslessly', () => {
    const args = gfxcaptureArgs('4461430', 'm.mkv');
    expect(after(args, '-filter_complex')).toMatch(/^gfxcapture=hwnd=4461430:capture_cursor=0:/);
    expect(after(args, '-crf')).toBe('0');
    expect(args.at(-1)).toBe('m.mkv');
  });

  it('records the live scene against a shared clock, the game with its pointer', () => {
    const filter = after(
      gfxcaptureArgs('77', 'g.mkv', { cursor: true, epochUs: 1_700 }),
      '-filter_complex',
    );
    expect(filter).toMatch(/^gfxcapture=hwnd=77:capture_cursor=1:/);
    expect(filter).toContain(
      "setpts='st(0,if(eq(N,0),(RTCTIME-1700)/1000000/TB-PTS,ld(0)));PTS+ld(0)'",
    );
    expect(filter).toContain('fps=30:start_time=0');
    expect(after(gfxcaptureArgs('77', 'v.mkv'), '-filter_complex')).not.toContain('setpts');
  });

  it('proxies a master for the composition, an odd side repeated, the end padded', () => {
    const size = { width: 2560, height: 1439 };
    expect(proxySize(size)).toEqual({ width: 2560, height: 1440 });
    const filter = after(proxyArgs('m.mkv', 'p.mp4', size), '-vf') ?? '';
    expect(filter).toContain('pad=2560:1440:0:0');
    expect(filter).toContain('fillborders=right=0:bottom=1:mode=smear');
    expect(filter).toContain('tpad=stop_mode=clone');
    expect(after(proxyArgs('m.mkv', 'p.mp4', size), '-g')).toBe('15');
    expect(after(proxyArgs('g.mkv', 'p.mp4', { width: 2560, height: 1440 }), '-vf')).not.toContain(
      'fillborders',
    );
    expect(after(posterArgs('c.mov', 'reload.png'), '-frames:v')).toBe('1');
    expect(posterArgs('c.mov', 'reload.png')).not.toContain('-ss');
    expect(after(posterArgs('c.mov', 'hero.png', 6.9667), '-ss')).toBe('6.967');
    // The demo loop's poster: the last shot of its first chapter, half a second before the second.
    const chapters = [
      { id: 'open', start: 0 },
      { id: 'type', start: 7.467 },
    ];
    expect(heroPosterAt({ chapters })).toBeCloseTo(6.967, 3);
    expect(heroPosterAt({ chapters: [{ id: 'open', start: 0 }] })).toBeUndefined();
    expect(heroPosterAt({})).toBeUndefined();
  });

  it('encodes VP9 in two passes and H.264 with the spec settings, 1920 px wide, silent', () => {
    const [pass1, pass2] = vp9Args('cut.mkv', 'log', 'hero.webm');
    for (const pass of [pass1, pass2]) {
      expect(after(pass, '-c:v')).toBe('libvpx-vp9');
      expect(after(pass, '-crf')).toBe('34');
      expect(after(pass, '-tune-content')).toBe('screen');
      expect(after(pass, '-vf')).toContain('scale=1920:1080');
      expect(after(pass, '-vf')).toContain('yuv420p');
      expect(pass).toContain('-an');
    }
    expect(after(pass1, '-pass')).toBe('1');
    expect(after(pass2, '-pass')).toBe('2');
    expect(pass2.at(-1)).toBe('hero.webm');

    const h264 = h264Args('cut.mkv', 'hero.mp4');
    expect(after(h264, '-c:v')).toBe('libx264');
    expect(after(h264, '-preset')).toBe('veryslow');
    expect(after(h264, '-crf')).toBe('23');
    expect(after(h264, '-movflags')).toBe('+faststart');
    expect(after(h264, '-profile:v')).toBe('high');
    expect(after(h264, '-level:v')).toBe('4.0');
    expect(h264).toContain('-an');
  });
});

describe('live take', () => {
  const settings = [
    'graphics={',
    '\tsize={',
    '\t\tx=3440',
    '\t\ty=1440',
    '\t}',
    '\tgame_ui_scale=1.000',
    '\tfullScreen=no',
    '\tborderless=yes',
    '}',
  ].join('\n');
  const size = { width: 2560, height: 1440 };

  it("windows the player's settings at the scene's resolution, keeping the rest", () => {
    const windowed = windowedSettings(settings, size);
    expect(windowed).toContain('x=2560');
    expect(windowed).toContain('y=1440');
    expect(windowed).toContain('borderless=no');
    expect(windowed).toContain('game_ui_scale=1.000');
    expect(() => windowedSettings(settings.replace('1.000', '1.250'), size)).toThrow(
      /game_ui_scale is 1.250/,
    );
    const pdx = [
      '"Graphics"={',
      '\t"display_mode"={',
      '\t\tvalue="borderless_fullscreen"',
      '\t}',
      '\t"windowed_resolution"={',
      '\t\tvalue="3440x1440"',
      '\t}',
      '}',
    ].join('\n');
    const windowedPdx = windowedPdxSettings(pdx, size);
    expect(windowedPdx).toContain('value="windowed"');
    expect(windowedPdx).toContain('value="2560x1440"');
    expect(() => windowedPdxSettings('"Graphics"={}', size)).toThrow(/no display_mode/);
  });
});

describe('draft manifest', () => {
  it('lists the loops captured, in the spec order, with file facts only', () => {
    const loop = { width: 1920, height: 1080, duration: 10.63321, webmBytes: 1, mp4Bytes: 2 };
    const manifest = draftManifest('0.1.0', { pick: loop, hero: loop });
    expect(Object.keys(manifest.loops)).toEqual(['hero', 'pick']);
    expect({ ...manifest, loops: { hero: manifest.loops.hero } }).toEqual({
      schemaVersion: 2,
      draft: true,
      etch: '0.1.0',
      loops: {
        hero: {
          width: 1920,
          height: 1080,
          duration: 10.633,
          poster: 'hero.png',
          sources: [
            { file: 'hero.webm', type: MEDIA_TYPES.webm, bytes: 1 },
            { file: 'hero.mp4', type: MEDIA_TYPES.mp4, bytes: 2 },
          ],
        },
      },
    });
    const chapters = [
      { id: 'open', start: 0 },
      { id: 'type', start: 6.4 },
    ];
    const chaptered = draftManifest('0.1.0', { hero: { ...loop, chapters }, pick: loop });
    expect(chaptered.loops.hero?.chapters).toEqual(chapters);
    expect(chaptered.loops.pick).not.toHaveProperty('chapters');
    expect(MEDIA_TYPES).toEqual({
      webm: 'video/webm; codecs="vp9"',
      mp4: 'video/mp4; codecs="avc1.640028"',
    });
  });
});

describe('posters', () => {
  it("reads a PNG's size from its header", () => {
    const header = new Uint8Array(24);
    header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    header.set([0x49, 0x48, 0x44, 0x52], 12);
    const view = new DataView(header.buffer);
    view.setUint32(16, 2560);
    view.setUint32(20, 1440);
    expect(pngSize(header)).toEqual({ width: 2560, height: 1440 });
    expect(() => pngSize(new Uint8Array(24))).toThrow('not a PNG');
  });
});
