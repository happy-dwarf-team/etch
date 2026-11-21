import { describe, expect, it } from 'vitest';
import { checkFolderOf, mapCheckErrors, planCheck, type CheckChunk } from '../src/index.ts';

const EVENT = [
  'namespace = etch_check', // 1
  'country_event = {', // 2
  '\tid = etch_check.1', // 3
  '\ttitle = etch_check.1.t', // 4
  '\tis_triggered_only = yes', // 5
  '\ttrigger = {', // 6
  '\t\tadm_techh = 1', // 7
  '\t}', // 8
  '\timmediate = {', // 9
  '\t\tadd_treasuryy = 5', // 10
  '\t}', // 11
  '\toption = {', // 12
  '\t\tname = etch_check.1.a', // 13
  '\t\ttrigger = { is_at_war = yes }', // 14
  '\t\tai_chance = { factor = 1 }', // 15
  '\t\tadd_prestige = 1', // 16
  '\t}', // 17
  '}', // 18
  '',
].join('\n');

function only(plan: ReturnType<typeof planCheck>): CheckChunk {
  if (plan.kind !== 'chunks') throw new Error(plan.message);
  expect(plan.chunks).toHaveLength(1);
  const [chunk] = plan.chunks;
  if (chunk === undefined) throw new Error('no chunk');
  return chunk;
}

/** The run file's lines, each with the file line it came from. */
function mapped(chunk: CheckChunk): string[] {
  return chunk.text
    .trimEnd()
    .split('\n')
    .map((line, i) => `${String(chunk.lines[i])}: ${line}`);
}

describe('checkFolderOf', () => {
  it('knows the folders of the trigger and effect blocks', () => {
    expect(checkFolderOf('C:\\mod\\events\\etch.txt')).toBe('events');
    expect(checkFolderOf('mod/decisions/etch.txt')).toBe('decisions');
    expect(checkFolderOf('mod/missions/etch.txt')).toBe('missions');
    expect(checkFolderOf('mod/common/scripted_effects/etch.txt')).toBe('scripted_effects');
    expect(checkFolderOf('mod/common/scripted_triggers/etch.txt')).toBe('scripted_triggers');
    expect(checkFolderOf('mod/common/ideas/etch.txt')).toBeUndefined();
    expect(checkFolderOf('mod/events/etch.yml')).toBeUndefined();
    expect(checkFolderOf('mod/scripted_effects/etch.txt')).toBeUndefined();
  });
});

