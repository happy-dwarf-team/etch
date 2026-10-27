/**
 * Writes a view into a mod project's window profile (**Save as view**, spec section 4): as an
 * ordinary view of the top layer, so it can be committed with the mod. The rest of the file,
 * comments included, stays as written.
 */
import { PROFILE_FORMAT_VERSION } from './format.ts';
import { parseJsonc, type JsonNode } from './jsonc.ts';

/** A view as Save as view writes it. */
export interface SavedView {
  readonly label: string;
  /** Selector values by selector id. */
  readonly set: Readonly<Record<string, string>>;
  /** Hand toggles by path. */
  readonly toggles: Readonly<Record<string, boolean>>;
}

const INDENT = '  ';

/**
 * The text of a profile file with a view added under `id`, or replacing the view of that id; a
 * new file when `text` is `undefined`. Throws when the file is not JSONC.
 */
export function withView(
  text: string | undefined,
  window: string,
  id: string,
  view: SavedView,
): string {
  const entry = viewText(view);
  if (text === undefined || text.trim() === '') {
    return (
      `{\n${INDENT}"formatVersion": ${String(PROFILE_FORMAT_VERSION)},\n` +
      `${INDENT}"window": ${JSON.stringify(window)},\n` +
      `${INDENT}"views": {\n${indent(`${JSON.stringify(id)}: ${entry}`, 2)}\n${INDENT}}\n}\n`
    );
  }
  const { root, error } = parseJsonc(text);
  if (root?.kind !== 'object') {
    throw new Error(error === undefined ? 'The file is not an object.' : `${error.message}.`);
  }
  const views = root.members.find((m) => m.key === 'views');
  if (views === undefined) {
    return insertMember(
      text,
      root,
      `${JSON.stringify('views')}: {\n${indent(`${JSON.stringify(id)}: ${entry}`, 1)}\n}`,
      1,
    );
  }
  if (views.value.kind !== 'object') throw new Error('"views" is not an object.');
  const same = views.value.members.find((m) => m.key === id);
  if (same !== undefined) {
    return (
      text.slice(0, same.value.start) + indent(entry, 2).trimStart() + text.slice(same.value.end)
    );
  }
  return insertMember(text, views.value, `${JSON.stringify(id)}: ${entry}`, 2);
}

/** A view's JSON, two spaces per level. */
function viewText(view: SavedView): string {
  return JSON.stringify(
    {
      label: view.label,
      ...(Object.keys(view.set).length === 0 ? {} : { set: view.set }),
      ...(Object.keys(view.toggles).length === 0 ? {} : { toggles: view.toggles }),
    },
    undefined,
    2,
  );
}

function indent(text: string, levels: number): string {
  const prefix = INDENT.repeat(levels);
  return text
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
}

/** Inserts a member last in an object, with the comma it needs, at an indentation level. */
function insertMember(
  text: string,
  object: JsonNode & { kind: 'object' },
  member: string,
  level: number,
): string {
  const close = object.end - 1;
  const last = object.members.at(-1);
  const body = indent(member, level).trimStart();
  if (last === undefined) {
    return `${text.slice(0, object.start + 1)}\n${INDENT.repeat(level)}${body}\n${INDENT.repeat(level - 1)}${text.slice(close)}`;
  }
  // A trailing comma after the last member stays where it is; the member goes after it.
  let at = last.end;
  for (;;) {
    const rest = text.slice(at, close);
    const skip = /^(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)/.exec(rest);
    if (skip === null) break;
    at += skip[0].length;
  }
  const comma = text[at] === ',';
  const after = comma ? at + 1 : last.end;
  return `${text.slice(0, after)}${comma ? '' : ','}\n${INDENT.repeat(level)}${body}${text.slice(after)}`;
}
