import { describe, it, expect } from 'vitest';
import {
  CAPTION, SPATTOO_MARK, captionText, luminanceOf, captionColours, ensureCaptionFont, drawCaption,
} from './reelCaption.js';

// A ctx that records what was asked of it. drawCaption touches nothing else, so this is the whole
// surface — no canvas, no jsdom.
function fakeCtx() {
  const calls = [];
  return {
    calls, font: '', textAlign: '', textBaseline: '', fillStyle: '', shadowColor: '', shadowBlur: 0,
    letterSpacing: '',
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    fillText(t, x, y) { calls.push(['fillText', t, x, y, this.font, this.fillStyle]); },
  };
}

describe('captionText', () => {
  it('uses the bakery name when the plan carries reel_branding', () => {
    expect(captionText({ bakeryName: 'Feelings & Flavours', ownBranding: true }))
      .toBe('Feelings & Flavours');
  });

  it('falls back to our mark on a plan without it', () => {
    expect(captionText({ bakeryName: 'Feelings & Flavours', ownBranding: false })).toBe(SPATTOO_MARK);
  });

  it('uses the mark rather than nothing when an entitled baker has no name set', () => {
    // The bakery name is optional at signup, so this is a real row and not a hypothetical. A blank
    // caption would be worse than ours: the reel goes out with no attribution at all.
    expect(captionText({ bakeryName: '   ', ownBranding: true })).toBe(SPATTOO_MARK);
    expect(captionText({ bakeryName: undefined, ownBranding: true })).toBe(SPATTOO_MARK);
  });

  it('leaves the frame BLANK when an entitled baker turns the name off', () => {
    // Not "made with Spattoo". What the plan sells is the frame, and a switch whose off position
    // advertises us is not a choice anybody wants. The reason to reach for it is that the reel is
    // going somewhere no bakery name belongs.
    expect(captionText({ bakeryName: 'Feelings & Flavours', ownBranding: true, includeName: false }))
      .toBe('');
  });

  it('⚠️ will NOT clear our mark for a baker who has not paid to remove it', () => {
    // The panel does not offer them the switch — but a UI is not an entitlement check, and this is
    // the function both the recorder and the preview go through.
    expect(captionText({ bakeryName: 'Feelings & Flavours', ownBranding: false, includeName: false }))
      .toBe(SPATTOO_MARK);
    expect(captionText({ bakeryName: '', ownBranding: false, includeName: false })).toBe(SPATTOO_MARK);
  });

  it('defaults to including the name, so every existing caller is unchanged', () => {
    expect(captionText({ bakeryName: 'Bloom', ownBranding: true })).toBe('Bloom');
    expect(captionText({ bakeryName: 'Bloom', ownBranding: true, includeName: true })).toBe('Bloom');
  });
});

describe('drawCaption with the name turned off', () => {
  it('draws NOTHING for an empty caption rather than an empty box', () => {
    // The blank case reaches the same drawing path as every other take; it must simply not paint.
    const ctx = fakeCtx();
    drawCaption(ctx, { text: captionText({ bakeryName: 'Bloom', ownBranding: true, includeName: false }),
                       width: 1080, height: 1920, ground: '#f4f4f5' });
    expect(ctx.calls).toEqual([]);
  });
});

