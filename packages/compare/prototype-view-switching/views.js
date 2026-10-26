// PROTOTYPE (etch#159), throwaway. The pure part: a window profile for `provinceview` in the
// Anbennar playset, the view state (selectors, hand toggles, sample data layers) and what follows
// from it: which nested windows show and which sample text each code-filled text gets. No DOM.
// Facts are from the province view research (etch#155, branch research/province-view).

const P = 'provinceview/';
const PW = P + 'province_window/';
const BW = P + 'buildings_window/';
const AP = BW + 'aPUI_parent_container/';

const SUB_PANELS = [
  'change_culture_view',
  'build_army_view',
  'build_navy_view',
  'client_state_selection',
  'transfer_occupation_window',
  'tradegoods_province_window',
  'allied_objectives_list',
];
const APUI = [
  'transmutative_path',
  'gor_vazumbrog_vault',
  'zena_medakas_majestic_menagerie',
  'mangrove_bio_infra',
  'kobold_citadel',
  'gene_pillar_interaction',
];

/**
 * The window profile, as data: selectors (with their kind: resolution, data, ui, scripted),
 * exclusive groups that tie windows to a selector's values, and named views. The Anbennar part
 * layers on the vanilla part; here they are one object, marked by `from`.
 */
export const PROFILE = {
  window: 'provinceview',
  playset: 'Anbennar + Proper 2K UI Enhanced + P2KE Patch - Anbennar',
  selectors: [
    {
      id: 'resolution',
      label: 'Screen height',
      kind: 'resolution',
      from: 'vanilla',
      values: { small: '≤ 813 px', large: '> 813 px' },
      rule: 'height ≤ 813 creates the small variants, else the _large ones',
    },
    {
      id: 'ownership',
      label: 'Province owner',
      kind: 'data',
      from: 'vanilla',
      values: { own: 'Own', foreign: 'Foreign' },
      rule: "the province's owner is the player's country",
    },
    {
      id: 'tab',
      label: 'Tab',
      kind: 'ui',
      from: 'vanilla',
      values: { province: 'Province', state: 'State' },
    },
    {
      id: 'side',
      label: 'Side panel',
      kind: 'ui',
      from: 'vanilla',
      values: { buildings: 'Buildings', institutions: 'Institutions', history: 'History', none: 'None' },
    },
    {
      id: 'sub',
      label: 'Sub-panel',
      kind: 'ui',
      from: 'vanilla',
      values: Object.fromEntries([['none', 'None'], ...SUB_PANELS.map((s) => [s, s])]),
    },
    {
      id: 'greatProjects',
      label: 'Great projects',
      kind: 'data',
      from: 'vanilla',
      values: { no: 'None', yes: 'Some' },
      rule: 'the province lists great_projects',
    },
    {
      id: 'natives',
      label: 'Native buildings',
      kind: 'data',
      from: 'vanilla',
      values: { no: 'Normal', yes: 'Native' },
      rule: 'the owner builds native buildings (engine test; not in the save)',
      notInSave: true,
    },
    {
      id: 'buttonBar',
      label: 'Province button bar',
      kind: 'scripted',
      from: 'anbennar',
      values: { closed: 'Closed', open: 'Open' },
      rule: 'potential: owner is FROM or its subject, and FROM has flag province_button_UI_opened',
    },
    {
      id: 'apui',
      label: 'aPUI window',
      kind: 'scripted',
      from: 'anbennar',
      values: Object.fromEntries([['none', 'None'], ...APUI.map((a) => [a, a])]),
      rule: 'potential: has_open_aPUI_in_province = { name = <window> } (one at a time: opening one clears the others)',
    },
  ],
  /** Windows a selector value shows; the other members of the group are hidden. */
  groups: [
    { selector: 'tab', members: { province: PW.slice(0, -1), state: P + 'state_window' } },
    {
      selector: 'side',
      members: {
        buildings: P + 'buildings_window',
        institutions: P + 'institutions_window',
        history: P + 'history_window',
      },
    },
    { selector: 'sub', members: Object.fromEntries(SUB_PANELS.map((s) => [s, PW + s])) },
    { selector: 'ownership', members: { own: PW + 'queue_window', foreign: PW + 'foreign_province_window' } },
    { selector: 'apui', members: Object.fromEntries(APUI.map((a) => [a, AP + `aPUI_${a}_window`])) },
    { selector: 'buttonBar', members: { open: PW + 'province_button_window_closed' } },
    { selector: 'greatProjects', members: { yes: BW + 'great_projects_window' } },
  ],
  views: [
    { id: 'own', label: 'Own province', set: { ownership: 'own', tab: 'province', side: 'buildings', sub: 'none', apui: 'none', buttonBar: 'closed' } },
    { id: 'foreign', label: 'Foreign province', set: { ownership: 'foreign', tab: 'province', side: 'buildings', sub: 'none', apui: 'none', buttonBar: 'closed' } },
    { id: 'state', label: 'State tab', set: { ownership: 'own', tab: 'state', side: 'none', sub: 'none', apui: 'none', buttonBar: 'closed' } },
    { id: 'army', label: 'Build army', set: { ownership: 'own', tab: 'province', side: 'buildings', sub: 'build_army_view', apui: 'none' } },
    { id: 'culture', label: 'Change culture', set: { ownership: 'own', tab: 'province', side: 'buildings', sub: 'change_culture_view', apui: 'none' } },
    { id: 'bar', label: 'Province button bar', from: 'anbennar', set: { ownership: 'own', tab: 'province', side: 'buildings', sub: 'none', buttonBar: 'open' } },
    { id: 'citadel', label: 'Kobold citadel', from: 'anbennar', set: { ownership: 'own', tab: 'province', side: 'buildings', sub: 'none', buttonBar: 'open', apui: 'kobold_citadel' } },
    { id: 'pillars', label: 'Gene pillars', from: 'anbennar', set: { ownership: 'own', tab: 'province', side: 'buildings', sub: 'none', buttonBar: 'open', apui: 'gene_pillar_interaction' } },
  ],
  /** Text widgets the game's code fills, by name pattern; their `.gui` text is a placeholder. */
  codeFilled: [
    /_value$/, /_amount$/, /_modifier$/, /^provincename$/, /^capitalname$/, /^area_name$/,
    /^region_name$/, /^religion$/, /^culture$/, /^country_name$/, /^opinion_box$/, /^miltech_value$/,
    /^state_name$/, /^current_edict/, /^tradegoods_name$/, /^fort_number$/, /^occupied_by$/,
    /^label_buildq$/, /^force_limit$/, /^Title$/, /^Description$/, /^revolution_progress_label$/,
    /^aPUI_.*_(title|textbox|text|explanation|explanation_top)$/, /^diggy_.*_text$/,
    /^province_tab_button$/, /^states_tab_button$/,
  ],
};

