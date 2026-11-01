import { describe, expect, it } from 'vitest';
import { onScreen, type Ping } from '../src/live-game/pipe.ts';
import {
  ProvinceMemory,
  SESSION_SLACK_MS,
  reselectedMessage,
  restartReopens,
} from '../src/live-game/reopen.ts';

const ping = (session: number | undefined, province?: number, window = 'provinceview'): Ping => ({
  ready: true,
  frame: 1,
  responding: true,
  busy: false,
  pick: false,
  gameSession:
    session === undefined ? undefined : { ironman: false, multiplayer: false, number: session },
  provinceView: onScreen(province === undefined ? null : { province, window }),
});

describe('ProvinceMemory', () => {
  it('remembers the province on screen with its session, and forgets it when the view closes', () => {
    const memory = new ProvinceMemory('mp_Russia1719_03_17.eu4');
    memory.observe(ping(undefined), 1_000);
    expect(memory.remembered).toBeUndefined();
    memory.observe(ping(1), 5_000);
    memory.observe(ping(1, 295), 6_000);
    expect(memory.remembered).toEqual({
      province: 295,
      window: 'provinceview',
      session: 1,
      sessionSinceMs: 5_000,
      startSave: 'mp_Russia1719_03_17.eu4',
    });
    memory.observe(ping(1, 1161, 'colonisationpanel'), 7_000);
    expect(memory.remembered).toMatchObject({ province: 1161, window: 'colonisationpanel' });
    // The player closed the view: nothing to bring back.
    memory.observe(ping(1), 8_000);
    expect(memory.remembered).toBeUndefined();
  });

  it('starts again in another session, which continues no known save', () => {
    const memory = new ProvinceMemory('Verne1444_11_11_test.eu4');
    memory.observe(ping(1, 295), 1_000);
    memory.observe(ping(2), 9_000);
    expect(memory.remembered).toBeUndefined();
    memory.observe(ping(2, 4410), 10_000);
    expect(memory.remembered).toMatchObject({ province: 4410, session: 2, sessionSinceMs: 9_000 });
    expect(memory.remembered?.startSave).toBeUndefined();
    // Back in the main menu.
    memory.observe(ping(undefined), 11_000);
    expect(memory.remembered).toBeUndefined();
  });

  it('reads only a province view that is one', () => {
    expect(onScreen(null)).toBeUndefined();
    expect(onScreen({ province: 0, window: 'provinceview' })).toBeUndefined();
    expect(onScreen({ province: 12, window: 'countryview' })).toBeUndefined();
    expect(onScreen({ province: 12, window: 'colonisationpanel' })).toEqual({
      province: 12,
      window: 'colonisationpanel',
    });
  });
});

describe('restartReopens', () => {
  const remembered = {
    province: 295,
    window: 'provinceview' as const,
    session: 1,
    sessionSinceMs: 100_000,
    startSave: 'mp_Russia1719_03_17.eu4',
  };

  it('reopens on a save written in the session: the planned restart, an autosave, a crash', () => {
    expect(restartReopens(remembered, { name: 'autosave.eu4', modifiedMs: 200_000 })).toEqual({
      reopen: true,
    });
    expect(
      restartReopens(remembered, { name: 'autosave.eu4', modifiedMs: 100_000 - SESSION_SLACK_MS }),
    ).toEqual({ reopen: true });
  });

  it('reopens on the save the first session continued, written before it', () => {
    expect(
      restartReopens(remembered, { name: 'mp_Russia1719_03_17.eu4', modifiedMs: 1_000 }),
    ).toEqual({ reopen: true });
  });

  it('does not reopen on another game, nor without a province or a save', () => {
    const other = restartReopens(remembered, { name: 'older.eu4', modifiedMs: 1_000 });
    expect(other.reopen).toBe(false);
    expect('why' in other ? other.why : '').toContain('older.eu4 is not the game');
    expect(
      restartReopens(
        { ...remembered, session: 2, startSave: undefined },
        { name: 'mp_Russia1719_03_17.eu4', modifiedMs: 1_000 },
      ),
    ).toMatchObject({ reopen: false });
    expect(restartReopens(undefined, { name: 'autosave.eu4', modifiedMs: 1 })).toMatchObject({
      reopen: false,
    });
    expect(restartReopens(remembered, undefined)).toMatchObject({ reopen: false });
  });
});

describe('reselectedMessage', () => {
  it('says nothing for an opened view, and why for each refusal', () => {
    const r = (outcome: string) => ({ province: 295, outcome, window: undefined });
    expect(reselectedMessage(r('opened'))).toBeUndefined();
    expect(reselectedMessage(r('terra_incognita'))).toContain('terra incognita');
    expect(reselectedMessage(r('discover'))).toContain('discover');
    expect(reselectedMessage(r('moved_on'))).toContain('first');
    expect(reselectedMessage(r('outcome_42'))).toContain('outcome_42');
  });
});
