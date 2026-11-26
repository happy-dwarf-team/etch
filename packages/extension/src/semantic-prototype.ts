// PROTOTYPE (etch#759, branch prototype/semantic-tokens, never merged): colours for script files
// from semantic tokens on a file-pattern selector, with no language id and no grammar. It answers
// whether VS Code applies them to a Plain Text document. The classes are a guess from the syntax
// alone: keys of blocks, keys of values, numbers, yes/no, strings, scopes, comments.
import * as vscode from 'vscode';
import { parseScript, type EntryNode } from '@etch/core';

const SELECTOR: vscode.DocumentSelector = [
  { scheme: 'file', pattern: '**/{common,events,decisions,missions,history}/**/*.txt' },
];

const LEGEND = new vscode.SemanticTokensLegend(
  ['namespace', 'function', 'property', 'number', 'keyword', 'string', 'variable', 'comment'],
  [],
);
const SCOPES = new Set(['root', 'from', 'prev', 'this', 'owner', 'controller', 'capital']);

function valueType(text: string, quoted: boolean): number {
  if (quoted) return 5; // string
  if (/^-?\d+(\.\d+)?$/.test(text)) return 3; // number
  if (text === 'yes' || text === 'no') return 4; // keyword
  if (SCOPES.has(text.toLowerCase()) || /^[A-Z]{3}$/.test(text)) return 0; // namespace: a scope
  return 6; // variable
}

function provide(document: vscode.TextDocument): vscode.SemanticTokens {
  const text = document.getText();
  const builder = new vscode.SemanticTokensBuilder(LEGEND);
  const spans: [number, number, number][] = [];
  const visit = (entries: readonly EntryNode[], depth: number): void => {
    for (const entry of entries) {
      if (entry.kind === 'block') {
        visit(entry.entries, depth + 1);
      } else if (entry.kind === 'scalar') {
        spans.push([entry.start, entry.end, valueType(entry.text, entry.quoted)]);
      } else {
        const block = entry.value?.kind === 'block';
        const keyType = SCOPES.has(entry.key.text.toLowerCase()) ? 0 : block ? 1 : 2;
        spans.push([entry.key.start, entry.key.end, keyType]);
        if (entry.value?.kind === 'block') visit(entry.value.entries, depth + 1);
        else if (entry.value !== undefined) {
          spans.push([
            entry.value.start,
            entry.value.end,
            valueType(entry.value.text, entry.value.quoted),
          ]);
        }
      }
    }
  };
  visit(parseScript(text, { script: true }).entries, 0);
  // Comments: the parser skips them, so find them here, outside strings.
  for (const match of text.matchAll(/(^|[^"\n])(#[^\n]*)/g)) {
    const start = (match.index ?? 0) + (match[1]?.length ?? 0);
    spans.push([start, start + (match[2]?.length ?? 0), 7]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  for (const [start, end, type] of spans) {
    const from = document.positionAt(start);
    const to = document.positionAt(end);
    if (from.line !== to.line) continue;
    builder.push(from.line, from.character, to.character - from.character, type, 0);
  }
  return builder.build();
}

export function registerSemanticPrototype(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      SELECTOR,
      { provideDocumentSemanticTokens: provide },
      LEGEND,
    ),
  );
}
