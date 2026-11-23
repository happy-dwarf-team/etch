import { describe, expect, it } from 'vitest';
import { SEPARATOR, currentFirst, withOffered, type Ordered } from '../src/current-first.ts';

const separator = (label: string): Ordered => ({ label, kind: SEPARATOR });
const labels = (items: readonly Ordered[]): string[] =>
  items.map((item) => (item.kind === SEPARATOR ? `-- ${item.label}` : item.label));

const RESOLUTIONS: Ordered[] = [
  { label: 'Default' },
  { label: 'Native' },
  separator('Corpus resolutions'),
  { label: '1280×720' },
  { label: '1920×1080' },
  separator(''),
  { label: 'Custom…' },
];

describe('currentFirst', () => {
  it('moves the current item first, under its own section', () => {
    const current = RESOLUTIONS[4];
    expect(
      labels(
        currentFirst(RESOLUTIONS, current, { current: 'Current', rest: 'Automatic' }, separator),
      ),
    ).toEqual([
      '-- Current',
      '1920×1080',
      '-- Automatic',
      'Default',
      'Native',
      '-- Corpus resolutions',
      '1280×720',
      '-- ',
      'Custom…',
    ]);
  });

  it('puts a current item that is not in the list first, and leaves the list whole', () => {
    expect(
      labels(
        currentFirst(
          RESOLUTIONS,
          { label: '1440×900' },
          { current: 'Current', rest: 'Automatic' },
          separator,
        ),
      ),
    ).toEqual(['-- Current', '1440×900', '-- Automatic', ...labels(RESOLUTIONS)]);
  });

  it('drops a section the move leaves empty', () => {
    const items = [
      separator('Corpus resolutions'),
      { label: '1920×1080' },
      separator(''),
      { label: 'Custom…' },
    ];
    expect(labels(currentFirst(items, items[1], { current: 'Current' }, separator))).toEqual([
      '-- Current',
      '1920×1080',
      '-- ',
      'Custom…',
    ]);
  });

  it('adds no section of its own before a list that starts with one', () => {
    const items = [separator('Corpus resolutions'), { label: '1280×720' }, { label: '1920×1080' }];
    expect(
      labels(currentFirst(items, items[2], { current: 'Current', rest: 'Automatic' }, separator)),
    ).toEqual(['-- Current', '1920×1080', '-- Corpus resolutions', '1280×720']);
  });

  it('keeps the order of a list without a current item', () => {
    const entities = [{ label: 'westerngfx_INFANTRY_1' }, { label: 'DAN_INFANTRY_1' }];
    expect(
      currentFirst(
        entities,
        undefined,
        { current: 'At the cursor', rest: 'In the file' },
        separator,
      ),
    ).toEqual(entities);
  });

  it('leaves no section after the only item', () => {
    const only = { label: 'DAN_INFANTRY_1' };
    expect(
      labels(
        currentFirst([only], only, { current: 'At the cursor', rest: 'In the file' }, separator),
      ),
    ).toEqual(['-- At the cursor', 'DAN_INFANTRY_1']);
  });
});

describe('withOffered', () => {
  const listed = currentFirst(
    RESOLUTIONS,
    { label: '1440×900' },
    { current: 'Current', rest: 'Automatic' },
    separator,
  );

  it('puts the typed item first and drops the item of the same label', () => {
    expect(labels(withOffered(listed, { label: '1920×1080' }))).toEqual([
      '1920×1080',
      '-- Current',
      '1440×900',
      '-- Automatic',
      'Default',
      'Native',
      '-- Corpus resolutions',
      '1280×720',
      '-- ',
      'Custom…',
    ]);
  });

  it('drops the section the typed item empties', () => {
    expect(labels(withOffered(listed, { label: '1440×900' })).slice(0, 3)).toEqual([
      '1440×900',
      '-- Automatic',
      'Default',
    ]);
  });

  it('returns the list as it is without a typed item', () => {
    expect(withOffered(listed, undefined)).toEqual(listed);
  });
});
