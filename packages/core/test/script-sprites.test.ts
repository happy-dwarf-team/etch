import { describe, expect, it } from 'vitest';
import { isSpriteScriptPath, parseScript, scriptSpriteReferences } from '../src/index.ts';

const EVENTS = `namespace = etch
country_event = {
	id = etch.1
	picture = ETCH_HARBOUR_eventPicture
	option = { name = etch.1.a picture = NOT_A_PICTURE }
}
province_event = {
	id = etch.2
	picture = {
		trigger = { has_dlc = "Rights of Man" }
		picture = "ETCH_FIRE_eventPicture"
	}
	picture = {
		trigger = { always = yes }
		picture = ETCH_RAIN_eventPicture
	}
}
picture = NOT_IN_AN_EVENT
`;

const MISSIONS = `etch_series = {
	slot = 1
	icon = NOT_A_MISSION
	etch_first_mission = {
		icon = mission_etch_harbour
		effect = { icon = NOT_EITHER }
	}
	etch_second_mission = { ICON = mission_etch_fleet }
}
`;

const PRIVILEGES = `estate_etch_privilege = {
	icon = privilege_etch
	on_granted = { custom_tooltip = { icon = NOT_A_PRIVILEGE } }
}
`;

const names = (path: string, text: string): string[] =>
  scriptSpriteReferences(path, parseScript(text, { script: true })).map(
    (r) => `${r.name} ${text.slice(r.node.start, r.node.end)}`,
  );

describe('scriptSpriteReferences', () => {
  it("reads an event's picture, plain or conditional, and nothing deeper or outside an event", () => {
    expect(names('events/etch.txt', EVENTS)).toEqual([
      'ETCH_HARBOUR_eventPicture ETCH_HARBOUR_eventPicture',
      'ETCH_FIRE_eventPicture "ETCH_FIRE_eventPicture"',
      'ETCH_RAIN_eventPicture ETCH_RAIN_eventPicture',
    ]);
  });

  it("reads a mission's icon in a series, in any case", () => {
    expect(names('missions/etch_missions.txt', MISSIONS)).toEqual([
      'mission_etch_harbour mission_etch_harbour',
      'mission_etch_fleet mission_etch_fleet',
    ]);
  });

  it("reads an estate privilege's icon", () => {
    expect(names('common/estate_privileges/etch.txt', PRIVILEGES)).toEqual([
      'privilege_etch privilege_etch',
    ]);
  });

  it('reads nothing in other folders or other files', () => {
    expect(names('common/government_reforms/etch.txt', PRIVILEGES)).toEqual([]);
    expect(names('events/etch.yml', EVENTS)).toEqual([]);
    expect(names('decisions/etch.txt', EVENTS)).toEqual([]);
  });

  it('knows its paths with either separator and in any case', () => {
    expect(isSpriteScriptPath('Events\\Etch.TXT')).toBe(true);
    expect(isSpriteScriptPath('common/estate_privileges/a.txt')).toBe(true);
    expect(isSpriteScriptPath('common/estates/a.txt')).toBe(false);
    expect(isSpriteScriptPath('interface/a.gui')).toBe(false);
  });
});