describe('planCheck', () => {
  it("wraps an event's blocks so that nothing runs, keeping each line's file line", () => {
    const chunk = only(planCheck(EVENT, 'events', 1 << 20));
    expect(mapped(chunk)).toEqual([
      '0: if = { limit = { always = no',
      '7: adm_techh = 1',
      '0: } }',
      '0: if = { limit = { always = no }',
      '10: add_treasuryy = 5',
      '0: }',
      '0: if = { limit = { always = no',
      '14: is_at_war = yes',
      '0: } }',
      '0: if = { limit = { always = no }',
      '16: add_prestige = 1',
      '0: }',
    ]);
    expect(chunk.blocks.map((b) => `${b.kind} ${b.key} ${String(b.line)}`)).toEqual([
      'trigger trigger 6',
      'effect immediate 9',
      'trigger trigger 14',
      'effect option 12',
    ]);
  });

  it("reads decisions' and missions' blocks", () => {
    const decisions = [
      'country_decisions = {',
      '\tetch_decision = {',
      '\t\tmajor = yes',
      '\t\tpotential = { tag = RUS }',
      '\t\tallow = { adm_power = 50 }',
      '\t\teffect = { add_treasury = 10 }',
      '\t\tai_will_do = { factor = 1 }',
      '\t}',
      '}',
    ].join('\n');
    expect(mapped(only(planCheck(decisions, 'decisions', 1 << 20)))).toEqual([
      '0: if = { limit = { always = no',
      '4: tag = RUS',
      '0: } }',
      '0: if = { limit = { always = no',
      '5: adm_power = 50',
      '0: } }',
      '0: if = { limit = { always = no }',
      '6: add_treasury = 10',
      '0: }',
    ]);
    const missions = [
      'etch_series = {',
      '\tslot = 1',
      '\tpotential = { tag = RUS }',
      '\tetch_mission = {',
      '\t\ticon = mission_rb_unite_the_clans',
      '\t\trequired_missions = { }',
      '\t\ttrigger = { army_size = 10 }',
      '\t\teffect = {',
      '\t\t\tadd_prestige = 5',
      '\t\t}',
      '\t}',
      '}',
    ].join('\n');
    expect(mapped(only(planCheck(missions, 'missions', 1 << 20)))).toEqual([
      '0: if = { limit = { always = no',
      '3: tag = RUS',
      '0: } }',
      '0: if = { limit = { always = no',
      '7: army_size = 10',
      '0: } }',
      '0: if = { limit = { always = no }',
      '9: add_prestige = 5',
      '0: }',
    ]);
  });

  it('wraps scripted effects and triggers, leaving out those with parameters', () => {
    const effects = [
      'etch_effect = {',
      '\tadd_treasury = 5',
      '}',
      'etch_with_parameter = {',
      '\tadd_treasury = $amount$',
      '}',
    ].join('\n');
    expect(mapped(only(planCheck(effects, 'scripted_effects', 1 << 20)))).toEqual([
      '0: if = { limit = { always = no }',
      '2: add_treasury = 5',
      '0: }',
    ]);
    expect(
      mapped(only(planCheck('etch_trigger = { is_at_war = yes }', 'scripted_triggers', 1 << 20))),
    ).toEqual(['0: if = { limit = { always = no', '1: is_at_war = yes', '0: } }']);
  });

  it('keeps a multi-line block whole, comments inside it included', () => {
    const text = [
      'etch_effect = {',
      '\tif = {',
      '\t\tlimit = { is_at_war = yes } # a comment with a }',
      '\t\tadd_treasury = 5',
      '\t}',
      '}',
    ].join('\n');
    expect(mapped(only(planCheck(text, 'scripted_effects', 1 << 20)))).toEqual([
      '0: if = { limit = { always = no }',
      '2: if = {',
      '3: \t\tlimit = { is_at_war = yes } # a comment with a }',
      '4: \t\tadd_treasury = 5',
      '5: \t}',
      '0: }',
    ]);
  });

  it('refuses a file whose braces do not balance, with the line', () => {
    expect(
      planCheck('etch = {\n\tadd_treasury = 5\n}\n}\n', 'scripted_effects', 1 << 20),
    ).toMatchObject({
      kind: 'refused',
      code: 'syntax',
      line: 4,
    });
    expect(planCheck('etch = {\n\tadd_treasury = 5\n', 'scripted_effects', 1 << 20)).toMatchObject({
      kind: 'refused',
      code: 'syntax',
      line: 1,
    });
    expect(planCheck('namespace = etch\n', 'events', 1 << 20)).toMatchObject({
      kind: 'refused',
      code: 'empty',
    });
  });

  it('splits a long file into run files of whole blocks', () => {
    const text = Array.from(
      { length: 6 },
      (_, i) => `etch_${String(i)} = { add_treasury = ${String(i)} }`,
    ).join('\n');
    const plan = planCheck(text, 'scripted_effects', 100);
    if (plan.kind !== 'chunks') throw new Error(plan.message);
    expect(plan.chunks.length).toBeGreaterThan(1);
    expect(plan.chunks.flatMap((c) => c.blocks.map((b) => b.line))).toEqual([1, 2, 3, 4, 5, 6]);
    for (const chunk of plan.chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(100);
      expect(chunk.text.split('\n').length - 1).toBe(chunk.lines.length);
    }
  });
});

describe('mapCheckErrors', () => {
  // The lines of the gate run (docs/live-game.md, "The script check: the gate run").
  it("places the game's lines on the file through the run file's lines", () => {
    const chunk = only(planCheck(EVENT, 'events', 1 << 20));
    const errors = mapCheckErrors(
      [
        '[persistent.cpp:62]: Parsing Errors. File: "etch_run_0123456789abcdef.txt", Error: ',
        '  [0]: Unknown trigger type. Key: adm_techh: adm_techh, near line: 2',
        '  [1]: Failed to create trigger: 1, near line: 2',
        '[effectimplementation.cpp:23127]: Unknown effect type. Key: add_treasuryy: add_treasuryy, near line: 5, Last good read: always=no',
        '[effectimplementation.cpp:23127]: Unknown effect type. Key: add_treasuryy: add_treasuryy, near line: 5, Last good read: always=no',
        "[effectimplementation.cpp:13542]: Unknown modifier-type 'add_prestige'.",
        '[map.cpp:10]: Something about another file',
      ],
      chunk,
      EVENT,
    );
    expect(errors.map((e) => [e.line, e.count, e.column?.start])).toEqual([
      [7, 1, 2],
      [7, 1, undefined],
      [10, 2, 2],
      [16, 1, 2],
      [undefined, 1, undefined],
    ]);
    expect(errors[0]?.message).toBe(
      'Parsing Error. File: "etch_run_0123456789abcdef.txt", Error: Unknown trigger type. Key: adm_techh: adm_techh, near line: 2',
    );
  });
});
