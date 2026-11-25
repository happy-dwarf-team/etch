// The entity preview (etch.previewEntity): an `.asset` file's entity drawn as the game builds it.
// A CodeLens above each `entity = { … }` of an `.asset` file opens it. The extension resolves the
// entity through the playset's `.gfx` pdxmesh types and `.asset` files (`@etch/core/asset`
// `resolveEntity`: its clone, mesh, scale, states and attachments), with the `.asset` file's
// unsaved text in place of the saved one, reads every mesh, texture and state animation through
// the playset, and posts them to the mesh preview's webview script, which draws the attachments
// on their bones and plays the state the user picks.

import * as path from 'node:path';
import * as vscode from 'vscode';
import { decodeGameText, parseScript } from '@etch/core';
import {
  EntityIndex,
  findParticleBlock,
  readAssetFile,
  readMesh,
  readParticleSystem,
  resolveEntity,
  shaderEffectNames,
  type ParticleSystem,
  type ResolvedEntity,
  type ResolvedEvent,
} from '@etch/core/asset';
import { loadEntityIndex, type GameFiles } from '@etch/core/playset';
import { keyOf } from '@etch/core';
import { layerFolder } from './asset-links.ts';
import {
  countryColours,
  flagTexture,
  gameTexture,
  meshHtml,
  read,
  texturesOf,
} from './mesh-preview.ts';
import type {
  EntityNode,
  EntityParticleEffect,
  MeshControls,
  MeshHostMessage,
  MeshSummary,
  MeshTexture,
  MeshWebviewMessage,
} from './mesh-protocol.ts';
import { pickCurrent } from './pick-current.ts';
import { linkedFiles } from './script-profile-view.ts';
import { notify } from './notify.ts';

export const ENTITY_PREVIEW_VIEW_TYPE = 'etch.entityPreview';
export const PREVIEW_ENTITY_COMMAND = 'etch.previewEntity';

export type EntityShown =
  | { readonly name: string; readonly ok: true; readonly summary: MeshSummary }
  | { readonly name: string; readonly ok: false; readonly message: string };

export interface EntityPreviewApi {
  /** Fires each time an entity preview has drawn an entity (or a new state) or failed to. */
  readonly onDidShow: vscode.Event<EntityShown>;
  /**
   * Sets the controls of the open previews of entity `name` of `uri` as a user would; each then
   * fires `onDidShow` with the colour it drew (`MeshSummary.drawn`). False when none is open.
   */
  control(uri: vscode.Uri, name: string, controls: MeshControls): Promise<boolean>;
}

/** An entity of an `.asset` file as its text writes it. */
export interface AssetEntity {
  readonly name: string;
  /** Where its `entity = { … }` starts and ends in the text. */
  readonly start: number;
  readonly end: number;
  /** Its `pdxmesh`, else the entity its `clone` names. */
  readonly pdxmesh: string | undefined;
  readonly clone: string | undefined;
  /** The names of its own `state` blocks. */
  readonly states: readonly string[];
}

/** The entities of an `.asset` file's text: each `entity = { name = … }` at the top level. */
export function entitiesOf(text: string): AssetEntity[] {
  const found: AssetEntity[] = [];
  for (const entry of parseScript(text).entries) {
    if (entry.kind !== 'property' || keyOf(entry) !== 'entity' || entry.value?.kind !== 'block') {
      continue;
    }
    const scalars = new Map<string, string>();
    const states: string[] = [];
    for (const inner of entry.value.entries) {
      if (inner.kind !== 'property') continue;
      const key = keyOf(inner);
      if (inner.value?.kind === 'scalar') scalars.set(key, inner.value.text);
      else if (key === 'state' && inner.value?.kind === 'block') {
        for (const field of inner.value.entries) {
          if (
            field.kind === 'property' &&
            keyOf(field) === 'name' &&
            field.value?.kind === 'scalar'
          )
            states.push(field.value.text);
        }
      }
    }
    const name = scalars.get('name');
    if (name === undefined) continue;
    found.push({
      name,
      start: entry.start,
      end: entry.end,
      pdxmesh: scalars.get('pdxmesh'),
      clone: scalars.get('clone'),
      states,
    });
  }
  return found;
}

