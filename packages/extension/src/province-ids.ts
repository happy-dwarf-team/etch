// Script values the game uses unchecked and the playset does not have (anvil#426): a warning on
// `owns = 5075`, a `5075 = { … }` scope and the other keys `PROVINCE_ID_KEYS` lists, against the
// `max_provinces` of the playset's `map/default.map` (a mod's when it has one) and its
// `map/definition.csv`, and on the names `SCRIPT_NAME_KEYS` and `SCRIPT_NAME_MEMBERS` list
// (`add_idea_group = …`, `has_active_policy = …`) that the playset does not define, in the open
// script files. Etch: Check Province IDs and Names in the Playset checks every script file the
// playset loads, so that a player can find which mod has such a line.
import { readFile } from 'node:fs/promises';
import * as vscode from 'vscode';
import {
  checkAdjacencies,
  checkClimate,
  checkPositions,
  checkTradeWinds,
  checkContinents,
  checkDefaultMap,
  decodeGameText,
  isProvinceIdScriptPath,
  parseScript,
  type ScriptNames,
} from '@etch/core';
import {
  checkScriptValues,
  definedIds,
  findScriptValueProblems,
  loadProvinceIds,
  loadScriptNames,
  type GameFiles,
  type PlaysetProvinceIds,
  type ScriptValueDiagnostic,
} from '@etch/core/playset';
import { gamePathOf } from './live-game/pick.ts';
import { linkedFiles } from './script-profile-view.ts';

export const CHECK_PROVINCE_IDS = 'etch.checkProvinceIds';

/** Files whose saving can change the map's province ids or the playset's names. */
const NAME_OR_MAP_FILE =
  /[\\/](?:(?:map|common[\\/](?:ideas|religions|policies|rebel_types|disasters|institutions|estate_agendas|advisortypes|scripted_effects|scripted_triggers))[\\/][^\\/]+|common[\\/]graphicalculturetype\.txt)$/i;

/** Diagnostics are not on the preview's path to pixels; a short debounce spares bursts of typing. */
const DEBOUNCE_MS = 150;

/**
 * The workspace's playset, its map's province ids and the names it defines; `ids` is `undefined`
 * without a map, `names` without any of the folders that define names.
 */
export interface PlaysetMap {
  readonly files: GameFiles;
  readonly ids: PlaysetProvinceIds | undefined;
  readonly names: ScriptNames | undefined;
}

