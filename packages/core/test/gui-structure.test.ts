import { describe, expect, it } from 'vitest';
import {
  GUI_ROOT,
  GUI_SCHEMAS,
  guiStructureDiagnostics,
  parseScript,
  readGuiFile,
} from '../src/index.ts';

function check(text: string): [string, string][] {
  const found = guiStructureDiagnostics(readGuiFile(parseScript(text)));
  expect(found.every((d) => d.severity === 'warning')).toBe(true);
  return found.map((d) => [d.code, text.slice(d.start, d.end)]);
}

describe('the table of keys EU4 1.37.5 reads', () => {
  it('holds every widget, its keys and its children', () => {
    expect(Object.keys(GUI_ROOT)).toHaveLength(20);
    expect(Object.keys(GUI_SCHEMAS)).toHaveLength(22);
    const keys = Object.values(GUI_SCHEMAS).reduce((n, s) => n + Object.keys(s.keys).length, 0);
    expect(keys).toBe(434);
    for (const schema of Object.values(GUI_SCHEMAS)) {
      for (const child of Object.values(schema.children)) expect(GUI_SCHEMAS[child]).toBeDefined();
    }
  });

  it('keeps the facts checked against the game', () => {
    expect(GUI_SCHEMAS.containerWindow.children).toHaveProperty('buttontype');
    expect(GUI_SCHEMAS.containerWindow.children).not.toHaveProperty('guiButtonType');
    expect(GUI_SCHEMAS.window.children).toHaveProperty('guiButtonType');
    expect(GUI_SCHEMAS.window.children).not.toHaveProperty('buttontype');
    expect(GUI_SCHEMAS.containerWindow.keys['orientation']).toBe('containerOrientation');
    expect(GUI_SCHEMAS.listBox.keys['spacing']).toBe('int');
    expect(GUI_SCHEMAS.icon.ignored).toEqual(['text', 'font', 'buttonText', 'buttonFont']);
    expect(GUI_SCHEMAS.instantTextBox.ignored).toEqual(['size']);
  });
});

describe('guiStructureDiagnostics', () => {
  it('finds nothing in keys the game reads, in any case', () => {
    expect(
      check(`@w = 10
guiTypes = {
  windowType = {
    name = "w" Orientation = "upper_right" backGround = "bg" movable = 0
    position = { x = @w y = -3 } size = { x = 100 y = 50 }
    listboxType = { name = "l" spacing = 2 Spacing = 1.0 borderSize = { x = 0 y = 0 } }
    iconType = { name = "i" spriteType = "GFX_a" alwaysTransparent = yes tint = { 1 1 1 0.5 } }
    if_resolution = { min_width = 1920 name = "w2" iconType = { name = "r" } }
  }
  containerWindowType = {
    name = "c" orientation = CENTER_DOWN
    position = { x = -50% y = auto step = { x = 1 y = 2 } }
    size = { width = 100% height = @undefined }
    buttonType = { name = "b" }
    background = { name = "bg" quadTextureSprite = "GFX_tiles" }
  }
}`),
    ).toEqual([]);
  });

  it('reports keys and child widgets the game does not read there', () => {
    expect(
      check(`guiTypes = {
  fooType = { name = "x" }
  checkboxType = { name = "c" }
  containerWindowType = { name = "c" guiButtonType = { name = "b" } sacle = 2 }
  iconType = { name = "i" position = { x = 0 z = 1 } }
}`),
    ).toEqual([
      ['unknown-key', 'fooType'],
      ['unknown-key', 'checkboxType'],
      ['unknown-key', 'guiButtonType'],
      ['unknown-key', 'sacle'],
      ['unknown-key', 'z'],
    ]);
    const [button] = guiStructureDiagnostics(
      readGuiFile(parseScript('guiTypes = { containerWindowType = { guiButtonType = { } } }')),
    );
    expect(button?.message).toContain('It takes buttontype for this widget here.');
  });

  it('reports the keys an icon and an instant text box only log', () => {
    expect(
      check(`guiTypes = {
  iconType = { name = "i" text = "T" buttonFont = "vic_18" }
  instantTextBoxType = { name = "t" size = { x = 1 y = 1 } }
}`),
    ).toEqual([
      ['ignored-key', 'text'],
      ['ignored-key', 'buttonFont'],
      ['ignored-key', 'size'],
    ]);
  });

  it('reports orientations outside the anchors, also those a container does not take', () => {
    expect(
      check(`guiTypes = { windowType = { name = "w" orientation = LEFT
  iconType = { name = "i" Orientation = "UPPERL_LEFT" }
  gridboxtype = { name = "g" format = UPPER_LEFT }
}
  containerWindowType = { name = "c" origo = center_left }
}`),
    ).toEqual([
      ['unknown-orientation', 'LEFT'],
      ['unknown-orientation', '"UPPERL_LEFT"'],
      ['unknown-orientation', 'center_left'],
    ]);
  });

  it('reports fractions where the game reads an integer, and values of the wrong kind', () => {
    const found = guiStructureDiagnostics(
      readGuiFile(
        parseScript(`guiTypes = { listboxType = { name = "l" spacing = 2.5
  position = 3 alwaystransparent = maybe priority = high
  format = middle borderSize = { x = 1.5 y = 0 } tint = { 1 a }
  name = { } } }`),
      ),
    );
    expect(found.map((d) => d.code)).toEqual([
      'fraction-as-int',
      'wrong-value-kind',
      'wrong-value-kind',
      'wrong-value-kind',
      'unknown-key',
      'fraction-as-int',
      'wrong-value-kind',
      'wrong-value-kind',
    ]);
    expect(found[0]?.message).toBe('The game reads spacing as an integer: 2.5 is read as 2.');
  });
});
