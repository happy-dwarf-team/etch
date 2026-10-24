import { describe, expect, it } from 'vitest';
import {
  backdropFiles,
  decodeGameText,
  isPreviewCopyFile,
  parseScript,
  previewCopyPath,
  readGuiFile,
  writePreviewCopy,
  type PreviewCopyRequest,
} from '../src/index.ts';

const screen = { width: 1920, height: 1080 };

const source = [
  'guiTypes = {',
  '\twindowType = {',
  '\t\tname = "goto_box"',
  '\t\tbackGround = "goto_box"',
  '\t\tposition = { x = 165 y = 215 }',
  '\t\tguiButtonType = {',
  '\t\t\tname = "goto_box"',
  '\t\t\tspriteType = "GFX_goto_bg"',
  '\t\t\ttooltip = "goto_tip"',
  '\t\t}',
  '\t\tlistboxType = {',
  '\t\t\tname = "list"',
  '\t\t\tscrollbartype = "own_scrollbar"',
  '\t\t}',
  '\t\tsmoothListboxType = {',
  '\t\t\tname = "other_list"',
  '\t\t\tscrollbartype = "standardlistbox_slider"',
  '\t\t}',
  '\t\tinstantTextBoxType = {',
  '\t\t\tname = "title"',
  '\t\t\ttext = "Own_scrollbar"',
  '\t\t\tif_resolution = { min_width = 1900 scrollbartype = own_scrollbar }',
  '\t\t}',
  '\t}',
  '\tscrollbarType = {',
  '\t\tname = "own_scrollbar"',
  '\t\tslider = "Slider"',
  '\t\tguiButtonType = { name = "Slider" parent = "own_scrollbar_track" }',
  '\t}',
  '\ttextBoxType = { name = "goto_tip" }',
  '\tpositionType = { name = "goto_pos" position = { x = 1 y = 2 } }',
  '}',
  '',
].join('\r\n');

const request = (over: Partial<PreviewCopyRequest> = {}): PreviewCopyRequest => ({
  path: 'interface/goto.gui',
  text: source,
  window: 'goto_box',
  screen,
  ...over,
});

const names = (text: string): string[] =>
  readGuiFile(parseScript(text)).definitions.map((d) => d.name ?? '');

