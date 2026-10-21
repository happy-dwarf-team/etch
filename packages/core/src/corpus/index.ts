/**
 * The precision corpus's text (ADR 0002, etch#41): the manifest, the capture records with their
 * widget trees, and where the screenshots live. Uses Node's file system, so it is a separate entry
 * point, `@etch/core/corpus`, that the browser-side renderer never imports.
 */
export type { CorpusProblem } from './check.ts';
export {
  CORPUS_FORMAT_VERSION,
  TONGS_KEYS,
  capturePath,
  deviationCovers,
  findView,
  parseCorpusManifest,
  requiredCaptures,
  resolutionKey,
  type CaptureKey,
  type CorpusManifest,
  type CorpusMod,
  type CorpusPlayset,
  type CorpusResolution,
  type CorpusSave,
  type CorpusView,
  type CorpusWindow,
  type KnownDeviation,
  type ManifestResult,
  type NotCovered,
  type PlaysetGate,
  type Recipe,
  type RecipeStart,
  type RecipeStep,
  type TongsKey,
} from './manifest.ts';
export {
  TONGS_WIDGET_TYPES,
  captureKeyOf,
  captureProblems,
  capturedWidgets,
  parseCaptureRecord,
  type CaptureRecord,
  type CaptureResult,
  type CapturedWidget,
  type TongsWidgetType,
} from './capture.ts';
export {
  CORPUS_PATH_VARIABLE,
  captureRecordFile,
  hashFile,
  hashModFolder,
  listCaptureRecords,
  localCorpusFolder,
  readCaptureRecord,
  readCorpusManifest,
  screenshotFile,
} from './files.ts';
export {
  matchesWidgetPattern,
  parentWidgetPath,
  splitWidgetPath,
  widgetPatternProblem,
} from './widget-path.ts';
