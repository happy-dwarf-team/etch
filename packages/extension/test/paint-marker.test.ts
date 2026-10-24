import { describe, expect, it } from 'vitest';
import { markPaint, paintResult } from '../webview/paint-marker.ts';

describe('paint marker', () => {
  it('tells a clean paint from one with texture problems and from no paint', () => {
    expect(paintResult(true, 0)).toBe('ok');
    expect(paintResult(true, 2)).toBe('problems');
    expect(paintResult(false, 0)).toBe('blank');
    expect(paintResult(false, 1)).toBe('blank');
  });

  it("writes the draw's id and result, replacing the previous paint's", () => {
    const attributes = new Map<string, string>();
    const canvas = { setAttribute: (name: string, value: string) => attributes.set(name, value) };
    markPaint(canvas, 7, 'ok');
    expect(Object.fromEntries(attributes)).toEqual({
      'data-paint-id': '7',
      'data-paint-result': 'ok',
    });
    markPaint(canvas, 12, 'failed');
    expect(Object.fromEntries(attributes)).toEqual({
      'data-paint-id': '12',
      'data-paint-result': 'failed',
    });
  });
});
