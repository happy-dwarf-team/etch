// The fixed conditions of every capture: the Etch site specification's media pipeline
// (happy-dwarf-team/etch-website, docs/spec.md section 8), in one place.

/** The pinned VS Code, downloaded by `@vscode/test-electron`. */
export const VSCODE_VERSION = '1.142.0';

/** VS Code's window in CSS pixels; with the device scale, the master is 2560 × 1440. */
export const WINDOW = { width: 1280, height: 720 } as const;
export const DEVICE_SCALE = 2;
export const MASTER = {
  width: WINDOW.width * DEVICE_SCALE,
  height: WINDOW.height * DEVICE_SCALE,
} as const;

/** `etch.previewResolution`: one game pixel is one master pixel when the preview is not scaled. */
export const PREVIEW_RESOLUTION = { width: 1280, height: 720 } as const;

/** The editor font size. */
export const EDITOR_FONT_SIZE = 18;

/** How long the preview must stay without a new paint before a step counts as done. */
export const QUIET_MS = 300;
/** The longest wait for a step's paint; the first one also loads the game's textures and fonts. */
export const PAINT_TIMEOUT_MS = 15_000;
export const FIRST_PAINT_TIMEOUT_MS = 90_000;

/** Loops: published width, frame rate and encoder settings (section 8.6). */
export const LOOP_WIDTH = 1920;
export const LOOP_HEIGHT = 1080;
export const LOOP_FPS = 30;
export const VP9_CRF = 34;
export const H264_CRF = 23;
/** H.264 High profile, level 4.0: the `codecs` value of the MP4 source. */
export const H264_PROFILE = { profile: 'high', level: '4.0', codecs: 'avc1.640028' } as const;
export const MEDIA_TYPES = {
  webm: 'video/webm; codecs="vp9"',
  mp4: `video/mp4; codecs="${H264_PROFILE.codecs}"`,
} as const;

/** The VS Code settings every capture starts from (section 8.4). */
export function workbenchSettings(gamePath: string | undefined): Record<string, unknown> {
  return {
    'workbench.colorTheme': 'Default Dark Modern',
    'workbench.startupEditor': 'none',
    'workbench.tips.enabled': false,
    'workbench.welcomePage.walkthroughs.openOnInstall': false,
    'workbench.secondarySideBar.defaultVisibility': 'hidden',
    'workbench.layoutControl.enabled': false,
    'workbench.editor.enablePreview': false,
    'workbench.editor.empty.hint': 'hidden',
    'workbench.statusBar.visible': true,
    'workbench.activityBar.location': 'default',
    'workbench.panel.defaultLocation': 'bottom',
    'breadcrumbs.enabled': false,
    'chat.disableAIFeatures': true,
    'chat.commandCenter.enabled': false,
    'window.zoomLevel': 0,
    'window.restoreWindows': 'none',
    'window.commandCenter': false,
    'window.newWindowDimensions': 'default',
    'editor.fontSize': EDITOR_FONT_SIZE,
    'editor.minimap.enabled': false,
    'editor.stickyScroll.enabled': false,
    'editor.cursorBlinking': 'solid',
    'editor.accessibilitySupport': 'off',
    'editor.hover.enabled': 'off',
    'editor.lightbulb.enabled': 'off',
    'editor.occurrencesHighlight': 'off',
    'editor.selectionHighlight': false,
    'editor.wordWrap': 'on',
    'editor.find.seedSearchStringFromSelection': 'never',
    'editor.quickSuggestions': { other: 'off', comments: 'off', strings: 'off' },
    'editor.suggestOnTriggerCharacters': false,
    'editor.wordBasedSuggestions': 'off',
    'editor.parameterHints.enabled': false,
    'editor.inlineSuggest.enabled': false,
    'files.autoSave': 'off',
    'git.enabled': false,
    'extensions.ignoreRecommendations': true,
    'extensions.autoCheckUpdates': false,
    'extensions.autoUpdate': false,
    'telemetry.telemetryLevel': 'off',
    'update.mode': 'none',
    'security.workspace.trust.enabled': false,
    'etch.previewResolution': `${String(PREVIEW_RESOLUTION.width)}x${String(PREVIEW_RESOLUTION.height)}`,
    ...(gamePath === undefined ? {} : { 'etch.gamePath': gamePath }),
  };
}
