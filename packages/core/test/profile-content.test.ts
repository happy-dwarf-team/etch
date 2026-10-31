// Sample data in window profiles (spec section 5, ADR 0006): reading and checking `content`,
// `repeaters` and `links`, and the layers that fill a window's texts and list boxes from a save,
// the playset's localisation, a live snapshot and generated text.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type GuiFile, type Widget } from '../src/index.ts';
import {
  SaveChoice,
  activeLinks,
  checkProfile,
  defaultSaveChoice,
  evaluateView,
  knownSavePaths,
  layerProfiles,
  readProfile,
  readSavePath,
  sampleData,
  saveFacts,
  type ProfileDiagnostic,
  type ProfileOrigin,
  type SampleInput,
  type WindowProfile,
} from '../src/profile/index.ts';
import { readSave, type Save } from '../src/save/index.ts';
import { profileSaveTexts, type CapturedWidget } from '../src/corpus/index.ts';

const GUI: GuiFile = readGuiFile(
  parseScript(`guiTypes = {
  windowType = {
    name = "provinceview"
    instantTextBoxType = { name = "provincename" }
    instantTextBoxType = { name = "tax_value" }
    instantTextBoxType = { name = "development_value" }
    instantTextBoxType = { name = "autonomy_value" }
    instantTextBoxType = { name = "culture" }
    instantTextBoxType = { name = "owner_name" }
    instantTextBoxType = { name = "title" }
    instantTextBoxType = { name = "income_value" }
    instantTextBoxType = { name = "label_without_source" }
    windowType = { name = "foreign_province_window" instantTextBoxType = { name = "country_name" } }
    listboxType = { name = "building_list" }
    iconType = { name = "flag" }
  }
  windowType = {
    name = "building_entry"
    instantTextBoxType = { name = "building_name" }
    instantTextBoxType = { name = "builder" }
  }
}`),
);
const WINDOW = GUI.definitions.find((w) => w.name === 'provinceview') as Widget;
const ENTRY = GUI.definitions.find((w) => w.name === 'building_entry') as Widget;

const ORIGIN: ProfileOrigin = { layer: 0, source: 'vanilla', file: 'vanilla/provinceview.jsonc' };

const PROFILE = `{
  "formatVersion": 1,
  "window": "provinceview",
  "selectors": {
    "owner": { "kind": "data", "fact": "province.ownedByPlayer", "values": { "yes": "Own", "no": "Foreign" } },
    "owned": { "kind": "data", "fact": "province.owned", "default": "yes" }
  },
  "groups": {
    "ownership": { "selector": "owner", "none": true, "members": { "no": "provinceview/foreign_province_window" } }
  },
  "content": {
    "provinceview/provincename": { "save": "provinces.{province}.name" },
    "provinceview/tax_value": { "save": "provinces.{province}.base_tax", "format": "number" },
    "provinceview/development_value": {
      "save": ["provinces.{province}.base_tax", "provinces.{province}.base_production", "provinces.{province}.base_manpower"],
      "transform": "sum"
    },
    "provinceview/autonomy_value": { "save": "provinces.{province}.local_autonomy", "format": "percent", "decimals": 1 },
    "provinceview/culture": { "save": "provinces.{province}.culture", "transform": "localise" },
    "provinceview/owner_name": { "save": "provinces.{province}.owner", "transform": "localise" },
    "provinceview/title": { "loc": "PROVINCE_TITLE" },
    "provinceview/income_value": { "engine": true, "generated": "number" },
    "provinceview/foreign_province_window/country_name": { "save": "countries.{owner}.government_name" }
  },
  "repeaters": {
    "provinceview/building_list": {
      "template": "building_entry",
      "from": "provinces.{province}.buildings",
      "count": 2,
      "fields": {
        "building_entry/building_name": { "save": "entry", "transform": "localise" },
        "building_entry/builder": { "generated": "text" }
      }
    }
  },
  "links": {
    "uncolonised": { "when": { "owned": "no" }, "window": "colonisationpanel", "label": "Uncolonised" }
  }
}`;

function profileOf(text: string): { profile: WindowProfile; diagnostics: ProfileDiagnostic[] } {
  const read = readProfile(text, ORIGIN);
  const file = read.file;
  if (file === undefined) throw new Error('not read');
  const checked = checkProfile(layerProfiles('provinceview', [file]), {
    window: WINDOW,
    positionType: () => false,
    template: (name) => GUI.definitions.find((w) => w.name === name),
    windowExists: (name) => name === 'colonisationpanel',
  });
  return { profile: checked.profile, diagnostics: [...read.diagnostics, ...checked.diagnostics] };
}

