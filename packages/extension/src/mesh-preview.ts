// The mesh preview (etch.meshPreview): a read-only custom editor for `.mesh` files. The extension
// reads the mesh, decodes the diffuse, normal and specular textures its materials name with
// `@etch/renderer`'s readers
// (a bare name is in the mesh's folder, as vanilla keeps them: through the playset when the mesh is
// in one of its layers, so a mod's texture wins over the game's, else on disk beside the mesh; a
// `.tga` name also tries `.dds`), and lists the `.anim` files beside it whose joints name the mesh's
// bones. A `PdxMeshTextureAtlas` part (a ship's sails) shows a country's flag: the webview asks
// for a tag's `gfx/flags/<TAG>.tga` and the host decodes it through the playset. For a map tree
// the host also sends the playset's tint and season maps (`map/terrain/Tree_tint.bmp`,
// `Tree_season.bmp`). The webview script
// (`dist/mesh-webview.js`, from `webview/mesh.ts`) parses the mesh with `@etch/core/asset`, draws
// it with WebGL2 and plays an animation the user picks, skinned on the CPU.

import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  keyOf,
  parseScript,
  textureCandidates,
  type EntryNode,
  type ParsedScript,
  type ValueNode,
} from '@etch/core';
import {
  jointsOfBones,
  mapTreeOf,
  MAP_SEASONS,
  readBmp,
  readMapSeasons,
  readTreeSeasons,
  readAnimation,
  readMesh,
  type PdxMesh,
  type PdxMeshType,
} from '@etch/core/asset';
import { loadPdxMeshTypes, type GameFiles } from '@etch/core/playset';
import { inspectTexture } from '@etch/renderer/inspect';
import { layerFolder } from './asset-links.ts';
import type {
  MeshAnimationEntry,
  MeshControls,
  MeshHostMessage,
  MeshPlace,
  MeshSummary,
  MeshTexture,
  MeshTreeSeasons,
  MeshWebviewMessage,
} from './mesh-protocol.ts';
import { linkedFiles } from './script-profile-view.ts';

export const MESH_PREVIEW_VIEW_TYPE = 'etch.meshPreview';

export type MeshShown =
  | { readonly uri: vscode.Uri; readonly ok: true; readonly summary: MeshSummary }
  | { readonly uri: vscode.Uri; readonly ok: false; readonly message: string };

export interface MeshPreviewApi {
  /** Fires each time a mesh preview has drawn a file (or a new animation) or failed to. */
  readonly onDidShow: vscode.Event<MeshShown>;
  /**
   * Sets the controls of the open previews of `uri` as a user would; each then fires `onDidShow`
   * with a summary that has `drawn`. False when no preview of `uri` is open.
   */
  control(uri: vscode.Uri, controls: MeshControls): Promise<boolean>;
}

class MeshDocument implements vscode.CustomDocument {
  readonly uri: vscode.Uri;

  constructor(uri: vscode.Uri) {
    this.uri = uri;
  }

  dispose(): void {}
}

export async function read(file: string): Promise<Uint8Array> {
  return Uint8Array.from(await vscode.workspace.fs.readFile(vscode.Uri.file(file)));
}

async function exists(file: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(file));
    return true;
  } catch {
    return false;
  }
}

/** The file a material's bare texture name leads to, and where it came from. */
async function findTexture(
  name: string,
  meshFile: string,
  files: GameFiles | undefined,
): Promise<{ file: string; source: string } | undefined> {
  const folder = files === undefined ? undefined : layerFolder(files, meshFile);
  for (const candidate of textureCandidates(name)) {
    if (files !== undefined && folder !== undefined) {
      const found = await files.find(folder === '' ? candidate : `${folder}/${candidate}`);
      if (found !== undefined) {
        const source = found.layer.name === 'game' ? 'the game' : found.layer.name;
        return { file: found.absolutePath, source };
      }
    }
    const beside = path.join(path.dirname(meshFile), candidate);
    if (await exists(beside)) return { file: beside, source: 'beside the mesh' };
  }
  return undefined;
}

