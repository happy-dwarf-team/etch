import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findLatestScriptProfile,
  parseScriptProfile,
  rowLabel,
  scriptProfileMarkdown,
  type ScriptProfileRow,
} from '../src/script-profile.ts';

/** The row at an index, which the test expects to be there. */
function at(rows: readonly ScriptProfileRow[], index: number): ScriptProfileRow {
  const row = rows[index];
  if (row === undefined) throw new Error(`no row ${String(index)}`);
  return row;
}

// A profile as Anvil's anvil-script-profiler writes it (format=1, docs/script-profiler.md there),
// with made-up keys.
const PROFILE = [
  '# format=1 plugin=anvil-script-profiler version=1.22.0 build=eu4-1.37.5-steam-win64 status=complete started=2026-11-12T09:09:12 first_day=1449.9.21 last_day=1450.3.21 days=182 wall_s=36.156 threads=7 root_calls=1000 nested_triggers=0 nested_effects=0 dropped_calls=0 multiplayer=0 ironman=0',
  '# Root blocks only, merged by owner and role.',
  'list,rank,owner,name,option,role,calls,total_ms,mean_us,max_us,main_thread_ms,caller_rva',
  'trigger,1,none,,,trigger,800,12.5,0.016,30.2,1.1,0x7F99AE',
  'trigger,2,event,test_events.1,,trigger,100,40.25,402.5,900.0,10.0,',
  'trigger,3,casus_belli,cb_test,,prerequisites,50,3.0,60.0,80.0,3.0,',
  'effect,1,event_option,test_events.2,2,effect,10,62.0,6200.0,61000.5,62.0,',
  'effect,2,on_action,on_test_pulse,,effect,40,5.5,137.5,400.0,5.5,',
  '',
].join('\r\n');

describe('parseScriptProfile', () => {
  it('reads the line of pairs and the two lists, each longest first', () => {
    const profile = parseScriptProfile(PROFILE);
    expect(profile.meta['version']).toBe('1.22.0');
    expect(profile.meta['days']).toBe('182');
    expect(profile.interrupted).toBe(false);
    expect(profile.problems).toEqual([]);
    expect(profile.triggers.rows.map((r) => r.name)).toEqual(['test_events.1', '', 'cb_test']);
    expect(profile.triggers.totalMs).toBeCloseTo(55.75);
    expect(profile.triggers.calls).toBe(950);
    expect(profile.effects.rows[0]).toMatchObject({
      owner: 'event_option',
      name: 'test_events.2',
      option: '2',
      calls: 10,
      totalMs: 62,
      meanUs: 6200,
      maxUs: 61000.5,
    });
  });

  it('names a row as the profiler window does', () => {
    const profile = parseScriptProfile(PROFILE);
    expect(rowLabel(at(profile.effects.rows, 0))).toBe('test_events.2 #2');
    expect(rowLabel(at(profile.triggers.rows, 1))).toBe('called from 0x7F99AE');
    expect(rowLabel(at(profile.triggers.rows, 2))).toBe('cb_test');
  });

  it('sums the rows without an owner into one, as the profiler window does', () => {
    const profile = parseScriptProfile(
      PROFILE.replace(
        'trigger,2,event,',
        'trigger,9,none,,,trigger,200,7.5,0.0375,45.0,1.0,0xB99B3E\r\ntrigger,2,event,',
      ),
    );
    const unowned = profile.triggers.rows.filter((r) => r.owner === 'none');
    expect(unowned).toHaveLength(1);
    expect(unowned[0]).toMatchObject({ calls: 1000, totalMs: 20, maxUs: 45, callers: 2 });
    expect(unowned[0]?.meanUs).toBeCloseTo(20);
    expect(rowLabel(at(unowned, 0))).toBe('2 callers in eu4.exe (the CSV lists each)');
    expect(profile.triggers.rows.map((r) => r.owner)).toEqual(['event', 'none', 'casus_belli']);
  });

  it('marks an interrupted span', () => {
    const profile = parseScriptProfile(
      PROFILE.replace('status=complete', 'status=interrupted_session'),
    );
    expect(profile.interrupted).toBe(true);
    expect(scriptProfileMarkdown(profile, { path: 'p.csv', uri: 'file:///p.csv' }, 10)).toContain(
      '**Interrupted** (interrupted_session)',
    );
  });

  it('finds columns by the header: new and reordered columns, quoted fields', () => {
    const text = [
      '# format=2 status=complete',
      'calls,list,new_column,total_ms,name,owner,role,max_us,mean_us',
      '5,trigger,x,1.5,"key, with comma",event,trigger,9,3',
      '7,effect,y,2.5,"say ""hi""",decision,effect,8,4',
      '1,other_list,z,1,a,event,trigger,1,1',
    ].join('\n');
    const profile = parseScriptProfile(text);
    expect(profile.triggers.rows[0]).toMatchObject({
      name: 'key, with comma',
      calls: 5,
      totalMs: 1.5,
    });
    expect(profile.effects.rows[0]).toMatchObject({
      name: 'say "hi"',
      owner: 'decision',
      meanUs: 4,
    });
    expect(profile.problems).toEqual([
      'The file is in format 2, newer than Etch reads (1): only the columns Etch knows are shown.',
      '1 rows of other lists than triggers and effects are left out.',
    ]);
  });

  it('refuses a file without the columns a row needs', () => {
    expect(() => parseScriptProfile('# format=1\nlist,owner\ntrigger,event\n')).toThrow(
      /no column calls, total_ms/,
    );
    expect(() => parseScriptProfile('# format=1\n')).toThrow(/no header/);
  });
});

