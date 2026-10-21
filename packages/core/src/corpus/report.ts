/**
 * The reports of the precision corpus (ADR 0002, etch#43): one Markdown page per corpus window,
 * with each capture's result and what failed, and a summary that says whether the layout preview
 * meets its target. The full per-widget results are the comparisons themselves, kept as JSON.
 */
import {
  CHANNEL_TOLERANCE,
  WIDGET_STATUSES,
  type CaptureComparison,
  type PixelCounts,
  type WidgetComparison,
} from './compare.ts';
import {
  capturePath,
  findView,
  resolutionKey,
  type CaptureKey,
  type CorpusManifest,
} from './manifest.ts';

/** What became of one capture the corpus wants. */
export type CaptureOutcome =
  | { readonly kind: 'compared'; readonly key: CaptureKey; readonly comparison: CaptureComparison }
  | {
      readonly kind: 'not-compared';
      readonly key: CaptureKey;
      /** Why: no capture record or screenshot, an out-of-date record, or an error. */
      readonly reasons: readonly string[];
    };

/** Whether an outcome counts for a release: a release playset at a confirmed resolution. */
export function gates(manifest: CorpusManifest, key: CaptureKey): boolean {
  const playset = manifest.playsets.find((p) => p.id === key.playset);
  const resolution = manifest.resolutions.find(
    (r) => resolutionKey(r) === resolutionKey(key.resolution),
  );
  return playset?.gate === 'release' && resolution?.confirmed === true;
}

/** Whether an outcome passed: compared, with no failing widget. */
export function outcomePassed(outcome: CaptureOutcome): boolean {
  return outcome.kind === 'compared' && outcome.comparison.passed;
}

/** The Markdown report of one corpus window over the outcomes of its views. */
export function windowReport(
  manifest: CorpusManifest,
  windowId: string,
  outcomes: readonly CaptureOutcome[],
): string {
  const window = manifest.windows.find((w) => w.id === windowId);
  const mine = outcomes.filter((o) => findView(manifest, o.key.view)?.window.id === windowId);
  const lines = [
    `# ${window?.title ?? windowId}`,
    '',
    `Corpus window \`${windowId}\` (${(window?.files ?? []).map((f) => `\`${f}\``).join(', ')}), ` +
      'compared widget by widget as ADR 0002 says: a static widget passes when its rect matches ' +
      `the game's and at least 99 % of its compared pixels are within ±${String(CHANNEL_TOLERANCE)} ` +
      'per channel. Rows in a release playset at a confirmed resolution gate a release.',
    '',
    '| Playset | Resolution | View | Gate | Result | Pass | Fail | Deviation | Not covered | ' +
      'Code-filled | Hidden | Within ±2 | Mean difference |',
    '| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const outcome of mine) {
    const { key } = outcome;
    const gate = gates(manifest, key) ? 'release' : 'report';
    const head = `| ${key.playset} | ${resolutionKey(key.resolution)} | ${key.view} | ${gate} |`;
    if (outcome.kind === 'not-compared') {
      lines.push(`${head} not compared | | | | | | | | |`);
      continue;
    }
    const { totals, passed } = outcome.comparison;
    const w = totals.widgets;
    lines.push(
      `${head} ${passed ? 'pass' : '**fail**'} | ${String(w.pass)} | ${String(w.fail)} | ` +
        `${String(w.deviation)} | ${String(w['not-covered'])} | ${String(w['code-filled'])} | ` +
        `${String(w.hidden)} | ${share(totals.pixels)} | ${mean(totals.pixels)} |`,
    );
  }

  for (const outcome of mine) {
    const { key } = outcome;
    lines.push('', `## ${key.view}, ${key.playset}, ${resolutionKey(key.resolution)}`, '');
    lines.push(`Capture \`${capturePath(key)}\`.`, '');
    if (outcome.kind === 'not-compared') {
      lines.push('Not compared:', '', ...outcome.reasons.map((r) => `- ${r}`));
      continue;
    }
    const { comparison } = outcome;
    if (comparison.problems.length > 0) {
      lines.push(...comparison.problems.map((p) => `- ${p}`), '');
    }
    const notable = comparison.widgets
      .filter((w) => w.status === 'fail' || w.status === 'deviation' || w.problems.length > 0)
      .sort((a, b) => order(a) - order(b));
    if (notable.length === 0) {
      lines.push(
        `Every compared widget passes: ${String(comparison.totals.pixels.compared)} pixels, ` +
          `${share(comparison.totals.pixels)} within ±${String(CHANNEL_TOLERANCE)}.`,
      );
      continue;
    }
    lines.push('| Widget | Kind | Status | What differs |', '| --- | --- | --- | --- |');
    for (const widget of notable) {
      const what = [
        ...widget.problems,
        ...(widget.deviations ?? []).map((d) => `Known deviation \`${d}\`.`),
        ...(widget.reason === undefined ? [] : [`Not covered: ${widget.reason}.`]),
      ];
      lines.push(
        `| \`${widget.path}\` | ${widget.kind ?? widget.type ?? ''} | ${widget.status} | ` +
          `${what.join(' ').replace(/\|/g, '\\|')} |`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * The summary of a corpus run: per window and playset, how many captures passed at each
 * resolution, and whether the layout preview meets its target (ADR 0002): every capture of a
 * release playset at a confirmed resolution compared and passed.
 */
export function corpusSummary(
  manifest: CorpusManifest,
  outcomes: readonly CaptureOutcome[],
): { readonly passed: boolean; readonly markdown: string } {
  const gating = outcomes.filter((o) => gates(manifest, o.key));
  const passed = gating.length > 0 && gating.every(outcomePassed);
  const resolutions = [...new Set(outcomes.map((o) => resolutionKey(o.key.resolution)))];
  const lines = [
    '# Precision corpus',
    '',
    passed
      ? `The layout preview meets its target: all ${String(gating.length)} gating captures pass.`
      : `The layout preview does not meet its target: ${String(gating.filter(outcomePassed).length)} ` +
        `of ${String(gating.length)} gating captures pass.`,
    '',
    'Each cell is passed captures of the window\'s views at that resolution; "–" is none wanted.',
    '',
    `| Window | Playset | Gate | ${resolutions.join(' | ')} |`,
    `| --- | --- | --- | ${resolutions.map(() => '---:').join(' | ')} |`,
  ];
  for (const window of manifest.windows) {
    for (const playset of manifest.playsets) {
      const mine = outcomes.filter(
        (o) =>
          o.key.playset === playset.id && findView(manifest, o.key.view)?.window.id === window.id,
      );
      if (mine.length === 0) continue;
      const cells = resolutions.map((res) => {
        const at = mine.filter((o) => resolutionKey(o.key.resolution) === res);
        if (at.length === 0) return '–';
        const ok = at.filter(outcomePassed).length;
        return ok === at.length
          ? `${String(ok)}/${String(at.length)}`
          : `**${String(ok)}/${String(at.length)}**`;
      });
      lines.push(
        `| [${window.id}](${window.id}.md) | ${playset.id} | ${playset.gate} | ${cells.join(' | ')} |`,
      );
    }
  }
  return { passed, markdown: `${lines.join('\n')}\n` };
}

function order(widget: WidgetComparison): number {
  return WIDGET_STATUSES.indexOf(widget.status);
}

function share(pixels: PixelCounts): string {
  if (pixels.compared === 0) return '–';
  return `${(Math.floor((pixels.within / pixels.compared) * 10000) / 100).toFixed(2)} %`;
}

function mean(pixels: PixelCounts): string {
  return pixels.compared === 0 ? '–' : pixels.meanDifference.toFixed(2);
}