interface EntityItem extends vscode.QuickPickItem {
  readonly entity?: AssetEntity;
}

const ENTITY_ICON = new vscode.ThemeIcon('symbol-class');

/**
 * Asks which entity of an `.asset` file to preview: the one the cursor is in comes first and
 * active, with its states; every item shows the mesh (or the clone) and the line it starts on.
 */
async function pickEntity(document: vscode.TextDocument): Promise<string | undefined> {
  const entities = entitiesOf(document.getText());
  if (entities.length === 0) {
    void notify(
      'info',
      `${path.basename(document.fileName)} has no entity = { name = … } to preview.`,
    );
    return undefined;
  }
  const editor = vscode.window.activeTextEditor;
  const cursor =
    editor?.document.uri.toString() === document.uri.toString()
      ? document.offsetAt(editor.selection.active)
      : undefined;
  const item = (entity: AssetEntity, states: boolean): EntityItem => ({
    label: entity.name,
    description: [
      entity.pdxmesh ?? (entity.clone === undefined ? 'no mesh' : `clone of ${entity.clone}`),
      `line ${String(document.positionAt(entity.start).line + 1)}`,
    ].join(' · '),
    ...(states && entity.states.length > 0 ? { detail: entity.states.join(' · ') } : {}),
    iconPath: ENTITY_ICON,
    entity,
  });
  const at =
    cursor === undefined
      ? undefined
      : entities.find((entity) => entity.start <= cursor && cursor <= entity.end);
  const items = entities.filter((entity) => entity !== at).map((entity) => item(entity, false));
  const count = entities.length === 1 ? 'the entity' : `the ${String(entities.length)} entities`;
  const picked = await pickCurrent(items, at === undefined ? undefined : item(at, true), {
    title: 'Preview Entity',
    placeholder: `Filter ${count} of ${path.basename(document.fileName)}`,
    current: 'At the cursor',
    rest: 'In the file',
  });
  return picked?.entity?.name;
}

class EntityLenses implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    return entitiesOf(document.getText()).map(({ name, start }) => {
      const position = document.positionAt(start);
      return new vscode.CodeLens(new vscode.Range(position, position), {
        title: 'Preview Entity',
        tooltip: `Draw ${name} with its attachments and states`,
        command: PREVIEW_ENTITY_COMMAND,
        arguments: [document.uri, name],
      });
    });
  }
}

/** Where a game-relative file is: through the playset, else beside the `.asset` file. */
async function locate(
  gamePath: string,
  files: GameFiles,
  outside: string | undefined,
): Promise<string | undefined> {
  const found = await files.find(gamePath);
  if (found !== undefined) return found.absolutePath;
  if (outside === undefined || gamePath.includes('/')) return undefined;
  // An `.asset` file outside the playset names its animations beside it.
  const beside = path.join(outside, gamePath);
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(beside));
    return beside;
  } catch {
    return undefined;
  }
}

/**
 * The particle system an event's pdxparticle type draws, in words, after the event's name: the
 * system where its name is not the type's, and the type's scale (vanilla's `siege_cannon` is
 * ` (artillery_cannon, scale 0.8)`); empty for an event that resolves to nothing.
 */
function systemOf(event: ResolvedEvent): string {
  if (event.system === undefined || event.pdxparticle === undefined) return '';
  const words = [
    ...(event.system === event.particle ? [] : [event.system]),
    ...(event.pdxparticle.scale === undefined ? [] : [`scale ${String(event.pdxparticle.scale)}`]),
  ];
  return words.length === 0 ? '' : ` (${words.join(', ')})`;
}

