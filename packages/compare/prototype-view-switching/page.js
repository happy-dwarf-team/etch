// PROTOTYPE (etch#159), throwaway: the page shell over views.js. Three variants of where the
// switches live: A in toolbar menus, B in a view inspector beside the preview, C in the Widget
// Outline itself with data picked from the status bar.
import * as V from './views.js';

const VARIANTS = {
  A: 'Toolbar menus: View ▾ and Data ▾',
  B: 'Inspector: selectors and data layers beside the preview',
  C: 'Outline-driven: radios in the outline, data from the status bar',
  D: 'Combined: View ▾ with selectors and your views, outline radios and eyes',
};
const KEYS = Object.keys(VARIANTS);
const params = new URLSearchParams(location.search);
const variant = KEYS.includes(params.get('variant')) ? params.get('variant') : 'A';
const RESOLUTIONS = [
  [1920, 1080],
  [1680, 1050],
  [1600, 900],
  [1366, 768],
  [1280, 720],
];
const LAYER_BADGE = { generated: 'G', files: 'F', save: 'S', snapshot: 'L' };
const SOURCE_LABEL = { resolution: 'auto', save: 'save', you: 'you', default: 'default' };
const CONTAINERS = new Set(['windowType', 'containerWindowType', 'eu3dialogtype']);
/** Non-window widgets the profile switches too: backgrounds, banners, the terrain picture. */
const PROFILE_WIDGETS = /^provinceview\/(provinceview_(foreign_)?bg(_large)?|province_terrain|top_section_window\/province_banner(_foreign)?)$/;

const $ = (id) => document.getElementById(id);
const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== undefined && c !== null && c !== false) el.append(c);
  return el;
};

let state = V.initialState();
let resolution = 0;
let layout; // { drawList, widgets, file, key, samplesKey }
let save; // the save index from the server
let province; // the chosen province, with fields and localised names
let derived = { samples: new Map(), selectors: {}, states: new Map(), drawn: [] };
let selected = -1;
const collapsed = new Set();
/** D: windows whose single elements the outline lists. */
const expanded = new Set();

const canvas = $('screen');
const gl = EtchRenderer.createContext(canvas);
const painter = new EtchRenderer.Painter(gl);

const screen = () => ({ width: RESOLUTIONS[resolution][0], height: RESOLUTIONS[resolution][1] });

function dispatch(action) {
  state = V.reduce(state, action);
  schedule();
}

let running = false;
let again = false;
async function schedule() {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      await refresh();
    } while (again);
  } finally {
    running = false;
  }
}

async function relayout(samples, samplesKey) {
  const s = screen();
  const res = await fetch('/api/layout', {
    method: 'POST',
    body: JSON.stringify({ ...s, samples }),
  });
  layout = { ...(await res.json()), key: `${s.width}x${s.height}`, samplesKey };
}

async function refresh() {
  const s = screen();
  if (layout === undefined || layout.key !== `${s.width}x${s.height}`) await relayout({}, '');
  const ctx = { province, country: state.country, localised: province?.localised ?? {} };
  const samples = V.sampleTexts(state, layout.widgets, ctx);
  const plain = Object.fromEntries([...samples].map(([p, v]) => [p, v.text]));
  const key = JSON.stringify(plain);
  if (key !== layout.samplesKey) await relayout(plain, key);
  const selectors = V.effectiveSelectors(state, s, province, state.country);
  // Every widget: hand toggles reach single elements, not only windows.
  const windows = layout.widgets;
  const states = V.windowStates(state, windows, selectors);
  const drawn = V.drawnWidgets(layout.widgets, states);
  derived = { samples, selectors, states, drawn };
  await paint();
  render();
}

async function paint() {
  const { drawList, widgets } = layout;
  const keep = new Array(drawList.draws.length).fill(false);
  widgets.forEach((w, i) => {
    if (!derived.drawn[i]) return;
    for (let d = w.drawStart; d < w.drawEnd; d++) keep[d] = true;
  });
  const result = await painter.paint({ ...drawList, draws: drawList.draws.filter((_, i) => keep[i]) });
  if (result.problems.length > 0) console.warn('texture problems', result.problems.length);
  placeBox($('selbox'), selected);
}

// ---------- shared rendering ----------

