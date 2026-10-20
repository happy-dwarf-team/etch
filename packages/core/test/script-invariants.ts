import type { EntryNode, ParsedScript, ScalarNode, SourceRange } from '../src/index.ts';

/**
 * Checks that every range of a parse points at what the node says it is, and
 * that entries are in text order inside their parent. Returns the problems.
 */
export function rangeProblems(text: string, parsed: ParsedScript): string[] {
  const problems: string[] = [];
  const at = (range: SourceRange): string =>
    `${String(range.start)}-${String(range.end)} ${JSON.stringify(text.slice(range.start, range.end))}`;

  const scalar = (node: ScalarNode): void => {
    const source = text.slice(node.start, node.end);
    const expected = node.quoted
      ? source.endsWith('"') && source.length >= 2
        ? `"${node.text}"`
        : `"${node.text}`
      : node.text;
    if (source !== expected) problems.push(`scalar ${JSON.stringify(node.text)} at ${at(node)}`);
  };

  const entries = (list: readonly EntryNode[], parent: SourceRange): void => {
    let previousEnd = parent.start;
    for (const entry of list) {
      if (entry.start < previousEnd || entry.end > parent.end || entry.end < entry.start) {
        problems.push(`${entry.kind} out of order or outside its parent at ${at(entry)}`);
      }
      previousEnd = entry.end;
      if (entry.kind === 'scalar') {
        scalar(entry);
      } else if (entry.kind === 'block') {
        block(entry.entries, entry, entry.closed);
      } else {
        scalar(entry.key);
        if (entry.start !== entry.key.start) problems.push(`property start at ${at(entry)}`);
        const op = entry.operator;
        if (op && text.slice(op.start, op.end) !== op.text) problems.push(`operator at ${at(op)}`);
        const value = entry.value;
        const end = value?.end ?? op?.end;
        if (entry.end !== end) problems.push(`property end at ${at(entry)}`);
        if (value?.kind === 'scalar') scalar(value);
        if (value?.kind === 'block') block(value.entries, value, value.closed);
      }
    }
  };

  const block = (list: readonly EntryNode[], range: SourceRange, closed: boolean): void => {
    if (text[range.start] !== '{') problems.push(`block start at ${at(range)}`);
    if (closed ? text[range.end - 1] !== '}' : range.end !== text.length) {
      problems.push(`block end at ${at(range)}`);
    }
    entries(list, { start: range.start + 1, end: closed ? range.end - 1 : range.end });
  };

  entries(parsed.entries, { start: 0, end: text.length });
  return problems;
}
