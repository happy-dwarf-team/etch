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
  generatedText,
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
    "provinceview/income_value": { "engine": true, "generated": "number", "sizedBy": "PROVINCE_TITLE" },
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
	DAN={ capital=12 trade_port=2 government_name="kingdom" secondary_religion=sunni patriarch_authority=0.462 institutions={ 1 1 1 0 0 0 0 0 } }
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
  TRUCE: 'A truce until §Y$DATE$§W with $WHO|Y$ ($LEFT$, $AMOUNT|0+$).',
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
    expect(income).toMatchObject({
      source: 'engine',
      generated: 'number',
      sizedBy: 'PROVINCE_TITLE',
    });
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
    ['a map and a loc', '{ "map": "area", "loc": "X" }', /one source: "save", "loc", "map"/],
    [
      'an unknown map',
      '{ "map": "continent" }',
      /^"map" is one of area, region, not "continent".$/,
    ],
    ['a map with a format', '{ "map": "area", "format": "number" }', /go with a "save"/],
    ['no source', '{ "format": "number" }', /has a source/],
    ['several paths without sum', '{ "save": ["meta.date", "meta.player"] }', /"sum"/],
    ['sum of one path', '{ "save": "meta.date", "transform": "sum" }', /array/],
    ['format without save', '{ "loc": "X", "format": "number" }', /go with a "save"/],
    ['engine false', '{ "engine": false }', /engine/],
    ['an unknown kind', '{ "generated": "colour" }', /"generated" is one of/],
    ['decimals of a text', '{ "save": "meta.date", "decimals": 2 }', /number or a percentage/],
    ['an empty sizedBy', '{ "engine": true, "sizedBy": "" }', /^"sizedBy" is a localisation key.$/],
  ])('refuses %s', (_name, entry, message) => {
    const { diagnostics } = profileOf(
      `{ "formatVersion": 1, "window": "provinceview", "content": { "provinceview/title": ${entry} } }`,
    );
    expect(diagnostics).toMatchObject([
      { code: 'profile-format', message: expect.stringMatching(message) as unknown },
    ]);
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

  it("checks a placed repeater: the bar it goes along, its positionTypes and the table's headings", () => {
    expect(
      check(`"repeaters": { "provinceview/building_list": { "template": "building_entry",
        "place": { "start": "first_pos", "step": "next_pos", "along": { "bar": "bar", "at": [0.5] } } } }`),
    ).toMatchObject([
      ['profile-unknown-path', /has no child "bar" for the entries to go along/],
      ['profile-unknown-name', /no positionType "first_pos"/],
      ['profile-unknown-name', /no positionType "next_pos"/],
    ]);
    expect(
      check(`"repeaters": { "provinceview/building_list": { "template": "building_entry",
        "place": { "table": { "weights": [1, 2], "label": "heading_row" } } } }`),
    ).toMatchObject([
      ['profile-unknown-source', /no top-level "heading_row" for the table's headings/],
    ]);
  });

  it("refuses a map source in a repeater's field: it names the chosen province's", () => {
    const { diagnostics } = profileOf(`{ "formatVersion": 1, "window": "provinceview",
      "repeaters": { "provinceview/building_list": { "template": "building_entry",
        "fields": { "building_entry/builder": { "map": "area" } } } } }`);
    expect(diagnostics).toMatchObject([
      {
        code: 'profile-format',
        message: expect.stringMatching(/^Unknown property "map" in field/) as unknown,
      },
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

describe('a repeater that hides parts of its entries', () => {
  const hiding = PROFILE.replace('"count": 2,', '"count": 2, "hide": ["building_entry/builder"],');

  it('leaves them out of every entry, unless a snapshot shows them', () => {
    const { profile, diagnostics } = profileOf(hiding);
    expect(diagnostics).toEqual([]);
    const screen = { width: 1920, height: 1080 };
    const view = evaluateView(profile, WINDOW, screen, {});
    const builder = ENTRY.children.find((w) => w.name === 'builder') as Widget;
    const sample = sampleData(profile, WINDOW, view, input({}));
    expect(sample.state(builder, 1)?.visible).toBe(false);
    const live = sampleData(
      profile,
      WINDOW,
      view,
      input({
        live: {
          text: () => undefined,
          state: () => ({ visible: true, enabled: true, checked: false }),
        },
      }),
    );
    expect(live.state(builder, 1)?.visible).toBe(true);
  });

  it('checks the paths against the template', () => {
    expect(
      profileOf(
        `{ "formatVersion": 1, "window": "provinceview", "repeaters": {
          "provinceview/building_list": { "template": "building_entry", "hide": ["builder"] } } }`,
      ).diagnostics.map((d) => [d.code, d.message]),
    ).toMatchObject([['profile-unknown-path', /path to hide starts with the template's name/]]);
  });
});

describe("a rule that reaches a repeater's entries", () => {
  const ruled = PROFILE.replace(
    '"groups": {',
    `"rules": {
      "foreign-builder": {
        "when": { "owner": "no" },
        "hide": ["provinceview/building_list/building_entry/builder"]
      }
    },
    "groups": {`,
  );

  it('hides the part in every entry while it holds, under a snapshot', () => {
    const { profile, diagnostics } = profileOf(ruled);
    expect(diagnostics).toEqual([]);
    const screen = { width: 1920, height: 1080 };
    const builder = ENTRY.children.find((w) => w.name === 'builder') as Widget;
    const at = (owner: string) =>
      sampleData(
        profile,
        WINDOW,
        evaluateView(profile, WINDOW, screen, { set: { owner } }),
        input(),
      );
    expect(at('no').state(builder, 0)?.visible).toBe(false);
    expect(at('no').state(builder, 1)?.visible).toBe(false);
    expect(at('yes').state(builder, 1)?.visible).toBeUndefined();
    const live = sampleData(
      profile,
      WINDOW,
      evaluateView(profile, WINDOW, screen, { set: { owner: 'no' } }),
      input({
        live: {
          text: () => undefined,
          state: () => ({ visible: true, enabled: true, checked: false }),
        },
      }),
    );
    expect(live.state(builder, 1)?.visible).toBe(true);
  });

  it('checks the part against the template', () => {
    const bad = ruled.replace('building_entry/builder"]', 'building_entry/nothing"]');
    expect(profileOf(bad).diagnostics.map((d) => [d.code, d.message])).toMatchObject([
      ['profile-unknown-path', /No widget of provinceview has the path/],
    ]);
  });
});

describe('sampleData', () => {
  it('takes no sum of a value that is not a number, and a text format as the save has it', async () => {
    const { profile, diagnostics } = profileOf(`{ "formatVersion": 1, "window": "provinceview",
      "content": {
        "provinceview/development_value": {
          "save": ["provinces.{province}.base_tax", "provinces.{province}.name"], "transform": "sum"
        },
        "provinceview/tax_value": { "save": "provinces.{province}.base_tax", "format": "text" },
        "provinceview/autonomy_value": { "save": "provinces.{province}.culture", "format": "number" }
      } }`);
    expect(diagnostics).toEqual([]);
    const choice = new SaveChoice(await save(), 'SWE', 1);
    const view = evaluateView(profile, WINDOW, { width: 1920, height: 1080 }, {});
    const sample = sampleData(profile, WINDOW, view, input({ save: choice }));
    const text = (name: string) => sample.text(named(name));
    // The sum of a name is none: the generated layer fills the box.
    expect(text('development_value')).toEqual({
      text: '12.3',
      layer: 'generated',
      detail: 'number, typical',
    });
    expect(text('tax_value')).toEqual({
      text: '5.000',
      layer: 'save',
      detail: 'provinces.{province}.base_tax',
    });
    // A number format on a value that is no number keeps the value.
    expect(text('autonomy_value')).toEqual({
      text: 'swedish',
      layer: 'save',
      detail: 'provinces.{province}.culture',
    });
  });

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
    // The text the code sizes the box by first, localised; none for the others.
    expect(sample.sizedBy(named('income_value'))).toBe('Province');
    expect(sample.sizedBy(named('tax_value'))).toBeUndefined();
    // Own province: the foreign window is hidden, so its text is not counted.
    expect(text('country_name')?.text).toBe('monarchy');
    // Three buildings: a localised name from the save and a generated builder each.
    expect(sample.counts).toEqual({ hand: 0, live: 0, save: 6 + 3, files: 1, generated: 1 + 3 });
  });

  it("fills a map source with the chosen province's area or region, localised", async () => {
    const { profile, diagnostics } = profileOf(`{ "formatVersion": 1, "window": "provinceview",
      "content": {
        "provinceview/title": { "map": "area" },
        "provinceview/label_without_source": { "map": "region" },
        "provinceview/culture": { "map": "region" }
      } }`);
    expect(diagnostics).toEqual([]);
    expect(profile.content.find((c) => c.id === 'provinceview/title')).toMatchObject({
      source: 'map',
      map: 'area',
      generated: 'text',
    });
    const map = {
      area: new Map([
        [1, 'uppland_area'],
        [2, 'gotland_area'],
      ]),
      region: new Map([['uppland_area', 'scandinavia_region']]),
    };
    const loc: Record<string, string> = {
      uppland_area: 'Uppland',
      scandinavia_region: 'Scandinavia',
    };
    const at = async (province: number, overrides: Partial<SampleInput> = {}) => {
      const sample = sampleData(
        profile,
        WINDOW,
        undefined,
        input({
          save: new SaveChoice(await save(), 'SWE', province),
          map,
          localise: (key) => loc[key],
          ...overrides,
        }),
      );
      return (name: string) => sample.text(named(name));
    };
    const stockholm = await at(1);
    expect(stockholm('title')).toEqual({
      text: 'Uppland',
      layer: 'files',
      detail: 'area uppland_area',
    });
    expect(stockholm('label_without_source')).toEqual({
      text: 'Scandinavia',
      layer: 'files',
      detail: 'region scandinavia_region',
    });
    // An area without its localisation shows its key; one without a region falls through.
    const gotland = await at(2);
    expect(gotland('title')).toMatchObject({ text: 'gotland_area', layer: 'files' });
    expect(gotland('culture')).toMatchObject({ text: 'Northmarch', layer: 'generated' });
    // A province the map does not place, or no map, falls through too.
    expect((await at(3))('title')).toMatchObject({ layer: 'generated' });
    const noMap = sampleData(
      profile,
      WINDOW,
      undefined,
      input({ save: new SaveChoice(await save(), 'SWE', 1) }),
    );
    expect(noMap.text(named('title'))).toMatchObject({ layer: 'generated' });
    // Without a save there is no province.
    const none = sampleData(profile, WINDOW, undefined, input({ map }));
    expect(none.text(named('title'))).toMatchObject({ layer: 'generated' });
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

  it("fills a rule's text from the files in its case, under a live snapshot and a typed text", () => {
    const { profile, diagnostics } = profileOf(`{ "formatVersion": 1, "window": "provinceview",
      "selectors": { "kind": { "kind": "ui", "values": { "own": "Own", "other": "Other" } } },
      "rules": {
        "own-title": { "when": { "kind": "own" }, "text": { "provinceview/title": "PROVINCE_TITLE" } },
        "other-title": { "when": { "kind": "other" }, "text": { "provinceview/title": "SWE" } },
        "culture": { "text": { "provinceview/culture": "NO_SUCH_KEY" } }
      },
      "content": { "provinceview/title": { "generated": "text" } } }`);
    expect(diagnostics).toEqual([]);
    const screen = { width: 1920, height: 1080 };
    const viewOf = (kind: string) => evaluateView(profile, WINDOW, screen, { set: { kind } });
    const own = sampleData(profile, WINDOW, viewOf('own'), input());
    // Over the content's generated text, from the playset's localisation.
    expect(own.text(named('title'))).toEqual({
      text: 'Province',
      layer: 'files',
      detail: 'PROVINCE_TITLE',
    });
    expect(sampleData(profile, WINDOW, viewOf('other'), input()).text(named('title'))?.text).toBe(
      'Sweden',
    );
    // A key the playset does not localise shows as the key, as the game writes it.
    expect(own.text(named('culture'))).toMatchObject({ text: 'NO_SUCH_KEY', layer: 'files' });
    const live = sampleData(
      profile,
      WINDOW,
      viewOf('own'),
      input({ live: { text: (path) => (path === 'provinceview/title' ? 'Kalmar' : undefined) } }),
    );
    expect(live.text(named('title'))).toMatchObject({ text: 'Kalmar', layer: 'live' });
    const typed = sampleData(
      profile,
      WINDOW,
      viewOf('own'),
      input({ hand: { text: (path) => (path === 'provinceview/title' ? 'Mine' : undefined) } }),
    );
    expect(typed.text(named('title'))).toMatchObject({ text: 'Mine', layer: 'hand' });
  });

  it("adds a rule's suffix after its key's text and writes a literal text, even an empty one", () => {
    const { profile, diagnostics } = profileOf(`{ "formatVersion": 1, "window": "provinceview",
      "rules": {
        "texts": { "text": {
          "provinceview/title": { "key": "PROVINCE_TITLE", "suffix": "\\n" },
          "provinceview/culture": { "literal": "" }
        } }
      } }`);
    expect(diagnostics).toEqual([]);
    const view = evaluateView(profile, WINDOW, { width: 1920, height: 1080 }, {});
    const sample = sampleData(profile, WINDOW, view, input());
    expect(sample.text(named('title'))).toEqual({
      text: 'Province\n',
      layer: 'files',
      detail: 'PROVINCE_TITLE',
    });
    expect(sample.text(named('culture'))).toEqual({ text: '', layer: 'files', detail: 'literal' });
  });

  it("writes a rule's text of parts one after another, with its keys' variables filled", () => {
    const { profile, diagnostics } = profileOf(`{ "formatVersion": 1, "window": "provinceview",
      "rules": {
        "texts": { "text": {
          "provinceview/title": [
            { "literal": "> " },
            { "key": "PROVINCE_TITLE", "suffix": "\\n" },
            { "key": "TRUCE", "vars": {
              "DATE": { "literal": "1 May 1450" },
              "WHO": "SWE",
              "AMOUNT": { "literal": "3" }
            } }
          ]
        } }
      } }`);
    expect(diagnostics).toEqual([]);
    const view = evaluateView(profile, WINDOW, { width: 1920, height: 1080 }, {});
    const sample = sampleData(profile, WINDOW, view, input());
    // A variable's value is a text of its own (a key here); a colour format colours it, another
    // format is left out, and a variable without a value stays as written.
    expect(sample.text(named('title'))).toEqual({
      text: '> Province\nA truce until §Y1 May 1450§W with §YSweden§! ($LEFT$, 3).',
      layer: 'files',
      detail: 'PROVINCE_TITLE + TRUCE',
    });
  });

  it("sets a part of each entry from the save's entry: shown by yes, its first defined sprite", async () => {
    const { profile, diagnostics } = profileOf(
      PROFILE.replace(
        '"building_entry/builder": { "generated": "text" }\n      }',
        '"building_entry/builder": { "generated": "text" }\n      },\n' +
          '      "states": { "building_entry/builder": { "visible": "entry.value", "sprite": ["entry.key", "entry.value"] },' +
          ' "building_entry/building_name": { "visible": "entry.key" } }',
      ),
    );
    expect(diagnostics).toEqual([]);
    const builder = named('builder');
    const sample = sampleData(
      profile,
      WINDOW,
      undefined,
      input({
        save: new SaveChoice(await save(), 'SWE', 1),
        spriteExists: (name) => name === 'marketplace',
      }),
    );
    // temple=yes: shown, and neither sprite defined, so the last; marketplace's own is defined.
    expect(sample.state(builder, 0)).toMatchObject({ visible: true, sprite: 'yes' });
    expect(sample.state(builder, 1)).toMatchObject({ visible: true, sprite: 'marketplace' });
    // A value other than yes hides the part.
    expect(sample.state(named('building_name'), 0)).toMatchObject({ visible: false });
    // Without a save the entries are generated and keep the template's state.
    expect(sampleData(profile, WINDOW, undefined, input()).state(builder, 0)).toBeUndefined();
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
      'country.religionIcon': 'none',
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
      'country.religionIcon': 'none',
    });
    // The country's facts hold without a province.
    expect(saveFacts(new SaveChoice(s, 'SWE', undefined))).toEqual({
      'country.religionIcon': 'none',
    });
    expect(saveFacts(new SaveChoice(s, 'DAN', undefined))).toEqual({
      'country.religionIcon': 'secondary',
      'country.institution': 'printing_press',
      'country.patriarchAuthority': '0.462',
    });
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

describe('generated whole numbers', () => {
  it('fit a level or a count, where a number with decimals would wrap', () => {
    expect(['short', 'typical', 'long'].map((l) => generatedText('integer', l as never))).toEqual([
      '1',
      '3',
      '12',
    ]);
    expect(generatedText('number', 'typical')).toBe('12.3');
  });
});