/** Keeps the province id warnings of the open script files and of the last playset check. */
export class ProvinceIdDiagnostics implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('etch-province-ids');
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly subscriptions: vscode.Disposable[];
  /** Files the last playset check put warnings on, by URI; they keep them when closed. */
  private readonly checked = new Set<string>();
  private map: Promise<PlaysetMap | undefined> | undefined;
  private disposed = false;

  private readonly output: vscode.LogOutputChannel;

  constructor(output: vscode.LogOutputChannel) {
    this.output = output;
    this.subscriptions = [
      vscode.workspace.onDidOpenTextDocument((document) => {
        this.schedule(document);
      }),
      vscode.workspace.onDidChangeTextDocument(({ document }) => {
        this.schedule(document);
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        void this.closed(document.uri);
      }),
      // A saved map or name file can change the ids or names; so can the playset's settings.
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (NAME_OR_MAP_FILE.test(document.uri.fsPath)) this.refresh();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration('etch.gamePath') ||
          event.affectsConfiguration('etch.playset')
        )
          this.refresh();
      }),
    ];
    for (const document of vscode.workspace.textDocuments) this.schedule(document);
  }

  /**
   * Reads the playset and its map again, and checks again the open documents and the closed files
   * the last playset check put warnings on.
   */
  refresh(): void {
    this.map = undefined;
    for (const document of vscode.workspace.textDocuments) this.schedule(document);
    for (const key of this.checked) {
      if (!vscode.workspace.textDocuments.some((open) => open.uri.toString() === key)) {
        void this.fromDisk(vscode.Uri.parse(key));
      }
    }
  }

  private playsetMap(): Promise<PlaysetMap | undefined> {
    this.map ??= (async () => {
      const linked = await linkedFiles();
      if (linked === undefined) return undefined;
      // Each part fails on its own: unreadable ideas leave the province ids checked, and back.
      const [ids, names] = await Promise.all([
        loadProvinceIds(linked.files).catch((error: unknown) => {
          this.unread('map', error);
          return undefined;
        }),
        loadScriptNames(linked.files).catch((error: unknown) => {
          this.unread('names', error);
          return undefined;
        }),
      ]);
      return { files: linked.files, ids, names };
    })().catch((error: unknown) => {
      this.unread('playset', error);
      return undefined;
    });
    return this.map;
  }

  private unread(what: string, error: unknown): void {
    this.output.warn(
      `Province ids and names: the playset's ${what} could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  private schedule(document: vscode.TextDocument): void {
    // `.csv`: the adjacencies file; the others, such as definition.csv, give no diagnostics.
    if (document.uri.scheme !== 'file' || !/\.(?:txt|map|csv)$/i.test(document.uri.fsPath)) return;
    const key = document.uri.toString();
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        void this.update(document);
      }, DEBOUNCE_MS),
    );
  }

  private async update(document: vscode.TextDocument): Promise<void> {
    const { version } = document;
    const pending = this.playsetMap();
    const map = await pending;
    if (this.disposed || document.isClosed || document.version !== version) return;
    // A refresh during the wait scheduled a newer update against the new map.
    if (this.map !== pending) return;
    const found =
      map === undefined ? undefined : diagnose(document.getText(), document.uri.fsPath, map);
    if (found === undefined) {
      this.collection.delete(document.uri);
      return;
    }
    this.collection.set(
      document.uri,
      found.map((d) => toDiagnostic(d, document)),
    );
  }

  /** A closed file keeps the playset check's warnings, from its text on disk; others lose theirs. */
  private async closed(uri: vscode.Uri): Promise<void> {
    const key = uri.toString();
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
    if (!this.checked.has(key)) {
      this.collection.delete(uri);
      return;
    }
    await this.fromDisk(uri);
  }

  /** Checks a file that is not open from its text on disk, as the playset check does. */
  private async fromDisk(uri: vscode.Uri): Promise<void> {
    const pending = this.playsetMap();
    const map = await pending;
    const text = await readFile(uri.fsPath).then(
      (bytes) => decodeGameText(bytes, 'interface').text,
      () => undefined,
    );
    if (this.disposed || this.map !== pending) return;
    if (vscode.workspace.textDocuments.some((open) => open.uri.toString() === uri.toString())) {
      return; // Opened meanwhile: its editor text is checked instead.
    }
    if (map === undefined || text === undefined) {
      this.collection.delete(uri);
      return;
    }
    const found = diagnose(text, uri.fsPath, map) ?? [];
    this.collection.set(
      uri,
      found.map((d) => toDiagnosticInText(d, text)),
    );
  }

  /** Etch: Check Province IDs and Names in the Playset. */
  async checkPlayset(): Promise<void> {
    this.refresh();
    const map = await this.playsetMap();
    if (map === undefined) {
      void vscode.window.showWarningMessage(
        'Etch could not find the game folder: set etch.gamePath to check the province ids and names.',
      );
      return;
    }
    const { ids, names } = map;
    if (ids === undefined && names === undefined) {
      void vscode.window.showWarningMessage(
        'The playset has no map/default.map with max_provinces and no files that define names, so Etch cannot check province ids or names.',
      );
      return;
    }
    const started = Date.now();
    const { findings, filesChecked } = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Etch: checking province ids and names…',
      },
      () => findScriptValueProblems(map.files, { ids, names }),
    );
    for (const key of this.checked) {
      const uri = vscode.Uri.parse(key);
      if (!vscode.workspace.textDocuments.some((open) => open.uri.toString() === key)) {
        this.collection.delete(uri);
      }
    }
    this.checked.clear();
    let warnings = 0;
    for (const finding of findings) {
      const uri = vscode.Uri.file(finding.file.absolutePath);
      this.checked.add(uri.toString());
      warnings += finding.diagnostics.length;
      const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
      // An open document's own diagnostics are of its editor text.
      if (open !== undefined) continue;
      this.collection.set(
        uri,
        finding.diagnostics.map((d) => toDiagnosticInText(d, finding.text)),
      );
    }
    const against = [
      ids === undefined
        ? 'no map'
        : `${ids.maxSource} (max_provinces = ${String(ids.maxProvinces)})`,
      names === undefined
        ? 'no names'
        : `names (${[...names.byKind].map(([kind, set]) => `${String(set.size)} ${kind}`).join(', ')})`,
    ].join(' and ');
    this.output.info(
      `Province ids and names: ${String(filesChecked)} files checked in ${String(Date.now() - started)} ms against ${against}; ${String(warnings)} values the playset lacks in ${String(findings.length)} files`,
    );
    for (const finding of findings) {
      const layer = finding.file.layer.name === 'game' ? 'the game' : finding.file.layer.name;
      for (const d of finding.diagnostics) {
        const line = lineOf(finding.text, d.start);
        // A warning about the file itself (its name) has no text of its own: an empty range.
        const what =
          d.code === 'province-history-not-read'
            ? `${d.key} file name, province ${String(d.id)}`
            : `${d.key} = ${finding.text.slice(d.start, d.end)}`;
        this.output.info(`  ${layer}: ${finding.file.path}:${String(line)}: ${what}`);
      }
    }
    if (warnings === 0) {
      void vscode.window.showInformationMessage(
        `Every province id and name in the playset's ${String(filesChecked)} script files is defined (${against}).`,
      );
      return;
    }
    const mods = new Set(findings.map((finding) => finding.file.layer.name));
    void vscode.window.showWarningMessage(
      `${String(warnings)} ${warnings === 1 ? 'id or name' : 'ids or names'} the playset does not have, in ${String(findings.length)} ${findings.length === 1 ? 'file' : 'files'} of ${[...mods].map((m) => (m === 'game' ? 'the game' : m)).join(', ')}: see Problems.`,
    );
    await vscode.commands.executeCommand('workbench.actions.view.problems');
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    vscode.Disposable.from(...this.subscriptions).dispose();
    this.collection.dispose();
  }
}

