// The checks and hovers of particle blocks (etch#631) on procedural text, with no game content.
import { describe, expect, it } from 'vitest';
import {
  checkParticleBlocks,
  particleHoverAt,
  particleTextureFiles,
  shaderEffectNames,
  shaderPlacesLocalSpace,
} from '../src/asset/index.ts';
import { parseScript } from '../src/index.ts';

const EFFECTS = new Set(['ParticleAdditive', 'ParticleAlphaBlend', 'ParticlePreAlphaBlend']);

/** The text a warning or hover covers, its code and its message. */
function check(text: string, effects: ReadonlySet<string> | undefined = EFFECTS) {
  return checkParticleBlocks(parseScript(text), effects).map((d) => ({
    code: d.code,
    at: text.slice(d.start, d.end),
    message: d.message,
  }));
}

const EFFECT = `particle = {
	name = "etch_smoke"
	subsystem = {
		max_amount = 100
		sort = "depth"
		texture = { shader = "ParticleAlphaBlend" file = "gfx/particles/etch_cloud.dds" }
		position = { x = 0 y = 0 z = 0 }
		life = { 0.7 0.3 }
		size = { 0.6,size_increase 0.3 }
		color = { r = { 100 } g = 100 b = { 100 } alpha = { 75,smoke_fade } }
		rotation = { spin 180 }
		force = chaos, upforce, drag
	}
	animation = { time = "life_abs" name = "spin" start = 0 duration = 7 repeat = yes op = "MUL" minValue = 0 maxValue = 2 curve = { 0 0 1 1 } }
	animation = { time = "life" name = "size_increase" duration = 1 op = "MUL" minValue = 1 maxValue = 2 curve = { 0 0 1 1 } }
	animation = { time = "life" name = "smoke_fade" duration = 1 op = "MUL" curve = { 0 0 0.1 1 1 0 } }
	force = { type = "planar" name = "upforce" direction = { 0.5 1 0 } amount = 1.0 }
	force = { type = "turbulence" name = "chaos" amount = 1.0 }
	force = { type = "friction" name = "drag" amount = 2.0 }
}
`;

