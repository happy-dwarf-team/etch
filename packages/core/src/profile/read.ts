/**
 * Reads one window profile file (ADR 0006): JSONC, checked against the format as
 * `profiles/window-profile.schema.json` describes it. A faulty entry is skipped with an error at
 * its range and the rest of the file applies; a file with a newer `formatVersion` is skipped with
 * a notice. What needs the window or the other layers (paths, names, values) is checked later,
 * by `checkProfile`.
 */
import type { SourceRange } from '../script/tree.ts';
import { factNamed } from './facts.ts';
import {
  GENERATED_KINDS,
  PROFILE_FORMAT_VERSION,
  SELECTOR_KINDS,
  VALUE_FORMATS,
  type Condition,
  type Content,
  type ContentSource,
  type ContentSourceKind,
  type ContentTransform,
  type GeneratedKind,
  type Group,
  type Link,
  type PlacePoint,
  type Placement,
  type Repeater,
  type RepeaterField,
  type SavePathRef,
  type ValueFormat,
  type Layered,
  type PathRef,
  type ProfileDiagnostic,
  type ProfileFile,
  type ProfileMod,
  type ProfileOrigin,
  type Rule,
  type Selector,
  type SelectorKind,
  type SelectorSetting,
  type SelectorValue,
  type View,
} from './format.ts';
import { parseJsonc, type JsonMember, type JsonNode } from './jsonc.ts';

export interface ReadProfile {
  /** `undefined` when nothing of the file can be used. */
  readonly file: ProfileFile | undefined;
  readonly diagnostics: readonly ProfileDiagnostic[];
}

/** An entry that cannot be used: the reason, at a range of the file. */
class Faulty extends Error {
  readonly range: SourceRange;
  constructor(message: string, range: SourceRange) {
    super(message);
    this.range = range;
  }
}

const TOP_LEVEL = new Set([
  '$schema',
  'formatVersion',
  'window',
  'checkedWith',
  'mod',
  'selectors',
  'groups',
  'rules',
  'views',
  'content',
  'repeaters',
  'links',
  'defaultView',
]);

