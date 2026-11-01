import { describe, expect, it } from 'vitest';
import { pngSize } from '../src/capture.ts';
import { MEDIA_TYPES, workbenchSettings } from '../src/config.ts';
import {
  cutArgs,
  firstChangeArgs,
  gfxcaptureArgs,
  h264Args,
  parseFirstChange,
  vp9Args,
} from '../src/ffmpeg.ts';
import { draftManifest, LOOP_IDS, STILL_IDS } from '../src/manifest.ts';
import { checkPaint } from '../src/paint.ts';
import { SCENES, scenesFor } from '../src/scenes.ts';
import { launchArgs, parseCursor } from '../src/workbench.ts';

/** The value after `flag` in an argument list. */
function after(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
}

describe('scenes', () => {
  it('writes every scene id once, the preview still from the hero run', () => {
    const written = SCENES.flatMap((scene) => scene.writes);
    expect([...written].sort()).toEqual([...LOOP_IDS, ...STILL_IDS].sort());
    expect(scenesFor(['preview']).map((scene) => scene.id)).toEqual(['hero']);
    expect(scenesFor(['zoom', 'hero']).map((scene) => scene.id)).toEqual(['hero', 'zoom']);
    expect(SCENES.filter((scene) => scene.loop).map((scene) => scene.id)).toEqual(['hero']);
  });
});

describe('VS Code', () => {
  it('starts with an empty extensions folder at device scale 2, without --disable-extensions', () => {
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
    expect(args).toContain('--force-device-scale-factor=2');
    expect(args).not.toContain('--disable-extensions');
  });

  it('seeds the framing settings', () => {
    const settings = workbenchSettings(undefined);
    expect(settings).toMatchObject({
      'workbench.colorTheme': 'Default Dark Modern',
      'editor.fontSize': 18,
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

  it('finds the first change of a master', () => {
    expect(after(firstChangeArgs('m.mkv'), '-vf')).toMatch(/^freezedetect=/);
    const log = [
      '[Parsed_freezedetect_0 @ 0] lavfi.freezedetect.freeze_start: 0',
      '[Parsed_freezedetect_0 @ 0] lavfi.freezedetect.freeze_end: 4.967',
      '[Parsed_freezedetect_0 @ 0] lavfi.freezedetect.freeze_end: 8.067',
    ].join('\n');
    expect(parseFirstChange(log)).toBe(4.967);
    expect(parseFirstChange('no freezes')).toBeUndefined();
  });

  it('cuts a 2560 × 1440 loop at 30 fps, padding the last frame', () => {
    const args = cutArgs('m.mkv', 3.5, 10.25, 'cut.mkv');
    expect(after(args, '-ss')).toBe('3.500');
    expect(after(args, '-t')).toBe('10.250');
    const filter = after(args, '-filter_complex') ?? '';
    expect(filter).toContain('crop=2560:1439:0:0');
    expect(filter).toContain('vstack');
    expect(filter).toContain('fps=30');
    expect(filter).toContain('tpad=stop_mode=clone');
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

describe('draft manifest', () => {
  it('lists the loops and stills captured, in the spec order, with file facts only', () => {
    const manifest = draftManifest(
      '0.1.0',
      { hero: { width: 1920, height: 1080, duration: 10.63321, webmBytes: 1, mp4Bytes: 2 } },
      ['problems', 'preview'],
    );
    expect(manifest).toEqual({
      schemaVersion: 1,
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
      stills: { preview: 'preview.png', problems: 'problems.png' },
    });
    expect(Object.keys(manifest.stills)).toEqual(['preview', 'problems']);
    expect(MEDIA_TYPES).toEqual({
      webm: 'video/webm; codecs="vp9"',
      mp4: 'video/mp4; codecs="avc1.640028"',
    });
  });
});

describe('stills', () => {
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
