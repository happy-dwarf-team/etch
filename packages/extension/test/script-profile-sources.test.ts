import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GameFiles } from '@etch/core/playset';
import { scriptProfileMarkdown, parseScriptProfile } from '../src/script-profile.ts';
import type { ScriptProfileRow } from '../src/script-profile.ts';
import { findScriptSources } from '../src/script-profile-sources.ts';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** Writes files under a new folder: game-relative path to text. */
async function folder(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'etch-profile-sources-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    const file = join(root, ...path.split('/'));
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, text);
  }
  return root;
}

function row(owner: string, name: string, role: string, option = ''): ScriptProfileRow {
  return { owner, name, option, role, calls: 1, totalMs: 1, meanUs: 1, maxUs: 1, callerRva: '' };
}

// Made-up keys in the game's layout: an event with two options, a decision in its group, a mission
// in its group, and one key of each top-level kind.
const EVENTS = [
  'namespace = test_events',
  '',
  'country_event = {',
  '\tid = test_events.1',
  '\ttitle = test_events.1.t',
  '\ttrigger = {',
  '\t\tis_year = 1500',
  '\t}',
  '\tmean_time_to_happen = { months = 12 }',
  '\toption = {',
  '\t\tname = test_events.1.a',
  '\t}',
  '\toption = {',
  '\t\tname = test_events.1.b',
  '\t\ttrigger = { always = yes }',
  '\t\tai_chance = { factor = 1 }',
  '\t}',
  '}',
  '',
  'province_event = {',
  '\tid = test_events.2',
  '}',
].join('\r\n');

const GAME = {
  'events/test_events.txt': EVENTS,
  'decisions/test_decisions.txt': [
    'country_decisions = {',
    '\ttest_decision = {',
    '\t\tpotential = { always = yes }',
    '\t\tallow = { always = yes }',
    '\t\teffect = { add_prestige = 1 }',
    '\t}',
    '}',
  ].join('\n'),
  'missions/test_missions.txt': [
    'test_missions_1 = {',
    '\tslot = 1',
    '\tpotential = { always = yes }',
    '\ttest_mission = {',
    '\t\ticon = mission_test',
    '\t\ttrigger = { always = yes }',
    '\t}',
    '}',
  ].join('\n'),
  'common/on_actions/00_on_actions.txt': 'on_test_pulse = {\n\tevents = { test_events.1 }\n}\n',
  'common/cb_types/00_cb_types.txt':
    '# a comment\ncb_test = {\n\tprerequisites = { always = yes }\n}\n',
  'common/scripted_triggers/00_scripted_triggers.txt': 'is_test_trigger = {\n\talways = yes\n}\n',
  'common/church_aspects/00_church_aspects.txt':
    'test_aspect = {\n\tcost = 100\n\ttrigger = { always = yes }\n}\n',
};

describe('findScriptSources', () => {
  it('finds each kind of owner, and the role or option block inside it', async () => {
    const files = new GameFiles([{ name: 'game', root: await folder(GAME), replacePaths: [] }]);
    const rows = [
      row('event', 'test_events.1', 'trigger'),
      row('event', 'test_events.1', 'mean_time_to_happen'),
      row('event', 'test_events.2', 'immediate'),
      row('event_option', 'test_events.1', 'effect', '1'),
      row('event_option', 'test_events.1', 'ai_chance', '2'),
      row('event_option', 'test_events.1', 'trigger', '9'),
      row('decision', 'test_decision', 'allow'),
      row('mission', 'test_mission', 'trigger'),
      row('on_action', 'on_test_pulse', 'effect'),
      row('casus_belli', 'CB_TEST', 'prerequisites'),
      row('scripted_trigger', 'is_test_trigger', ''),
      row('church_aspect', 'test_aspect', 'potential'),
      row('triggered_modifier', 'not_in_the_playset', 'trigger'),
      row('none', '', 'trigger'),
    ];
    const sources = await findScriptSources(files, rows);
    const lines = rows.map((r) => sources.get(r)?.line);
    expect(lines).toEqual([6, 9, 20, 10, 16, 3, 4, 6, 1, 3, 1, 1, undefined, undefined]);
    const event = sources.get(rows[0] as ScriptProfileRow);
    expect(event?.path).toBe('events/test_events.txt');
    expect(event?.layer).toBe('game');
    expect(event?.others).toBe(0);
  });

  it('links the winning file, a subfolder too, and counts other definitions', async () => {
    const game = await folder(GAME);
    const mod = await folder({
      // The mod's file of the same name wins over the game's.
      'decisions/test_decisions.txt':
        'country_decisions = {\n\n\ttest_decision = {\n\t\tallow = { always = no }\n\t}\n}\n',
      // A second event with the same id, in a subfolder.
      'events/more/duplicate.txt': 'country_event = {\n\tid = test_events.2\n}\n',
    });
    const files = new GameFiles([
      { name: 'game', root: game, replacePaths: [] },
      { name: 'Test Mod', root: mod, replacePaths: [] },
    ]);
    const decision = row('decision', 'test_decision', 'allow');
    const event = row('event', 'test_events.2', 'immediate');
    const sources = await findScriptSources(files, [decision, event]);
    expect(sources.get(decision)).toMatchObject({
      path: 'decisions/test_decisions.txt',
      layer: 'Test Mod',
      line: 4,
      others: 0,
    });
    expect(sources.get(event)).toMatchObject({
      path: 'events/test_events.txt',
      line: 20,
      others: 1,
    });
  });
});

describe('scriptProfileMarkdown with links', () => {
  it('links the names it has a source for and says which playset', () => {
    const profile = parseScriptProfile(
      [
        '# format=1 status=complete days=30',
        'list,rank,owner,name,option,role,calls,total_ms,mean_us,max_us,main_thread_ms,caller_rva',
        'trigger,1,event,test_events.1,,trigger,10,2.5,250.0,400.0,2.5,',
        'trigger,2,decision,test_decision,,potential,3,1.0,333.3,500.0,1.0,',
      ].join('\n'),
    );
    const page = scriptProfileMarkdown(profile, { path: 'p.csv', uri: 'file:///p.csv' }, 30, {
      playset: "the workspace's playset (the game)",
      find: (r) =>
        r.name === 'test_events.1'
          ? { uri: 'file:///c%3A/game/events/a.txt#L6', title: 'events/a.txt, line 6 ("x")' }
          : undefined,
    });
    expect(page).toContain(
      `| 1 | Event | [test_events.1](<file:///c%3A/game/events/a.txt#L6> "events/a.txt, line 6 ('x')") | trigger |`,
    );
    expect(page).toContain('| 2 | Decision | test_decision | potential |');
    expect(page).toContain(
      "Names link to where they are written in the workspace's playset (the game)",
    );
  });
});