/** Reads a profile file's text; `origin` says which layer it is. */
export function readProfile(text: string, origin: ProfileOrigin): ReadProfile {
  const diagnostics: ProfileDiagnostic[] = [];
  const report = (
    severity: ProfileDiagnostic['severity'],
    code: ProfileDiagnostic['code'],
    range: SourceRange,
    message: string,
  ): void => {
    diagnostics.push({
      severity,
      code,
      message,
      start: range.start,
      end: range.end,
      file: origin.file,
    });
  };
  const fault = (error: unknown): void => {
    if (!(error instanceof Faulty)) throw error;
    report('error', 'profile-format', error.range, error.message);
  };

  const parsed = parseJsonc(text);
  if (parsed.root === undefined) {
    const error = parsed.error ?? { message: 'Not JSONC', start: 0, end: 0 };
    report('error', 'profile-format', error, `${error.message}.`);
    return { file: undefined, diagnostics };
  }
  const root = parsed.root;
  if (root.kind !== 'object') {
    report('error', 'profile-format', root, 'A window profile is an object.');
    return { file: undefined, diagnostics };
  }

  const version = member(root, 'formatVersion');
  if (version?.value.kind !== 'number' || !Number.isInteger(version.value.value)) {
    report(
      'error',
      'profile-format',
      version?.value ?? root,
      `A window profile starts with "formatVersion": ${String(PROFILE_FORMAT_VERSION)}.`,
    );
    return { file: undefined, diagnostics };
  }
  if (version.value.value > PROFILE_FORMAT_VERSION) {
    report(
      'warning',
      'profile-newer-format',
      version.value,
      `This file has formatVersion ${String(version.value.value)}; this Etch reads ` +
        `${String(PROFILE_FORMAT_VERSION)} and skips it. Update Etch to use it.`,
    );
    return { file: undefined, diagnostics };
  }
  if (version.value.value < 1) {
    report('error', 'profile-format', version.value, 'formatVersion starts at 1.');
    return { file: undefined, diagnostics };
  }

  let window: string;
  try {
    window = text$(required(root, 'window'), 'window');
  } catch (error) {
    fault(error);
    return { file: undefined, diagnostics };
  }

  for (const entry of root.members) {
    if (!TOP_LEVEL.has(entry.key)) {
      report('error', 'profile-format', entry.keyRange, `Unknown property "${entry.key}".`);
    }
  }

  let checkedWith: string | undefined;
  let mod: ProfileMod | undefined;
  let defaultView: ProfileFile['defaultView'];
  try {
    const node = member(root, 'checkedWith');
    if (node !== undefined) checkedWith = text$(node.value, 'checkedWith');
  } catch (error) {
    fault(error);
  }
  try {
    const node = member(root, 'mod');
    if (node !== undefined) mod = readMod(node.value);
  } catch (error) {
    fault(error);
  }
  try {
    const node = member(root, 'defaultView');
    if (node !== undefined)
      defaultView = { id: text$(node.value, 'defaultView'), range: node.value };
  } catch (error) {
    fault(error);
  }

  /** A section keyed by id, or by widget path (`byPath`), whose keys compare without case. */
  const section = <T>(
    name: string,
    read: (
      id: string,
      node: JsonNode,
      written: { origin: ProfileOrigin; range: SourceRange },
      key: JsonMember,
    ) => T,
    byPath = false,
  ): Layered<T>[] => {
    const node = member(root, name);
    if (node === undefined) return [];
    if (node.value.kind !== 'object') {
      const keyed = byPath ? 'widget path' : 'id';
      report('error', 'profile-format', node.value, `"${name}" is an object keyed by ${keyed}.`);
      return [];
    }
    const entries: Layered<T>[] = [];
    for (const entry of node.value.members) {
      const written = { origin, range: { start: entry.start, end: entry.end } };
      const id = byPath ? pathId(entry.key) : entry.key;
      if (entry.value.kind === 'null') {
        entries.push({ removed: true, id, ...written });
        continue;
      }
      try {
        entries.push(read(id, entry.value, written, entry));
      } catch (error) {
        fault(error);
      }
    }
    return entries;
  };

  const file: ProfileFile = {
    origin,
    window,
    ...(checkedWith === undefined ? {} : { checkedWith }),
    ...(mod === undefined ? {} : { mod }),
    selectors: section('selectors', readSelector),
    groups: section('groups', readGroup),
    rules: section('rules', readRule),
    views: section('views', readView),
    content: section('content', readContent, true),
    repeaters: section('repeaters', readRepeater, true),
    links: section('links', readLink),
    ...(defaultView === undefined ? {} : { defaultView }),
  };
  return { file, diagnostics };
}

/** The key of an entry keyed by widget path: names compare without case, as the game's do. */
export function pathId(path: string): string {
  return path.trim().toLowerCase();
}

const SOURCE_KEYS = ['save', 'loc', 'engine', 'generated', 'transform', 'format', 'decimals'];