function render() {
  $('file').textContent = `${layout.file}`;
  $('resolution').textContent = `${screen().width}×${screen().height}`;
  $('sw-label').textContent = `${variant} · ${VARIANTS[variant]}`;
  $('inspector').hidden = variant !== 'B';
  renderControls();
  renderOutline();
  renderNotices();
  renderStatus();
  if (variant === 'B') renderInspector();
  if (!$('popover').hidden && popover !== undefined) $('popover').replaceChildren(...popover.build(closePopover));
}

function viewLabel() {
  if (!state.profile) return 'All windows (no profile)';
  const v = V.allViews(state).find((x) => x.id === state.view);
  // Hand toggles a view of your own saved are part of it, not edits.
  const edited = Object.entries(state.manual).filter(([p, on]) => v?.manual?.[p] !== on).length;
  let base = v === undefined ? 'Custom view' : v.label;
  // Data selectors that follow the save may differ from what the view says.
  const followed = Object.entries(derived.selectors).filter(([k, s]) => s.source === 'save' && v?.set[k] !== undefined && v.set[k] !== s.value);
  if (followed.length > 0) base += ` (${followed.map(([, s]) => s.value).join(', ')} from the save)`;
  return edited > 0 ? `${base} · ${edited} by hand` : base;
}

function dataLabel() {
  const parts = [];
  if (state.layers.save && province !== undefined) {
    const own = derived.selectors.ownership?.value;
    parts.push(`${save.file} › ${countryName(state.country)} › ${province.name} (${own})`);
  }
  if (state.layers.generated) parts.push(`generated: ${state.length}`);
  if (state.layers.snapshot) parts.push('live snapshot (mock)');
  return parts.length === 0 ? 'No sample data' : parts.join(' · ');
}

const countryName = (tag) => save?.countries.find((c) => c.tag === tag)?.name ?? tag ?? '—';

function renderNotices() {
  const list = $('notices');
  list.replaceChildren();
  if (save?.error) list.append(h('li', { class: 'warning' }, `No save: ${save.error}`));
  const own = derived.selectors.ownership;
  if (state.layers.save && province !== undefined && state.pinned.ownership && province.owner !== undefined) {
    const fromSave = province.owner === state.country ? 'own' : 'foreign';
    if (fromSave !== own.value) {
      list.append(
        h('li', { class: 'warning' },
          `The view shows a ${own.value} province, but ${province.name} is ${fromSave} for ${countryName(state.country)} in the save.`,
          h('button', { onclick: () => dispatch({ type: 'unpin', id: 'ownership' }) }, 'Follow the save')),
      );
    }
  }
  if (state.layers.snapshot) list.append(h('li', {}, `Live snapshot: ${V.MOCK_SNAPSHOT.taken}. Its values win over the save's.`));
}

function renderStatus() {
  const bar = $('statusbar');
  bar.replaceChildren(h('span', { class: 'item' }, '⎇ prototype/view-switching'));
  bar.append(h('span', { class: 'spacer' }));
  if (variant === 'C') {
    bar.append(h('span', { class: 'item click', title: 'Choose sample data', onclick: openDataPick }, `🗃 ${dataLabel()}`));
    bar.append(h('span', { class: 'item click', title: 'Choose a view', onclick: openViewPick }, `👁 ${viewLabel()}`));
  }
  bar.append(h('span', { class: 'item' }, `Etch: P2KE Patch - Anbennar · ${screen().width}×${screen().height}`));
}

// ---------- outline ----------

function windowRows() {
  const rows = [];
  const depthOf = (w) => w.path.split('/').length - 1;
  const isCollapsedUnder = (path) => [...collapsed].some((c) => path.startsWith(c + '/'));
  layout.widgets.forEach((w, i) => {
    if (!CONTAINERS.has(w.kind)) return;
    if (isCollapsedUnder(w.path)) return;
    rows.push({ w, i, depth: depthOf(w) });
    if (variant === 'D' && expanded.has(w.path)) {
      // Single elements of the window, each with its own eye.
      layout.widgets.forEach((t, j) => {
        if (t.parent === i && !CONTAINERS.has(t.kind)) rows.push({ w: t, i: j, depth: depthOf(t), element: true });
      });
    }
    if (variant === 'C' && !collapsed.has(w.path)) {
      // Text widgets the game's code fills, with their sample value.
      layout.widgets.forEach((t, j) => {
        if (t.parent !== i || CONTAINERS.has(t.kind)) return;
        if (!V.PROFILE.codeFilled.some((re) => re.test(t.name))) return;
        rows.push({ w: t, i: j, depth: depthOf(t), text: true });
      });
    }
  });
  return rows;
}