describe('checkParticleBlocks', () => {
  it('warns on nothing in a well-formed effect', () => {
    expect(check(EFFECT)).toEqual([]);
  });

  it('warns on a key a block does not read, with the nearest known key', () => {
    const text = `particle = {
	name = "x"
	subsystm = { }
	subsystem = { lifee = 1 colour = { r = 1 } texture = { fil = "a.dds" } }
	animation = { name = "c" duraton = 1 MINVALUE = 0 }
	force = { name = "f" strength = 1 }
}`;
    expect(check(text).map(({ code, at, message }) => [code, at, message])).toEqual([
      [
        'unknown-particle-key',
        'subsystm',
        'The game does not read "subsystm" in a particle block, so it has no effect. Did you mean "subsystem"? The game writes in its error log: Unexpected token: subsystm.',
      ],
      [
        'unknown-particle-key',
        'lifee',
        'The game does not read "lifee" in a subsystem block, so it has no effect. Did you mean "life"? The game writes in its error log: Unexpected token: lifee.',
      ],
      [
        'unknown-particle-key',
        'colour',
        'The game does not read "colour" in a subsystem block, so it has no effect. Did you mean "color"? The game writes in its error log: Unexpected token: colour.',
      ],
      [
        'unknown-particle-key',
        'fil',
        'The game does not read "fil" in a texture block, so it has no effect. Did you mean "file"? The game writes in its error log: Unexpected token: fil.',
      ],
      [
        'unknown-particle-key',
        'duraton',
        'The game does not read "duraton" in an animation block, so it has no effect. Did you mean "duration"? The game writes in its error log: Unexpected token: duraton.',
      ],
      [
        'unknown-particle-key',
        'strength',
        'The game does not read "strength" in a force block, so it has no effect. The game writes in its error log: Unexpected token: strength.',
      ],
    ]);
  });

  it('warns on curve and force names the effect does not define, on the name alone', () => {
    const text = `particle = {
	name = "x"
	subsystem = {
		size = { 1.75,size_increse 0.4 }
		color = { alpha = { 75,fade } }
		velocity = { 2,spin,other 1 }
		force = drag, gravty
		force = drag,upforce
	}
	subsystem = { force = { drag chaos } }
	animation = { name = "size_increase" time = "life" duration = 1 }
	animation = { name = "spin" time = "life" duration = 1 }
	force = { name = "drag" amount = { 1,missing } }
	force = { name = "upforce" }
	force = { name = "gravity" }
}`;
    expect(check(text).map(({ code, at }) => [code, at])).toEqual([
      ['unknown-particle-curve', 'size_increse'],
      ['unknown-particle-curve', 'fade'],
      ['unknown-particle-curve', 'other'],
      ['unknown-particle-force', 'gravty'],
      ['unknown-particle-force', 'chaos'],
      ['unknown-particle-curve', 'missing'],
    ]);
    expect(check(text)[0]?.message).toBe(
      'No animation block of this particle effect is named "size_increse". Did you mean "size_increase"? The game leaves the curve out and writes in its error log: Couldn\'t find animation "size_increse".',
    );
    expect(check(text.replace('\tname = "x"\n', ''))[3]?.message).toBe(
      'No force block of this particle effect is named "gravty". Did you mean "gravity"? The game leaves the force out and writes in its error log: Couldn\'t find particle force "gravty".',
    );
    expect(check(text)[3]?.message).toBe(
      'No force block of this particle effect is named "gravty". Did you mean "gravity"? The game leaves the force out and writes in its error log: Couldn\'t find particle force "gravty" in: x.',
    );
  });

  it('warns on a curve time the game reads as spawn, and on a duration of 0 or less', () => {
    const text = `particle = {
	name = "x"
	animation = { name = "a" time = "Life" duration = 1 }
	animation = { name = "b" time = "particle" duration = 0 }
	animation = { name = "c" time = "spawn" duration = -2 }
	animation = { name = "d" time = "life_abs" duration = 0.5 }
}`;
    expect(check(text)).toEqual([
      {
        code: 'particle-curve-time',
        at: '"Life"',
        message:
          'The game reads time = "Life" as spawn. It knows only life, life_abs, system and spawn. Write "life" in lowercase.',
      },
      {
        code: 'particle-curve-time',
        at: '"particle"',
        message:
          'The game reads time = "particle" as spawn. It knows only life, life_abs, system and spawn.',
      },
      {
        code: 'particle-curve-without-duration',
        at: '0',
        message:
          "A curve's duration must be above 0. The game uses 1 instead, and writes in its error log: Curve animation has no duration!",
      },
      {
        code: 'particle-curve-without-duration',
        at: '-2',
        message:
          "A curve's duration must be above 0. The game uses 1 instead, and writes in its error log: Curve animation has no duration!",
      },
    ]);
  });

  it('warns on a word the game skips, in any case it knows', () => {
    const text = `particle = {
	name = "x"
	subsystem = { sort = "Depth" sort = "none" emitter_type = "SPHERE" emitter_type = "cone" }
	animation = { name = "a" op = "MUL" op = "times" curve = { 0 0 1 1 } }
	force = { name = "a" type = "Point" }
	force = { name = "b" type = "point" type = "gravity" }
}`;
    expect(check(text)).toEqual([
      {
        code: 'particle-skipped-value',
        at: '"none"',
        message:
          'The game skips sort = "none": the subsystem keeps the sort written before it, or is not sorted without one. It knows depth, distance, age, in any case.',
      },
      {
        code: 'particle-skipped-value',
        at: '"cone"',
        message:
          'The game skips emitter_type = "cone": the subsystem keeps the emitter_type written before it, or is a point emitter without one. It knows point, sphere, box, in any case.',
      },
      {
        code: 'particle-skipped-value',
        at: '"times"',
        message:
          'The game skips op = "times": the curve keeps the op written before it, or adds to the value without one. It knows mul, add, abs, in any case.',
      },
      {
        code: 'particle-skipped-value',
        at: '"gravity"',
        message:
          'The game skips type = "gravity": the force keeps the type written before it, or is planar without one. It knows planar, point, vortex, friction, turbulence, spin, in any case.',
      },
    ]);
  });

  it('warns on a position written without keys, which the game cannot read (step 29)', () => {
    const text = 'particle = { subsystem = { position = { 2911 40 1483 } color = { r = 255 } } }';
    const found = checkParticleBlocks(parseScript(text)).filter(
      (d) => d.code === 'particle-position-without-keys',
    );
    expect(found.map((d) => text.slice(d.start, d.end))).toEqual(['2911 40 1483']);
    expect(found[0]?.message).toContain('Unexpected token: 2911');
    expect(found[0]?.message).toContain('loads none of it');
    const keyed = 'particle = { subsystem = { position = { x = 1 y = 2 z = 3 } } }';
    expect(
      checkParticleBlocks(parseScript(keyed)).filter(
        (d) => d.code === 'particle-position-without-keys',
      ),
    ).toEqual([]);
  });

  it('warns on the keys of position and color the game does not take', () => {
    const text = `particle = {
	name = "x"
	subsystem = {
		position = { R = 1 y = 0 zz = 0 w = 5 }
		color = { x = 255 G = 0 b = 0 A = 255 alfa = 1 }
	}
}`;
    expect(check(text)).toEqual([
      {
        code: 'unknown-particle-key',
        at: 'zz',
        message:
          'The game does not read "zz" in a position block, so it has no effect. Did you mean "z"? It takes x, y and z (or r, g and b), and writes in its error log: Unexpected token: zz.',
      },
      {
        code: 'unknown-particle-key',
        at: 'w',
        message:
          'A position has no fourth value: the game reads "w" and drops it, without a line in its error log. It takes x, y and z.',
      },
      {
        code: 'unknown-particle-key',
        at: 'alfa',
        message:
          'The game does not read "alfa" in a color block, so it has no effect. Did you mean "alpha"? It takes r, g, b and alpha (or x, y, z and w or a), and writes in its error log: Unexpected token: alfa.',
      },
    ]);
  });

  it('warns on the keys of the other emitter shape', () => {
    const text = `particle = {
	name = "x"
	subsystem = { emitter_type = sphere sphere_emitter_radius = 1 box_emitter_x = 2 }
	subsystem = { emitter_type = "box" box_emitter_y = 1 sphere_emitter_yaw = 2 }
	subsystem = { emitter_type = point box_emitter_z = 1 sphere_emitter_radius = 1 }
}`;
    expect(check(text)).toEqual([
      {
        code: 'particle-emitter-keys',
        at: 'box_emitter_x',
        message:
          'This subsystem has emitter_type = sphere, but "box_emitter_x" is a key of a box emitter. The game stores it in the same place as "sphere_emitter_radius", so it sets that value, and writes in its error log: Sphere emitter contains box emitter parameters and will probably be wrong.',
      },
      {
        code: 'particle-emitter-keys',
        at: 'sphere_emitter_yaw',
        message:
          'This subsystem has emitter_type = box, but "sphere_emitter_yaw" is a key of a sphere emitter. The game stores it in the same place as "box_emitter_y", so it sets that value, and writes in its error log: Box emitter contains sphere emitter parameters and will probably be wrong.',
      },
    ]);
  });

  it('warns on a shader effect the particle shader does not have, as the game names it', () => {
    const text = `particle = {
	name = "x"
	subsystem = { texture = { shader = "ParticleAdditive" } }
	subsystem = { texture = { shader = "ParticleGlow" } }
	subsystem = { trail = yes texture = { shader = "ParticleAdditive" } }
	subsystem = { trail = yes billboard = yes texture = { shader = "ParticleAdditive" } }
	subsystem = { billboard = no texture = { shader = "ParticleAlphaBlend" } }
}`;
    const list = 'The file has ParticleAdditive, ParticleAlphaBlend, ParticlePreAlphaBlend.';
    expect(check(text).map(({ at, message }) => [at, message])).toEqual([
      [
        '"ParticleGlow"',
        `gfx/FX/particle.shader has no shader effect "ParticleGlow", the texture's shader. ${list}`,
      ],
      [
        '"ParticleAdditive"',
        `gfx/FX/particle.shader has no shader effect "ParticleAdditiveTrailNoBillboard". The game looks for that name: the texture's shader, plus Trail for trail = yes and NoBillboard because a trail does not face the camera. ${list}`,
      ],
      [
        '"ParticleAdditive"',
        `gfx/FX/particle.shader has no shader effect "ParticleAdditiveTrail". The game looks for that name: the texture's shader, plus Trail for trail = yes. ${list}`,
      ],
      [
        '"ParticleAlphaBlend"',
        `gfx/FX/particle.shader has no shader effect "ParticleAlphaBlendNoBillboard". The game looks for that name: the texture's shader, plus NoBillboard for billboard = no. ${list}`,
      ],
    ]);
    // Without the playset's shader file, the effects are not checked.
    expect(checkParticleBlocks(parseScript(text))).toEqual([]);
  });

  it('checks only top-level particle blocks', () => {
    expect(check('entity = { particle = { lifee = 1 } }\nobjectTypes = { }\n')).toEqual([]);
  });
});