/** The source of a text, from the properties of a content entry or a repeater's field. */
function readSource(node: JsonNode, props: Map<string, JsonNode>, what: string): ContentSource {
  const saveNode = props.get('save');
  const locNode = props.get('loc');
  const engineNode = props.get('engine');
  const sources = [saveNode, locNode, engineNode].filter((n) => n !== undefined);
  if (sources.length > 1) {
    throw new Faulty(`${capitalise(what)} has one source: "save", "loc" or "engine".`, node);
  }
  const generatedNode = props.get('generated');
  let generated: GeneratedKind | undefined;
  if (generatedNode !== undefined) {
    const kind = text$(generatedNode, '"generated"');
    if (!(GENERATED_KINDS as readonly string[]).includes(kind)) {
      throw new Faulty(
        `"generated" is one of ${GENERATED_KINDS.join(', ')}, not "${kind}".`,
        generatedNode,
      );
    }
    generated = kind as GeneratedKind;
  }
  if (sources.length === 0 && generated === undefined) {
    throw new Faulty(
      `${capitalise(what)} has a source: "save", "loc", "engine" or "generated".`,
      node,
    );
  }

  const transformNode = props.get('transform');
  const formatNode = props.get('format');
  const decimalsNode = props.get('decimals');
  if (saveNode === undefined) {
    const only = transformNode ?? formatNode ?? decimalsNode;
    if (only !== undefined) {
      throw new Faulty('"transform", "format" and "decimals" go with a "save" source.', only);
    }
  }

  let save: SavePathRef[] = [];
  if (saveNode !== undefined) {
    save =
      saveNode.kind === 'array'
        ? saveNode.items.map((item) => ({ path: text$(item, 'a save path'), range: item }))
        : [{ path: text$(saveNode, 'a save path'), range: saveNode }];
    if (save.length === 0) throw new Faulty('"save" names at least one save path.', saveNode);
  }
  let transform: ContentTransform | undefined;
  if (transformNode !== undefined) {
    const name = text$(transformNode, '"transform"');
    if (name !== 'sum' && name !== 'localise') {
      throw new Faulty(`"transform" is "sum" or "localise", not "${name}".`, transformNode);
    }
    transform = name;
  }
  if (save.length > 1 && transform !== 'sum') {
    throw new Faulty('Several save paths are added up: give "transform": "sum".', saveNode ?? node);
  }
  if (transform === 'sum' && save.length < 2) {
    throw new Faulty(
      '"sum" adds up several save paths: give "save" an array.',
      transformNode ?? node,
    );
  }
  let format: ValueFormat = transform === 'sum' ? 'number' : 'text';
  if (formatNode !== undefined) {
    const name = text$(formatNode, '"format"');
    if (!(VALUE_FORMATS as readonly string[]).includes(name)) {
      throw new Faulty(
        `"format" is one of ${VALUE_FORMATS.join(', ')}, not "${name}".`,
        formatNode,
      );
    }
    format = name as ValueFormat;
    if (transform === 'localise' && format !== 'text') {
      throw new Faulty('A localised value is a text.', formatNode);
    }
    if (transform === 'sum' && format === 'text') {
      throw new Faulty('A sum is a number or a percentage.', formatNode);
    }
  }
  let decimals: number | undefined;
  if (decimalsNode !== undefined) {
    if (
      decimalsNode.kind !== 'number' ||
      !Number.isInteger(decimalsNode.value) ||
      decimalsNode.value < 0 ||
      decimalsNode.value > 4
    ) {
      throw new Faulty('"decimals" is a whole number from 0 to 4.', decimalsNode);
    }
    if (format === 'text')
      throw new Faulty('"decimals" goes with a number or a percentage.', decimalsNode);
    decimals = decimalsNode.value;
  }
  let loc: string | undefined;
  if (locNode !== undefined) loc = text$(locNode, '"loc"');
  if (engineNode !== undefined && (engineNode.kind !== 'boolean' || !engineNode.value)) {
    throw new Faulty('"engine" is true: only a live snapshot knows the value.', engineNode);
  }

  const source: ContentSourceKind =
    saveNode !== undefined
      ? 'save'
      : locNode !== undefined
        ? 'loc'
        : engineNode !== undefined
          ? 'engine'
          : 'generated';
  return {
    source,
    save,
    ...(transform === undefined ? {} : { transform }),
    format,
    ...(decimals === undefined ? {} : { decimals }),
    ...(loc === undefined ? {} : { loc }),
    generated: generated ?? (format === 'text' ? 'text' : format),
  };
}

function readContent(
  id: string,
  node: JsonNode,
  written: { origin: ProfileOrigin; range: SourceRange },
  key: JsonMember,
): Content {
  const props = object(node, `the content of "${key.key}"`, [...SOURCE_KEYS, 'note']);
  optionalText(props.get('note'), 'note');
  return {
    id,
    path: pathKey(key),
    ...readSource(node, props, `the content of "${key.key}"`),
    ...written,
  };
}

