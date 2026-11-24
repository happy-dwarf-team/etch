import { describe, expect, it } from 'vitest';
import { readProfile, type ProfileOrigin } from '../src/profile/index.ts';

// The format errors of a window profile file (ADR 0006): each one says what the entry should be,
// at the node that is wrong, and the rest of the file applies.
const ORIGIN: ProfileOrigin = { layer: 0, source: 'vanilla', file: 'w.jsonc' };

function messages(text: string): string[] {
  return readProfile(text, ORIGIN).diagnostics.map((d) => d.message);
}

/**
 * The expected message: `toMatchObject` takes a RegExp value as an object with no properties to
 * match, so a pattern goes through `expect.stringMatching`.
 */
function matching(message: string | RegExp): unknown {
  return typeof message === 'string' ? message : expect.stringMatching(message);
}

describe('the format errors of a window profile', () => {
  it.each([
    ['text that is not JSONC', '{ "formatVersion": ', /\.$/],
    ['an array', '[1]', 'A window profile is an object.'],
    ['no formatVersion', '{ "window": "w" }', 'A window profile starts with "formatVersion": 1.'],
    ['formatVersion 0', '{ "formatVersion": 0, "window": "w" }', 'formatVersion starts at 1.'],
    ['no window', '{ "formatVersion": 1 }', 'A window profile has "window".'],
    [
      'an empty window',
      '{ "formatVersion": 1, "window": " " }',
      '"window" is a text that is not empty.',
    ],
  ])('skips a file with %s', (_name, text, message) => {
    const { file, diagnostics } = readProfile(text, ORIGIN);
    expect(file).toBeUndefined();
    expect(diagnostics).toMatchObject([
      { severity: 'error', code: 'profile-format', message: matching(message) },
    ]);
  });

  it.each([
    [
      'a checkedWith that is not a text',
      '"checkedWith": 137',
      '"checkedWith" is a text that is not empty.',
    ],
    ['a mod without its name', '"mod": {}', '"mod" names the mod by "remoteFileId" or "name".'],
    [
      'a defaultView that is not a text',
      '"defaultView": ["a"]',
      '"defaultView" is a text that is not empty.',
    ],
    [
      'a section keyed by id that is not an object',
      '"rules": []',
      '"rules" is an object keyed by id.',
    ],
    [
      'a section keyed by path that is not an object',
      '"content": 1',
      '"content" is an object keyed by widget path.',
    ],
  ])('reads the window of a file with %s', (_name, member, message) => {
    const { file, diagnostics } = readProfile(
      `{ "formatVersion": 1, "window": "w", ${member} }`,
      ORIGIN,
    );
    expect(file?.window).toBe('w');
    expect(diagnostics).toMatchObject([{ code: 'profile-format', message: matching(message) }]);
  });

  const SELECTOR = 'selectors';
  const GROUP = 'groups';
  const RULE = 'rules';
  const VIEW = 'views';
  const CONTENT = 'content';
  const REPEATER = 'repeaters';
  const LINK = 'links';
  it.each([
    [SELECTOR, '"s": "x"', 'Selector "s" is an object.'],
    [SELECTOR, '"s": { "values": { "a": "A" } }', 'Selector "s" has no "kind".'],
    [SELECTOR, '"s": { "kind": 1 }', '"kind" is a text that is not empty.'],
    [SELECTOR, '"s": { "kind": "colour" }', /^"kind" is one of .*, not "colour"\.$/],
    [SELECTOR, '"s": { "kind": "data" }', 'Data selector "s" names the fact it reads in "fact".'],
    [
      SELECTOR,
      '"s": { "kind": "ui", "fact": "province.owned", "values": { "a": "A" } }',
      'Only a data selector reads a fact.',
    ],
    [SELECTOR, '"s": { "kind": "ui" }', 'Selector "s" has no "values".'],
    [
      SELECTOR,
      '"s": { "kind": "ui", "values": {} }',
      '"values" is an object of at least one value, keyed by id.',
    ],
    [
      SELECTOR,
      '"s": { "kind": "resolution", "values": { "a": "A" } }',
      'A resolution value gives its screen bounds.',
    ],
    [
      SELECTOR,
      '"s": { "kind": "ui", "values": { "a": { "minHeight": 800 } } }',
      'Only a resolution value has bounds.',
    ],
    [
      SELECTOR,
      '"s": { "kind": "resolution", "values": { "a": { "minHeight": -1 } } }',
      '"minHeight" is a whole number of pixels.',
    ],
    [
      SELECTOR,
      '"s": { "kind": "resolution", "values": { "a": { "label": "A" } } }',
      'A resolution value gives at least one screen bound.',
    ],
    [GROUP, '"g": { "members": { "a": ["w/x"] } }', 'Group "g" names its "selector".'],
    [
      GROUP,
      '"g": { "selector": 2, "members": { "a": ["w/x"] } }',
      '"selector" is a text that is not empty.',
    ],
    [
      GROUP,
      '"g": { "selector": "s", "members": {} }',
      'Group "g" has "members": an object of paths keyed by selector value.',
    ],
    [
      GROUP,
      '"g": { "selector": "s", "members": { "a": ["w/x"] }, "none": "no" }',
      '"none" is true or false.',
    ],
    [
      RULE,
      '"r": { "when": ["s"], "hide": ["w/x"] }',
      '"when" is an object of selector values keyed by selector.',
    ],
    [
      RULE,
      '"r": { "when": { "s": [] }, "hide": ["w/x"] }',
      'A condition names at least one value.',
    ],
    [RULE, '"r": { "hide": "w/x" }', '"hide" is an array of paths.'],
    [RULE, '"r": { "frame": ["w/x"] }', '"frame" is an object keyed by path.'],
    [RULE, '"r": { "frame": { "w/x": 0 } }', 'A frame is a whole number from 1.'],
    [RULE, '"r": { "position": { "w/x": { "axis": "x" } } }', 'A move names its "positionType".'],
    [
      RULE,
      '"r": { "offset": { "w/x": { "x": 1.5 } } }',
      '"x" of an offset is a whole number of pixels.',
    ],
    [
      RULE,
      '"r": { "chartSize": { "w/x": { "x": 32 } } }',
      '"y" of a chart size is a whole number of pixels from 1.',
    ],
    [
      RULE,
      '"r": { "slider": { "w/x": { "low": "w/a", "high": "w/b", "at": 2 } } }',
      '"at" of a slider is its share without a save, from 0 to 1.',
    ],
    [
      RULE,
      '"r": { "slider": { "w/x": { "high": "w/b", "at": 1 } } }',
      'A slider names its "low" end by path.',
    ],
    [
      RULE,
      '"r": { "slider": { "w/x": { "low": "w/a", "high": "w/b", "at": 1, "valueText": "number" } } }',
      '"valueText" of a slider is "percent".',
    ],
    [
      RULE,
      '"r": { "slider": { "w/x": { "low": "w/a", "high": "w/b", "at": 1, "valueText": "percent" } } }',
      'A slider with "valueText" names its "value" text box.',
    ],
    [RULE, '"r": { "hide": ["w/x"], "frame": { " ": 2 } }', 'A path is not empty.'],
    [VIEW, '"v": { "set": ["s"] }', '"set" is an object of selector values keyed by selector.'],
    [
      VIEW,
      '"v": { "toggles": ["w/x"] }',
      '"toggles" is an object of true (shown) or false keyed by path.',
    ],
    [VIEW, '"v": { "toggles": { "w/x": 1 } }', 'A hand toggle is true (shown) or false (hidden).'],
    [CONTENT, '"w/x": { "save": [] }', '"save" names at least one save path.'],
    [CONTENT, '"w/x": { "engine": true, "sizedBy": 3 }', '"sizedBy" is a localisation key.'],
    [
      CONTENT,
      '"w/x": { "save": "meta.date", "transform": "join" }',
      '"transform" is "sum" or "localise", not "join".',
    ],
    [
      CONTENT,
      '"w/x": { "save": "meta.date", "format": "date" }',
      /^"format" is one of .*, not "date"\.$/,
    ],
    [
      CONTENT,
      '"w/x": { "save": "meta.date", "transform": "localise", "format": "number" }',
      'A localised value is a text.',
    ],
    [
      CONTENT,
      '"w/x": { "save": ["a", "b"], "transform": "sum", "format": "text" }',
      'A sum is a number or a percentage.',
    ],
    [
      CONTENT,
      '"w/x": { "save": "meta.date", "format": "number", "decimals": 5 }',
      '"decimals" is a whole number from 0 to 4.',
    ],
    [
      REPEATER,
      '"w/list": { "count": 2 }',
      'The repeater of "w/list" names the "template" of its entries.',
    ],
    [
      REPEATER,
      '"w/list": { "template": "t", "count": 101 }',
      '"count" is a whole number of entries from 0 to 100.',
    ],
    [
      REPEATER,
      '"w/list": { "template": "t", "fields": [] }',
      '"fields" is an object of sources keyed by a path in the template.',
    ],
    [
      REPEATER,
      '"w/list": { "template": "t", "hide": "x" }',
      '"hide" is an array of paths in the template.',
    ],
    [
      REPEATER,
      '"w/list": { "template": "t", "place": { "step": { "x": 0, "y": 10 } } }',
      '"place" names the "start" of the first entry, a bar to put them "along", or a "table".',
    ],
    [
      REPEATER,
      '"w/list": { "template": "t", "place": { "start": { "x": 0, "y": 0.5 } } }',
      '"start" of "place" is a positionType\'s name or whole pixels { "x", "y" }.',
    ],
    [
      REPEATER,
      '"w/list": { "template": "t", "place": { "start": "p", "columns": 0 } }',
      '"columns" of "place" is a whole number from 1 or a positionType\'s name.',
    ],
    [
      REPEATER,
      '"w/list": { "template": "t", "place": { "along": { "at": [0.5] } } }',
      '"along" names the "bar" and the shares of its width "at" which the entries go.',
    ],
    [
      REPEATER,
      '"w/list": { "template": "t", "place": { "along": { "bar": "b", "at": [0.5, 2] } } }',
      '"at" of "along" is an array of shares of the bar, from 0 to 1.',
    ],
    [
      REPEATER,
      '"w/list": { "template": "t", "place": { "along": { "bar": "b", "at": [0.5], "sprites": ["a", "b"] } } }',
      '"sprites" of "along" names one sprite for each share of "at".',
    ],
    [LINK, '"l": { "when": { "s": "a" } }', 'Link "l" names the "window" it opens.'],
    [LINK, '"l": { "window": "other" }', 'Link "l" says "when" it holds.'],
  ])('refuses in %s: %s', (section, entry, message) => {
    const { file, diagnostics } = readProfile(
      `{ "formatVersion": 1, "window": "w", "${section}": { ${entry} } }`,
      ORIGIN,
    );
    expect(diagnostics).toMatchObject([
      { severity: 'error', code: 'profile-format', message: matching(message) },
    ]);
    // The faulty entry is skipped, the file is read.
    expect(file?.window).toBe('w');
  });

  it('reads a repeater whose columns are a positionType or a whole number', () => {
    const repeater = (columns: string) =>
      readProfile(
        `{ "formatVersion": 1, "window": "w", "repeaters": {
          "w/list": { "template": "t", "place": { "start": "p", "columns": ${columns} } } } }`,
        ORIGIN,
      );
    for (const [columns, expected] of [
      ['"columns_pos"', 'columns_pos'],
      ['3', 3],
    ] as const) {
      const { file, diagnostics } = repeater(columns);
      expect(diagnostics).toEqual([]);
      const first = file?.repeaters[0];
      expect(first !== undefined && 'place' in first ? first.place.columns : undefined).toBe(
        expected,
      );
    }
    expect(messages('{ "formatVersion": 1, "window": "w" }')).toEqual([]);
  });
});
