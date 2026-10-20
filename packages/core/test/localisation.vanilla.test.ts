// Local only: reads the installed game's localisation in place, read only.
// Runs when ETCH_GAME_PATH names the game folder, for example
//   $env:ETCH_GAME_PATH = 'C:\Program Files (x86)\Steam\steamapps\common\Europa Universalis IV'
// and is skipped otherwise (CI has no game). Game files never enter the repository.
import { describe, expect, it } from 'vitest';
import { GAME_LANGUAGES } from '../src/index.ts';
import { GameFiles, loadPlaysetLocalisation } from '../src/playset/index.ts';

const gamePath = process.env['ETCH_GAME_PATH'];

describe.skipIf(gamePath === undefined)('vanilla localisation', () => {
  const files = new GameFiles([{ name: 'game', root: gamePath ?? '', replacePaths: [] }]);

  it.each(GAME_LANGUAGES)('%s reads without problems', async (language) => {
    const loc = await loadPlaysetLocalisation(files, language);
    expect(loc.problems()).toEqual([]);
    expect(loc.size).toBeGreaterThan(100_000);
    expect(loc.get(`l_${language}`)).toBeTruthy();
  });

  it('keeps substitutions and markup literal', async () => {
    const loc = await loadPlaysetLocalisation(files, 'english');
    expect(loc.get('EMBARGO_AGAINST')).toBe('$WHO$ is embargoing $AGAINST$.');
    expect(loc.get('ACCEPTED_CULTURE_SLOTS_DESC')).toContain('§Y"Promote Culture"§!');
  });
});