function readRepeater(
  id: string,
  node: JsonNode,
  written: { origin: ProfileOrigin; range: SourceRange },
  key: JsonMember,
): Repeater {
  const what = `the repeater of "${key.key}"`;
  const props = object(node, what, ['template', 'from', 'count', 'fields', 'place', 'note']);
  optionalText(props.get('note'), 'note');
  const templateNode = props.get('template');
  if (templateNode === undefined) {
    throw new Faulty(`${capitalise(what)} names the "template" of its entries.`, node);
  }
  const fromNode = props.get('from');
  const countNode = props.get('count');
  let count = 3;
  if (countNode !== undefined) {
    if (
      countNode.kind !== 'number' ||
      !Number.isInteger(countNode.value) ||
      countNode.value < 0 ||
      countNode.value > 100
    ) {
      throw new Faulty('"count" is a whole number of entries from 0 to 100.', countNode);
    }
    count = countNode.value;
  }
  const fields: RepeaterField[] = [];
  const fieldsNode = props.get('fields');
  if (fieldsNode !== undefined) {
    if (fieldsNode.kind !== 'object') {
      throw new Faulty(
        '"fields" is an object of sources keyed by a path in the template.',
        fieldsNode,
      );
    }
    for (const entry of fieldsNode.members) {
      const field = `field "${entry.key}"`;
      const fieldProps = object(entry.value, field, SOURCE_KEYS);
      fields.push({ path: pathKey(entry), ...readSource(entry.value, fieldProps, field) });
    }
  }
  const placeNode = props.get('place');
  const place = placeNode === undefined ? undefined : readPlacement(placeNode);
  return {
    id,
    path: pathKey(key),
    template: text$(templateNode, '"template"'),
    templateRange: templateNode,
    ...(place === undefined ? {} : { place }),
    ...(fromNode === undefined
      ? {}
      : { from: { path: text$(fromNode, '"from"'), range: fromNode } }),
    count,
    fields,
    ...written,
  };
}

/** A repeater's `place`: points and columns as pixels or `positionType` names. */
function readPlacement(node: JsonNode): Placement {
  const props = object(node, '"place"', ['start', 'step', 'columns']);
  const point = (value: JsonNode, what: string): PlacePoint => {
    if (value.kind === 'string') return value.value;
    const xy = object(value, `"${what}" of "place"`, ['x', 'y']);
    const whole = (n: JsonNode | undefined): number => {
      if (n?.kind !== 'number' || !Number.isInteger(n.value)) {
        throw new Faulty(
          `"${what}" of "place" is a positionType's name or whole pixels { "x", "y" }.`,
          n ?? value,
        );
      }
      return n.value;
    };
    return { x: whole(xy.get('x')), y: whole(xy.get('y')) };
  };
  const startNode = props.get('start');
  if (startNode === undefined) {
    throw new Faulty('"place" names the "start" of the first entry.', node);
  }
  const stepNode = props.get('step');
  const columnsNode = props.get('columns');
  let columns: number | string | undefined;
  if (columnsNode !== undefined) {
    if (columnsNode.kind === 'string') columns = columnsNode.value;
    else if (
      columnsNode.kind === 'number' &&
      Number.isInteger(columnsNode.value) &&
      columnsNode.value >= 1
    ) {
      columns = columnsNode.value;
    } else {
      throw new Faulty(
        '"columns" of "place" is a whole number from 1 or a positionType\'s name.',
        columnsNode,
      );
    }
  }
  return {
    start: point(startNode, 'start'),
    ...(stepNode === undefined ? {} : { step: point(stepNode, 'step') }),
    ...(columns === undefined ? {} : { columns }),
  };
}

