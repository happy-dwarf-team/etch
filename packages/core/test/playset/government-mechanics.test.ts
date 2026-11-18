import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameFiles, loadGovernmentMechanics } from '../../src/playset/index.ts';
import { makeTree, removeTree } from './fixture.ts';

// The playset's government mechanics, scripted widgets and basic reforms, through the winning
// files of each layer.
describe('loadGovernmentMechanics', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTree({
      'game/common/government_mechanics/00_mechanics.txt': [
        'game_mechanic = { powers = { game_power = { gui = game_gui } } }',
        'reform_mechanic = { available = { has_reform = some_reform } }',
      ].join('\n'),
      'game/common/government_reforms/00_basic.txt':
        'game_basic = { basic_reform = yes government_abilities = { game_mechanic } }',
      'game/common/custom_gui/00_custom.txt': 'custom_icon = { name = game_icon }',
      // A mod that adds a mechanic every country has, given by its own basic reform.
      'mod/common/government_mechanics/mod_mechanics.txt': [
        'mod_hold = {',
        '  available = { always = yes }',
        '  interactions = { mod_action = { gui = mod_gui icon = GFX_mod cost_type = mod_power } }',
        '}',
      ].join('\n'),
      'mod/common/government_reforms/mod_basic.txt': [
        'mod_basic = { basic_reform = yes government_abilities = { MOD_HOLD } }',
        'mod_other = { government_abilities = { reform_mechanic } }',
      ].join('\n'),
      // Replaces the game's file of the same name.
      'mod/common/custom_gui/00_custom.txt': 'custom_window = { name = mod_window }',
    });
  });

  afterEach(async () => {
    await removeTree(root);
  });

  it('reads the mechanics, the basic ones and the scripted widgets of the winning files', async () => {
    const files = new GameFiles([
      { name: 'game', root: join(root, 'game'), replacePaths: [] },
      { name: 'Mod', root: join(root, 'mod'), replacePaths: [] },
    ]);
    const { mechanics, basic, scripted } = await loadGovernmentMechanics(files);
    expect(mechanics.map((m) => m.name)).toEqual(['game_mechanic', 'reform_mechanic', 'mod_hold']);
    expect(mechanics.find((m) => m.name === 'mod_hold')?.interactions).toEqual([
      { name: 'mod_action', gui: 'mod_gui', icon: 'GFX_mod', costType: 'mod_power', center: true },
    ]);
    // game_mechanic is given by a basic reform too and has no `available`; reform_mechanic needs
    // a reform, and a reform that is not basic gives nothing to every player.
    expect(basic.map((m) => m.name)).toEqual(['game_mechanic', 'mod_hold']);
    expect(scripted.map((w) => w.name)).toEqual(['mod_window']);
  });

  it('is empty for a playset without these folders', async () => {
    const files = new GameFiles([{ name: 'game', root: join(root, 'none'), replacePaths: [] }]);
    expect(await loadGovernmentMechanics(files)).toEqual({
      mechanics: [],
      basic: [],
      scripted: [],
    });
  });
});
