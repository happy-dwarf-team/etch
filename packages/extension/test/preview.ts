// The preview end to end in a real VS Code: a fixture game in a temp folder (an `eu4.exe` that is
// not the game, one `.gfx`, one `.gui`, a TGA texture, a BMFont and English localisation) with its
// own profile (`userdir.txt`, a player's `settings.txt`), opened through the command, drawn by the
// webview, followed through unsaved edits and laid out at each preview resolution.
import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { SpriteDraw, TextDraw } from '@etch/core';
import type { EtchApi } from '../src/extension.ts';
import {
  CHOOSE_RESOLUTION,
  RESOLUTION_SETTING,
  writeResolution,
  type PreviewApi,
  type PreviewPaint,
  type PreviewRender,
} from '../src/preview/index.ts';

const COLD_TIMEOUT_MS = 30_000;
const TIMEOUT_MS = 5_000;

/** An uncompressed 32-bit TGA, top-left origin, every texel the same BGRA. */
function tga(width: number, height: number, bgra: [number, number, number, number]): Uint8Array {
  const bytes = new Uint8Array(18 + width * height * 4);
  bytes[2] = 2;
  bytes[12] = width & 0xff;
  bytes[13] = width >> 8;
  bytes[14] = height & 0xff;
  bytes[15] = height >> 8;
  bytes[16] = 32;
  bytes[17] = 0x28;
  for (let i = 18; i < bytes.length; i += 4) bytes.set(bgra, i);
  return bytes;
}

// The glyphs of core's test font `tiny.fnt`: A, V, a and b among them.
const FONT = `info face="Etch Tiny" size=10 bold=0 italic=0 charset="ANSI" stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=1,1
common lineHeight=10 base=8 scaleW=64 scaleH=64 pages=1 packed=0
page id=0 file="etch_tiny.tga"
chars count=4
char id=65   x=0     y=0     width=6     height=8     xoffset=0     yoffset=1     xadvance=6     page=0  chnl=15
char id=86   x=7     y=0     width=6     height=8     xoffset=0     yoffset=1     xadvance=6     page=0  chnl=15
char id=97   x=14    y=0     width=4     height=6     xoffset=0     yoffset=3     xadvance=5     page=0  chnl=15
char id=98   x=19    y=0     width=4     height=8     xoffset=1     yoffset=1     xadvance=5     page=0  chnl=15
`;

const GFX = `spriteTypes = {
	spriteType = {
		name = "GFX_etch_box"
		texturefile = "gfx/interface/etch_box.tga"
	}
}
bitmapfonts = {
	bitmapfont = {
		name = "etch_font"
		path = "gfx/fonts/etch_tiny"
	}
}
`;

const GUI = `guiTypes = {
	windowType = {
		name = "etch_first"
		position = { x = 100 y = 50 }
		size = { x = 200 y = 100 }
		iconType = {
			name = "box"
			spriteType = "GFX_etch_box"
			position = { x = 10 y = 20 }
			if_resolution = { max_height = 768 position = { x = 40 y = 20 } }
		}
		instantTextBoxType = {
			name = "hello"
			position = { x = 0 y = 40 }
			font = "etch_font"
			text = "ETCH_HELLO"
			maxWidth = 100
			maxHeight = 20
		}
	}
	windowType = {
		name = "etch_second"
		iconType = {
			name = "missing"
			spriteType = "GFX_etch_missing"
		}
	}
}
`;

// The player's settings as the game writes them: the default preview resolution, and a UI scale
// the preview reports.
const SETTINGS = `language="l_english"
graphics={
	size={
		x=1600
		y=900
	}
	game_ui_scale=1.250
	fullScreen=no
}
`;

async function fixtureGame(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'etch-preview-'));
  const files: Record<string, string | Uint8Array> = {
    'eu4.exe': 'not the game',
    // The profile is the game's own `profile` folder, so the tests never read the player's.
    'userdir.txt': 'profile',
    'profile/settings.txt': SETTINGS,
    'interface/etch.gfx': GFX,
    'interface/etch.gui': GUI,
    'gfx/interface/etch_box.tga': tga(4, 4, [0, 0, 255, 255]),
    'gfx/fonts/etch_tiny.fnt': FONT,
    'gfx/fonts/etch_tiny.tga': tga(64, 64, [255, 255, 255, 255]),
    'localisation/etch_l_english.yml': '﻿l_english:\n ETCH_HELLO:0 "AV"\n',
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, ...name.split('/'));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return root;
}

/** The next event that satisfies a condition. */
function next<T>(event: vscode.Event<T>, done: (value: T) => boolean, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listener.dispose();
      reject(new Error(`no matching event in ${String(ms)} ms`));
    }, ms);
    const listener = event((value) => {
      if (!done(value)) return;
      clearTimeout(timer);
      listener.dispose();
      resolve(value);
    });
  });
}

/**
 * The next paint of a render that satisfies a condition. Renders made before the webview is ready
 * are not posted, so the paint is matched to the render that is current when it arrives.
 */