function readLink(
  id: string,
  node: JsonNode,
  written: { origin: ProfileOrigin; range: SourceRange },
): Link {
  const props = object(node, `link "${id}"`, ['when', 'window', 'label']);
  const windowNode = props.get('window');
  if (windowNode === undefined) throw new Faulty(`Link "${id}" names the "window" it opens.`, node);
  const whenNode = props.get('when');
  if (whenNode === undefined) throw new Faulty(`Link "${id}" says "when" it holds.`, node);
  const label = optionalText(props.get('label'), 'label');
  return {
    id,
    when: readWhen(whenNode),
    window: text$(windowNode, '"window"'),
    windowRange: windowNode,
    ...(label === undefined ? {} : { label }),
    ...written,
  };
}

/** Conditions keyed by selector: one value, or any of several. */
function readWhen(whenNode: JsonNode): Condition[] {
  if (whenNode.kind !== 'object') {
    throw new Faulty('"when" is an object of selector values keyed by selector.', whenNode);
  }
  const when: Condition[] = [];
  for (const entry of whenNode.members) {
    const values =
      entry.value.kind === 'array'
        ? entry.value.items.map((item) => text$(item, `"${entry.key}"`))
        : [text$(entry.value, `"${entry.key}"`)];
    if (values.length === 0) throw new Faulty('A condition names at least one value.', entry.value);
    when.push({ selector: entry.key, values, range: entry });
  }
  return when;
}

function readMod(node: JsonNode): ProfileMod {
  const props = object(node, 'mod', ['remoteFileId', 'name']);
  const remoteFileId = optionalText(props.get('remoteFileId'), 'remoteFileId');
  const name = optionalText(props.get('name'), 'name');
  if (remoteFileId === undefined && name === undefined) {
    throw new Faulty('"mod" names the mod by "remoteFileId" or "name".', node);
  }
  return {
    ...(remoteFileId === undefined ? {} : { remoteFileId }),
    ...(name === undefined ? {} : { name }),
  };
}

function readSelector(
  id: string,
  node: JsonNode,
  written: { origin: ProfileOrigin; range: SourceRange },
): Selector {
  const props = object(node, `selector "${id}"`, [
    'kind',
    'label',
    'values',
    'default',
    'fact',
    'note',
  ]);
  const kindNode = props.get('kind');
  if (kindNode === undefined) throw new Faulty(`Selector "${id}" has no "kind".`, node);
  const kind = text$(kindNode, 'kind');
  if (!(SELECTOR_KINDS as readonly string[]).includes(kind)) {
    throw new Faulty(`"kind" is one of ${SELECTOR_KINDS.join(', ')}, not "${kind}".`, kindNode);
  }
  const fact = optionalText(props.get('fact'), 'fact');
  if (kind === 'data' && fact === undefined) {
    throw new Faulty(`Data selector "${id}" names the fact it reads in "fact".`, node);
  }
  if (kind !== 'data' && fact !== undefined) {
    throw new Faulty('Only a data selector reads a fact.', props.get('fact') ?? node);
  }
  const valuesNode = props.get('values');
  let values: SelectorValue[];
  if (valuesNode === undefined) {
    // A data selector may take its fact's values as they are.
    const known = fact === undefined ? undefined : factNamed(fact);
    if (known === undefined) throw new Faulty(`Selector "${id}" has no "values".`, node);
    values = known.values.map((value) => ({ id: value, label: value }));
  } else {
    values = readValues(valuesNode, kind as SelectorKind);
  }
  const defaultValue = optionalText(props.get('default'), 'default');
  const label = optionalText(props.get('label'), 'label') ?? id;
  const note = optionalText(props.get('note'), 'note');
  return {
    id,
    kind: kind as SelectorKind,
    label,
    values,
    default: defaultValue ?? values[0]?.id ?? '',
    ...(fact === undefined ? {} : { fact }),
    ...(note === undefined ? {} : { note }),
    ...written,
  };
}

const BOUNDS = ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'] as const;

