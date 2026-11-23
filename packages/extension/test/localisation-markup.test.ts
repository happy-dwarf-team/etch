import { describe, expect, it } from 'vitest';
import { colouredText, escapeHtml, iconSprites } from '../src/localisation-markup.ts';

const COLOURS = { Y: [255, 189, 0], R: [255, 50, 50], b: [0, 0, 0] } as const;

describe('colouredText', () => {
  it('colours the runs of a § code and leaves the rest in the hover colour', () => {
    expect(colouredText('Set the anvil §Ytrue§!.', COLOURS, new Map())).toBe(
      'Set the anvil <span style="color:#ffbd00;">true</span>&#46;',
    );
  });

  it('tells a black code from the text outside any code', () => {
    expect(colouredText('a§bb§!c', COLOURS, new Map())).toBe(
      'a<span style="color:#000000;">b</span>c',
    );
  });

  it('nests codes as the game does', () => {
    expect(colouredText('§Ya§Rb§!c§!d', COLOURS, new Map())).toBe(
      '<span style="color:#ffbd00;">a</span><span style="color:#ff3232;">b</span>' +
        '<span style="color:#ffbd00;">c</span>d',
    );
  });

  it('keeps the colour of an unknown code', () => {
    expect(colouredText('§Ya§qb§!c§!', COLOURS, new Map())).toBe(
      '<span style="color:#ffbd00;">abc</span>',
    );
  });

  it('draws the icons it has a picture for and writes the others as they are', () => {
    const icons = new Map([['GFX_text_building', 'data:image/png;base64,AAAA']]);
    expect(colouredText('art £building£ and £unknown£ ¤5', COLOURS, icons)).toBe(
      'art <img src="data:image/png;base64,AAAA" alt="&#163;building&#163;" title="&#163;building&#163;"> ' +
        'and &#163;unknown&#163; &#164;5',
    );
  });

  it('breaks lines at \\n and leaves what the game fills in as written', () => {
    expect(colouredText('One\\nTwo $COUNTRY$ [Root.GetName]', {}, new Map())).toBe(
      'One<br>Two &#36;COUNTRY&#36; &#91;Root&#46;GetName&#93;',
    );
  });

  it('writes markup characters so that neither HTML nor Markdown reads them', () => {
    expect(escapeHtml('<b>*x*</b> _y_ `z` # [l](u)')).toBe(
      '&#60;b&#62;&#42;x&#42;&#60;&#47;b&#62; &#95;y&#95; &#96;z&#96; &#35; &#91;l&#93;&#40;u&#41;',
    );
  });
});

describe('iconSprites', () => {
  it('names the sprites of the icons, each once', () => {
    expect(iconSprites('£building£ ¤ £building£ ¤1 £ not an icon £')).toEqual([
      'GFX_text_building',
      'GFX_icon_font_gold',
      'GFX_icon_font_development',
    ]);
  });
});