async function nextPaint(
  preview: PreviewApi,
  done: (render: PreviewRender) => boolean,
  action: () => Thenable<unknown> | undefined,
  ms = TIMEOUT_MS,
): Promise<{ render: PreviewRender; paint: PreviewPaint }> {
  let render: PreviewRender | undefined;
  const painted = next(
    preview.onDidPaint,
    (paint) => {
      const current = preview.current;
      if (current?.id !== paint.id || !done(current)) return false;
      render = current;
      return true;
    },
    ms,
  );
  await action();
  const paint = await painted;
  assert.ok(render);
  assert.equal(paint.error, undefined, `the webview drew ${render.window.name ?? ''}`);
  assert.equal(paint.painted, true);
  return { render, paint };
}

function sprites(render: PreviewRender): SpriteDraw[] {
  return render.drawList.draws.filter((d): d is SpriteDraw => d.kind === 'sprite');
}

function glyphCount(render: PreviewRender): number {
  const text = render.drawList.draws.filter((d): d is TextDraw => d.kind === 'text');
  return text.reduce((sum, d) => sum + d.glyphs.length / 7, 0);
}

async function replace(editor: vscode.TextEditor, from: string, to: string): Promise<void> {
  const text = editor.document.getText();
  const at = text.indexOf(from);
  assert.ok(at >= 0, `${from} is in ${editor.document.fileName}`);
  const range = new vscode.Range(
    editor.document.positionAt(at),
    editor.document.positionAt(at + from.length),
  );
  assert.ok(
    await editor.edit((edit) => {
      edit.replace(range, to);
    }),
  );
}

function moveCursor(editor: vscode.TextEditor, needle: string): void {
  const at = editor.document.positionAt(editor.document.getText().indexOf(needle));
  editor.selection = new vscode.Selection(at, at);
}

/** The preview resolution: the setting, `if_resolution` blocks, the monitor and the command. */
async function testResolution(preview: PreviewApi): Promise<void> {
  // A corpus resolution: the box's if_resolution block applies at heights up to 768.
  const small = await nextPaint(
    preview,
    (r) => r.drawList.width === 1280,
    () => writeResolution('1280x720'),
  );
  assert.equal(small.render.drawList.height, 720);
  assert.equal(sprites(small.render)[0]?.x, 140);
  assert.deepEqual(preview.resolution.source, 'setting');

  // The monitor's resolution, as the webview reported it.
  const native = preview.resolutionContext.native;
  assert.ok(native, 'the webview reports the monitor');
  const shown = await nextPaint(
    preview,
    (r) => r.drawList.width === native.width && r.drawList.height === native.height,
    () => writeResolution('native'),
  );
  assert.equal(preview.resolution.source, 'native');
  assert.equal(sprites(shown.render)[0]?.x, native.height <= 768 ? 140 : 130);

  // A custom size, then a value that is none: the default with a warning.
  await nextPaint(
    preview,
    (r) => r.drawList.width === 1000 && r.drawList.height === 700,
    () => writeResolution('1000 x 700'),
  );
  const settings = vscode.workspace.getConfiguration('etch');
  await nextPaint(
    preview,
    (r) => r.drawList.width === 1600,
    () => settings.update(RESOLUTION_SETTING, 'big', vscode.ConfigurationTarget.Global),
  );
  assert.ok(
    preview.notices.some((n) => n.severity === 'warning' && /previewResolution/.test(n.message)),
    JSON.stringify(preview.notices),
  );

  // The command: the first choice is the default, which removes the setting.
  await writeResolution('1366x768');
  await preview.idle();
  const chosen = vscode.commands.executeCommand<string | undefined>(CHOOSE_RESOLUTION);
  await new Promise((resolve) => setTimeout(resolve, 500));
  await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
  assert.equal(await chosen, 'default');
  assert.equal(settings.inspect(RESOLUTION_SETTING)?.globalValue, undefined);
  await preview.idle();
  assert.deepEqual(preview.resolution, {
    screen: { width: 1600, height: 900 },
    source: 'settings.txt',
  });
}

function previewTab(): vscode.Tab | undefined {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .find(
      (tab) =>
        tab.input instanceof vscode.TabInputWebview && tab.input.viewType.includes('etch.preview'),
    );
}