function readValues(node: JsonNode, kind: SelectorKind): SelectorValue[] {
  if (node.kind !== 'object' || node.members.length === 0) {
    throw new Faulty('"values" is an object of at least one value, keyed by id.', node);
  }
  return node.members.map((entry) => {
    if (entry.value.kind === 'string') {
      if (kind === 'resolution') {
        throw new Faulty('A resolution value gives its screen bounds.', entry.value);
      }
      return { id: entry.key, label: entry.value.value };
    }
    const props = object(entry.value, `value "${entry.key}"`, ['label', ...BOUNDS]);
    const value: { -readonly [K in keyof SelectorValue]: SelectorValue[K] } = {
      id: entry.key,
      label: optionalText(props.get('label'), 'label') ?? entry.key,
    };
    for (const bound of BOUNDS) {
      const n = props.get(bound);
      if (n === undefined) continue;
      if (kind !== 'resolution') throw new Faulty('Only a resolution value has bounds.', n);
      if (n.kind !== 'number' || !Number.isInteger(n.value) || n.value < 0) {
        throw new Faulty(`"${bound}" is a whole number of pixels.`, n);
      }
      value[bound] = n.value;
    }
    if (kind === 'resolution' && BOUNDS.every((b) => value[b] === undefined)) {
      throw new Faulty('A resolution value gives at least one screen bound.', entry.value);
    }
    return value;
  });
}

function readGroup(
  id: string,
  node: JsonNode,
  written: { origin: ProfileOrigin; range: SourceRange },
): Group {
  const props = object(node, `group "${id}"`, ['label', 'selector', 'members', 'none']);
  const selectorNode = props.get('selector');
  if (selectorNode === undefined) throw new Faulty(`Group "${id}" names its "selector".`, node);
  const membersNode = props.get('members');
  if (membersNode?.kind !== 'object' || membersNode.members.length === 0) {
    throw new Faulty(
      `Group "${id}" has "members": an object of paths keyed by selector value.`,
      membersNode ?? node,
    );
  }
  const noneNode = props.get('none');
  if (noneNode !== undefined && noneNode.kind !== 'boolean') {
    throw new Faulty('"none" is true or false.', noneNode);
  }
  const label = optionalText(props.get('label'), 'label');
  return {
    id,
    ...(label === undefined ? {} : { label }),
    selector: text$(selectorNode, 'selector'),
    members: membersNode.members.map((entry) => ({ value: entry.key, ...pathOf(entry.value) })),
    none: noneNode?.kind === 'boolean' && noneNode.value,
    ...written,
  };
}

function readRule(
  id: string,
  node: JsonNode,
  written: { origin: ProfileOrigin; range: SourceRange },
): Rule {
  const props = object(node, `rule "${id}"`, [
    'when',
    'show',
    'hide',
    'notCreated',
    'position',
    'frame',
    'note',
  ]);
  optionalText(props.get('note'), 'note');
  const whenNode = props.get('when');
  const when = whenNode === undefined ? [] : readWhen(whenNode);
  const paths = (key: string): PathRef[] => {
    const n = props.get(key);
    if (n === undefined) return [];
    if (n.kind !== 'array') throw new Faulty(`"${key}" is an array of paths.`, n);
    return n.items.map(pathOf);
  };
  const keyed = <T>(key: string, read: (value: JsonNode) => T): (PathRef & T)[] => {
    const n = props.get(key);
    if (n === undefined) return [];
    if (n.kind !== 'object') throw new Faulty(`"${key}" is an object keyed by path.`, n);
    return n.members.map((entry) => ({ ...pathKey(entry), ...read(entry.value) }));
  };
  const rule: Rule = {
    id,
    when,
    show: paths('show'),
    hide: paths('hide'),
    notCreated: paths('notCreated'),
    position: keyed('position', (value) => {
      if (value.kind !== 'object') return { positionType: text$(value, 'a positionType') };
      const move = object(value, 'a move', ['positionType', 'axis']);
      const typeNode = move.get('positionType');
      if (typeNode === undefined) throw new Faulty('A move names its "positionType".', value);
      const axisNode = move.get('axis');
      const axis = axisNode === undefined ? undefined : text$(axisNode, '"axis"');
      if (axis !== undefined && axis !== 'x' && axis !== 'y') {
        throw new Faulty('"axis" is "x" or "y": the coordinate the move takes.', axisNode ?? value);
      }
      return {
        positionType: text$(typeNode, 'a positionType'),
        ...(axis === undefined ? {} : { axis }),
      };
    }),
    frame: keyed('frame', (value) => {
      if (value.kind !== 'number' || !Number.isInteger(value.value) || value.value < 1) {
        throw new Faulty('A frame is a whole number from 1.', value);
      }
      return { frame: value.value };
    }),
    ...written,
  };
  const effects =
    rule.show.length +
    rule.hide.length +
    rule.notCreated.length +
    rule.position.length +
    rule.frame.length;
  if (effects === 0) {
    throw new Faulty(
      `Rule "${id}" has no effect: show, hide, notCreated, position or frame.`,
      node,
    );
  }
  return rule;
}

