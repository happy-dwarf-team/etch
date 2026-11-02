import { describe, expect, it } from 'vitest';
import { pngSize } from '../src/capture.ts';
import { MEDIA_TYPES, workbenchSettings } from '../src/config.ts';
import { CLIPS } from '../src/clips.ts';
import { gfxcaptureArgs, h264Args, posterArgs, vp9Args } from '../src/ffmpeg.ts';
import { LIVE_CLIPS, windowedPdxSettings, windowedSettings } from '../src/live.ts';
import { CLIP_IDS, draftManifest, LIVE_CLIP_IDS, OFFLINE_CLIP_IDS } from '../src/manifest.ts';
import { checkPaint } from '../src/paint.ts';
import { proxyArgs, proxySize } from '../src/render.ts';
import { launchArgs, parseCursor } from '../src/workbench.ts';

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

  it('seeds the framing settings', () => {
    const settings = workbenchSettings(undefined);
    expect(settings).toMatchObject({
      'workbench.colorTheme': 'Default Dark Modern',
      'editor.fontSize': 16,
      'window.zoomLevel': 0,
      'editor.minimap.enabled': false,
      'breadcrumbs.enabled': false,
      'etch.previewResolution': '1280x720',
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
