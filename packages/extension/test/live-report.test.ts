import { describe, expect, it } from 'vitest';
import { readProfile, withView } from '@etch/core/profile';
import type { LiveDifference } from '@etch/core/corpus';
import {
  ETCH_ISSUES,
  differenceMessage,
  reportBody,
  reportTitle,
  reportUrl,
} from '../src/preview/live-report.ts';

const widget = {} as Extract<LiveDifference, { kind: 'place' }>['widget'];
const moved: LiveDifference = {
  kind: 'place',
  path: 'mywindow/title',
  widget,
  game: { x: 10, y: 23, w: 100, h: 20 },
  preview: { x: 10, y: 20, w: 100, h: 20 },
};
const VERSIONS = { etch: '2.7.0', anvil: 'v1.6.1', tongs: 'v0.24.0' };

describe('Compare with Live Game in Problems', () => {
  it('says where the game and the offline preview put a widget', () => {
    expect(differenceMessage(moved)).toBe(
      'Live difference: the game shows mywindow/title at 10,23 100×20, the offline preview at 10,20 100×20.',
    );
  });

  it('says once how many widgets the game hides in a window without a profile', () => {
    expect(
      differenceMessage({
        kind: 'hiddenInWindow',
        path: 'mywindow',
        paths: ['mywindow/a', 'mywindow/b'],
      }),
    ).toMatch(
      /^Live difference: the game hides 2 widgets of mywindow that the offline preview draws\./,
    );
  });
});

describe('Report to Etch', () => {
  it('holds the path, the kind, both rects, the visibility, the versions and the resolution', () => {
    const body = reportBody(moved, { width: 1920, height: 1080 }, VERSIONS, true);
    expect(body).toContain('- Widget: `mywindow/title`');
    expect(body).toContain('- Kind: place');
    expect(body).toContain('- Game rect: 10,23 100×20');
    expect(body).toContain('- Offline preview rect: 10,20 100×20');
    expect(body).toContain('- Visibility: shown by both');
    expect(body).toContain('- Resolution: 1920×1080');
    expect(body).toContain('- Etch 2.7.0, Anvil v1.6.1, Tongs v0.24.0');
  });

  it("opens a new issue of Etch's repository, filled in", () => {
    const url = new URL(reportUrl(reportTitle(moved), 'body'));
    expect(`${url.origin}${url.pathname}`).toBe(ETCH_ISSUES);
    expect(url.searchParams.get('title')).toBe('Live difference: place of title');
    expect(url.searchParams.get('body')).toBe('body');
  });
});

describe('Save as view for a window without a profile', () => {
  it('writes a profile file whose view hides what the game hid', () => {
    const text = withView(undefined, 'mywindow', 'as-shown', {
      label: 'As the live game showed it',
      set: {},
      toggles: { 'mywindow/a': false },
    });
    const read = readProfile(text, { layer: 0, source: 'mod project', file: 'mywindow.jsonc' });
    expect(read.diagnostics).toEqual([]);
    expect(read.file?.window).toBe('mywindow');
  });
});