function readView(
  id: string,
  node: JsonNode,
  written: { origin: ProfileOrigin; range: SourceRange },
): View {
  const props = object(node, `view "${id}"`, ['label', 'set', 'toggles']);
  const set: SelectorSetting[] = [];
  const setNode = props.get('set');
  if (setNode !== undefined) {
    if (setNode.kind !== 'object') {
      throw new Faulty('"set" is an object of selector values keyed by selector.', setNode);
    }
    for (const entry of setNode.members) {
      set.push({ selector: entry.key, value: text$(entry.value, `"${entry.key}"`), range: entry });
    }
  }
  const toggles: (PathRef & { shown: boolean })[] = [];
  const togglesNode = props.get('toggles');
  if (togglesNode !== undefined) {
    if (togglesNode.kind !== 'object') {
      throw new Faulty(
        '"toggles" is an object of true (shown) or false keyed by path.',
        togglesNode,
      );
    }
    for (const entry of togglesNode.members) {
      if (entry.value.kind !== 'boolean') {
        throw new Faulty('A hand toggle is true (shown) or false (hidden).', entry.value);
      }
      toggles.push({ ...pathKey(entry), shown: entry.value.value });
    }
  }
  return {
    id,
    label: optionalText(props.get('label'), 'label') ?? id,
    set,
    toggles,
    ...written,
  };
}

function member(node: JsonNode & { kind: 'object' }, key: string): JsonMember | undefined {
  return node.members.find((m) => m.key === key);
}

function required(node: JsonNode & { kind: 'object' }, key: string): JsonNode {
  const found = member(node, key);
  if (found === undefined) throw new Faulty(`A window profile has "${key}".`, node);
  return found.value;
}

/** An object's properties by key; any other key is a fault. */
function object(node: JsonNode, what: string, keys: readonly string[]): Map<string, JsonNode> {
  if (node.kind !== 'object') throw new Faulty(`${capitalise(what)} is an object.`, node);
  const props = new Map<string, JsonNode>();
  for (const entry of node.members) {
    if (!keys.includes(entry.key)) {
      throw new Faulty(
        `Unknown property "${entry.key}" in ${what}; it has ${keys.map((k) => `"${k}"`).join(', ')}.`,
        entry.keyRange,
      );
    }
    props.set(entry.key, entry.value);
  }
  return props;
}

function text$(node: JsonNode, what: string): string {
  if (node.kind !== 'string' || node.value.trim() === '') {
    throw new Faulty(`${capitalise(what)} is a text that is not empty.`, node);
  }
  return node.value;
}

function optionalText(node: JsonNode | undefined, what: string): string | undefined {
  return node === undefined ? undefined : text$(node, `"${what}"`);
}

function pathOf(node: JsonNode): PathRef {
  return { path: text$(node, 'a path'), range: node };
}

function pathKey(entry: JsonMember): PathRef {
  if (entry.key.trim() === '') throw new Faulty('A path is not empty.', entry.keyRange);
  return { path: entry.key, range: entry.keyRange };
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
