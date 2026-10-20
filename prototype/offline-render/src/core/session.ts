// PROTOTYPE (etch#9): one preview session (mod set + indexes) with step timings. Throwaway.
import { Files, Root } from './files';
import { Gfx, loadLocalisation } from './gfx';
import { parse } from './parse';
import { DrawList, findWindow, layoutWindow, SampleData } from './layout';

export type Timings = Record<string, number>;
const now = () => performance.now();

export class Session {
  files!: Files; gfx!: Gfx; loc!: Map<string, string>;
  readonly cold: Timings = {};

  constructor(roots: Root[]) {
    let t = now();
    this.files = new Files(roots, ['interface', 'gfx/interface', 'gfx/fonts', 'localisation']);
    this.cold.fileIndex = now() - t; t = now();
    this.gfx = new Gfx(this.files);
    this.cold.gfxIndex = now() - t; t = now();
    this.loc = loadLocalisation(this.files);
    this.cold.localisation = now() - t;
  }

  render(guiText: string, window: string, screen: { w: number; h: number }, sample?: SampleData, extra?: { inheritOrientation?: boolean }): { list: DrawList; t: Timings } {
    const t: Timings = {}; let s = now();
    const top = parse(guiText); t.parse = now() - s; s = now();
    const root = findWindow(top, window.split('/')[0]);
    if (!root) throw new Error(`window ${window} not found`);
    const list = layoutWindow(this.gfx, root, { screen, loc: this.loc, sample, only: window.includes('/') ? window : undefined, ...extra });
    t.layout = now() - s;
    return { list, t };
  }
}
