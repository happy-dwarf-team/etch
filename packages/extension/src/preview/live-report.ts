// Compare with Live Game's texts (spec v3 section 4): what Problems says of a live difference and
// what **Report to Etch** puts in a new issue. The issue holds the widget's path, the kind of
// difference, both rects, the visibility, the versions and the resolution; never a file or a text
// of the mod. Node only, no vscode.
import type { LiveDifference } from '@etch/core/corpus';

export const ETCH_ISSUES = 'https://github.com/happy-dwarf-team/etch/issues/new';

type Rect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

export function rectText(rect: Rect | undefined): string {
  return rect === undefined
    ? 'off the screen'
    : `${String(rect.x)},${String(rect.y)} ${String(rect.w)}×${String(rect.h)}`;
}

/** What Problems says of a live difference. */
export function differenceMessage(difference: LiveDifference): string {
  switch (difference.kind) {
    case 'place':
      return (
        `Live difference: the game shows ${difference.path} at ${rectText(difference.game)}, ` +
        `the offline preview at ${rectText(difference.preview)}.`
      );
    case 'gameOnly':
      return (
        `Live difference: the game shows ${difference.path} at ${rectText(difference.game)}, ` +
        "which the window's files do not define."
      );
    case 'previewOnly':
      return `Live difference: the offline preview draws ${difference.path}, which the game did not create.`;
    case 'hidden':
      return `Live difference: the game hides ${difference.path}, which the offline preview draws.`;
    case 'shown':
      return `Live difference: the game shows ${difference.path} at ${rectText(difference.game)}, which the offline preview hides.`;
    case 'hiddenInWindow': {
      const n = difference.paths.length;
      return (
        `Live difference: the game hides ${String(n)} ${n === 1 ? 'widget' : 'widgets'} of ` +
        `${difference.path} that the offline preview draws. Without a window profile the preview ` +
        'draws every widget: Save as view keeps what the game showed.'
      );
    }
  }
}

export interface ReportVersions {
  readonly etch: string;
  readonly anvil: string;
  readonly tongs: string;
}

/** The fields **Report to Etch** sends, as the author sees them before sending. */
export function reportBody(
  difference: LiveDifference,
  screen: { readonly width: number; readonly height: number },
  versions: ReportVersions,
  profiled: boolean,
): string {
  const game = 'game' in difference ? rectText(difference.game) : '–';
  const preview =
    difference.kind === 'place'
      ? rectText(difference.preview)
      : difference.kind === 'previewOnly'
        ? rectText(difference.preview)
        : '–';
  const visibility: Record<LiveDifference['kind'], string> = {
    place: 'shown by both',
    gameOnly: 'shown by the game; not in the files',
    previewOnly: 'drawn by the preview; not created by the game',
    hidden: 'hidden by the game; drawn by the preview',
    shown: 'shown by the game; hidden by the preview',
    hiddenInWindow: `${String('paths' in difference ? difference.paths.length : 0)} widgets hidden by the game; drawn by the preview`,
  };
  return [
    'Compare with Live Game found a live difference.',
    '',
    `- Widget: \`${difference.path}\``,
    `- Kind: ${difference.kind}`,
    `- Game rect: ${game}`,
    `- Offline preview rect: ${preview}`,
    `- Visibility: ${visibility[difference.kind]}`,
    `- Window profile: ${profiled ? 'yes' : 'no'}`,
    `- Resolution: ${String(screen.width)}×${String(screen.height)}`,
    `- Etch ${versions.etch}, Anvil ${versions.anvil}, Tongs ${versions.tongs}`,
    '',
    'No files or texts of the mod are included. Add what the window is and how to open it in the game, if you can.',
  ].join('\n');
}

export function reportTitle(difference: LiveDifference): string {
  const leaf = difference.path.split('/').at(-1) ?? difference.path;
  return `Live difference: ${difference.kind} of ${leaf}`;
}

/** The new issue's address, filled in. */
export function reportUrl(title: string, body: string): string {
  return `${ETCH_ISSUES}?${new URLSearchParams({ title, body }).toString()}`;
}