describe('particleTextureFiles and shaderEffectNames', () => {
  it('lists the texture files of the subsystems', () => {
    const parsed = parseScript(
      'particle = { subsystem = { texture = { file = "gfx/particles/a.dds" } } subsystem = { texture = { file = "" } } }',
    );
    expect(particleTextureFiles(parsed).map((n) => n.text)).toEqual(['gfx/particles/a.dds']);
  });

  it('reads the effect names of a shader file, not those in comments', () => {
    const text =
      'Includes = { }\nEffect ParticleAlphaBlend\n{\n\tVertexShader = "x"\n}\n# Effect Commented\n  Effect ParticleAdditive { }\n';
    expect([...shaderEffectNames(text)]).toEqual(['ParticleAlphaBlend', 'ParticleAdditive']);
  });

  it('tells a shader that moves particles by InstanceWorldMatrix from one that only declares it', () => {
    const declared = 'ConstantBuffer( 3, 40 )\n{\n\tfloat4x4 InstanceWorldMatrix;\n}\n';
    const use = 'Out.vPosition = mul( ViewProjectionMatrix, mul( InstanceWorldMatrix, p ) );\n';
    expect(shaderPlacesLocalSpace(declared)).toBe(false);
    expect(shaderPlacesLocalSpace(`${declared}# ${use}// ${use}`)).toBe(false);
    expect(shaderPlacesLocalSpace(`${declared}${use}`)).toBe(true);
  });
});