/** Everything the webview needs to draw an entity, read through the playset. */
async function entityMessage(
  entity: ResolvedEntity,
  files: GameFiles,
  outside: string | undefined,
  systemNamed: (name: string) => Promise<ParticleSystem | undefined>,
): Promise<MeshHostMessage> {
  const nodes: EntityNode[] = [];
  const problems: string[] = [];
  const animationPaths = new Set<string>();
  const particles: Record<string, string[]> = {};
  const effects: EntityParticleEffect[] = [];
  const visit = async (
    node: ResolvedEntity,
    parent: number | undefined,
    bone: string | undefined,
  ): Promise<void> => {
    problems.push(...node.problems.map((problem) => `${node.name}: ${problem}`));
    if (node.mesh === undefined) return;
    const file = await locate(node.mesh, files, outside);
    if (file === undefined) {
      problems.push(`${node.name}: ${node.mesh} is not in the playset`);
      return;
    }
    let bytes: Uint8Array;
    let textures: EntityNode['textures'];
    try {
      bytes = await read(file);
      textures = await texturesOf(readMesh(bytes), file, files);
    } catch (error) {
      problems.push(
        `${node.name}: ${node.mesh}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    const states: Record<string, string | undefined> = {};
    const stateStarts: Record<string, number> = {};
    // The index this node gets below.
    const at = nodes.length;
    for (const state of node.states) {
      states[state.name] = state.file;
      if (state.timeOffset !== undefined) stateStarts[state.name] = state.timeOffset.base;
      for (const event of state.events) {
        if (event.particle === undefined) continue;
        const where = event.node === undefined ? '' : ` on ${event.node}`;
        const when = event.time === undefined ? '' : ` at ${String(event.time)} s`;
        (particles[state.name] ??= []).push(
          `${node.name}: ${event.particle}${systemOf(event)}${where}${when}`,
        );
        const system = event.system === undefined ? undefined : await systemNamed(event.system);
        if (system === undefined) continue;
        effects.push({
          node: at,
          state: state.name,
          bone: event.node,
          time: event.time ?? 0,
          name: event.particle,
          scale: event.pdxparticle?.scale ?? 1,
          system,
          keepParticle: event.keepParticle,
          triggerOnce: event.triggerOnce,
          stateTime: state.stateTime,
          stateStart: state.timeOffset?.base ?? 0,
        });
      }
      if (state.file !== undefined) animationPaths.add(state.file);
      if (state.problem !== undefined)
        problems.push(`${node.name}: state ${state.name}: ${state.problem}`);
    }
    const index =
      nodes.push({
        name: node.name,
        parent,
        bone,
        meshName: path.basename(node.mesh),
        bytes,
        textures,
        scale: node.scale,
        states,
        stateStarts,
      }) - 1;
    for (const attachment of node.attachments) {
      await visit(attachment.entity, index, attachment.bone);
    }
  };
  await visit(entity, undefined, undefined);
  const animations: Record<string, Uint8Array> = {};
  for (const animation of animationPaths) {
    const file = await locate(animation, files, outside);
    if (file === undefined) {
      problems.push(`${animation} is not in the playset`);
      continue;
    }
    animations[animation] = await read(file);
  }
  const particleTextures: Record<string, MeshTexture> = {};
  for (const effect of effects) {
    for (const subsystem of effect.system.subsystems) {
      const file = subsystem.texture.file;
      if (file === undefined || file in particleTextures) continue;
      const texture = await gameTexture(file, files, outside);
      particleTextures[file] = texture;
      if (!texture.ok) {
        problems.push(`${effect.system.name}: texture ${file}: ${texture.message}`);
      }
    }
  }
  const states = entity.states.map((state) => state.name);
  const shader = await files.read('gfx/FX/particle.shader').catch(() => undefined);
  return {
    type: 'entity',
    name: entity.name,
    nodes,
    animations,
    states,
    state: entity.defaultState ?? (states.includes('idle') ? 'idle' : undefined),
    problems: [...new Set(problems)],
    particles,
    effects,
    particleTextures,
    particleShaderEffects:
      shader === undefined
        ? undefined
        : [...shaderEffectNames(new TextDecoder('latin1').decode(shader))],
  };
}

/** The key of an entity's previews: its `.asset` file and its name. */
function viewKey(uri: vscode.Uri, name: string): string {
  return `${uri.toString()}#${name}`;
}

class EntityPreviews {
  readonly shown = new vscode.EventEmitter<EntityShown>();
  private readonly extensionUri: vscode.Uri;
  private readonly output: vscode.LogOutputChannel;
  private index: Promise<{ files: GameFiles; index: EntityIndex } | undefined> | undefined;
  private readonly panels = new Set<() => Promise<void>>();
  /** The open previews' webviews, by `.asset` file and entity (`viewKey`). */
  private readonly views = new Map<string, Set<vscode.Webview>>();

  constructor(extensionUri: vscode.Uri, output: vscode.LogOutputChannel) {
    this.extensionUri = extensionUri;
    this.output = output;
  }

  /** Forgets the playset and its definitions; open previews draw again. */
  reset(): void {
    this.index = undefined;
    for (const refresh of this.panels) void refresh();
  }

  private playset(): Promise<{ files: GameFiles; index: EntityIndex } | undefined> {
    this.index ??= linkedFiles().then(async (linked) =>
      linked === undefined
        ? undefined
        : { files: linked.files, index: await loadEntityIndex(linked.files) },
    );
    return this.index;
  }

  /** The message for one entity of an `.asset` file, with the file's current text in the index. */
  private async message(uri: vscode.Uri, name: string): Promise<MeshHostMessage | string> {
    const loaded = await this.playset();
    if (loaded === undefined) {
      return "An entity resolves through the game's .gfx and .asset files: set etch.gamePath to the game folder.";
    }
    const { files, index } = loaded;
    const document = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString() === uri.toString(),
    );
    const text = document?.getText() ?? new TextDecoder().decode(await read(uri.fsPath));
    const folder = layerFolder(files, uri.fsPath);
    const gamePath =
      folder === undefined
        ? path.basename(uri.fsPath)
        : folder === ''
          ? path.basename(uri.fsPath)
          : `${folder}/${path.basename(uri.fsPath)}`;
    const ownParsed = parseScript(text);
    const own = readAssetFile(ownParsed, gamePath);
    const merged = new EntityIndex();
    for (const [key, value] of index.pdxmeshes) merged.pdxmeshes.set(key, value);
    for (const [key, value] of index.pdxparticles) merged.pdxparticles.set(key, value);
    for (const [key, value] of index.entities) merged.entities.set(key, value);
    for (const [key, value] of index.animations) merged.animations.set(key, value);
    for (const particle of index.particles) merged.particles.add(particle);
    for (const particle of own.particles) merged.particles.add(particle);
    for (const [key, value] of index.particleFiles) merged.particleFiles.set(key, value);
    for (const particle of own.particles) merged.particleFiles.set(particle, own.path);
    for (const entity of own.entities) merged.entities.set(entity.name, entity);
    for (const animation of own.animations) merged.animations.set(animation.name, animation);
    const entity = resolveEntity(merged, name);
    if (entity === undefined) return `No entity "${name}" in ${path.basename(uri.fsPath)}.`;
    const parsedFiles = new Map<string, Promise<ReturnType<typeof parseScript> | undefined>>();
    const systemNamed = async (system: string): Promise<ParticleSystem | undefined> => {
      const file = merged.particleFiles.get(system);
      if (file === undefined) return undefined;
      let parsed = parsedFiles.get(file);
      if (parsed === undefined) {
        parsed =
          file === own.path
            ? Promise.resolve(ownParsed)
            : files
                .find(file)
                .then(async (found) =>
                  found === undefined
                    ? undefined
                    : parseScript(decodeGameText(await read(found.absolutePath), 'script').text),
                );
        parsedFiles.set(file, parsed);
      }
      const block = findParticleBlock((await parsed)?.entries ?? [], system);
      return block === undefined ? undefined : readParticleSystem(block);
    };
    return entityMessage(
      entity,
      files,
      folder === undefined ? path.dirname(uri.fsPath) : undefined,
      systemNamed,
    );
  }

  open(uri: vscode.Uri, name: string): void {
    const panel = vscode.window.createWebviewPanel(
      ENTITY_PREVIEW_VIEW_TYPE,
      `Entity: ${name}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')] },
    );
    const { webview } = panel;
    webview.html = meshHtml(webview, this.extensionUri);
    let ready = false;
    const post = async (): Promise<void> => {
      if (!ready) return;
      try {
        const message = await this.message(uri, name);
        if (typeof message === 'string') {
          this.report({ name, ok: false, message });
          void notify('warning', message);
          return;
        }
        await webview.postMessage(message);
      } catch (error) {
        this.report({
          name,
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };
    this.panels.add(post);
    const key = viewKey(uri, name);
    const views = this.views.get(key) ?? new Set<vscode.Webview>();
    views.add(webview);
    this.views.set(key, views);
    const subscriptions = [
      webview.onDidReceiveMessage(async (message: MeshWebviewMessage) => {
        if (message.type === 'ready') {
          ready = true;
          void post();
        } else if (message.type === 'flag') {
          const files = (await this.playset())?.files;
          const reply: MeshHostMessage = {
            type: 'flag',
            tag: message.tag,
            texture: await flagTexture(message.tag, files),
            colours: await countryColours(message.tag, files),
          };
          await webview.postMessage(reply);
        } else if (message.type === 'shown') {
          this.report({ name, ok: true, summary: message.summary });
        } else if (message.type === 'failed') {
          this.report({ name, ok: false, message: message.message });
        }
      }),
    ];
    panel.onDidDispose(() => {
      this.panels.delete(post);
      views.delete(webview);
      if (views.size === 0) this.views.delete(key);
      for (const subscription of subscriptions) subscription.dispose();
    });
  }

  /** Sets the controls of the open previews of an entity; see `EntityPreviewApi.control`. */
  async control(uri: vscode.Uri, name: string, controls: MeshControls): Promise<boolean> {
    const views = [...(this.views.get(viewKey(uri, name)) ?? [])];
    const message: MeshHostMessage = { type: 'controls', controls };
    for (const view of views) await view.postMessage(message);
    return views.length > 0;
  }

  private report(shown: EntityShown): void {
    if (!shown.ok) this.output.warn(`Entity preview of ${shown.name}: ${shown.message}`);
    this.shown.fire(shown);
  }
}

/** Registers the entity preview's CodeLens and command; the returned API is for Etch's tests. */
export function registerEntityPreview(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
): EntityPreviewApi {
  const previews = new EntityPreviews(context.extensionUri, output);
  context.subscriptions.push(
    previews.shown,
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', pattern: '**/*.asset' },
      new EntityLenses(),
    ),
    vscode.commands.registerCommand(
      PREVIEW_ENTITY_COMMAND,
      async (uri?: vscode.Uri, name?: string) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target === undefined || !/\.asset$/i.test(target.fsPath)) {
          void notify('info', 'Open an .asset file to preview its entities.');
          return;
        }
        const chosen = name ?? (await pickEntity(await vscode.workspace.openTextDocument(target)));
        if (chosen !== undefined) previews.open(target, chosen);
      },
    ),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (/\.(?:asset|gfx)$/i.test(document.fileName)) previews.reset();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('etch.gamePath') ||
        event.affectsConfiguration('etch.playset')
      ) {
        previews.reset();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      previews.reset();
    }),
  );
  return {
    onDidShow: previews.shown.event,
    control: (uri, name, controls) => previews.control(uri, name, controls),
  };
}
