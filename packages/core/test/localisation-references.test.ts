import { describe, expect, it } from 'vitest';
import { isLocalisationReferencePath, localisationReferences, parseScript } from '../src/index.ts';

const GUI = `guiTypes = {
	windowType = {
		name = "etch_window"
		instantTextBoxType = { name = "title" text = "ETCH_TITLE" }
		guiButtonType = { name = "ok" buttonText = "NOT_A_TEXT" tooltipText = ETCH_OK_TT }
		iconType = { name = "badge" tooltip = "" delayedTooltipText = @constant }
		instantTextBoxType = { name = "late" TEXT = "ETCH_LATE" }
	}
}
`;

const EVENTS = `namespace = etch
country_event = {
	id = etch.1
	title = etch.1.t
	desc = "etch.1.d"
	option = {
		name = etch.1.a
		custom_tooltip = ETCH_TT
		add_treasury = 10
	}
	immediate = { hidden_effect = { tooltip = { add_prestige = 1 } } }
}
`;

const keysOf = (path: string, text: string, script = true): string[] =>
  localisationReferences(path, parseScript(text, { script })).map(({ key }) => key);

describe('localisationReferences', () => {
  it('reads the text keys of a .gui file, case-insensitively, and nothing else', () => {
    expect(keysOf('interface/etch.gui', GUI, false)).toEqual([
      'ETCH_TITLE',
      'ETCH_OK_TT',
      'ETCH_LATE',
    ]);
  });

  it('reads the keys of a script file at any depth, but not a block', () => {
    expect(keysOf('events/etch.txt', EVENTS)).toEqual([
      'etch.1.t',
      'etch.1.d',
      'etch.1.a',
      'ETCH_TT',
    ]);
  });

  it('gives the range of the value, quotes included', () => {
    const [desc] = localisationReferences(
      'events/etch.txt',
      parseScript('desc = "etch.1.d"', { script: true }),
    );
    expect(desc?.node.start).toBe(7);
    expect(desc?.node.end).toBe(17);
  });

  it('reads files of the folders the game shows texts from, and no others', () => {
    expect(isLocalisationReferencePath('interface/etch.gui')).toBe(true);
    expect(isLocalisationReferencePath('events/etch.txt')).toBe(true);
    expect(isLocalisationReferencePath('decisions/etch.txt')).toBe(true);
    expect(isLocalisationReferencePath('missions/etch.txt')).toBe(true);
    expect(isLocalisationReferencePath('common/ideas/etch.txt')).toBe(true);
    expect(isLocalisationReferencePath('history/provinces/1 - Uppland.txt')).toBe(false);
    expect(isLocalisationReferencePath('interface/etch.gfx')).toBe(false);
    expect(keysOf('history/countries/ETC.txt', 'name = etch')).toEqual([]);
  });

  it('reads the keys of common folders that CWTools types as localisation, not their kin', () => {
    const WARGOAL = `etch_wargoal = {
	type = take_province
	prov_desc = ETCH_PROVINCE
	country_desc = ETCH_COUNTRY
	war_name = ETCH_WAR_NAME
	elector_relation = ETCH_ELECTOR
}
`;
    expect(keysOf('common/wargoal_types/etch.txt', WARGOAL)).toEqual([
      'ETCH_PROVINCE',
      'ETCH_COUNTRY',
      'ETCH_WAR_NAME',
      'ETCH_ELECTOR',
    ]);
    expect(
      keysOf('common/rebel_types/etch.txt', 'etch = { demands_description = ETCH_DEMANDS }'),
    ).toEqual(['ETCH_DEMANDS']);
    expect(
      keysOf('common/mercenary_companies/etch.txt', 'm = { mercenary_desc_key = ETCH_M }'),
    ).toEqual(['ETCH_M']);
    expect(
      keysOf('common/ruler_personalities/etch.txt', 'p = { custom_ai_explanation = ETCH_AI }'),
    ).toEqual(['ETCH_AI']);
    expect(
      keysOf('common/religions/etch.txt', 'g = { r = { reform_tooltip = ETCH_REFORM } }'),
    ).toEqual(['ETCH_REFORM']);
    expect(
      keysOf('common/new_diplomatic_actions/etch.txt', 'a = { alert_tooltip = ETCH_ALERT }'),
    ).toEqual(['ETCH_ALERT']);
    expect(
      keysOf('common/religions/etch.txt', 'g = { r = { crusade_name = ETCH_CRUSADE } }'),
    ).toEqual(['ETCH_CRUSADE']);
    expect(
      keysOf('common/government_mechanics/etch.txt', 'm = { i = { cooldown_desc = ETCH_CD } }'),
    ).toEqual(['ETCH_CD']);
    expect(keysOf('missions/etch.txt', 'slot = { m = { key = etch_mission } }')).toEqual([]);
    expect(
      keysOf('events/etch.txt', 'e = { define_ruler = { dynasty = Etch } leader = etch_rebel }'),
    ).toEqual([]);
  });
});
