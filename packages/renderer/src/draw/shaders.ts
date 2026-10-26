/**
 * What each ported shader does, read from the game's `gfx/FX/*.shader` files
 * of EU4 1.37.5 (ADR 0001): how it samples, and what each button effect does
 * to a sampled texel. `vanilla.test.ts` checks the sampler table against the
 * files of a local install.
 */

import type { DrawEffect, MaskedShader, SpriteShader } from '@etch/core/draw-list';

export type Filter = 'point' | 'linear';

/** One sampler of a shader: its filters, and whether it wraps or clamps. */
export interface SamplerState {
  readonly min: Filter;
  readonly mag: Filter;
  readonly wrap: boolean;
}

/** Every shader the renderer draws with: the sprite and masked shaders, `progress` and `text`. */
export type ShaderName = SpriteShader | MaskedShader | 'progress' | 'text';

const POINT_CLAMP: SamplerState = { min: 'point', mag: 'point', wrap: false };
const POINT_WRAP: SamplerState = { min: 'point', mag: 'point', wrap: true };
const LINEAR_CLAMP: SamplerState = { min: 'linear', mag: 'linear', wrap: false };
const LINEAR_WRAP: SamplerState = { min: 'linear', mag: 'linear', wrap: true };

/**
 * The samplers of each shader by index: the texture, then the mask (masked
 * shaders) or the second fill (`progress`). `default` is a hypothesis: the
 * game's shader for sprites without `effectFile` is unknown (docs/spec/after-v1.md),
 * so it starts as linear and clamped.
 */
export const SHADER_SAMPLERS: Readonly<Record<ShaderName, readonly SamplerState[]>> = {
  default: [LINEAR_CLAMP],
  buttonstate: [POINT_CLAMP],
  buttonstate_linear: [LINEAR_CLAMP],
  buttonstate_nodowneffect: [POINT_CLAMP],
  // MapTexture only; its other samplers serve an animation no vanilla sprite turns on.
  buttonstate_onlydisable: [LINEAR_WRAP],
  button_overlay: [POINT_CLAMP],
  maskedflag: [POINT_CLAMP, POINT_CLAMP],
  maskedflag_greydown: [POINT_WRAP, POINT_WRAP],
  progress: [POINT_WRAP, POINT_WRAP],
  text: [{ min: 'point', mag: 'linear', wrap: true }],
};

/**
 * What an effect does to the sampled RGB before the `Color` constant
 * multiplies it: nothing, add 0.1, subtract 0.1, or turn it into luminance
 * (0.212671, 0.715160, 0.072169).
 */
export type TexelOp = 'plain' | 'brighten' | 'darken' | 'grey';

export interface EffectPass {
  readonly op: TexelOp;
  /**
   * The constant that multiplies the result instead of the draw's colour, for
   * shaders that ignore `Color`.
   */
  readonly colour?: readonly [number, number, number, number];
}

type EffectTable = Readonly<Record<DrawEffect, EffectPass>>;

const plain: EffectPass = { op: 'plain' };
const BUTTON: EffectTable = {
  up: plain,
  over: { op: 'brighten' },
  down: { op: 'darken' },
  disable: { op: 'grey' },
};
const WHITE = [1, 1, 1, 1] as const;

/** The pixel shader each effect runs, per sprite and masked shader. */
export const SHADER_EFFECTS: Readonly<Record<SpriteShader | MaskedShader, EffectTable>> = {
  // A shader without states: every effect draws the texel times the colour.
  default: { up: plain, over: plain, down: plain, disable: plain },
  buttonstate: BUTTON,
  buttonstate_linear: BUTTON,
  buttonstate_nodowneffect: { ...BUTTON, down: plain },
  buttonstate_onlydisable: { up: plain, over: plain, down: plain, disable: { op: 'grey' } },
  // Multiplies by fixed constants, not by Color: invisible unless hovered or pressed.
  button_overlay: {
    up: { op: 'plain', colour: [1, 1, 1, 0] },
    over: { op: 'plain', colour: [1, 1, 1, 0.15] },
    down: { op: 'plain', colour: [0, 0, 0, 0.2] },
    disable: { op: 'plain', colour: [1, 1, 1, 0] },
  },
  maskedflag: BUTTON,
  // Has no Color constant; Down greys like Disable.
  maskedflag_greydown: {
    up: { op: 'plain', colour: WHITE },
    over: { op: 'brighten', colour: WHITE },
    down: { op: 'grey', colour: WHITE },
    disable: { op: 'grey', colour: WHITE },
  },
};