const NUMERIC = /(_value|_amount|_number|_modifier|^opinion_box|^fort_number|_label)$/;

export const LENGTHS = {
  short: { text: 'Ab', number: '7' },
  typical: { text: 'Northmarch', number: '12.34' },
  long: { text: 'The Grand Duchy of the Western Marches', number: '-1,234.56' },
  overflow: {
    text: 'Bulwar-upon-the-Dhenbasana, Seat of the Sun Elves and the Jaddari Legion of the Phoenix',
    number: '123,456,789.00%',
  },
};

/** Values a live game snapshot would carry. MOCK: no game was started; invented numbers. */
export const MOCK_SNAPSHOT = {
  taken: 'mock · 1444.11.11 · no game started',
  values: {
    [PW + 'tax_value']: '3.42',
    [PW + 'production_value']: '1.87',
    [PW + 'total_value']: '5.29',
    [PW + 'unrest_value']: '-2.00',
    [PW + 'supply_value']: '11',
    [PW + 'manpower_value']: '1.2k',
    [PW + 'sailor_value']: '0',
    [PW + 'attrition_value']: '1',
    [PW + 'tradepower_value']: '6.31',
    [PW + 'tradevalue_value']: '0.94',
    [PW + 'goodsproduced_value']: '1.20',
    [PW + 'resource_price_value']: '2.48',
    [PW + 'defensiveness_value']: '25.0%',
    [PW + 'warscore_value']: '6.3%',
    [P + 'top_section_window/area_name']: 'Vernham',
    [P + 'top_section_window/region_name']: 'Lencenor',
    [BW + 'province_values_window/naval_forcelimit_value']: '0.50',
    [BW + 'province_values_window/land_forcelimit_value']: '1.20',
    [BW + 'province_values_window/capacity_value']: '120',
    [BW + 'province_values_window/build_allowed_value']: '3',
  },
};

export const LAYERS = [
  { id: 'generated', label: 'Generated text', note: 'chosen lengths, for wrapping and overflow' },
  { id: 'files', label: 'Game and mod files', note: 'localisation of written keys (always on)' },
  { id: 'save', label: 'Save', note: 'a province and its owner from a text save' },
  { id: 'snapshot', label: 'Live game snapshot', note: 'exact values the game showed' },
];

export function initialState() {
  return {
    profile: true,
    /** The selectors as the user (or a view) set them. */
    selectors: { ownership: 'own', tab: 'province', side: 'buildings', sub: 'none', greatProjects: 'no', natives: 'no', buttonBar: 'closed', apui: 'none' },
    /** Selectors the user or a view fixed; data selectors not pinned follow the save. */
    pinned: {},
    view: 'own',
    /** Hand toggles from the Widget Outline: path → shown. Remembered per window. */
    manual: {},
    layers: { generated: false, files: true, save: false, snapshot: false },
    length: 'typical',
    country: undefined,
    province: undefined,
  };
}