describe('local_space and the particle shader (step 19)', () => {
  const text = `particle = { name = "x" subsystem = {
	local_space = yes childsystem = { local_space = YES } } subsystem = { local_space = no } }`;
  const codes = (placed: boolean | undefined) =>
    checkParticleBlocks(parseScript(text), EFFECTS, placed).map((d) => [
      d.code,
      text.slice(d.start, d.end),
    ]);

  it('warns on each local_space = yes when the shader does not use InstanceWorldMatrix', () => {
    expect(codes(false)).toEqual([
      ['particle-local-space-unplaced', 'yes'],
      ['particle-local-space-unplaced', 'YES'],
    ]);
  });

  it('says nothing when the shader uses it, or when there is no shader to read', () => {
    expect(codes(true)).toEqual([]);
    expect(codes(undefined)).toEqual([]);
  });

  it('says where the game draws them, with or without a subsystem in world space (steps 23 and 28)', () => {
    const messages = (source: string) =>
      checkParticleBlocks(parseScript(source), EFFECTS, false).map((d) => d.message);
    // Seen in the game (step 28): a local_space subsystem alone drew at its coordinates on the map.
    const only = messages(
      'particle = { name = "y" subsystem = { local_space = yes childsystem = { local_space = yes } } }',
    );
    expect([...messages(text), ...only]).toHaveLength(4);
    for (const message of [...messages(text), ...only]) {
      expect(message).toContain('around its south-west corner');
      expect(message).toContain('its x towards the north and its z towards the east');
      expect(message).not.toContain('draws none');
    }
  });
});