describe('captionColours', () => {
  it('puts ink on the light grounds and chalk on the dark ones', () => {
    const light = ['#f4f4f5', '#FBF3E7', '#FBEFEF'].map(h => captionColours(h).fill);
    const dark  = ['#2E3A36', '#14181A'].map(h => captionColours(h).fill);
    expect(light.every(c => c.startsWith('rgba(28'))).toBe(true);
    expect(dark.every(c => c.startsWith('rgba(255'))).toBe(true);
  });

  it('reads a mid green as light, because eyes weight green heaviest', () => {
    // #3a4f46 is the brand primary and IS dark; #6f9a86 is the same hue lightened. Hex arithmetic
    // would call both middling — the luma coefficients are what separate them.
    expect(captionColours('#3a4f46').fill).toMatch(/^rgba\(255/);
    expect(captionColours('#8FBFA8').fill).toMatch(/^rgba\(28/);
  });

  it('assumes a light ground when the colour is unparseable', () => {
    // The baker's own primary comes from the database and may be a name, a rgb() string, or null.
    // Dark text on an unknown ground is the safe guess: most grounds here are pale.
    for (const bad of [null, undefined, '', 'rebeccapurple', 'rgb(1,2,3)']) {
      expect(captionColours(bad).fill).toMatch(/^rgba\(28/);
    }
    expect(luminanceOf('#000000')).toBe(0);
    expect(luminanceOf('#ffffff')).toBeCloseTo(1, 5);
  });
});

describe('drawCaption', () => {
  it('scales with the frame, so the preview and the take draw the same picture', () => {
    // The preview box is ~498px tall and the recording is 1920. Same fractions, so the name lands in
    // the same PLACE in both — which is the entire promise the preview makes.
    const shot = fakeCtx(); drawCaption(shot, { text: 'X', width: 1080, height: 1920, ground: '#f4f4f5' });
    const prev = fakeCtx(); drawCaption(prev, { text: 'X', width: 280, height: 498, ground: '#f4f4f5' });

    const [, , sx, sy] = shot.calls.find(c => c[0] === 'fillText');
    const [, , px, py] = prev.calls.find(c => c[0] === 'fillText');
    expect(sx / 1080).toBeCloseTo(px / 280, 6);
    expect(sy / 1920).toBeCloseTo(py / 498, 6);
  });

  it('keeps the text clear of Instagram\'s own furniture along the bottom', () => {
    // Below roughly an eighth of the height the account row and audio ticker sit on top of it, so a
    // name drawn there is invisible to every viewer while looking perfect in the preview.
    const ctx = fakeCtx();
    drawCaption(ctx, { text: 'Feelings & Flavours', width: 1080, height: 1920, ground: '#f4f4f5' });
    const [, , , y] = ctx.calls.find(c => c[0] === 'fillText');
    expect(1920 - y).toBeGreaterThan(1920 * 0.125);
    expect(y).toBeLessThan(1920);                     // and still on the frame
  });

  it('centres rather than sitting bottom-left, where the poster\'s own handle goes', () => {
    const ctx = fakeCtx();
    drawCaption(ctx, { text: 'Hi', width: 1080, height: 1920, ground: '#f4f4f5' });
    expect(ctx.textAlign).toBe('center');
    expect(ctx.calls.find(c => c[0] === 'fillText')[2]).toBe(540);
  });

  it('always restores the context', () => {
    // The recorder draws the cake onto this same context on the very next frame. A leaked shadow or
    // fillStyle would tint the whole video.
    const ctx = fakeCtx();
    drawCaption(ctx, { text: 'Hi', width: 1080, height: 1920, ground: '#14181A' });
    expect(ctx.calls[0][0]).toBe('save');
    expect(ctx.calls[ctx.calls.length - 1][0]).toBe('restore');
  });

  it('draws nothing rather than throwing when there is no text or no context', () => {
    expect(() => drawCaption(null, { text: 'x', width: 1, height: 1 })).not.toThrow();
    const ctx = fakeCtx();
    drawCaption(ctx, { text: '', width: 1080, height: 1920 });
    expect(ctx.calls).toHaveLength(0);
  });

  it('asks for the app face at the size the geometry says', () => {
    const ctx = fakeCtx();
    drawCaption(ctx, { text: 'Hi', width: 1080, height: 1920, ground: '#f4f4f5' });
    const font = ctx.calls.find(c => c[0] === 'fillText')[4];
    expect(font).toContain('Quicksand');
    expect(font).toContain(String(CAPTION.weight));
    expect(font).toContain(`${1920 * CAPTION.sizeFrac}px`);
  });

  it('survives an engine without ctx.letterSpacing', () => {
    // Older WebKit throws on assignment rather than ignoring it, and this runs on the phones we are
    // least sure about.
    const ctx = fakeCtx();
    Object.defineProperty(ctx, 'letterSpacing', { set() { throw new TypeError('nope'); } });
    expect(() => drawCaption(ctx, { text: 'Hi', width: 1080, height: 1920, ground: '#f4f4f5' }))
      .not.toThrow();
    expect(ctx.calls.some(c => c[0] === 'fillText')).toBe(true);
  });
});

describe('ensureCaptionFont', () => {
  it('waits for the face, because canvas substitutes silently', () => {
    const asked = [];
    const fonts = { load: t => { asked.push(t); return Promise.resolve(); }, ready: Promise.resolve() };
    return ensureCaptionFont(50, fonts).then(ok => {
      expect(ok).toBe(true);
      expect(asked[0]).toContain('Quicksand');
      expect(asked[0]).toContain('50px');
    });
  });

  it('records rather than failing when the font never arrives', () => {
    // A reel in the wrong face is a blemish; a reel that did not record is a lost cake.
    const fonts = { load: () => Promise.reject(new Error('offline')), ready: Promise.resolve() };
    return ensureCaptionFont(50, fonts).then(ok => expect(ok).toBe(false));
  });

  it('copes with an engine that has no document.fonts at all', () =>
    ensureCaptionFont(50, null).then(ok => expect(ok).toBe(false)));
});
