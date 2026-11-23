import { describe, expect, it } from 'vitest';
import { zoomKey } from '../webview/zoom.ts';

function key(code: string, modifiers: { shift?: boolean; alt?: boolean; meta?: boolean } = {}) {
  return {
    ctrlKey: true,
    altKey: modifiers.alt ?? false,
    metaKey: modifiers.meta ?? false,
    shiftKey: modifiers.shift ?? false,
    code,
  };
}

describe('zoomKey', () => {
  it('reads the same zoom keys in every preview', () => {
    expect(zoomKey(key('Equal'))).toBe('zoomIn');
    expect(zoomKey(key('NumpadAdd'))).toBe('zoomIn');
    expect(zoomKey(key('Minus'))).toBe('zoomOut');
    expect(zoomKey(key('NumpadSubtract'))).toBe('zoomOut');
    expect(zoomKey(key('Digit0'))).toBe('actualSize');
    expect(zoomKey(key('Numpad0'))).toBe('actualSize');
    expect(zoomKey(key('Digit0', { shift: true }))).toBe('fit');
    expect(zoomKey(key('Numpad0', { shift: true }))).toBe('fit');
  });

  it('reads the key, not the character, so Shift does not change + and -', () => {
    expect(zoomKey(key('Equal', { shift: true }))).toBe('zoomIn');
    expect(zoomKey(key('Minus', { shift: true }))).toBe('zoomOut');
  });

  it('leaves other keys and other modifiers to VS Code', () => {
    expect(zoomKey({ ...key('Equal'), ctrlKey: false })).toBeUndefined();
    expect(zoomKey(key('Equal', { alt: true }))).toBeUndefined();
    expect(zoomKey(key('Digit0', { meta: true }))).toBeUndefined();
    expect(zoomKey(key('KeyW'))).toBeUndefined();
    expect(zoomKey(key('Digit1'))).toBeUndefined();
  });
});