export async function testPreview(api: EtchApi): Promise<void> {
  const { preview, navigation } = api;
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('etch.openPreview'), 'the open command is registered');
  assert.ok(commands.includes('etch.togglePreviewPin'), 'the pin command is registered');

  const game = await fixtureGame();
  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', game, vscode.ConfigurationTarget.Global);
  try {
    const guiUri = vscode.Uri.file(path.join(game, 'interface', 'etch.gui'));
    const gui = await vscode.window.showTextDocument(guiUri, { viewColumn: vscode.ViewColumn.One });
    moveCursor(gui, 'name = "box"');

    // Cold open: the window holding the cursor, drawn over a transparent screen.
    const opened = performance.timeOrigin + performance.now();
    const cold = await nextPaint(
      preview,
      (r) => r.window.name === 'etch_first',
      () => vscode.commands.executeCommand('etch.openPreview'),
      COLD_TIMEOUT_MS,
    );
    console.log(`[etch] preview cold open: ${(cold.paint.at - opened).toFixed(0)} ms`);
    // The default preview resolution is the player's, and their UI scale gets a notice.
    assert.deepEqual(preview.resolution, {
      screen: { width: 1600, height: 900 },
      source: 'settings.txt',
    });
    assert.deepEqual([cold.render.drawList.width, cold.render.drawList.height], [1600, 900]);
    assert.ok(
      preview.notices.some((n) => n.severity === 'information' && /game_ui_scale/.test(n.message)),
      JSON.stringify(preview.notices),
    );
    const [box] = sprites(cold.render);
    assert.ok(box);
    assert.deepEqual([box.x, box.y, box.width, box.height], [110, 70, 4, 4]);
    assert.match(cold.render.drawList.textures[box.texture] ?? '', /etch_box\.tga$/);
    assert.equal(glyphCount(cold.render), 2, 'ETCH_HELLO shows its localised text AV');
    assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), guiUri.toString());

    const probed = await preview.probe([
      { x: 111, y: 71 },
      { x: 5, y: 5 },
    ]);
    assert.deepEqual(probed.pixels, [
      [255, 0, 0, 255],
      [0, 0, 0, 0],
    ]);

    // The outline shows the preview's window; hover and click go through its navigation (etch#37).
    assert.equal(navigation.previewed?.window.name, 'etch_first');
    assert.equal(
      preview.hover({ x: 111, y: 71 }),
      ['etch_first › box', 'iconType at 110, 70, 4 × 4'].join('\n'),
    );
    assert.equal(preview.hover(undefined), undefined);
    moveCursor(gui, 'name = "hello"');
    assert.equal(await preview.click({ x: 111, y: 71 }), true);
    assert.equal(gui.document.getText(gui.selection), 'iconType');

    // Warm reload from the unsaved buffer.
    const moved = await nextPaint(
      preview,
      (r) => sprites(r)[0]?.x === 130,
      () => replace(gui, 'x = 10 y = 20', 'x = 30 y = 20'),
    );
    console.log(
      `[etch] preview warm reload: ${(moved.paint.at - moved.render.requestedAt).toFixed(1)} ms`,
    );
    assert.equal(gui.document.isDirty, true);
    assert.equal(moved.render.window.name, 'etch_first');

    await testResolution(preview);

    // The cursor picks the window; the model's diagnostics reach the Problems panel.
    const second = await nextPaint(
      preview,
      (r) => r.window.name === 'etch_second',
      () => {
        moveCursor(gui, 'name = "missing"');
        return undefined;
      },
    );
    assert.equal(sprites(second.render).length, 0);
    const problems = vscode.languages.getDiagnostics(guiUri);
    const missing = problems.find((d) => d.code === 'missing-sprite');
    assert.ok(missing, JSON.stringify(problems));
    assert.equal(missing.source, 'Etch');
    assert.equal(gui.document.getText(missing.range), '"GFX_etch_missing"');

    // A pinned window stays while the cursor moves.
    preview.togglePin();
    await preview.idle();
    assert.equal(preview.current?.pinned, true);
    moveCursor(gui, 'name = "box"');
    await new Promise((resolve) => setTimeout(resolve, 200));
    await preview.idle();
    assert.equal(preview.current.window.name, 'etch_second');
    assert.equal(navigation.previewed.window.name, 'etch_second', 'the outline keeps the pin');
    const unpinned = await nextPaint(
      preview,
      (r) => r.window.name === 'etch_first',
      () => {
        preview.togglePin();
        return undefined;
      },
    );
    assert.equal(unpinned.render.pinned, false);

    // An unsaved localisation edit changes the text.
    const ymlUri = vscode.Uri.file(path.join(game, 'localisation', 'etch_l_english.yml'));
    const yml = await vscode.window.showTextDocument(ymlUri, {
      viewColumn: vscode.ViewColumn.One,
      preserveFocus: false,
    });
    const relocalised = await nextPaint(
      preview,
      (r) => glyphCount(r) === 4,
      () => replace(yml, '"AV"', '"AVab"'),
    );
    assert.equal(relocalised.render.window.name, 'etch_first', 'the last window stays');
    const reverted = await nextPaint(
      preview,
      (r) => glyphCount(r) === 2,
      () => vscode.commands.executeCommand('workbench.action.files.revert'),
    );
    assert.equal(reverted.render.window.name, 'etch_first');

    // Closing the preview removes its diagnostics.
    const tab = previewTab();
    assert.ok(tab, 'the preview is a tab');
    await vscode.window.tabGroups.close(tab);
    await preview.idle();
    assert.equal(preview.current, undefined);
    assert.equal(
      vscode.languages.getDiagnostics(guiUri).filter((d) => d.code === 'missing-sprite').length,
      0,
    );

    await vscode.window.showTextDocument(gui.document);
    await vscode.commands.executeCommand('workbench.action.files.revert');
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
    await settings.update(RESOLUTION_SETTING, undefined, vscode.ConfigurationTarget.Global);
  }
}
