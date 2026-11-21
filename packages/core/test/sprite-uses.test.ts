import { describe, expect, it } from 'vitest';
import {
  occurrencesOf,
  planSpriteRename,
  spriteFileKind,
  spriteOccurrenceAt,
  spriteOccurrences,
  type SpriteRenameFile,
} from '../src/index.ts';

const GFX = `spriteTypes = {
	spriteType = {
		name = "GFX_etch_badge"
		texturefile = "gfx/interface/etch_badge.dds"
	}
	spriteType = {
		name = GFX_etch_other
		texturefile = "gfx/interface/etch_other.dds"
	}
}
`;

const GUI = `@badge = "GFX_etch_badge"
guiTypes = {
	windowType = {
		name = "etch_window"
		iconType = { name = "badge" spriteType = "gfx_etch_BADGE" }
		iconType = { name = "through_constant" spriteType = @badge }
		listboxType = { name = "list" background = "GFX_etch_other" }
		instantTextBoxType = { name = "GFX_etch_badge" }
	}
}
`;

const EVENTS = `country_event = {
	id = etch.1
	picture = GFX_etch_badge
}
country_event = {
	id = etch.2
	picture = { trigger = { always = yes } picture = GFX_etch_badge }
}
`;

/** The text at each occurrence. */
function texts(path: string, text: string, name: string): string[] {
  return occurrencesOf(path, text, name).map((o) => text.slice(o.start, o.end));
}

describe('sprite occurrences', () => {
  it('knows which files name sprites', () => {
    expect(spriteFileKind('interface/etch.gfx')).toBe('gfx');
    expect(spriteFileKind('interface/sub/etch.GUI')).toBe('gui');
    expect(spriteFileKind('events/etch.txt')).toBe('script');
    expect(spriteFileKind('missions/etch.txt')).toBe('script');
    expect(spriteFileKind('common/estate_privileges/etch.txt')).toBe('script');
    expect(spriteFileKind('common/ideas/etch.txt')).toBeUndefined();
  });

  it('finds definitions and uses without regard to case, inside the quotes', () => {
    expect(texts('interface/etch.gfx', GFX, 'gfx_etch_badge')).toEqual(['GFX_etch_badge']);
    expect(occurrencesOf('interface/etch.gfx', GFX, 'GFX_etch_badge')[0]?.definition).toBe(true);
    // A widget's own `name` is not a sprite use.
    expect(texts('interface/etch.gui', GUI, 'GFX_etch_badge')).toEqual([
      'gfx_etch_BADGE',
      '@badge',
    ]);
    expect(
      occurrencesOf('interface/etch.gui', GUI, 'GFX_etch_badge').map((o) => o.literal),
    ).toEqual([true, false]);
    expect(texts('interface/etch.gui', GUI, 'GFX_etch_other')).toEqual(['GFX_etch_other']);
    expect(texts('events/etch.txt', EVENTS, 'GFX_etch_badge')).toEqual([
      'GFX_etch_badge',
      'GFX_etch_badge',
    ]);
    expect(texts('events/etch.txt', EVENTS, 'GFX_nothing')).toEqual([]);
    // An unclosed quote keeps the name's last character: it has no closing `"` to leave out.
    const unclosed = 'name = "GFX_etch_cut\n';
    expect(
      spriteOccurrences('interface/etch.gfx', `spriteTypes = { spriteType = { ${unclosed}} }`).map(
        (o) => o.name,
      ),
    ).toEqual(['GFX_etch_cut']);
  });

  it('finds the sprite name under the cursor', () => {
    const at = GFX.indexOf('GFX_etch_other') + 3;
    expect(spriteOccurrenceAt('interface/etch.gfx', GFX, at)?.name).toBe('GFX_etch_other');
    expect(spriteOccurrenceAt('interface/etch.gfx', GFX, GFX.indexOf('texturefile'))).toBe(
      undefined,
    );
  });
});

describe('planSpriteRename', () => {
  const mod = (path: string, text: string): SpriteRenameFile => ({ path, text, editable: true });
  const game = (path: string, text: string): SpriteRenameFile => ({ path, text, editable: false });
  const none = (): boolean => false;
  const GUI_PLAIN = GUI.replace('spriteType = @badge', 'spriteType = "GFX_etch_other"');

  it("renames the mod's definition and uses", () => {
    const files = [
      mod('interface/etch.gfx', GFX),
      mod('interface/etch.gui', GUI_PLAIN),
      mod('events/etch.txt', EVENTS),
      game('interface/game.gui', 'guiTypes = { iconType = { spriteType = "GFX_game" } }'),
    ];
    const plan = planSpriteRename(files, 'GFX_etch_badge', 'GFX_etch_medal', none);
    if (plan.kind !== 'edits') throw new Error(plan.message);
    expect(
      plan.edits.map((e) => [files[e.file]?.path, files[e.file]?.text.slice(e.start, e.end)]),
    ).toEqual([
      ['interface/etch.gfx', 'GFX_etch_badge'],
      ['interface/etch.gui', 'gfx_etch_BADGE'],
      ['events/etch.txt', 'GFX_etch_badge'],
      ['events/etch.txt', 'GFX_etch_badge'],
    ]);
  });

  it('refuses what would leave a use or a definition behind', () => {
    const gfx = mod('interface/etch.gfx', GFX);
    expect(
      planSpriteRename(
        [gfx, game('interface/game.gui', GUI_PLAIN)],
        'GFX_etch_badge',
        'GFX_x',
        none,
      ),
    ).toEqual({
      kind: 'refused',
      message: 'GFX_etch_badge is also named where Etch does not change it: interface/game.gui',
    });
    expect(
      planSpriteRename([gfx, mod('interface/etch.gui', GUI)], 'GFX_etch_badge', 'GFX_x', none),
    ).toEqual({
      kind: 'refused',
      message:
        'GFX_etch_badge is also named where Etch does not change it: interface/etch.gui (through an @constant)',
    });
    expect(
      planSpriteRename([mod('events/etch.txt', EVENTS)], 'GFX_etch_badge', 'GFX_x', none),
    ).toEqual({ kind: 'refused', message: "the mod's .gfx files do not define GFX_etch_badge" });
    expect(planSpriteRename([gfx], 'GFX_etch_badge', 'GFX x', none)).toMatchObject({
      kind: 'refused',
    });
    expect(
      planSpriteRename([gfx], 'GFX_etch_badge', 'GFX_etch_other', (n) => n === 'GFX_etch_other'),
    ).toEqual({
      kind: 'refused',
      message: 'the playset already has a sprite named GFX_etch_other',
    });
    // A change of case only is not a clash with itself.
    expect(planSpriteRename([gfx], 'GFX_etch_badge', 'GFX_ETCH_BADGE', () => true)).toMatchObject({
      kind: 'edits',
    });
  });
});