const SAVE_TEXT = `EU4txt
date=1444.11.11
player="SWE"
dlc_enabled={ "Wealth of Nations" }
provinces={
-1={
		name="Stockholm"
		owner="SWE"
		controller="DAN"
		culture=swedish
		base_tax=5.000
		base_production=4.500
		base_manpower=3.000
		local_autonomy=12.500
		buildings={
			temple=yes
			marketplace=yes
			workshop=yes
		}
		building_construction={ id=1 }
		seat_in_parliament={ }
		center_of_trade=1
	}
-2={
		name="Kalmar"
		owner="DAN"
		controller="DAN"
		great_projects={ "kalmar_castle" }
		buildings={ fort_15th=yes }
	}
-3={
		name="Uncharted"
	}
}
countries={
	SWE={ capital=1 trade_port=4 government_name="monarchy" parliament={ } }
	DAN={ capital=12 trade_port=2 government_name="kingdom" }
}
`;

let saved: Save | undefined;
async function save(): Promise<Save> {
  saved ??= await readSave(new Uint8Array(Buffer.from(SAVE_TEXT, 'latin1')));
  return saved;
}

const LOC: Record<string, string> = {
  swedish: 'Swedish',
  SWE: 'Sweden',
  DAN: 'Denmark',
  temple: 'Temple',
  workshop: 'Workshop',
  PROVINCE_TITLE: 'Province',
};

function input(overrides: Partial<SampleInput> = {}): SampleInput {
  return {
    localise: (key) => LOC[key],
    length: 'typical',
    template: (name) => {
      const widget = GUI.definitions.find((w) => w.name === name);
      return widget === undefined ? undefined : { widget, file: GUI };
    },
    ...overrides,
  };
}

const named = (name: string): Widget => {
  const find = (w: Widget): Widget | undefined =>
    w.name === name ? w : w.children.map(find).find((x) => x !== undefined);
  const found = find(WINDOW) ?? find(ENTRY);
  if (found === undefined) throw new Error(name);
  return found;
};

describe('reading content, repeaters and links', () => {
  it('reads every kind of source and keys content by path without case', () => {
    const { profile, diagnostics } = profileOf(PROFILE);
    expect(diagnostics).toEqual([]);
    expect(profile.content.map((c) => [c.id, c.source, c.format, c.generated])).toContainEqual([
      'provinceview/development_value',
      'save',
      'number',
      'number',
    ]);
    const income = profile.content.find((c) => c.id === 'provinceview/income_value');
    expect(income).toMatchObject({ source: 'engine', generated: 'number' });
    expect(profile.repeaters[0]).toMatchObject({ template: 'building_entry', count: 2 });
    expect(profile.links[0]).toMatchObject({ id: 'uncolonised', window: 'colonisationpanel' });
  });

  it('lets a later layer remove a content entry by its path in any case', () => {
    const base = readProfile(PROFILE, ORIGIN).file;
    const top = readProfile(
      '{ "formatVersion": 1, "window": "provinceview", "content": { "ProvinceView/Tax_Value": null } }',
      { layer: 1, source: 'mod project', file: 'p.jsonc' },
    ).file;
    if (base === undefined || top === undefined) throw new Error('not read');
    const layered = layerProfiles('provinceview', [base, top]);
    expect(layered.content.map((c) => c.id)).not.toContain('provinceview/tax_value');
  });

  it.each([
    ['two sources', '{ "save": "provinces.{province}.name", "loc": "X" }', /one source/],
    ['no source', '{ "format": "number" }', /has a source/],
    ['several paths without sum', '{ "save": ["meta.date", "meta.player"] }', /"sum"/],
    ['sum of one path', '{ "save": "meta.date", "transform": "sum" }', /array/],
    ['format without save', '{ "loc": "X", "format": "number" }', /go with a "save"/],
    ['engine false', '{ "engine": false }', /engine/],
    ['an unknown kind', '{ "generated": "colour" }', /"generated" is one of/],
    ['decimals of a text', '{ "save": "meta.date", "decimals": 2 }', /number or a percentage/],
  ])('refuses %s', (_name, entry, message) => {
    const { diagnostics } = profileOf(
      `{ "formatVersion": 1, "window": "provinceview", "content": { "provinceview/title": ${entry} } }`,
    );
    expect(diagnostics).toMatchObject([{ code: 'profile-format', message }]);
  });
});