function hasChildWindows(i) {
  return layout.widgets.some((w) => w.parent === i && CONTAINERS.has(w.kind));
}

function renderOutline() {
  $('outline-desc').textContent = viewLabel();
  const actions = $('outline-actions');
  actions.replaceChildren();
  if (variant !== 'B' && Object.keys(state.manual).length > 0) {
    actions.append(h('button', { title: 'Back to the view', onclick: () => dispatch({ type: 'resetManual' }) }, '↺ Reset'));
  }
  if (variant === 'C') {
    actions.append(
      h('button', { title: state.profile ? 'Show everything (no profile)' : 'Use the window profile', onclick: () => dispatch({ type: 'profile', on: !state.profile }) },
        state.profile ? '⧉ Profile' : '⧉ All'),
    );
  }
  const box = $('outline');
  box.replaceChildren();
  let lastGroupHead;
  for (const row of windowRows()) {
    const { w, i, depth } = row;
    const st = derived.states.get(w.path);
    const drawn = derived.drawn[i];
    const indent = h('span', { style: `width:${depth * 12}px;flex:none` });
    if (row.text) {
      const s = derived.samples.get(w.path);
      box.append(
        h('div', { class: `row text${drawn ? '' : ' hidden'}`, onclick: () => select(i) },
          indent, h('span', { class: 'twisty' }), h('span', { class: 'tick' }, 'T'),
          h('span', { class: 'name' }, w.name),
          s ? h('span', { class: `badge b-${s.layer}`, title: `${s.layer}: ${s.detail}` }, LAYER_BADGE[s.layer]) : undefined,
          h('span', { class: 'descr' }, s ? `“${s.text}”` : `“${w.text ?? ''}” (as written)`)),
      );
      continue;
    }
    if (row.element) {
      const s = derived.samples.get(w.path);
      const shown = st?.shown ?? true;
      const toggle = (e) => {
        e.stopPropagation();
        dispatch({ type: 'toggle', path: w.path, current: shown });
      };
      const cls = ['row'];
      if (!drawn) cls.push('hidden');
      if (st?.manual) cls.push('manual');
      if (i === selected) cls.push('sel');
      box.append(
        h('div', { class: cls.join(' '), title: `${w.path}\nline ${w.line}\n${st?.why ?? ''}`, onclick: () => select(i) },
          indent, h('span', { class: 'twisty' }), h('span', { class: 'eye', title: 'Show or hide this element', onclick: toggle }, shown ? '👁' : '—'),
          h('span', { class: 'name' }, w.name),
          s ? h('span', { class: `badge b-${s.layer}`, title: `${s.layer}: ${s.detail}` }, LAYER_BADGE[s.layer]) : undefined,
          h('span', { class: 'descr' }, s ? `“${s.text}”` : w.kind.replace(/Type$/, ''))),
      );
      continue;
    }
    if (variant === 'D') {
      const any = layout.widgets.some((t) => t.parent === i && !CONTAINERS.has(t.kind));
      const twistyD = any
        ? h('span', { class: 'twisty', title: 'Show its elements', onclick: (e) => { e.stopPropagation(); expanded.has(w.path) ? expanded.delete(w.path) : expanded.add(w.path); render(); } },
            expanded.has(w.path) ? '⌄' : '›')
        : h('span', { class: 'twisty' });
      row.twisty = twistyD;
    }
    const twisty = row.twisty ?? (hasChildWindows(i)
      ? h('span', { class: 'twisty', onclick: (e) => { e.stopPropagation(); collapsed.has(w.path) ? collapsed.delete(w.path) : collapsed.add(w.path); render(); } },
          collapsed.has(w.path) ? '›' : '⌄')
      : h('span', { class: 'twisty' }));
    const cls = ['row'];
    if (st && !st.created) cls.push('absent');
    else if (!drawn) cls.push('hidden');
    if (st?.manual) cls.push('manual');
    if (i === selectedWindow()) cls.push('sel');
    const control = outlineControl(w, i, st, drawn);
    if ((variant === 'C' || variant === 'D') && st?.selector && st.value !== undefined && state.profile) {
      const label = V.PROFILE.selectors.find((s) => s.id === st.selector)?.label;
      const head = `${w.path.split('/').slice(0, -1).join('/')}|${st.selector}`;
      if (head !== lastGroupHead) {
        box.append(h('div', { class: 'group-head', style: `padding-left:${depth * 12 + 22}px` }, `${label} (one of)`));
        lastGroupHead = head;
      }
    }
    box.append(
      h('div', { class: cls.join(' '), title: `${w.path}\nline ${w.line}\n${st?.why ?? ''}`, onclick: () => select(i) },
        indent, twisty, control,
        h('span', { class: 'name' }, w.name),
        variant === 'B' || (st && !st.created) ? h('span', { class: 'descr' }, st?.why ?? '') : undefined),
    );
  }
}

