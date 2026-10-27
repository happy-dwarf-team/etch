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
  PROFILE_FORMAT_VERSION,
  SELECTOR_KINDS,
  type Condition,
  type Group,
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

  const section = <T>(
    name: string,
    read: (id: string, node: JsonNode, written: { origin: ProfileOrigin; range: SourceRange }) => T,
  ): Layered<T>[] => {
    const node = member(root, name);
    if (node === undefined) return [];
    if (node.value.kind !== 'object') {
      report('error', 'profile-format', node.value, `"${name}" is an object keyed by id.`);
      return [];
    }
    const entries: Layered<T>[] = [];
    for (const entry of node.value.members) {
      const written = { origin, range: { start: entry.start, end: entry.end } };
      if (entry.value.kind === 'null') {
        entries.push({ removed: true, id: entry.key, ...written });
        continue;
      }
      try {
        entries.push(read(entry.key, entry.value, written));
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
    ...(defaultView === undefined ? {} : { defaultView }),
  };
  return { file, diagnostics };
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
  const when: Condition[] = [];
  const whenNode = props.get('when');
  if (whenNode !== undefined) {
    if (whenNode.kind !== 'object') {
      throw new Faulty('"when" is an object of selector values keyed by selector.', whenNode);
    }
    for (const entry of whenNode.members) {
      const values =
        entry.value.kind === 'array'
          ? entry.value.items.map((item) => text$(item, `"${entry.key}"`))
          : [text$(entry.value, `"${entry.key}"`)];
      if (values.length === 0)
        throw new Faulty('A condition names at least one value.', entry.value);
      when.push({ selector: entry.key, values, range: entry });
    }
  }
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
    position: keyed('position', (value) => ({ positionType: text$(value, 'a positionType') })),
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