describe('the load checks of sample data', () => {
  const check = (section: string) =>
    profileOf(
      `{ "formatVersion": 1, "window": "provinceview",
         "selectors": { "owned": { "kind": "data", "fact": "province.owned" } }, ${section} }`,
    ).diagnostics.map((d) => [d.code, d.message]);

  it('refuses a save path Etch does not read, and names the known ones', () => {
    const found = check(
      '"content": { "provinceview/tax_value": { "save": "provinces.{province}.tax_income" } }',
    );
    expect(found).toMatchObject([['profile-unknown-source', /no value "tax_income"/]]);
    expect(
      check('"content": { "provinceview/tax_value": { "save": "armies.{army}.name" } }'),
    ).toMatchObject([['profile-unknown-source', /starts with provinces/]]);
  });

  it('refuses a content path the window lacks', () => {
    expect(check('"content": { "provinceview/nothing": { "generated": "text" } }')).toMatchObject([
      ['profile-unknown-path', /nothing/],
    ]);
  });

  it('checks a repeater: a list box, a known collection, its template and field paths', () => {
    expect(
      check(`"repeaters": { "provinceview/flag": { "template": "building_entry" },
        "provinceview/building_list": { "template": "nowhere", "from": "provinces.{province}.armies" } }`),
    ).toMatchObject([
      ['profile-unknown-path', /fills a list box/],
      ['profile-unknown-source', /no collection "armies"/],
      ['profile-unknown-source', /no top-level "nowhere"/],
    ]);
    expect(
      check(`"repeaters": { "provinceview/building_list": { "template": "building_entry",
        "fields": { "building_name": { "save": "entry.key" } } } }`),
    ).toMatchObject([
      ['profile-unknown-path', /starts with the template's name/],
      // Without "from" there is no entry to read.
      ['profile-unknown-source', /entry\.key/],
    ]);
  });

  it('checks a link: its selector values and the window it opens', () => {
    expect(
      check('"links": { "l": { "when": { "owned": "maybe" }, "window": "elsewhere" } }'),
    ).toMatchObject([
      ['profile-unknown-value', /no value "maybe"/],
      ['profile-unknown-name', /no window "elsewhere"/],
    ]);
  });

  it('reads save paths of every scope and entry fields', () => {
    expect(readSavePath('meta.date')).toEqual({ scope: 'meta', key: 'date', collection: false });
    expect(readSavePath('countries.{owner}.treasury')).toMatchObject({ scope: 'owner' });
    expect(readSavePath('entry.value', { entry: true })).toEqual({ scope: 'entry', key: 'value' });
    expect(readSavePath('entry', { entry: true })).toEqual({ scope: 'entry', key: 'self' });
    expect(readSavePath('entry.a.b', { entry: true })).toHaveProperty('problem');
  });
});

describe('sampleData', () => {
  it('fills texts from the save, the files and the generated layer, and counts them', async () => {
    const { profile } = profileOf(PROFILE);
    const choice = new SaveChoice(await save(), 'SWE', 1);
    const view = evaluateView(
      profile,
      WINDOW,
      { width: 1920, height: 1080 },
      { facts: saveFacts(choice) },
    );
    const sample = sampleData(profile, WINDOW, view, input({ save: choice }));
    const text = (name: string) => sample.text(named(name));
    expect(text('provincename')).toEqual({
      text: 'Stockholm',
      layer: 'save',
      detail: 'provinces.{province}.name',
    });
    expect(text('tax_value')?.text).toBe('5');
    expect(text('development_value')).toMatchObject({ text: '12.5', layer: 'save' });
    expect(text('autonomy_value')?.text).toBe('12.5%');
    expect(text('culture')?.text).toBe('Swedish');
    expect(text('owner_name')?.text).toBe('Sweden');
    expect(text('title')).toEqual({ text: 'Province', layer: 'files', detail: 'PROVINCE_TITLE' });
    expect(text('income_value')).toEqual({
      text: '12.3',
      layer: 'generated',
      detail: 'number, typical',
    });
    // Own province: the foreign window is hidden, so its text is not counted.
    expect(text('country_name')?.text).toBe('monarchy');
    // Three buildings: a localised name from the save and a generated builder each.
    expect(sample.counts).toEqual({ hand: 0, live: 0, save: 6 + 3, files: 1, generated: 1 + 3 });
  });

  it('lets a value the save lacks fall through to the generated layer', async () => {
    const { profile } = profileOf(PROFILE);
    const sample = sampleData(
      profile,
      WINDOW,
      undefined,
      input({ save: new SaveChoice(await save(), 'SWE', 2), length: 'short' }),
    );
    expect(sample.text(named('tax_value'))).toMatchObject({ text: '7', layer: 'generated' });
    expect(sample.text(named('development_value'))?.layer).toBe('generated');
    expect(sample.text(named('owner_name'))?.text).toBe('Denmark');
  });

  it('takes a live snapshot first, by widget path and list row', async () => {
    const { profile } = profileOf(PROFILE);
    const live = new Map([
      ['provinceview/tax_value', '4.20'],
      ['provinceview/building_list/row[2]/building_name', 'Marketplace (live)'],
    ]);
    const sample = sampleData(
      profile,
      WINDOW,
      undefined,
      input({
        save: new SaveChoice(await save(), 'SWE', 1),
        live: { text: (path) => live.get(path) },
      }),
    );
    expect(sample.text(named('tax_value'))).toMatchObject({ text: '4.20', layer: 'live' });
    expect(sample.text(named('building_name'), 1)).toMatchObject({
      text: 'Marketplace (live)',
      layer: 'live',
    });
  });

  it('takes every text, the rows and their states from a live snapshot', () => {
    const { profile } = profileOf(PROFILE);
    const texts = new Map([
      ['provinceview/label_without_source', 'Shown in the game'],
      ['provinceview/building_list/row[1]/builder', 'Live builder'],
    ]);
    const states = new Map([
      [
        'provinceview/building_list/row[1]/builder',
        { visible: false, enabled: true, checked: false },
      ],
    ]);
    const sample = sampleData(
      profile,
      WINDOW,
      undefined,
      input({
        live: {
          text: (path) => texts.get(path),
          rows: (list) => (list === 'provinceview/building_list' ? 1 : undefined),
          state: (path) => states.get(path),
        },
      }),
    );
    expect(sample.text(named('label_without_source'))).toMatchObject({
      text: 'Shown in the game',
      layer: 'live',
    });
    expect(sample.rows(named('building_list'))).toMatchObject({ count: 1, layer: 'live' });
    expect(sample.text(named('builder'), 0)?.text).toBe('Live builder');
    expect(sample.state(named('builder'), 0)?.visible).toBe(false);
  });

  it('takes a text typed by hand over every layer, any text of the window or a list row', async () => {
    const { profile } = profileOf(PROFILE);
    const typed = new Map([
      ['provinceview/tax_value', 'Typed tax'],
      ['provinceview/title', 'Typed title'],
      ['provinceview/building_list/row[1]/builder', 'Typed builder'],
    ]);
    const live = new Map([['provinceview/tax_value', '4.20']]);
    const sample = sampleData(
      profile,
      WINDOW,
      undefined,
      input({
        save: new SaveChoice(await save(), 'SWE', 1),
        live: { text: (path) => live.get(path) },
        hand: { text: (path) => typed.get(path) },
      }),
    );
    expect(sample.text(named('tax_value'))).toMatchObject({ text: 'Typed tax', layer: 'hand' });
    expect(sample.text(named('title'))).toMatchObject({ text: 'Typed title', layer: 'hand' });
    expect(sample.text(named('builder'), 0)).toMatchObject({
      text: 'Typed builder',
      layer: 'hand',
    });
    expect(sample.text(named('builder'), 1)?.layer).toBe('generated');
    expect(sample.counts.hand).toBe(3);
  });

  it("sets the number of a list's entries, the save's first and generated ones after", async () => {
    const { profile } = profileOf(PROFILE);
    const list = named('building_list');
    const sample = sampleData(
      profile,
      WINDOW,
      undefined,
      input({ save: new SaveChoice(await save(), 'SWE', 1), count: () => 5 }),
    );
    expect(sample.rows(list)).toMatchObject({ count: 5, layer: 'save' });
    expect(sample.text(named('building_name'), 2)?.text).toBe('Workshop');
    expect(sample.text(named('building_name'), 3)).toMatchObject({ layer: 'generated' });
    expect(sample.lists).toEqual([
      {
        id: 'provinceview/building_list',
        list: 'building_list',
        template: 'building_entry',
        count: 5,
        bySet: true,
        layer: 'save',
        drawn: true,
      },
    ]);
  });

  it('fills a list box: one entry per child of the save collection, else count generated ones', async () => {
    const { profile } = profileOf(PROFILE);
    const list = named('building_list');
    const withSave = sampleData(
      profile,
      WINDOW,
      undefined,
      input({ save: new SaveChoice(await save(), 'SWE', 1) }),
    );
    expect(withSave.rows(list)).toMatchObject({ template: ENTRY, count: 3, layer: 'save' });
    expect([0, 1, 2].map((row) => withSave.text(named('building_name'), row)?.text)).toEqual([
      'Temple',
      'marketplace',
      'Workshop',
    ]);
    const without = sampleData(profile, WINDOW, undefined, input());
    expect(without.rows(list)).toMatchObject({ count: 2, layer: 'generated' });
    expect(without.text(named('building_name'), 0)).toMatchObject({
      layer: 'generated',
      text: 'Northmarch',
    });
  });

  it('reads the facts of the chosen province, with the chosen country as the player', async () => {
    const s = await save();
    expect(saveFacts(new SaveChoice(s, 'SWE', 1))).toEqual({
      'province.owned': 'yes',
      'province.ownedByPlayer': 'yes',
      'province.occupied': 'yes',
      'province.constructing': 'yes',
      'province.hasGreatProjects': 'no',
      'province.hasFort': 'no',
      'province.isCapital': 'yes',
      'province.isTradePort': 'no',
      'province.parliamentSeat': 'seat',
      'province.centerOfTrade': 'yes',
      'game.cradleOfCivilization': 'no',
    });
    expect(saveFacts(new SaveChoice(s, 'SWE', 2))).toMatchObject({
      'province.ownedByPlayer': 'no',
      'province.occupied': 'no',
      'province.hasGreatProjects': 'yes',
      'province.hasFort': 'yes',
      'province.isCapital': 'no',
      'province.isTradePort': 'yes',
      'province.parliamentSeat': 'none',
      'province.centerOfTrade': 'no',
    });
    expect(saveFacts(new SaveChoice(s, 'SWE', 3))).toEqual({
      'province.owned': 'no',
      'province.ownedByPlayer': 'no',
      'province.occupied': 'no',
      'province.constructing': 'no',
      'province.hasGreatProjects': 'no',
      'province.hasFort': 'no',
      'province.centerOfTrade': 'no',
      'game.cradleOfCivilization': 'no',
    });
    expect(saveFacts(new SaveChoice(s, 'SWE', undefined))).toEqual({});
  });

  it('opens on the player and the capital, and holds a link when its selectors do', async () => {
    const s = await save();
    expect(defaultSaveChoice(s)).toEqual({ country: 'SWE', province: 1 });
    const { profile } = profileOf(PROFILE);
    const facts = saveFacts(new SaveChoice(s, 'SWE', 3));
    const view = evaluateView(profile, WINDOW, { width: 1920, height: 1080 }, { facts });
    expect(activeLinks(profile, view).map((l) => l.window)).toEqual(['colonisationpanel']);
    const own = evaluateView(
      profile,
      WINDOW,
      { width: 1920, height: 1080 },
      { facts: saveFacts(new SaveChoice(s, 'SWE', 1)) },
    );
    expect(activeLinks(profile, own)).toEqual([]);
  });
});

describe('the documentation of save paths', () => {
  it('lists every save path and collection Etch reads', () => {
    const doc = readFileSync(new URL('../../../docs/window-profiles.md', import.meta.url), 'utf8');
    for (const scope of knownSavePaths()) {
      expect(doc).toContain(`\`${scope.scope}.`);
      // A meta key is written whole, `meta.date`; the others alone.
      for (const key of [...scope.scalars, ...scope.collections])
        expect(doc).toMatch(new RegExp(`[\`.]${key}\``));
    }
  });
});

describe('profileSaveTexts', () => {
  it("reports the save's texts against a capture's, in the view it shows", async () => {
    const { profile } = profileOf(PROFILE);
    const text = (name: string, value: string, visible = true): CapturedWidget => ({
      path: `provinceview/${name}`,
      name,
      type: 'text',
      visible,
      rect: { x: 0, y: 0, w: 10, h: 10 },
      text: value,
    });
    const root: CapturedWidget = {
      path: 'provinceview',
      name: 'provinceview',
      type: 'window',
      visible: true,
      rect: { x: 0, y: 0, w: 100, h: 100 },
      children: [
        text('provincename', ' Stockholm '),
        text('tax_value', '5.0'),
        text('development_value', '12.5'),
        text('culture', 'Swedish', false),
        text('title', 'Province'),
      ],
    };
    const report = profileSaveTexts(
      profile,
      WINDOW,
      { width: 1920, height: 1080 },
      { owner: 'yes' },
      new SaveChoice(await save(), 'SWE', 1),
      (key) => LOC[key],
      root,
    );
    // The hidden culture and the loc title are left out; white space does not count.
    expect(report).toEqual({
      window: 'provinceview',
      compared: 3,
      matched: 2,
      differences: [
        {
          path: 'provinceview/tax_value',
          sample: '5',
          game: '5.0',
          from: 'provinces.{province}.base_tax',
        },
      ],
    });
  });
});