function outlineControl(w, i, st, drawn) {
  if (w.parent < 0) return h('span', { class: 'tick' }, '▣');
  if (variant === 'B') {
    // Read-only: the inspector holds the switches; the outline says why.
    const src = st?.manual ? 'you' : st?.selector ? derived.selectors[st.selector]?.source : undefined;
    return h('span', { class: 'tick', title: st?.why }, st && !st.created ? '∅' : drawn ? '●' : '○', src ? '' : '');
  }
  if (st && !st.created) return h('span', { class: 'tick', title: st.why }, '∅');
  const toggle = (e) => {
    e.stopPropagation();
    dispatch({ type: 'toggle', path: w.path, current: st?.shown ?? true });
  };
  if ((variant === 'C' || variant === 'D') && st?.selector && st.value !== undefined && state.profile) {
    const on = derived.selectors[st.selector]?.value === st.value;
    const pick = (e) => {
      e.stopPropagation();
      const def = V.PROFILE.selectors.find((s) => s.id === st.selector);
      const off = 'none' in def.values ? 'none' : Object.keys(def.values).find((k) => k !== st.value);
      dispatch({ type: 'select', id: st.selector, value: on && def.kind !== 'data' && st.selector !== 'tab' ? off : st.value });
    };
    return h('span', { class: 'tick', title: `${st.why} (click to choose)`, onclick: pick }, on ? '◉' : '○');
  }
  if (variant === 'C') return h('span', { class: 'tick', onclick: toggle }, (st?.shown ?? true) ? '☑' : '☐');
  return h('span', { class: 'eye', title: 'Show or hide by hand', onclick: toggle }, (st?.shown ?? true) ? '👁' : '—');
}

function selectedWindow() {
  for (let i = selected; i >= 0; i = layout.widgets[i].parent) if (CONTAINERS.has(layout.widgets[i].kind)) return i;
  return -1;
}

function select(i) {
  selected = i;
  placeBox($('selbox'), i);
  render();
}

// ---------- variant A: toolbar menus ----------

function renderControls() {
  const slot = $('variant-controls');
  slot.replaceChildren();
  if (variant === 'A' || variant === 'D') {
    slot.append(
      h('button', { class: 'menu', onclick: (e) => openViewMenu(e.currentTarget) }, `View: ${viewLabel()}`),
      h('button', { class: 'menu', onclick: (e) => openDataMenu(e.currentTarget) }, `Data: ${dataLabel()}`),
    );
  } else if (variant === 'C') {
    slot.append(h('button', { class: 'chip', onclick: openViewPick, title: 'Choose a view' }, viewLabel()));
  }
}

let popover; // { build }: rebuilt on every render while open, so it shows the current state
const closePopover = () => ($('popover').hidden = true);

