// Province names as inlay hints (etch#648, P3.14): in a script file, a province id that Etch: Check
// Province IDs and Names in the Playset reads (`owns = 151`, a `151 = { … }` scope, a scripted
// call's province argument) gets the province's name in grey after it, as localisation keys get
// their texts. The ids come from the core's walk of that check, with the playset's scripted calls
// it found; the names from the playset's localisation in `etch.language`, of which only the
// `PROV<id>` keys are read. An id the map does not have gets no name: its warning says why.
import * as vscode from 'vscode';
import {
  DEFAULT_LANGUAGE,
  isProvinceIdScriptPath,
  parseScript,
  provinceIdProblem,
  provinceIdsIn,
  type Localisation,
  type ProvinceArguments,
  type ProvinceIdUse,
  type ProvinceIds,
} from '@etch/core';
import { loadPlaysetLocalisation } from '@etch/core/playset';
import { plainLabelText } from '@etch/core/profile';
import { gamePathOf } from './live-game/pick.ts';
import type { PlaysetMap } from './province-ids.ts';

const SELECTOR: vscode.DocumentSelector = [
  {
    scheme: 'file',
    pattern: '**/{common,events,decisions,missions,history,customizable_localization}/**/*.txt',
  },
];

/** The setting that turns the names on and off. */
const SETTING = 'editor.provinceNames';

/** The localisation keys of province names. */
const PROVINCE_NAME_KEYS = /^PROV\d+$/;

/** Where the province ids and the map come from: Etch's province id check. */
export interface ProvinceIdSource {
  /** The playset, its map's ids and the scripted calls' province arguments. */
  playsetMap(): Promise<PlaysetMap | undefined>;
  /** Fires when the check reads the playset again. */
  readonly onDidRefresh: vscode.Event<void>;
}

/** A province name to show after an id, at the id's end. */
export interface ProvinceName {
  readonly use: ProvinceIdUse;
  readonly key: string;
  readonly name: string;
}

/**
 * The names to show after a file's province ids: each id the map has (or any id, without a map)
 * whose `PROV<id>` the localisation defines, as plain text.
 */
export function provinceNames(
  uses: readonly ProvinceIdUse[],
  localisation: Localisation,
  ids: ProvinceIds | undefined,
): ProvinceName[] {
  const names: ProvinceName[] = [];
  for (const use of uses) {
    if (ids !== undefined && provinceIdProblem(use.id, ids) !== undefined) continue;
    const key = `PROV${String(use.id)}`;
    const text = localisation.get(key);
    const name = text === undefined ? undefined : plainLabelText(text);
    if (name !== undefined && name !== '') names.push({ use, key, name });
  }
  return names;
}

interface Loaded {
  readonly map: PlaysetMap;
  readonly localisation: Localisation;
}

export class ProvinceNameHints implements vscode.InlayHintsProvider, vscode.Disposable {
  private loaded: Promise<Loaded | undefined> | undefined;
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeInlayHints = this.changed.event;
  private readonly parsed = new Map<
    string,
    { version: number; calls: ProvinceArguments | undefined; uses: ProvinceIdUse[] }
  >();
  private readonly source: ProvinceIdSource;
  private readonly output: vscode.LogOutputChannel;

  constructor(source: ProvinceIdSource, output: vscode.LogOutputChannel) {
    this.source = source;
    this.output = output;
  }

  /** Forgets the names and the parsed files, and asks VS Code for new hints. */
  reset(): void {
    this.loaded = undefined;
    this.parsed.clear();
    this.changed.fire();
  }

  /** Forgets a closed document's ids. */
  forget(document: vscode.TextDocument): void {
    this.parsed.delete(document.uri.toString());
  }

  dispose(): void {
    this.changed.dispose();
  }

  /** The document's province ids, read once per version and set of scripted calls. */
  private uses(
    document: vscode.TextDocument,
    path: string,
    calls: ProvinceArguments | undefined,
  ): ProvinceIdUse[] {
    const key = document.uri.toString();
    const cached = this.parsed.get(key);
    if (cached?.version === document.version && cached.calls === calls) return cached.uses;
    const uses = provinceIdsIn(parseScript(document.getText(), { script: true }), path, calls);
    this.parsed.set(key, { version: document.version, calls, uses });
    return uses;
  }

  async provideInlayHints(
    document: vscode.TextDocument,
    range: vscode.Range,
  ): Promise<vscode.InlayHint[]> {
    if (!enabled(document)) return [];
    const loaded = await this.load();
    if (loaded === undefined) return [];
    const path = gamePathOf(document.uri.fsPath, loaded.map.files);
    if (path === undefined || !isProvinceIdScriptPath(path)) return [];
    const { ids } = loaded.map;
    const start = document.offsetAt(range.start);
    const end = document.offsetAt(range.end);
    const shown = this.uses(document, path, ids?.calls).filter(
      (use) => use.end >= start && use.start <= end,
    );
    return provinceNames(shown, loaded.localisation, ids).map(({ use, key, name }) => {
      const hint = new vscode.InlayHint(document.positionAt(use.end), name);
      hint.paddingLeft = true;
      const tooltip = new vscode.MarkdownString();
      tooltip.appendMarkdown(`**${key}** · ${loaded.localisation.language}`);
      const from = loaded.localisation.source(key);
      if (from !== undefined) tooltip.appendMarkdown(` · \`${from.path}\``);
      tooltip.appendMarkdown('\n\n');
      tooltip.appendText(`Province ${String(use.id)}: ${name}`);
      hint.tooltip = tooltip;
      return hint;
    });
  }

  private load(): Promise<Loaded | undefined> {
    this.loaded ??= (async () => {
      const map = await this.source.playsetMap();
      if (map === undefined) return undefined;
      const folder = vscode.workspace.workspaceFolders?.[0];
      const language = vscode.workspace
        .getConfiguration('etch', folder?.uri)
        .get<string>('language', DEFAULT_LANGUAGE);
      const localisation = await loadPlaysetLocalisation(map.files, language, PROVINCE_NAME_KEYS);
      this.output.info(`Province names: ${String(localisation.size)} in ${language}`);
      return { map, localisation };
    })().catch((error: unknown) => {
      this.output.warn(
        `Province names: the playset's localisation could not be read: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    });
    return this.loaded;
  }
}

function enabled(document: vscode.TextDocument): boolean {
  return vscode.workspace.getConfiguration('etch', document.uri).get<boolean>(SETTING, true);
}

/** Registers the province names; the check's refresh and `.yml` saves read them again. */
export function registerProvinceNames(
  source: ProvinceIdSource,
  output: vscode.LogOutputChannel,
): vscode.Disposable {
  const hints = new ProvinceNameHints(source, output);
  return vscode.Disposable.from(
    hints,
    vscode.languages.registerInlayHintsProvider(SELECTOR, hints),
    source.onDidRefresh(() => {
      hints.reset();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('etch.language') ||
        event.affectsConfiguration(`etch.${SETTING}`)
      ) {
        hints.reset();
      }
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (/\.yml$/i.test(document.fileName)) hints.reset();
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      hints.forget(document);
    }),
  );
}
