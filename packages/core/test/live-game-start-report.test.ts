import { describe, expect, it } from 'vitest';
import { findKey, readStartLine, startLineMessage } from '../src/index.ts';

// The shapes of EU4 1.37.5's own start lines (a profile with an Anbennar playset, 21.11.2026),
// with the names of the mod changed.
describe('readStartLine', () => {
  it('reads `file: … line: N`', () => {
    expect(
      readStartLine(
        "[windowtype.cpp:809]: Guitype 'button1' already exists in windowtype 'etch_policy'.  file: interface/etch.gui line: 731",
      ),
    ).toEqual({
      message:
        "Guitype 'button1' already exists in windowtype 'etch_policy'.  file: interface/etch.gui line: 731",
      path: 'interface/etch.gui',
      line: 731,
      parseError: false,
    });
    expect(
      readStartLine('[dlc.cpp:254]: Invalid supported_version in  file: mod/ugc_1.mod line: 8'),
    ).toMatchObject({ path: 'mod/ugc_1.mod', line: 8 });
  });

  it('reads a parsing error with its file and near line', () => {
    expect(
      readStartLine(
        '[persistent.cpp:88]: Parsing Error. File: "interface/settings.gui", Error: Unexpected token: format, near line: 2640, Last good read: use_special_chars=no',
      ),
    ).toMatchObject({ path: 'interface/settings.gui', line: 2640, parseError: true });
  });

  it('reads a path that starts the message, with no line', () => {
    const line = readStartLine(
      "[fixedwindow.cpp:2962]: interface/frontend.gui: Missing Button 'social_view_button' in window 'mainmenu_panel_bottom'.",
    );
    expect(line).toMatchObject({ path: 'interface/frontend.gui', parseError: false });
    expect(line.line).toBeUndefined();
  });

  it('reads the key of a line that names no file', () => {
    expect(
      readStartLine(
        '[triggerimplementation.cpp:17071]: Unknown province-modifier in a trigger etch_tower',
      ),
    ).toMatchObject({ key: 'etch_tower' });
    expect(
      readStartLine(
        '[pdx_localize.cpp:1063]: Error in localization value! Key: "MODIFIER_ETCH", Error: "Couldn\'t find Latin1 character"',
      ),
    ).toMatchObject({ key: 'MODIFIER_ETCH' });
    expect(
      readStartLine(
        '[effectimplementation.cpp:21848]: Unknown effect type. Key: add_treasuryy, near line: 2',
      ),
    ).toMatchObject({ key: 'add_treasuryy' });
  });

  it('names nothing when the line has neither', () => {
    const line = readStartLine("[news_banner.cpp:96]: Failed to get server data for key: 'x'");
    expect(line.path).toBeUndefined();
    expect(line.key).toBeUndefined();
  });

  it('drops the time stamp and the source of the message', () => {
    expect(startLineMessage('[12:01:02][dlc.cpp:254]: Invalid')).toBe('Invalid');
    expect(startLineMessage('no source')).toBe('no source');
  });
});

describe('findKey', () => {
  it('finds a key as a whole word only', () => {
    const text = 'etch.10 = yes\nlimit = { has_province_modifier = etch.1 }\n';
    expect(findKey(text, 'etch.1')).toEqual({ start: 48, end: 54 });
    expect(findKey('etch.1.a = yes', 'etch.1')).toBeUndefined();
    expect(findKey(' MODIFIER_ETCH:0 "x"', 'MODIFIER_ETCH')).toEqual({ start: 1, end: 14 });
    expect(findKey('my_etch_tower = 1', 'etch_tower')).toBeUndefined();
    expect(findKey('anything', '')).toBeUndefined();
  });
});