function openPopover(anchor, build) {
  const pop = $('popover');
  popover = { build };
  pop.replaceChildren(...build(closePopover));
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${r.left}px`;
  pop.style.top = `${r.bottom + 2}px`;
  pop.hidden = false;
}
document.addEventListener('mousedown', (e) => {
  const pop = $('popover');
  if (!pop.hidden && !pop.contains(e.target) && !e.target.classList.contains('menu') && !$('outline').contains(e.target)) pop.hidden = true;
});

function openViewMenu(anchor) {
  openPopover(anchor, (close) => (variant === 'D' ? viewMenuD() : viewMenuA(close)));
}

/** D: ready views and your own as chips, then every selector compactly, as B's inspector has them. */
function viewMenuD() {
  const edited = Object.keys(state.manual).length;
  return [
    h('div', { class: 'pad' },
      h('div', { class: 'note', style: 'color:var(--dim);font-size:11px;margin-bottom:4px' }, `Profile: provinceview · ${V.PROFILE.playset}`),
      h('div', { class: 'seg', style: 'margin-bottom:6px' }, V.allViews(state).map((v) =>
        h('button', { class: 'chip', title: v.mine ? 'Your view (kept per window)' : v.from === 'anbennar' ? 'Anbennar profile' : 'Vanilla profile',
          'aria-pressed': String(state.profile && state.view === v.id), onclick: () => dispatch({ type: 'view', id: v.id }) },
          v.mine ? `★ ${v.label}` : v.label))),
      h('div', { class: 'seg' },
        h('button', { onclick: () => {
          const label = prompt('Name of the view', `My view ${(state.custom?.length ?? 0) + 1}`);
          if (label) dispatch({ type: 'saveView', label });
        } }, '★ Save as view…'),
        edited > 0 ? h('button', { onclick: () => dispatch({ type: 'resetManual' }) }, `↺ Reset ${edited} by hand`) : undefined,
        h('button', { 'aria-pressed': String(!state.profile), onclick: () => dispatch({ type: 'profile', on: !state.profile }) }, 'All windows'))),
    h('div', { class: 'sep' }),
    h('div', { class: 'pad', style: 'max-height:60vh;overflow:auto' }, selectorRows()),
  ];
}

function viewMenuA(close) {
  {
    const item = (on, label, desc, action) =>
      h('div', { class: 'item', onclick: () => { action(); close(); } }, h('span', { class: 'check' }, on ? '✓' : ''), label,
        desc ? h('span', { class: 'hint', style: 'margin-left:auto;padding:0' }, desc) : undefined);
    return [
      h('div', { class: 'hint' }, `Profile: provinceview · ${V.PROFILE.playset}`),
      ...V.PROFILE.views.map((v) =>
        item(state.profile && state.view === v.id, v.label, v.from === 'anbennar' ? 'Anbennar' : '', () => dispatch({ type: 'view', id: v.id }))),
      h('div', { class: 'sep' }),
      item(!state.profile, 'All windows (no profile)', 'as in 1.x', () => dispatch({ type: 'profile', on: false })),
      Object.keys(state.manual).length > 0
        ? item(false, `Reset ${Object.keys(state.manual).length} hand toggle(s)`, '', () => dispatch({ type: 'resetManual' }))
        : undefined,
      h('div', { class: 'sep' }),
      h('div', { class: 'hint' }, `Height ${screen().height} px → ${derived.selectors.resolution?.value} variants (automatic)`),
      h('div', { class: 'hint' }, 'Toggle windows by hand with 👁 in the Widget Outline.'),
    ].filter(Boolean);
  }
}

function openDataMenu(anchor) {
  openPopover(anchor, () => [h('div', { class: 'pad' }, ...dataLayers())]);
}

// ---------- shared data controls (A's menu, B's inspector) ----------

function dataLayers() {
  const counts = {};
  for (const s of derived.samples.values()) counts[s.layer] = (counts[s.layer] ?? 0) + 1;
  return V.LAYERS.slice()
    .reverse()
    .map((layer) => {
      const on = state.layers[layer.id];
      const head = h('div', { class: 'head' },
        h('input', { type: 'checkbox', checked: on, disabled: layer.id === 'files', onchange: (e) => dispatch({ type: 'layer', id: layer.id, on: e.target.checked }) }),
        h('span', { class: `badge b-${layer.id}` }, LAYER_BADGE[layer.id]),
        h('b', {}, layer.label),
        h('span', { class: 'count' }, on && counts[layer.id] ? `${counts[layer.id]} texts` : ''));
      const body = h('div', { class: 'body' }, h('div', { class: 'note' }, layer.note));
      if (layer.id === 'generated') {
        body.append(h('div', { class: 'seg' }, Object.keys(V.LENGTHS).map((k) =>
          h('button', { 'aria-pressed': String(on && state.length === k), onclick: () => dispatch({ type: 'length', value: k }) }, k))));
      }
      if (layer.id === 'save') body.append(...savePickers());
      if (layer.id === 'snapshot') {
        body.append(h('button', { disabled: true, title: 'The live game is not running (prototype: no game is started)' }, 'Capture from the live game'));
      }
      return h('div', { class: `layer${on ? '' : ' off'}` }, head, body);
    })
    .concat(h('div', { class: 'note', style: 'color:var(--dim);font-size:11px' }, 'Upper layers win. Engine values (income, supply, unrest) come only from a snapshot or by hand.'));
}

function savePickers() {
  if (save === undefined) return [h('div', { class: 'note' }, 'Reading the save…')];
  if (save.error) return [h('div', { class: 'note' }, save.error)];
  const countries = h('input', { list: 'countries', value: state.country ? `${state.country} — ${countryName(state.country)}` : '', placeholder: 'Country tag or name' });
  countries.addEventListener('change', () => {
    const tag = countries.value.split(' ')[0].toUpperCase();
    if (save.countries.some((c) => c.tag === tag)) dispatch({ type: 'country', tag });
  });
  const own = save.provinces.filter((p) => p.owner === state.country);
  const provSelect = h('select', { onchange: (e) => pickProvince(Number(e.target.value)) },
    h('option', { value: '' }, own.length ? `${own.length} provinces of ${state.country}…` : '—'),
    own.map((p) => h('option', { value: p.id, selected: province?.id === p.id }, `${p.name} (${p.id})`)));
  const any = h('input', { list: 'provinces', placeholder: 'Any province: id or name (foreign too)' });
  any.addEventListener('change', () => {
    const id = Number(any.value.split(' ')[0]);
    if (Number.isFinite(id)) pickProvince(id);
  });
  return [
    h('div', { class: 'field' }, h('span', {}, 'Save'), h('span', {}, `${save.file} · ${save.date}`)),
    h('div', { class: 'field' }, h('span', {}, 'Country'), countries),
    h('div', { class: 'field' }, h('span', {}, 'Province'), provSelect),
    h('div', { class: 'field' }, h('span', {}), any),
    h('div', { class: 'note' }, `Player: ${save.player} (from meta). Mods match the playset: ${save.mods.join(', ')}.`),
  ];
}

async function pickProvince(id) {
  if (!Number.isFinite(id)) return;
  const res = await fetch(`/api/province?id=${id}`);
  if (!res.ok) return;
  province = await res.json();
  dispatch({ type: 'province', id });
}

// ---------- variant B: inspector ----------

function renderInspector() {
  const box = $('inspector');
  const rows = selectorRows();
  box.replaceChildren(
    h('div', { class: 'section' },
      h('h3', {}, 'View', h('span', { style: 'flex:1' }),
        h('label', { style: 'text-transform:none;font-weight:400' },
          h('input', { type: 'checkbox', checked: state.profile, onchange: (e) => dispatch({ type: 'profile', on: e.target.checked }) }), ' profile')),
      h('div', { class: 'seg', style: 'margin-bottom:10px' }, V.PROFILE.views.map((v) =>
        h('button', { class: 'chip', 'aria-pressed': String(state.profile && state.view === v.id), onclick: () => dispatch({ type: 'view', id: v.id }) }, v.label))),
      rows,
      Object.keys(state.manual).length > 0 ? h('button', { onclick: () => dispatch({ type: 'resetManual' }) }, `Reset ${Object.keys(state.manual).length} hand toggle(s)`) : undefined),
    h('div', { class: 'section' }, h('h3', {}, 'Sample data'), dataLayers()),
  );
}

function selectorRows() {
  const sel = derived.selectors;
  const rows = V.PROFILE.selectors.map((s) => {
    const cur = sel[s.id];
    const source = cur?.source ?? 'default';
    const auto = s.id === 'resolution';
    const options = Object.entries(s.values);
    const control = options.length > 5
      ? h('select', { onchange: (e) => dispatch({ type: 'select', id: s.id, value: e.target.value }) },
          options.map(([k, label]) => h('option', { value: k, selected: cur.value === k }, label)))
      : h('div', { class: 'seg' }, options.map(([k, label]) =>
          h('button', { 'aria-pressed': String(cur.value === k), disabled: auto, onclick: () => dispatch({ type: 'select', id: s.id, value: k }) }, label)));
    return h('div', { class: 'sel-row' },
      h('div', { class: 'label' },
        h('span', {}, s.label),
        s.from === 'anbennar' ? h('span', { class: 'badge b-default' }, 'Anbennar') : undefined,
        h('span', { class: `badge b-${source}`, title: sourceTitle(s, source) }, SOURCE_LABEL[source]),
        state.pinned[s.id] && s.kind === 'data' && province !== undefined
          ? h('span', { class: 'x', title: 'Follow the save again', onclick: () => dispatch({ type: 'unpin', id: s.id }) }, '✕ follow save')
          : undefined),
      control,
      s.rule ? h('div', { class: 'rule' }, `${s.kind}: ${s.rule}`) : h('div', { class: 'rule' }, `${s.kind}: chosen in the game by a click`));
  });
  return rows;
}

function sourceTitle(s, source) {
  if (source === 'resolution') return `From the preview's resolution: ${s.rule}`;
  if (source === 'save') return `From the save: ${s.rule}`;
  if (source === 'you') return 'Set by you or by the chosen view';
  return s.notInSave ? 'Default; the save cannot tell' : 'Default';
}