describe('particleHoverAt', () => {
  const hover = (text: string, at: string, nth = 0) => {
    let offset = -1;
    for (let i = 0; i <= nth; i++) offset = text.indexOf(at, offset + 1);
    const found = particleHoverAt(parseScript(text), offset + 1);
    return found === undefined
      ? undefined
      : { at: text.slice(found.start, found.end), markdown: found.markdown };
  };

  it('checks a childsystem as a subsystem, nested ones too (step 10)', () => {
    const text = `particle = { name = "x" subsystem = {
	childsystem = { lifee = 1 force = gravty childsystem = { sizee = 1 } }
} }`;
    expect(check(text).map(({ code, at }) => [code, at])).toEqual([
      ['unknown-particle-key', 'lifee'],
      ['unknown-particle-force', 'gravty'],
      ['unknown-particle-key', 'sizee'],
    ]);
    expect(hover(text, 'lifee')).toBeUndefined();
    expect(
      hover('particle = { subsystem = { childsystem = { life = 1 } } }', 'life')?.markdown,
    ).toMatch(/^\*\*`life`\*\* in a subsystem block/);
    expect(hover(text, 'childsystem')?.markdown).toMatch(
      /^\*\*`childsystem`\*\* in a subsystem block\n\nTakes a block with the keys of a subsystem\./,
    );
  });

  it('says what a key takes and does, and whether the game confirms it', () => {
    expect(hover(EFFECT, 'life =')).toEqual({
      at: 'life',
      markdown:
        '**`life`** in a subsystem block\n\nTakes a number of seconds: `2`, `{ 2 0.5 }` with a variation, or with curves: `{ 1.75,size_increase 0.4 }`.\n\nHow long each particle lives.\n\n_Etch reads this from the key’s name and the base game’s files. It is not checked in the game._',
    });
    expect(hover(EFFECT, 'file =')?.markdown).toBe(
      '**`file`** in a texture block\n\nTakes a path in the game folder.\n\nThe picture of each particle, a `.dds` file.',
    );
    expect(hover(EFFECT, 'minValue')?.markdown).toMatch(
      /^\*\*`minValue`\*\* in an animation block/,
    );
    expect(hover(EFFECT, 'subsystem')?.markdown).toMatch(
      /^\*\*`subsystem`\*\* in a particle block/,
    );
    expect(hover('particle = { subsystem = { hide = yes } }', 'hide')?.markdown).toBe(
      '**`hide`** in a subsystem block\n\nTakes `yes` or `no`.\n\nWith `yes`, the emitter sends out no particles.',
    );
    expect(
      hover('particle = { subsystem = { slave_particles = 1 } }', 'slave_particles')?.markdown,
    ).toBe(
      '**`slave_particles`** in a subsystem block\n\nTakes a whole number.\n\nThe game reads this key. Etch does not know what it does.',
    );
  });

  it('shows the curve or force that a name refers to', () => {
    expect(hover(EFFECT, 'size_increase')).toEqual({
      at: 'size_increase',
      markdown:
        '**Animation `size_increase`** of this particle effect\n\nFollows `life`, starts at `0` and runs for `1`, `op = MUL`, gives `1` to `2`.\n\nPoints (time, value): (0, 0) (1, 1)',
    });
    expect(hover(EFFECT, 'spin 180')?.markdown).toMatch(
      /^\*\*Animation `spin`\*\* of this particle effect\n\nFollows `life_abs`, starts at `0` and runs for `7`, repeats,/,
    );
    expect(hover(EFFECT, 'upforce')).toEqual({
      at: 'upforce',
      markdown:
        '**Force `upforce`** of this particle effect\n\n`planar`, `amount = 1.0`, `direction = { 0.5 1 0 }`.',
    });
    expect(hover('particle = { subsystem = { force = nothing } }', 'nothing')?.markdown).toBe(
      'No force of this particle effect is named `nothing`.',
    );
  });

  it('says what a pdxparticle key of a .gfx file does', () => {
    const text = 'objectTypes = { pdxparticle = { name = "a" type = "b" scale = 2 } }';
    expect(hover(text, 'type')?.markdown).toMatch(/^\*\*`type`\*\* in a pdxparticle block/);
    expect(hover(text, 'objectTypes')).toBeUndefined();
  });

  it('gives no hover on a value, an unknown key or outside particle blocks', () => {
    expect(hover(EFFECT, '"depth"')).toBeUndefined();
    expect(hover('particle = { lifee = 1 }', 'lifee')).toBeUndefined();
    expect(hover('entity = { name = "x" }', 'name')).toBeUndefined();
  });
});
