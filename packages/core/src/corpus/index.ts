/**
 * The precision corpus's text (ADR 0002, etch#41): the manifest, the capture records with their
 * widget trees, and where the screenshots live. Uses Node's file system, so it is a separate entry
 * point, `@etch/core/corpus`, that the browser-side renderer never imports.
 */
export { Checker, ID, SHA256, field, type CorpusProblem, type Json } from './check.ts';
export {
  CORPUS_FORMAT_VERSION,
  TONGS_KEYS,
  capturePath,
  deviationCovers,
  findView,
  parseCorpusManifest,
  requiredCaptures,
  resolutionKey,
  viewInPlayset,
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
  type PlaysetView,
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
  type CapturedScreenshot,
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
  unstableMaskFile,
} from './files.ts';
export { compareShots, unstableIn, type ShotComparison } from './shots.ts';
export {
  matchesWidgetPattern,
  parentWidgetPath,
  splitWidgetPath,
  widgetPatternProblem,
} from './widget-path.ts';
export {
  CHANNEL_TOLERANCE,
  PASS_SHARE,
  PIXEL,
  WIDGET_STATUSES,
  compareCapture,
  differenceImage,
  planCapture,
  spriteShaderOf,
  type CaptureComparison,
  type CapturePlan,
  type CapturePlanInput,
  type PixelCounts,
  type PixelMap,
  type PlanWindow,
  type PlannedWidget,
  type WidgetComparison,
  type WidgetRect,
  type WidgetStatus,
} from './compare.ts';
export { decodePng, encodeGreyPng, encodePng, type RgbaImage } from './png.ts';
export {
  corpusSummary,
  gates,
  outcomePassed,
  windowReport,
  type CaptureOutcome,
} from './report.ts';
export { profileVisibility, type VisibilityMismatch, type VisibilityResult } from './visibility.ts';