// ---------- variant C: quick picks ----------

function quickPick(items, placeholder, onPick) {
  const qp = $('quickpick');
  const input = $('qp-input');
  const list = $('qp-list');
  input.value = '';
  input.placeholder = placeholder;
  let active = 0;
  let shown = items;
  const draw = () => {
    const q = input.value.toLowerCase();
    shown = items.filter((it) => `${it.label} ${it.detail ?? ''}`.toLowerCase().includes(q)).slice(0, 300);
    active = Math.min(active, shown.length - 1);
    list.replaceChildren(...shown.map((it, k) =>
      h('div', { class: `item${k === active ? ' active' : ''}`, onclick: () => done(it) }, h('span', {}, it.label), h('span', { class: 'd' }, it.detail ?? ''))));
  };
  const done = (it) => {
    qp.hidden = true;
    if (it) onPick(it);
  };
  input.oninput = () => { active = 0; draw(); };
  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { active = Math.min(active + 1, shown.length - 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); draw(); e.preventDefault(); }
    if (e.key === 'Enter') done(shown[active]);
    if (e.key === 'Escape') done();
  };
  qp.hidden = false;
  draw();
  input.focus();
}

function openViewPick() {
  quickPick(
    [
      ...V.PROFILE.views.map((v) => ({ label: `${state.view === v.id && state.profile ? '✓ ' : ''}${v.label}`, detail: v.from === 'anbennar' ? 'Anbennar profile' : 'vanilla profile', run: () => dispatch({ type: 'view', id: v.id }) })),
      { label: 'All windows (no profile)', detail: 'as in 1.x', run: () => dispatch({ type: 'profile', on: false }) },
      { label: 'Reset hand toggles', detail: `${Object.keys(state.manual).length} changed`, run: () => dispatch({ type: 'resetManual' }) },
    ],
    'Choose a view of provinceview',
    (it) => it.run(),
  );
}