describe('scriptProfileMarkdown', () => {
  it('shows the span, the totals and the longest rows of each list', () => {
    const page = scriptProfileMarkdown(
      parseScriptProfile(PROFILE),
      { path: 'C:\\logs\\script_profile_1.csv', uri: 'file:///c%3A/logs/script_profile_1.csv' },
      2,
    );
    expect(page).toContain('182 days (1449.9.21 to 1450.3.21) · 36.156 s');
    expect(page).toContain('Anvil 1.22.0');
    expect(page).toContain('## Triggers');
    expect(page).toContain('55.8 ms in 950 calls, 3 rows.');
    expect(page).toContain(
      '| 1 | Event | test_events.1 | trigger | 100 | 40.25 | 402.500 | 900.0 |',
    );
    expect(page).toContain('| 2 | No owner found | called from 0x7F99AE | trigger |');
    expect(page).toContain('1 more rows are in the CSV.');
    expect(page).toContain(
      '| 1 | Event option | test_events.2 #2 | effect | 10 | 62.00 | 6,200.000 | 61,000.5 |',
    );
    expect(page).not.toContain('Interrupted');
  });

  it('escapes what would break a table', () => {
    const page = scriptProfileMarkdown(
      parseScriptProfile('list,calls,total_ms,name,owner\ntrigger,1,1,a|b,event\n'),
      { path: 'p', uri: 'file:///p' },
      5,
    );
    expect(page).toContain('a\\|b');
  });
});

describe('findLatestScriptProfile', () => {
  let folder: string | undefined;
  afterEach(async () => {
    if (folder !== undefined) await rm(folder, { recursive: true, force: true });
  });

  it('takes the newest script_profile_*.csv of the logs folders', async () => {
    folder = await mkdtemp(join(tmpdir(), 'etch-script-profile-'));
    const player = join(folder, 'player');
    const privateProfile = join(folder, 'private');
    await mkdir(join(player, 'logs'), { recursive: true });
    await mkdir(join(privateProfile, 'logs'), { recursive: true });
    const old = join(player, 'logs', 'script_profile_2026-11-01_100000.csv');
    const newest = join(privateProfile, 'logs', 'script_profile_2026-11-02_100000.csv');
    const other = join(player, 'logs', 'error.log');
    for (const path of [old, newest, other]) await writeFile(path, PROFILE);
    await utimes(old, new Date('2026-11-01'), new Date('2026-11-01'));
    await utimes(newest, new Date('2026-11-02'), new Date('2026-11-02'));
    await utimes(other, new Date('2026-11-03'), new Date('2026-11-03'));
    const found = await findLatestScriptProfile([player, privateProfile, join(folder, 'missing')]);
    expect(found?.path).toBe(newest);
    expect(await findLatestScriptProfile([join(folder, 'missing')])).toBeUndefined();
  });
});
