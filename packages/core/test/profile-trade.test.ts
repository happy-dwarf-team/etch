// The trade tab's profile (the coverage survey): the merchant's node choice opens by a click, and
// each "none" label shows while its list is empty.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type Widget } from '../src/index.ts';
import { evaluateView, layerProfiles, readProfile, widgetsAt } from '../src/profile/index.ts';

const LARGE = { width: 1920, height: 1080 };
const NAMES = ['send_merchant_window', 'trade_embargoes_on_us_none', 'transferring_trade_none'];

describe('the trade tab', () => {
  const window = readGuiFile(
    parseScript(
      `guiTypes = { windowType = { name = "countrytradeview" size = { x = 100 y = 100 } ${NAMES.map(
        (n) => `windowType = { name = "${n}" size = { x = 10 y = 10 } }`,
      ).join(' ')} } }`,
    ),
  ).definitions[0] as Widget;
  const read = readProfile(
    readFileSync(
      new URL('../../../profiles/vanilla/countrytradeview.jsonc', import.meta.url),
      'utf8',
    ),
    { layer: 0, source: 'vanilla', file: 'countrytradeview.jsonc' },
  );
  const shown = (set: Record<string, string>) => {
    const profile = layerProfiles('countrytradeview', read.file === undefined ? [] : [read.file]);
    const view = evaluateView(profile, window, LARGE, { set });
    return NAMES.filter((n) =>
      widgetsAt(window, `countrytradeview/${n}`).some((w) => view.drawn(w)),
    );
  };

  it('opens the merchant choice by a click and says when a list is empty', () => {
    expect(read.diagnostics).toEqual([]);
    expect(shown({})).toEqual(['trade_embargoes_on_us_none', 'transferring_trade_none']);
    expect(shown({ sendMerchant: 'open', transferringTrade: 'some' })).toEqual([
      'send_merchant_window',
      'trade_embargoes_on_us_none',
    ]);
  });
});
