// Which build of Etch runs: build.mts bakes the stamp into the bundle and writes the same stamp to
// dist/build.json beside it. VS Code keeps running the code it loaded when a VSIX of the same
// version replaces the extension's files, so the running stamp and the file on disk then differ.
// Node only, no vscode.
import { readFile } from 'node:fs/promises';

/** A build of the extension. */
export interface BuildStamp {
  readonly version: string;
  /** The commit it was built from, short; `-dirty` when the tree had changes. */
  readonly commit: string;
  /** When it was built (ISO 8601): two builds of one commit differ by it. */
  readonly builtAt: string;
}

declare const ETCH_BUILD: BuildStamp | undefined;

/** The build that runs; `undefined` outside the bundle (the unit tests). */
export const RUNNING_BUILD: BuildStamp | undefined =
  typeof ETCH_BUILD === 'undefined' ? undefined : ETCH_BUILD;

/** The stamp in a build.json; `undefined` when it is missing or not a stamp. */
export async function readStamp(path: string): Promise<BuildStamp | undefined> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
  try {
    const value = JSON.parse(text) as Partial<Record<keyof BuildStamp, unknown>>;
    const { version, commit, builtAt } = value;
    if (typeof version !== 'string' || typeof commit !== 'string' || typeof builtAt !== 'string') {
      return undefined;
    }
    return { version, commit, builtAt };
  } catch {
    return undefined;
  }
}

export function sameBuild(a: BuildStamp, b: BuildStamp | undefined): boolean {
  return (
    b !== undefined && a.version === b.version && a.commit === b.commit && a.builtAt === b.builtAt
  );
}

/** A build as the log and the notices name it: `1.0.1 (abc1234)`. */
export function describeBuild(stamp: BuildStamp): string {
  return `${stamp.version} (${stamp.commit})`;
}
