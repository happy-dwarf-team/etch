// PROTOTYPE (etch#9): where the game and the playset live. Env overrides; defaults are this machine's Steam install.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { rootsFromPlayset } from '../core/files';
import { SampleData } from '../core/layout';

export function config() {
  const game = process.env.ETCH_GAME ?? 'C:/Program Files (x86)/Steam/steamapps/common/Europa Universalis IV';
  const user = process.env.ETCH_USER ?? path.join(os.homedir(), 'Documents/Paradox Interactive/Europa Universalis IV');
  const vanilla = process.env.ETCH_VANILLA === '1';
  const playset = process.env.ETCH_PLAYSET ?? path.resolve(__dirname, '..', 'samples', 'playset-menu-capture.json');
  const roots = rootsFromPlayset(game, vanilla ? undefined : user, playset);
  const sf = process.env.ETCH_SAMPLE;
  const sample: SampleData | undefined = sf ? JSON.parse(fs.readFileSync(sf, 'utf8')) : undefined;
  return { game, user, roots, sample };
}
