import { describe, expect, it } from 'vitest';
import { formatNumber } from '../src/profile/sample.ts';
import { readSavePath, SaveChoice } from '../src/profile/save-paths.ts';
import { readSave } from '../src/save/save.ts';
import {
  fixedPoint,
  menShortText,
  menSiText,
  menText,
  plusText,
  signedStabilityText,
  signedText,
  treasuryText,
  wholeText,
} from '../src/profile/game-numbers.ts';

/** A save value through a formatter, as the game holds it. */
const of = (format: (raw: number) => string, value: number): string => format(fixedPoint(value));

// The texts the game wrote in the coverage survey (EU4 1.37.5): Russia and Savoy of 17 March
// 1719, Verne of 11 November 1444 in Anbennar.
describe("the game's number formats", () => {
  it('writes the top bar as the game does', () => {
    expect(of(treasuryText, 1000000)).toBe('1000k');
    expect(of(treasuryText, 9999.9)).toBe('9999');
    expect(of(treasuryText, 10000)).toBe('10k');
    expect(of(menText, 2534.947)).toBe('2534k');
    expect(of(menText, 45.5)).toBe('45,500');
    expect(of(menText, 0.75)).toBe('750');
    expect(of(signedStabilityText, 3)).toBe('§W+3');
    expect(of(signedStabilityText, 0)).toBe('§W+0');
    expect(of(signedStabilityText, -2)).toBe('§R-2');
    expect(of(signedText, 100)).toBe('§W+100');
    expect(of(signedText, -5.924)).toBe('§R-5');
    expect(of(signedText, 0.4)).toBe('§Y0');
  });

  it('writes the diplomacy and stability views as the game does', () => {
    expect(of(wholeText, 16343.119)).toBe('16343');
    expect(of(wholeText, 9.655)).toBe('9');
    expect(of(wholeText, -0.5)).toBe('-0');
    expect(of(wholeText, -5.924)).toBe('-5');
    expect(of(plusText, 3)).toBe('+3');
    expect(of(plusText, 0)).toBe('0');
    expect(of(plusText, -1)).toBe('-1');
    expect(of(menShortText, 2534.947)).toBe('2534k');
    expect(of(menShortText, 23.822)).toBe('23k');
    expect(of(menShortText, 0.4)).toBe('0');
    expect(of(menSiText, 9.7)).toBe('9k');
    expect(of(menSiText, 2063)).toBe('2M');
    expect(of(menSiText, 999.999)).toBe('999k');
    expect(of(menSiText, 0.5)).toBe('500');
  });

  it('formats a save value by the name a profile gives', () => {
    expect(formatNumber(16343.119, 'whole', undefined)).toBe('16343');
    expect(formatNumber(12.5, 'percent', undefined)).toBe('12.5%');
  });
});

/** A save with the game's age scoring set (the 29th gameplay option) or not. */
const saveText = (ageScoring: 0 | 1): string => `EU4txt
date=1719.3.17
player="RUS"
gameplaysettings={
	setgameplayoptions={
		1 1 0 1 1 0 0 1 0 1 0 1 2 0 0 0 0 0 1 1 0 0 1 0 0 1 0 1 ${String(ageScoring)} 0 1 1
	}
}
countries={
	RUS={
		age_score={ 583.300 2476.239 11753.112 1530.468 }
		vc_age_score={ 1.000 2.000 0.000 0.000 }
		card_score=10.500
		army={ name="1st Army" regiment={ strength=1.000 } regiment={ strength=0.970 } }
		army={ name="2nd Army" regiment={ strength=0.500 } regiment={ morale=2.607 } }
		navy={ name="1st Fleet" ship={ strength=1.000 } }
	}
	SAV={ age_score={ 0.039 0.000 7.950 1.666 } }
}
`;

describe("the sums the game's code makes of a save's values", () => {
  const value = async (
    ageScoring: 0 | 1,
    tag: string,
    key: string,
  ): Promise<string | undefined> => {
    const save = await readSave(new Uint8Array(Buffer.from(saveText(ageScoring), 'latin1')));
    const path = readSavePath(`countries.{country}.${key}`);
    if ('problem' in path) throw new Error(path.problem);
    return new SaveChoice(save, tag, undefined).value(path);
  };

  it("adds up the score of every age and the card score, or the age scoring's", async () => {
    expect(await value(0, 'RUS', 'score')).toBe('16353.619');
    expect(await value(1, 'RUS', 'score')).toBe('16346.119');
    expect(await value(0, 'SAV', 'score')).toBe('9.655');
  });

  it("adds up the strength of the regiments of the country's armies, not its fleets", async () => {
    // A regiment without a strength is at full strength.
    expect(await value(0, 'RUS', 'army_strength')).toBe('3.470');
    expect(await value(0, 'SAV', 'army_strength')).toBe('0.000');
  });
});