/** The state after an action; actions are plain objects. */
export function reduce(state, action) {
  switch (action.type) {
    case 'profile':
      return { ...state, profile: action.on };
    case 'view': {
      const view = PROFILE.views.find((v) => v.id === action.id);
      if (view === undefined) return state;
      const pinned = { ...state.pinned };
      for (const k of Object.keys(view.set)) pinned[k] = true;
      // A view sets UI state; ownership follows the save again when a province is chosen.
      if (state.layers.save && state.province !== undefined) delete pinned.ownership;
      return { ...state, profile: true, view: view.id, selectors: { ...state.selectors, ...view.set }, pinned, manual: {} };
    }
    case 'select':
      return {
        ...state,
        view: matchingView({ ...state.selectors, [action.id]: action.value }),
        selectors: { ...state.selectors, [action.id]: action.value },
        pinned: { ...state.pinned, [action.id]: true },
      };
    case 'unpin': {
      const pinned = { ...state.pinned };
      delete pinned[action.id];
      return { ...state, pinned };
    }
    case 'toggle': {
      const manual = { ...state.manual };
      if (manual[action.path] !== undefined && action.shown === undefined) delete manual[action.path];
      else manual[action.path] = action.shown ?? !action.current;
      return { ...state, manual };
    }
    case 'resetManual':
      return { ...state, manual: {} };
    case 'layer':
      return { ...state, layers: { ...state.layers, [action.id]: action.on } };
    case 'length':
      return { ...state, length: action.value, layers: { ...state.layers, generated: true } };
    case 'country':
      return { ...state, country: action.tag, province: undefined };
    case 'province': {
      // Choosing data releases the data selectors so they follow it.
      const pinned = { ...state.pinned };
      delete pinned.ownership;
      delete pinned.greatProjects;
      return { ...state, province: action.id, pinned, layers: { ...state.layers, save: true } };
    }
    default:
      return state;
  }
}

function matchingView(selectors) {
  const v = PROFILE.views.find((view) => Object.entries(view.set).every(([k, val]) => selectors[k] === val));
  return v?.id;
}

/**
 * The selectors in force and where each value came from: `resolution` (the preview screen),
 * `save` (the chosen province and country), `you` (pinned by hand or by a view), `default`.
 */
export function effectiveSelectors(state, screen, province, country) {
  const out = {};
  for (const s of PROFILE.selectors) {
    let value = state.selectors[s.id];
    let source = state.pinned[s.id] ? 'you' : 'default';
    if (s.id === 'resolution') {
      value = screen.height <= 813 ? 'small' : 'large';
      source = 'resolution';
    } else if (!state.pinned[s.id] && state.layers.save && province !== undefined) {
      if (s.id === 'ownership') {
        value = province.owner === country ? 'own' : 'foreign';
        source = 'save';
      } else if (s.id === 'greatProjects') {
        value = province.fields.great_projects === 'yes' ? 'yes' : 'no';
        source = 'save';
      }
    }
    out[s.id] = { value, source };
  }
  return out;
}

/**
 * Each nested window's state: `shown`, `created` (false for the variant the game does not create
 * at this height) and `why` (a short reason). Windows the profile does not know show, as today.
 */