describe('writePreviewCopy', () => {
  const copy = writePreviewCopy(request());
  const [black, white] = copy.files ?? [];

  it('writes a black and a white copy into the overlay mod', () => {
    expect(copy.diagnostics).toEqual([]);
    expect(black).toMatchObject({
      colour: 'black',
      path: 'interface/etch_goto.gui',
      fileName: 'etch_goto.gui',
      wrapper: 'etch_goto_box_backdrop',
      window: 'etch_goto_box',
    });
    expect(white).toMatchObject({
      colour: 'white',
      path: 'interface/etchw_goto.gui',
      wrapper: 'etchw_goto_box_backdrop',
      window: 'etchw_goto_box',
    });
  });

  it('prefixes every top-level name and wraps the window', () => {
    expect(names(black?.text ?? '')).toEqual([
      'etch_goto_box_backdrop',
      'etch_own_scrollbar',
      'etch_goto_tip',
      'etch_goto_pos',
    ]);
    const file = readGuiFile(parseScript(black?.text ?? ''));
    expect(file.diagnostics).toEqual([]);
    const wrapper = file.definitions[0];
    expect(wrapper?.children.map((c) => `${c.kind} ${c.name ?? ''}`)).toEqual([
      'iconType etch_backdrop_fill',
      'windowType etch_goto_box',
    ]);
    expect(black?.text).toContain('spriteType = "GFX_etch_backdrop_black"');
    expect(white?.text).toContain('spriteType = "GFX_etch_backdrop_white"');
    expect(black?.text).toContain('size = { x = 1920 y = 1080 }');
  });

  it('keeps the original byte for byte around the window, apart from the names', () => {
    const wrapped = black?.text ?? '';
    const start = wrapped.indexOf('windowType = {', wrapped.indexOf('etch_backdrop_fill'));
    const inner = source.slice(source.indexOf('windowType'), source.indexOf('\tscrollbarType'));
    const expected = inner
      .replace('name = "goto_box"', 'name = "etch_goto_box"')
      .replace('"goto_tip"', '"etch_goto_tip"')
      .replace('"own_scrollbar"', '"etch_own_scrollbar"')
      .replace('= own_scrollbar }', '= etch_own_scrollbar }');
    expect(wrapped.slice(start, start + expected.length)).toBe(expected);
    const tail = wrapped.indexOf('\r\n\t}\r\n\tscrollbarType');
    const unwrap =
      wrapped.slice(0, wrapped.indexOf('windowType = {')) +
      wrapped.slice(start, tail) +
      wrapped.slice(tail + '\r\n\t}'.length);
    expect(unwrap.replaceAll('etch_', '')).toBe(source);
  });

  it('rewrites same-file registry references and nothing that only reads like one', () => {
    const text = black?.text ?? '';
    // Nested names, the window's background, scroll bar parts and nested parent stay.
    expect(text).toContain('\t\t\tname = "goto_box"');
    expect(text).toContain('backGround = "goto_box"');
    expect(text).toContain('slider = "Slider"');
    expect(text).toContain('parent = "own_scrollbar_track"');
    // A text that equals a top-level name is not a reference.
    expect(text).toContain('text = "Own_scrollbar"');
    // Another file's scroll bar stays.
    expect(text).toContain('scrollbartype = "standardlistbox_slider"');
    // A button tooltip naming a text box type of the file is.
    expect(text).toContain('tooltip = "etch_goto_tip"');
    expect(white?.text).toContain('tooltip = "etchw_goto_tip"');
  });

  it('encodes the copy as Windows-1252 and keeps a byte order mark', () => {
    const bytes = Uint8Array.from([
      ...Array.from('guiTypes = { windowType = { name = "w" text = "', (c) => c.charCodeAt(0)),
      0xe9,
      0x80,
      0x81,
      ...Array.from('" } }', (c) => c.charCodeAt(0)),
    ]);
    const { text } = decodeGameText(bytes, 'interface');
    const out = writePreviewCopy(request({ text, window: 'W', bom: true })).files?.[0];
    const body = out?.bytes.subarray(3) ?? new Uint8Array();
    expect([...(out?.bytes.subarray(0, 3) ?? [])]).toEqual([0xef, 0xbb, 0xbf]);
    expect(decodeGameText(body, 'interface').text).toBe(out?.text);
    const at = body.indexOf(0xe9);
    expect([...body.subarray(at, at + 3)]).toEqual([0xe9, 0x80, 0x81]);
    expect(out?.text).not.toContain('\r\n');
  });

  it('prefixes a top-level parent and every name of a block', () => {
    const text =
      'guiTypes = { windowType = { name = "a" name = "b" parent = "base" } windowType = { name = base } }';
    const out = writePreviewCopy(request({ text, window: 'B' }));
    expect(out.files?.[0].window).toBe('etch_b');
    expect(out.files?.[0].text).toContain('name = "etch_a" name = "etch_b" parent = "etch_base"');
    expect(out.files?.[0].text).toContain('windowType = { name = etch_base }');
    expect(out.diagnostics.map((d) => d.code)).toEqual(['wrapped-parent']);
  });

  it('leaves out a second definition of a name and the default sounds', () => {
    const text = [
      'default_clicksound = "click"',
      'guiTypes = {',
      '\twindowType = { name = "w" }',
      '\ticonType = { name = "dup" }',
      '}',
      'guiTypes = { iconType = { name = "DUP" } }',
    ].join('\n');
    const out = writePreviewCopy(request({ text, window: 'w' }));
    const copyText = out.files?.[0].text ?? '';
    expect(names(copyText)).toEqual(['etch_w_backdrop', 'etch_dup']);
    expect(copyText).not.toContain('default_clicksound');
    expect(copyText).toContain('guiTypes = {  }');
    expect(out.diagnostics.map((d) => [d.severity, d.code, text.slice(d.start, d.end)])).toEqual([
      ['information', 'copy-leaves-out', 'default_clicksound = "click"'],
      ['warning', 'copy-leaves-out', '"DUP"'],
    ]);
  });

  it('refuses kinds window open cannot show, missing windows and broken blocks', () => {
    const codes = (r: Partial<PreviewCopyRequest>) => {
      const out = writePreviewCopy(request(r));
      expect(out.files).toBeUndefined();
      return out.diagnostics.map((d) => d.code);
    };
    expect(codes({ window: 'goto_pos' })).toEqual(['game-host-window-kind']);
    expect(codes({ window: 'own_scrollbar' })).toEqual(['game-host-window-kind']);
    expect(codes({ window: 'nothing' })).toEqual(['not-previewable']);
    expect(codes({ path: 'common/goto.gui' })).toEqual(['not-previewable']);
    expect(codes({ text: 'guiTypes = { windowType = { name = "w"', window: 'w' })).toEqual([
      'not-previewable',
    ]);
  });

  it('opens eu3dialogtype windows', () => {
    const out = writePreviewCopy(
      request({ text: 'guiTypes = { eu3dialogtype = { name = "dlg" } }', window: 'dlg' }),
    );
    expect(out.files?.[1].wrapper).toBe('etchw_dlg_backdrop');
  });

  it('refuses names the file or the playset already defines', () => {
    const text = 'guiTypes = { windowType = { name = "w" } windowType = { name = "w_backdrop" } }';
    expect(writePreviewCopy(request({ text, window: 'w' })).diagnostics[0]?.code).toBe(
      'copy-name-taken',
    );
    const taken = writePreviewCopy(
      request({ isTopLevelName: (n) => n.toLowerCase() === 'etchw_goto_pos' }),
    );
    expect(taken.files).toBeUndefined();
    expect(taken.diagnostics[0]?.message).toContain('etchw_goto_pos');
  });

  it('scales the backdrop to cover screens larger than the verified one', () => {
    const big = writePreviewCopy(request({ screen: { width: 5120, height: 2160 } }));
    expect(big.files?.[0].text).toContain('scale = 161');
    expect(black?.text).toContain('scale = 120');
  });
});