function openDataPick() {
  quickPick(
    [
      { label: '$(save) Province from the save…', detail: save?.file ?? '', run: pickCountryThenProvince },
      { label: '$(globe) Any province (own or foreign)…', detail: 'by id or name', run: pickAnyProvince },
      ...Object.keys(V.LENGTHS).map((k) => ({ label: `$(text-size) Generated text: ${k}`, detail: `“${V.LENGTHS[k].text.slice(0, 28)}” · ${V.LENGTHS[k].number}`, run: () => dispatch({ type: 'length', value: k }) })),
      { label: `${state.layers.generated ? 'Turn off' : 'Turn on'} generated text`, run: () => dispatch({ type: 'layer', id: 'generated', on: !state.layers.generated }) },
      { label: `${state.layers.save ? 'Turn off' : 'Turn on'} the save layer`, run: () => dispatch({ type: 'layer', id: 'save', on: !state.layers.save }) },
      { label: `${state.layers.snapshot ? 'Turn off' : 'Turn on'} the live snapshot (mock)`, detail: 'game not running', run: () => dispatch({ type: 'layer', id: 'snapshot', on: !state.layers.snapshot }) },
    ],
    `Sample data · now: ${dataLabel()}`,
    (it) => it.run(),
  );
}

function pickCountryThenProvince() {
  if (!save || save.error) return;
  const player = save.countries.find((c) => c.tag === save.player);
  const rest = save.countries.filter((c) => c.tag !== save.player);
  quickPick(
    [player, ...rest].filter(Boolean).map((c) => ({ label: `${c.tag} — ${c.name}`, detail: `${c.tag === save.player ? 'player · ' : ''}${c.provinces} provinces`, tag: c.tag })),
    'Country (the player is first)',
    (it) => {
      state = V.reduce(state, { type: 'country', tag: it.tag });
      const own = save.provinces.filter((p) => p.owner === it.tag);
      quickPick(own.map((p) => ({ label: p.name, detail: `#${p.id}`, id: p.id })), `Province of ${it.tag}`, (pp) => pickProvince(pp.id));
    },
  );
}