export function windowStates(state, windows, selectors) {
  const result = new Map();
  const sel = (id) => selectors[id].value;
  const decide = (path) => {
    if (!state.profile) return { shown: true, created: true, why: 'no profile: everything' };
    const small = sel('resolution') === 'small';
    if (/\/(select_building|natives_buildings_window)_large$/.test(path) && small)
      return { shown: false, created: false, why: 'not created below 814 px' };
    if (/\/(select_building|natives_buildings_window)$/.test(path) && !small)
      return { shown: false, created: false, why: 'not created above 813 px' };
    if (/\/select_building(_large)?$/.test(path)) return { shown: false, created: true, why: 'opens on a click (building picker)', selector: 'side' };
    if (/\/natives_buildings_window(_large)?$/.test(path)) return { shown: sel('natives') === 'yes', created: true, why: 'native buildings', selector: 'natives' };
    if (path === BW + 'general_buildings_window' || path === BW + 'province_values_window')
      return { shown: sel('natives') === 'no', created: true, why: 'normal buildings', selector: 'natives' };
    // Backgrounds and banners: picked by height and ownership (research view 1 and 2).
    const own = sel('ownership') === 'own';
    const bg = /^provinceview\/provinceview_(foreign_)?bg(_large)?$/.exec(path);
    if (bg) {
      const shown = (bg[1] === undefined) === own && (bg[2] !== undefined) === !small;
      return { shown, created: true, why: `background: ${own ? 'own' : 'foreign'}, ${small ? 'small' : 'large'}`, selector: 'ownership' };
    }
    if (path === P + 'top_section_window/province_banner') return { shown: own, created: true, why: 'own banner', selector: 'ownership' };
    if (path === P + 'top_section_window/province_banner_foreign') return { shown: !own, created: true, why: 'foreign banner', selector: 'ownership' };
    if (path === P + 'province_terrain' && small) return { shown: false, created: true, why: 'hidden below 814 px', selector: 'resolution' };
    if (path === PW + 'progress_bar_window') return { shown: false, created: true, why: 'construction in progress (data)' };
    if (path === AP + 'aPUI_template_window') return { shown: false, created: true, why: 'debug only' };
    for (const g of PROFILE.groups) {
      const entry = Object.entries(g.members).find(([, p]) => p === path);
      if (entry === undefined) continue;
      let shown = sel(g.selector) === entry[0];
      if (g.selector === 'side') shown = shown && sel('tab') === 'province';
      if (g.selector === 'ownership' && entry[0] === 'own') shown = shown && !['build_army_view', 'build_navy_view'].includes(sel('sub'));
      const label = PROFILE.selectors.find((s) => s.id === g.selector)?.label;
      return { shown, created: true, why: `${label}: ${sel(g.selector)}`, selector: g.selector, value: entry[0] };
    }
    return { shown: true, created: true, why: 'always' };
  };
  for (const w of windows) {
    const decided = decide(w.path);
    const hand = state.manual[w.path];
    result.set(w.path, hand === undefined ? decided : { ...decided, shown: hand, why: `by hand (profile: ${decided.shown ? 'shown' : 'hidden'})`, manual: true });
  }
  return result;
}

/** Whether a widget is drawn: it and every ancestor window shown. */
export function drawnWidgets(widgets, states) {
  const drawn = new Array(widgets.length).fill(false);
  widgets.forEach((w, i) => {
    const own = states.get(w.path);
    const parentDrawn = w.parent < 0 ? true : drawn[w.parent];
    drawn[i] = parentDrawn && (own === undefined || own.shown);
  });
  return drawn;
}

/**
 * The sample text of each code-filled text, layer by layer, later winning:
 * path → { text, layer, detail }.
 */
export function sampleTexts(state, widgets, { province, country, localised }) {
  const out = new Map();
  const put = (path, text, layer, detail) => {
    if (text !== undefined && text !== '') out.set(path, { text, layer, detail });
  };
  const textWidgets = widgets.filter((w) => w.text !== undefined || w.kind === 'guiButtonType');
  if (state.layers.generated) {
    const len = LENGTHS[state.length];
    for (const w of textWidgets) {
      if (!PROFILE.codeFilled.some((re) => re.test(w.name))) continue;
      put(w.path, NUMERIC.test(w.name) ? len.number : len.text, 'generated', state.length);
    }
  }
  if (state.layers.save && province !== undefined) {
    const f = province.fields;
    const n = (v) => (v === undefined ? undefined : String(Number(v)));
    const dev = ['base_tax', 'base_production', 'base_manpower'].reduce((a, k) => a + Number(f[k] ?? 0), 0);
    const T = P + 'top_section_window/';
    put(T + 'provincename', province.name, 'save', 'name');
    put(T + 'province_tab_button', province.name, 'save', 'name');
    put(T + 'capitalname', f.capital, 'save', 'capital');
    put(PW + 'tax_base_value', n(f.base_tax), 'save', 'base_tax');
    put(PW + 'prod_base_value', n(f.base_production), 'save', 'base_production');
    put(PW + 'mp_base_value', n(f.base_manpower), 'save', 'base_manpower');
    put(PW + 'development_value', String(dev), 'save', 'base_tax + base_production + base_manpower');
    put(PW + 'religion', localised.religion, 'save', `religion=${f.religion}`);
    put(PW + 'culture', localised.culture, 'save', `culture=${f.culture}`);
    put(PW + 'local_autonomy_value', f.local_autonomy === undefined ? '0%' : `${Number(f.local_autonomy)}%`, 'save', 'local_autonomy');
    put(PW + 'garrison_value', f.garrison === undefined ? undefined : String(Math.round(Number(f.garrison))), 'save', 'garrison');
    put(PW + 'foreign_province_window/country_name', localised.owner, 'save', `owner=${province.owner}`);
    put(PW + 'tradegoods_province_window/tradegoods_name', localised.trade_goods, 'save', `trade_goods=${f.trade_goods}`);
    void country;
  }
  if (state.layers.snapshot) {
    for (const [path, text] of Object.entries(MOCK_SNAPSHOT.values)) put(path, text, 'snapshot', MOCK_SNAPSHOT.taken);
  }
  return out;
}
