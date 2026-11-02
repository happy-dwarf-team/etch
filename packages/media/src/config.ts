// The fixed conditions of every capture: the Etch site specification's media pipeline
// (happy-dwarf-team/etch-website, docs/spec.md section 8), in one place.

/** The pinned VS Code, downloaded by `@vscode/test-electron`. */
export const VSCODE_VERSION = '1.142.0';

/**
 * VS Code's window in CSS pixels at device scale 1, as on an ordinary monitor: the master is
 * 2560 × 1440, and the edit's close-ups make its text readable (section 8.4).
 */
export const WINDOW = { width: 2560, height: 1440 } as const;
export const DEVICE_SCALE = 1;
export const MASTER = {
  width: WINDOW.width * DEVICE_SCALE,
  height: WINDOW.height * DEVICE_SCALE,
} as const;

/**
 * The live take's game (section 8.4): windowed at a corpus resolution as big as VS Code's master,
 * on the monitor right of VS Code's (live.ts, `GAME_ORIGIN`).
 */
export const LIVE_GAME_RESOLUTION = { width: 2560, height: 1440 } as const;

/** `etch.previewResolution`: one game pixel is one master pixel when the preview is not scaled. */
export const PREVIEW_RESOLUTION = { width: 1280, height: 720 } as const;

/** The editor font size. */
export const EDITOR_FONT_SIZE = 16;

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

/**
 * The media bucket behind `media.happydwarf.dev` (hub spec 7.2): the Happy Dwarf Cloudflare
 * account's R2 S3 endpoint, and Etch's prefix in the bucket's keys (section 8.8).
 */
export const MEDIA_BUCKET = {
  name: 'happydwarf-media',
  endpoint: 'https://e3c697b3d2be7d32a12d08b7ae12398b.r2.cloudflarestorage.com',
  origin: 'https://media.happydwarf.dev',
  prefix: 'etch',
} as const;
/** A key never changes its content, so caches may keep it for a year. */
export const CACHE_CONTROL = 'public, max-age=31536000, immutable';
/** The user environment variables that hold the upload token (hub spec 7.4); never printed. */
export const CREDENTIAL_VARIABLES = {
  accessKeyId: 'HAPPYDWARF_MEDIA_ACCESS_KEY_ID',
  secretAccessKey: 'HAPPYDWARF_MEDIA_SECRET_ACCESS_KEY',
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