function pickAnyProvince() {
  if (!save || save.error) return;
  if (state.country === undefined) state = V.reduce(state, { type: 'country', tag: save.player });
  quickPick(
    save.provinces.map((p) => ({ label: p.name, detail: `#${p.id} · ${p.owner ?? 'unowned'}${p.owner === state.country ? ' (own)' : ''}`, id: p.id })),
    `Any province; own or foreign is seen from ${state.country}`,
    (pp) => pickProvince(pp.id),
  );
}

// ---------- hover and boxes ----------

function screenRect(i) {
  const w = layout.widgets[i];
  const scale = canvas.clientWidth / canvas.width;
  const main = canvas.parentElement.getBoundingClientRect();
  const c = canvas.getBoundingClientRect();
  return { left: c.left - main.left + w.x * scale, top: c.top - main.top + w.y * scale, width: w.width * scale, height: w.height * scale };
}

function placeBox(box, i) {
  if (i < 0 || layout === undefined || !derived.drawn[i]) {
    box.hidden = true;
    return;
  }
  const r = screenRect(i);
  Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  box.hidden = false;
}

function widgetAtPoint(ev) {
  const c = canvas.getBoundingClientRect();
  const x = ((ev.clientX - c.left) * canvas.width) / c.width;
  const y = ((ev.clientY - c.top) * canvas.height) / c.height;
  for (let i = layout.widgets.length - 1; i >= 0; i--) {
    const w = layout.widgets[i];
    if (!derived.drawn[i] || CONTAINERS.has(w.kind) || w.width <= 0 || w.height <= 0) continue;
    if (x >= w.x && y >= w.y && x < w.x + w.width && y < w.y + w.height) return i;
  }
  return -1;
}

canvas.addEventListener('mousemove', (ev) => {
  if (!layout) return;
  const i = widgetAtPoint(ev);
  placeBox($('hoverbox'), i);
  const tip = $('tip');
  if (i < 0) {
    tip.hidden = true;
    return;
  }
  const w = layout.widgets[i];
  const s = derived.samples.get(w.path);
  const text = s ? `\n“${s.text}” ← ${s.layer} (${s.detail})` : w.text !== undefined ? `\n“${w.text}” as written` : '';
  tip.textContent = `${w.path.replace(/\//g, ' › ')}\n${w.kind} · ${layout.file}:${w.line}${text}`;
  tip.style.left = `${ev.clientX + 14}px`;
  tip.style.top = `${ev.clientY + 14}px`;
  tip.hidden = false;
});
canvas.addEventListener('mouseleave', () => {
  $('tip').hidden = true;
  $('hoverbox').hidden = true;
});
canvas.addEventListener('click', (ev) => select(widgetAtPoint(ev)));
window.addEventListener('resize', () => placeBox($('selbox'), selected));

$('resolution').addEventListener('click', () => {
  resolution = (resolution + 1) % RESOLUTIONS.length;
  schedule();
});

// ---------- variant switcher ----------

function go(delta) {
  const next = KEYS[(KEYS.indexOf(variant) + delta + KEYS.length) % KEYS.length];
  const url = new URL(location.href);
  url.searchParams.set('variant', next);
  location.replace(url);
}
$('sw-prev').addEventListener('click', () => go(-1));
$('sw-next').addEventListener('click', () => go(1));
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
  if (!$('quickpick').hidden) return;
  if (e.key === 'ArrowLeft') go(-1);
  if (e.key === 'ArrowRight') go(1);
});

// ---------- start ----------

fetch('/api/save')
  .then((r) => r.json())
  .then((s) => {
    save = s;
    if (!s.error) {
      document.body.append(
        h('datalist', { id: 'countries' }, s.countries.map((c) => h('option', { value: `${c.tag} — ${c.name}` }))),
        h('datalist', { id: 'provinces' }, s.provinces.map((p) => h('option', { value: `${p.id} ${p.name} (${p.owner ?? 'unowned'})` }))),
      );
      state = V.reduce(state, { type: 'country', tag: s.player });
    }
    schedule();
  });
schedule();