describe('preview copy files', () => {
  it('flattens subfolders into the copy name', () => {
    expect(previewCopyPath('interface/government_mechanics/militarization.gui', 'black')).toBe(
      'interface/etch_government_mechanics__militarization.gui',
    );
    expect(previewCopyPath('mod\\x\\Interface\\topbar.gui', 'white')).toBe(
      'interface/etchw_topbar.gui',
    );
    expect(previewCopyPath('interface/topbar.gfx', 'black')).toBeUndefined();
  });

  it('recognises copies to clear before a start, and not the backdrop', () => {
    expect(isPreviewCopyFile('etch_goto.gui')).toBe(true);
    expect(isPreviewCopyFile('ETCHW_goto.gui')).toBe(true);
    expect(isPreviewCopyFile('etch_backdrop.gfx')).toBe(false);
    expect(isPreviewCopyFile('goto.gui')).toBe(false);
  });

  it('ships the backdrop sprites and their opaque textures', () => {
    const files = backdropFiles();
    expect(files.map((f) => f.path)).toEqual([
      'interface/etch_backdrop.gfx',
      'gfx/interface/etch_backdrop_black.tga',
      'gfx/interface/etch_backdrop_white.tga',
    ]);
    const gfx = new TextDecoder().decode(files[0]?.bytes);
    expect(gfx).toContain('name = "GFX_etch_backdrop_white"');
    expect(gfx).toContain('texturefile = "gfx/interface/etch_backdrop_white.tga"');
    const white = files[2]?.bytes ?? new Uint8Array();
    expect(white.length).toBe(18 + 32 * 32 * 4);
    expect([...white.subarray(12, 18)]).toEqual([32, 0, 32, 0, 32, 0x28]);
    expect([...white.subarray(18, 22)]).toEqual([255, 255, 255, 255]);
    expect([...(files[1]?.bytes.subarray(-4) ?? [])]).toEqual([0, 0, 0, 255]);
  });
});
