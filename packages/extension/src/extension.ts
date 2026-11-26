import * as vscode from 'vscode';
import { SUPPORTED_GAME_VERSION } from '@etch/core';
import { registerAssetLinks, type AssetLinks } from './asset-links.ts';
import { registerSpriteLinks, type SpriteLinks } from './sprite-links.ts';
import { registerFontLinks, type FontLinks } from './font-links.ts';
import { registerLocalisationHints, type LocalisationHints } from './localisation-hints.ts';
import { registerSemanticPrototype } from './semantic-prototype.ts';
import { registerGuiCompletion, type GuiCompletion } from './gui-completion.ts';
import { registerInterfaceSymbols, type InterfaceSymbols } from './interface-symbols.ts';
import { registerSpriteReferences, type SpriteReferences } from './sprite-references.ts';
import { registerGfxColours, type GfxColours } from './gfx-colours.ts';
import { registerCwtools } from './cwtools.ts';
import { registerSpriteGutter, type SpriteGutter } from './sprite-gutter.ts';
import { BuildCheck } from './build-check.ts';
import { RUNNING_BUILD } from './build-stamp.ts';
import { registerLiveGame, type LiveGame, type PickMode } from './live-game/index.ts';
import { closeWindowsHelper } from './live-game/windows.ts';
import { registerGameText } from './game-text.ts';
import { WidgetNavigation } from './navigation.ts';
import { registerPreview, type PreviewApi } from './preview/index.ts';
import { registerProvinceIds } from './province-ids.ts';
import { registerParticleDiagnostics } from './particle-diagnostics.ts';
import { registerScriptProfile } from './script-profile-view.ts';
import { registerTexturePreview, type TexturePreviewApi } from './texture-preview.ts';
import { registerMeshPreview, type MeshPreviewApi } from './mesh-preview.ts';
import { registerEntityPreview, type EntityPreviewApi } from './entity-preview.ts';
import { registerDlcFiles } from './dlc-files.ts';
import { registerOnboarding } from './onboarding.ts';
import { registerScriptLanguageNotice } from './script-language-notice.ts';

/** What `activate` returns: for Etch's own tests, not a stable API for other extensions. */
export interface EtchApi {
  readonly navigation: WidgetNavigation;
  readonly preview: PreviewApi;
  readonly liveGame: LiveGame;
  readonly pickMode: PickMode;
  readonly texturePreview: TexturePreviewApi;
  readonly meshPreview: MeshPreviewApi;
  readonly entityPreview: EntityPreviewApi;
  readonly assetLinks: AssetLinks;
  readonly spriteLinks: SpriteLinks;
  readonly fontLinks: FontLinks;
  readonly localisationHints: LocalisationHints;
  readonly guiCompletion: GuiCompletion;
  readonly interfaceSymbols: InterfaceSymbols;
  readonly spriteReferences: SpriteReferences;
  readonly gfxColours: GfxColours;
  readonly spriteGutter: SpriteGutter;
}

let liveGame: LiveGame | undefined;

export function activate(context: vscode.ExtensionContext): EtchApi {
  const { version } = context.extension.packageJSON as { version: string };
  const output = vscode.window.createOutputChannel('Etch', { log: true });
  context.subscriptions.push(output);
  // The commit names the build: a VSIX of the same version can replace the files of this one.
  output.info(
    `Etch ${version} (${RUNNING_BUILD?.commit ?? 'dev'}) for EU4 ${SUPPORTED_GAME_VERSION}`,
  );
  context.subscriptions.push(registerDlcFiles());
  context.subscriptions.push(registerGameText());
  context.subscriptions.push(registerOnboarding(output, context.globalState));
  const navigation = new WidgetNavigation();
  context.subscriptions.push(navigation);
  const live = registerLiveGame(context, output);
  liveGame = live.game;
  context.subscriptions.push(registerScriptProfile(live.game, output, context.globalStorageUri));
  context.subscriptions.push(registerProvinceIds(output));
  context.subscriptions.push(registerParticleDiagnostics(output));
  context.subscriptions.push(registerScriptLanguageNotice(context));
  if (RUNNING_BUILD !== undefined) {
    const build = new BuildCheck(RUNNING_BUILD, context.extensionUri, output);
    context.subscriptions.push(
      build,
      live.game.onDidChangeState((state) => {
        if (state.status === 'starting') void build.check();
      }),
    );
  }
  registerCwtools(context);
  registerSemanticPrototype(context);
  const spriteLinks = registerSpriteLinks(context, output);
  return {
    navigation,
    preview: registerPreview(context, output, navigation, live.game, live.pick),
    liveGame: live.game,
    pickMode: live.pick,
    texturePreview: registerTexturePreview(context, output),
    meshPreview: registerMeshPreview(context, output),
    entityPreview: registerEntityPreview(context, output),
    assetLinks: registerAssetLinks(context, output),
    spriteLinks,
    fontLinks: registerFontLinks(context, spriteLinks, output),
    localisationHints: registerLocalisationHints(context, output, spriteLinks),
    guiCompletion: registerGuiCompletion(context, spriteLinks),
    interfaceSymbols: registerInterfaceSymbols(context),
    spriteReferences: registerSpriteReferences(context, spriteLinks),
    gfxColours: registerGfxColours(context),
    spriteGutter: registerSpriteGutter(context, spriteLinks),
  };
}

/** The live game stops when the window closes (spec section 6); VS Code waits for it. */
export async function deactivate(): Promise<void> {
  await liveGame?.stop();
  closeWindowsHelper();
  // Everything else Etch creates is disposed through context.subscriptions.
}