/** The diffuse, normal and specular textures of a mesh's drawn parts, decoded, by file name. */
export async function texturesOf(
  mesh: PdxMesh,
  meshFile: string,
  files: GameFiles | undefined,
): Promise<Record<string, MeshTexture>> {
  const textures: Record<string, MeshTexture> = {};
  const names = mesh.shapes
    .filter((shape) => !shape.collision)
    .flatMap((shape) => shape.parts)
    .flatMap(({ material }) => [material.diffuse, material.normal, material.specular]);
  for (const name of names) {
    if (name === undefined || name in textures) continue;
    const found = await findTexture(name, meshFile, files);
    if (found === undefined) {
      textures[name] = { ok: false, message: `not found: ${textureCandidates(name).join(', ')}` };
      continue;
    }
    try {
      const { summary, rgba } = inspectTexture(found.file, await read(found.file));
      textures[name] = {
        ok: true,
        width: summary.width,
        height: summary.height,
        rgba,
        source: found.source,
      };
    } catch (error) {
      textures[name] = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return textures;
}

/** A country tag the flag request takes: three letters or digits, as the game's tags are. */
const TAG = /^[A-Z0-9]{3}$/;

/**
 * The flag of a country tag, decoded: `gfx/flags/<TAG>.tga` (or `.dds`) through the playset, so
 * a mod's flag wins over the game's.
 */
export async function flagTexture(tag: string, files: GameFiles | undefined): Promise<MeshTexture> {
  if (!TAG.test(tag)) return { ok: false, message: `"${tag}" is not a country tag` };
  if (files === undefined) {
    return { ok: false, message: 'a flag comes from the playset: set etch.gamePath' };
  }
  for (const candidate of textureCandidates(`gfx/flags/${tag}.tga`)) {
    const found = await files.find(candidate);
    if (found === undefined) continue;
    try {
      const { summary, rgba } = inspectTexture(found.absolutePath, await read(found.absolutePath));
      return {
        ok: true,
        width: summary.width,
        height: summary.height,
        rgba,
        source: found.layer.name === 'game' ? 'the game' : found.layer.name,
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
  return { ok: false, message: `no gfx/flags/${tag}.tga in the playset` };
}

/** The map's tint map of its trees, which `gfx/FX/tree.shader` takes as `TintMap`. */
export const TREE_TINT = 'map/terrain/Tree_tint.bmp';
/** The map's season map of its trees, which `gfx/FX/tree.shader` takes as `SeasonMap`. */
export const TREE_SEASON = 'map/terrain/Tree_season.bmp';

/** One of the playset's tree maps (`TREE_TINT`, `TREE_SEASON`), decoded. */
export async function treeMap(files: GameFiles | undefined, file: string): Promise<MeshTexture> {
  const found = files === undefined ? undefined : await files.find(file);
  if (found === undefined) return { ok: false, message: `no ${file} in the playset` };
  try {
    const image = readBmp(await read(found.absolutePath));
    return {
      ok: true,
      width: image.width,
      height: image.height,
      rgba: image.rgba,
      source: found.layer.name === 'game' ? 'the game' : found.layer.name,
    };
  } catch (error) {
    return {
      ok: false,
      message: `${file}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** The map's seasons, whose `tree_*` blocks give the season map's column for a date. */
export const TREE_SEASONS_FILE = 'map/seasons.txt';

/** The playset's tree seasons (`TREE_SEASONS_FILE`), read. */
export async function treeSeasons(files: GameFiles | undefined): Promise<MeshTreeSeasons> {
  const found = files === undefined ? undefined : await files.find(TREE_SEASONS_FILE);
  if (found === undefined) return { ok: false, message: `no ${TREE_SEASONS_FILE} in the playset` };
  try {
    const text = new TextDecoder('windows-1252').decode(await read(found.absolutePath));
    const parsed = parseScript(text);
    const { spans, problems } = readTreeSeasons(parsed);
    const map = readMapSeasons(parsed);
    return {
      ok: true,
      spans: spans.map((span) => span ?? null),
      mapSpans: map.spans.map((span) => span ?? null),
      source: found.layer.name === 'game' ? 'the game' : found.layer.name,
      problems: [...map.problems, ...problems],
    };
  } catch (error) {
    return {
      ok: false,
      message: `${TREE_SEASONS_FILE}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** The map's settings, which name its size and its positions file. */
export const DEFAULT_MAP = 'map/default.map';

async function scriptOf(files: GameFiles, file: string): Promise<ParsedScript | undefined> {
  const found = await files.find(file);
  if (found === undefined) return undefined;
  return parseScript(new TextDecoder('windows-1252').decode(await read(found.absolutePath)));
}

function valueOf(block: readonly EntryNode[], key: string): ValueNode | undefined {
  let value: ValueNode | undefined;
  for (const entry of block) {
    if (entry.kind === 'property' && keyOf(entry) === key) value = entry.value;
  }
  return value;
}

/**
 * A texel of a decoded texture as the shader's linear filter reads it at `u`, `v` (0 to 1, from
 * the top left; the texture repeats): red, green and blue from 0 to 255.
 */
export function sampleLinear(
  image: { width: number; height: number; rgba: Uint8Array },
  u: number,
  v: number,
): number[] {
  const x = u * image.width - 0.5;
  const y = v * image.height - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (tx: number, ty: number, c: number): number => {
    const wx = ((tx % image.width) + image.width) % image.width;
    const wy = ((ty % image.height) + image.height) % image.height;
    return image.rgba[(wy * image.width + wx) * 4 + c] ?? 0;
  };
  return [0, 1, 2].map((c) => {
    const top = at(x0, y0, c) * (1 - fx) + at(x0 + 1, y0, c) * fx;
    const bottom = at(x0, y0 + 1, c) * (1 - fx) + at(x0 + 1, y0 + 1, c) * fx;
    return top * (1 - fy) + bottom * fy;
  });
}

/**
 * A map tree's place at a province: its position in `map/positions.txt` (the file
 * `map/default.map` names), the colour of each map season's colour map there, and its North
 * value, as `gfx/FX/tree.shader` takes them. The shader reads the colour maps at
 * `((x + 0.5) / width, 1 - (y + 0.5) / height)`, and the season colour fades in with
 * `saturate(saturate(y / height - 0.5) * 2.5)`, `y` running north from the map's south edge.
 */
export async function treePlace(
  province: number,
  files: GameFiles | undefined,
): Promise<MeshPlace> {
  if (!Number.isInteger(province) || province < 1) {
    return { ok: false, message: `"${String(province)}" is not a province ID` };
  }
  if (files === undefined) {
    return { ok: false, message: 'a place comes from the playset: set etch.gamePath' };
  }
  try {
    const settings = await scriptOf(files, DEFAULT_MAP);
    if (settings === undefined) return { ok: false, message: `no ${DEFAULT_MAP} in the playset` };
    const number = (key: string): number | undefined => {
      const value = valueOf(settings.entries, key);
      return value?.kind === 'scalar' ? Number(value.text) : undefined;
    };
    const width = number('width');
    const height = number('height');
    if (width === undefined || height === undefined || !(width > 0) || !(height > 0)) {
      return { ok: false, message: `${DEFAULT_MAP}: no width and height` };
    }
    const named = valueOf(settings.entries, 'positions');
    const file = `map/${named?.kind === 'scalar' ? named.text : 'positions.txt'}`;
    const positions = await scriptOf(files, file);
    if (positions === undefined) return { ok: false, message: `no ${file} in the playset` };
    const block = valueOf(positions.entries, String(province));
    const position = block?.kind === 'block' ? valueOf(block.entries, 'position') : undefined;
    const pair =
      position?.kind === 'block'
        ? position.entries
            .filter((entry) => entry.kind === 'scalar')
            .slice(0, 2)
            .map((entry) => Number(entry.text))
        : [];
    const [x, y] = pair;
    if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, message: `${file}: no position for province ${String(province)}` };
    }
    const u = (x + 0.5) / width;
    const v = 1 - (y + 0.5) / height;
    const colours: number[][] = [];
    const sources = new Set<string>();
    for (const season of MAP_SEASONS) {
      const name = `map/terrain/colormap_${season}.dds`;
      const found = await files.find(name);
      if (found === undefined) return { ok: false, message: `no ${name} in the playset` };
      const { rgba, summary } = inspectTexture(found.absolutePath, await read(found.absolutePath));
      colours.push(sampleLinear({ width: summary.width, height: summary.height, rgba }, u, v));
      sources.add(found.layer.name === 'game' ? 'the game' : found.layer.name);
    }
    const clamp = (value: number): number => Math.min(1, Math.max(0, value));
    return {
      ok: true,
      province,
      x,
      y,
      colours,
      north: clamp(clamp(y / height - 0.5) * 2.5),
      source: [...sources].join(', '),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** The `.anim` files beside the mesh whose joints name at least half of a skinned shape's bones. */
async function animationsOf(
  mesh: PdxMesh,
  folder: string,
  stem: string,
): Promise<MeshAnimationEntry[]> {
  const skeletons = mesh.shapes.filter((shape) => shape.skeleton.length > 0);
  if (skeletons.length === 0) return [];
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(folder));
  } catch {
    return [];
  }
  const found: MeshAnimationEntry[] = [];
  for (const [name, type] of entries) {
    if (type !== vscode.FileType.File || !/\.anim$/i.test(name)) continue;
    try {
      const animation = readAnimation(await read(path.join(folder, name)));
      const fits = skeletons.some((shape) => {
        const named = jointsOfBones(shape.skeleton, animation).filter((j) => j !== undefined);
        return named.length * 2 >= shape.skeleton.length;
      });
      if (fits) found.push({ name, frames: animation.frames, fps: animation.fps });
    } catch {
      // An animation Etch cannot read is not offered.
    }
  }
  // The mesh's own animations first (`carrack_idle.anim` for `carrack.mesh`): ships and units
  // share bone names, so other meshes' animations beside it fit as well.
  const own = (entry: MeshAnimationEntry): number =>
    entry.name.toLowerCase().startsWith(`${stem.toLowerCase()}_`) ? 0 : 1;
  return found.sort((a, b) => own(a) - own(b) || a.name.localeCompare(b.name));
}

class MeshPreviewProvider implements vscode.CustomReadonlyEditorProvider<MeshDocument> {
  readonly shown = new vscode.EventEmitter<MeshShown>();
  private readonly extensionUri: vscode.Uri;
  private readonly output: vscode.LogOutputChannel;
  private files: Promise<GameFiles | undefined> | undefined;
  private types: Promise<PdxMeshType[]> | undefined;
  /** The open previews' webviews, by the mesh's URI. */
  private readonly views = new Map<string, Set<vscode.Webview>>();

  constructor(extensionUri: vscode.Uri, output: vscode.LogOutputChannel) {
    this.extensionUri = extensionUri;
    this.output = output;
  }

  /** Forgets the playset: after a setting or the workspace folders change. */
  reset(): void {
    this.files = undefined;
    this.types = undefined;
  }

  /** The map tree type (`mapobject_<n>`) that draws a mesh of the playset, if one does. */
  private async treeOf(file: string): Promise<string | undefined> {
    const files = await this.playset();
    const folder = files === undefined ? undefined : layerFolder(files, file);
    if (files === undefined || folder === undefined) return undefined;
    this.types ??= loadPdxMeshTypes(files).then(
      (types) => types.flat(),
      (error: unknown) => {
        this.output.warn(
          `Mesh preview: the .gfx files could not be read, no mesh is drawn as a map tree: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return [];
      },
    );
    const name = path.basename(file);
    return mapTreeOf(await this.types, folder === '' ? name : `${folder}/${name}`)?.name;
  }

  private playset(): Promise<GameFiles | undefined> {
    this.files ??= linkedFiles().then(
      (linked) => linked?.files,
      (error: unknown) => {
        this.output.warn(
          `Mesh preview: the playset could not be read, textures come from beside the mesh: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return undefined;
      },
    );
    return this.files;
  }

  /** Sets the controls of the open previews of `uri`; see `MeshPreviewApi.control`. */
  async control(uri: vscode.Uri, controls: MeshControls): Promise<boolean> {
    const views = [...(this.views.get(uri.toString()) ?? [])];
    const message: MeshHostMessage = { type: 'controls', controls };
    for (const view of views) await view.postMessage(message);
    return views.length > 0;
  }

  openCustomDocument(uri: vscode.Uri): MeshDocument {
    return new MeshDocument(uri);
  }

  resolveCustomEditor(document: MeshDocument, panel: vscode.WebviewPanel): void {
    const { webview } = panel;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
    };
    webview.html = meshHtml(webview, this.extensionUri);
    const uri = document.uri;
    const key = uri.toString();
    const views = this.views.get(key) ?? new Set<vscode.Webview>();
    views.add(webview);
    this.views.set(key, views);
    const file = uri.fsPath;
    const folder = path.dirname(file);
    const name = path.basename(file);

    let ready = false;
    const post = async (): Promise<void> => {
      if (!ready) return;
      let bytes: Uint8Array;
      let mesh: PdxMesh;
      try {
        bytes = await read(file);
        mesh = readMesh(bytes);
      } catch (error) {
        this.report({
          uri,
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      const tree = await this.treeOf(file);
      const message: MeshHostMessage = {
        type: 'mesh',
        name,
        bytes,
        textures: await texturesOf(mesh, file, await this.playset()),
        animations: await animationsOf(mesh, folder, path.basename(file, path.extname(file))),
        tree,
        tint: tree === undefined ? undefined : await treeMap(await this.playset(), TREE_TINT),
        season: tree === undefined ? undefined : await treeMap(await this.playset(), TREE_SEASON),
        seasons: tree === undefined ? undefined : await treeSeasons(await this.playset()),
      };
      await webview.postMessage(message);
    };

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(folder), '*.{mesh,dds,tga,anim}'),
    );
    const subscriptions = [
      watcher,
      watcher.onDidChange(() => void post()),
      watcher.onDidCreate(() => void post()),
      webview.onDidReceiveMessage(async (message: MeshWebviewMessage) => {
        if (message.type === 'ready') {
          ready = true;
          void post();
        } else if (message.type === 'animation') {
          // Only a name the host offered: a plain file name beside the mesh.
          if (path.basename(message.name) !== message.name || !/\.anim$/i.test(message.name)) {
            return;
          }
          try {
            const bytes = await read(path.join(folder, message.name));
            const reply: MeshHostMessage = { type: 'animation', name: message.name, bytes };
            await webview.postMessage(reply);
          } catch (error) {
            this.report({
              uri,
              ok: false,
              message: `cannot read ${message.name}: ${String(error)}`,
            });
          }
        } else if (message.type === 'place') {
          const reply: MeshHostMessage = {
            type: 'place',
            province: message.province,
            place: await treePlace(message.province, await this.playset()),
          };
          await webview.postMessage(reply);
        } else if (message.type === 'flag') {
          const reply: MeshHostMessage = {
            type: 'flag',
            tag: message.tag,
            texture: await flagTexture(message.tag, await this.playset()),
          };
          await webview.postMessage(reply);
        } else if (message.type === 'shown') {
          this.report({ uri, ok: true, summary: message.summary });
        } else {
          this.report({ uri, ok: false, message: message.message });
        }
      }),
    ];
    panel.onDidDispose(() => {
      for (const subscription of subscriptions) subscription.dispose();
      views.delete(webview);
      if (views.size === 0) this.views.delete(key);
    });
  }

  private report(shown: MeshShown): void {
    if (!shown.ok) this.output.warn(`Mesh preview of ${shown.uri.fsPath}: ${shown.message}`);
    this.shown.fire(shown);
  }
}

/** Registers the mesh preview; the returned API is for Etch's tests. */
export function registerMeshPreview(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
): MeshPreviewApi {
  const provider = new MeshPreviewProvider(context.extensionUri, output);
  context.subscriptions.push(
    provider.shown,
    vscode.window.registerCustomEditorProvider(MESH_PREVIEW_VIEW_TYPE, provider, {
      supportsMultipleEditorsPerDocument: true,
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('etch.gamePath') ||
        event.affectsConfiguration('etch.playset')
      ) {
        provider.reset();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      provider.reset();
    }),
  );
  return {
    onDidShow: provider.shown.event,
    control: (uri, controls) => provider.control(uri, controls),
  };
}

export function meshHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomBytes(16).toString('base64');
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'mesh-webview.js'));
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
  ].join('; ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style nonce="${nonce}">
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--vscode-editor-background); color: var(--vscode-foreground);
    font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
  }
  header {
    display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 4px 8px;
    border-bottom: 1px solid var(--vscode-panel-border, transparent);
  }
  #facts { display: flex; flex-wrap: wrap; gap: 4px 12px; }
  #facts span { white-space: nowrap; }
  .spacer { flex: 1; }
  #snow-amount, #tint-turn, #season-day, #season-north { width: 6em; vertical-align: middle; }
  #season-date { display: inline-block; min-width: 3.6em; margin-right: 0.5em; }
  input[type="color"] { width: 24px; height: 20px; padding: 0; border: none; background: none; vertical-align: middle; }
  #flag-tag, #place-province { width: 4em; font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); padding: 1px 4px; text-transform: uppercase; }
  button, select {
    font: inherit; color: var(--vscode-foreground);
    background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border, transparent);
    padding: 1px 6px;
  }
  button[aria-pressed="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  [hidden] { display: none !important; }
  #error {
    margin: 8px; padding: 4px 8px; white-space: pre-wrap;
    border-left: 3px solid var(--vscode-notificationsErrorIcon-foreground);
  }
  main { flex: 1; position: relative; min-height: 0; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: grab; }
  canvas:active { cursor: grabbing; }
  footer { padding: 2px 8px; min-height: 1.4em; opacity: 0.8; font-variant-numeric: tabular-nums; white-space: pre; }
</style>
</head>
<body>
<header>
  <div id="facts"></div>
  <div class="spacer"></div>
  <select id="animation" title="Animation beside the mesh" aria-label="Animation" hidden></select>
  <button id="play" aria-pressed="false" title="Play or pause the animation" hidden>Play</button>
  <select id="lod" title="Level of detail: which of the mesh's levels (lodShape0, lodShape1 …) to draw" aria-label="Level of detail" hidden></select>
  <span id="colours" title="The country colours a PdxMeshColor part shows (the specular map's R, G and B mask them), and the stripes a PdxMeshTextureAtlas part shows with no flag tag" hidden>
    <input type="color" id="primary" value="#bf291f" aria-label="Primary country colour">
    <input type="color" id="secondary" value="#ebe0bf" aria-label="Secondary country colour">
    <input type="color" id="tertiary" value="#264d99" aria-label="Tertiary country colour">
  </span>
  <label id="flag" title="The flag a PdxMeshTextureAtlas part (a ship's sails) shows: a country tag's gfx/flags flag, or with no tag the three country colours as stripes" hidden>
    Flag <input id="flag-tag" size="4" maxlength="3" spellcheck="false" placeholder="TAG" aria-label="Country tag of the flag">
  </label>
  <label id="region" title="A colonial nation's region colour: the game draws its overlord's flag with the far half (where the flag's u is over 0.5) in this colour, and puts it in place of the tertiary colour on PdxMeshColor parts; off for other countries" hidden>
    Region <input type="checkbox" id="region-on" aria-label="Show a colonial region colour"> <input type="color" id="region-colour" value="#3f8f4f" aria-label="Colonial region colour">
  </label>
  <label id="snow" title="Snow on PdxMeshSnow parts and map trees, as the game puts it on them in winter: the game takes the amount from the map, here from 0 (none) to 1" hidden>
    Snow <input type="range" id="snow-amount" min="0" max="1" step="0.05" value="0" aria-label="Snow amount">
  </label>
  <label id="tint" title="A map tree's tint: the game shifts each tree's place in map/terrain/Tree_tint.bmp by the tree's random turn on the map, here from 0 to 1 of a full turn" hidden>
    Turn <input type="range" id="tint-turn" min="0" max="1" step="0.05" value="0" aria-label="Tree turn for the tint">
  </label>
  <label id="place" title="A map tree's place: a province ID, whose position in map/positions.txt sets Ground (the map's colour maps there, map/terrain/colormap_*.dds, mixed for the Date as the game mixes them) and North; empty to set them by hand" hidden>
    Place <input type="text" id="place-province" inputmode="numeric" placeholder="province" aria-label="Province ID of the tree's place">
  </label>
  <label id="ground" title="A map tree's ground colour: the game lays the map's colour map at the tree's place over it at one quarter; grey (#808080) changes nothing" hidden>
    Ground <input type="color" id="ground-colour" value="#808080" aria-label="Map colour under the tree">
  </label>
  <label id="season" title="A map tree's season colour from map/terrain/Tree_season.bmp: Date is the day of the year, whose tree season in map/seasons.txt picks the season map's column as the game picks it, North how much of it the tree takes (the game adds it only in the map's northern half, from none at the middle to all of it at nine tenths of the height)" hidden>
    Date <input type="range" id="season-day" min="0" max="364" step="1" value="181" aria-label="Day of the year"> <output id="season-date">1 Jul</output>
    North <input type="range" id="season-north" min="0" max="1" step="0.05" value="0" aria-label="How far north the tree stands">
  </label>
  <button id="maps" aria-pressed="true" title="Draw the normal and specular maps">Maps</button>
  <button id="wireframe" aria-pressed="false" title="Show the triangle edges">Wire</button>
  <button id="reset" title="Frame the whole mesh">Reset view</button>
</header>
<div id="error" role="alert" hidden></div>
<main><canvas id="canvas"></canvas></main>
<footer id="status"></footer>
<script nonce="${nonce}" src="${script.toString()}"></script>
</body>
</html>`;
}