/**
 * The province id and name warnings of a file's text by its game path in the playset (the path
 * below the layer that holds it): a script file's, `map/default.map`'s own lists, the climate
 * file's lists, the continent file's negative ids, the trade winds file's ids, the positions file's negative ids, the adjacencies file's ids, `undefined` for
 * any other file, one outside the playset's folders, or a playset with neither a map nor ideas.
 */
export function diagnose(
  text: string,
  file: string,
  map: PlaysetMap,
): ScriptValueDiagnostic[] | undefined {
  const { files, ids, names } = map;
  if (ids === undefined && names === undefined) return undefined;
  const path = gamePathOf(file, files);
  if (path === undefined) return undefined;
  if (path.toLowerCase() === 'map/default.map') {
    return ids === undefined
      ? undefined
      : checkDefaultMap(parseScript(text, { script: true }), definedIds(ids));
  }
  if (ids?.climateFile !== undefined && path.toLowerCase() === ids.climateFile.path.toLowerCase()) {
    return checkClimate(parseScript(text, { script: true }), ids);
  }
  if (
    ids?.continentFile !== undefined &&
    path.toLowerCase() === ids.continentFile.path.toLowerCase()
  ) {
    return checkContinents(parseScript(text, { script: true }), ids);
  }
  if (
    ids?.tradeWindsFile !== undefined &&
    path.toLowerCase() === ids.tradeWindsFile.path.toLowerCase()
  ) {
    return checkTradeWinds(parseScript(text, { script: true }), ids);
  }
  if (
    ids?.positionsFile !== undefined &&
    path.toLowerCase() === ids.positionsFile.path.toLowerCase()
  ) {
    return checkPositions(parseScript(text, { script: true }), ids);
  }
  if (
    ids?.adjacenciesFile !== undefined &&
    path.toLowerCase() === ids.adjacenciesFile.path.toLowerCase()
  ) {
    return checkAdjacencies(text, ids);
  }
  if (!isProvinceIdScriptPath(path)) return undefined;
  return checkScriptValues(parseScript(text, { script: true }), { ids, names }, path);
}

function toDiagnostic(
  found: ScriptValueDiagnostic,
  document: vscode.TextDocument,
): vscode.Diagnostic {
  return make(
    found,
    new vscode.Range(document.positionAt(found.start), document.positionAt(found.end)),
  );
}

function toDiagnosticInText(found: ScriptValueDiagnostic, text: string): vscode.Diagnostic {
  return make(found, new vscode.Range(positionIn(text, found.start), positionIn(text, found.end)));
}

function make(found: ScriptValueDiagnostic, range: vscode.Range): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(range, found.message, vscode.DiagnosticSeverity.Warning);
  diagnostic.source = 'Etch';
  diagnostic.code = found.code;
  return diagnostic;
}

/** The 1-based line of an offset. */
function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < offset; i = text.indexOf('\n', i + 1)) line++;
  return line;
}

function positionIn(text: string, offset: number): vscode.Position {
  const start = text.lastIndexOf('\n', offset - 1) + 1;
  return new vscode.Position(lineOf(text, offset) - 1, offset - start);
}

/** Registers the diagnostics and Etch: Check Province IDs and Names in the Playset. */
export function registerProvinceIds(output: vscode.LogOutputChannel): vscode.Disposable {
  const diagnostics = new ProvinceIdDiagnostics(output);
  return vscode.Disposable.from(
    diagnostics,
    vscode.commands.registerCommand(CHECK_PROVINCE_IDS, () => diagnostics.checkPlayset()),
  );
}
