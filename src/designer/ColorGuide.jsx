import { useState, useRef, useCallback } from 'react';

// ── RGB → CMYK recipe ─────────────────────────────────────────────────────────
function computeRgbRecipe(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const maxC = Math.max(rn, gn, bn);
  const minC = Math.min(rn, gn, bn);

  const whitePct    = Math.round(minC * 100);
  const colorantPct = 100 - whitePct;

  if (colorantPct === 0) {
    return [{ label: 'White base', pct: 100, color: '#e0e0e0' }];
  }

  const k = maxC > 0 ? 1 - maxC : 1;
  let c = 0, m = 0, y = 0;
  if (k < 1) {
    c = (1 - rn - k) / (1 - k);
    m = (1 - gn - k) / (1 - k);
    y = (1 - bn - k) / (1 - k);
  }

  const total  = c + m + y + k || 1;
  const blue   = Math.round((c / total) * colorantPct);
  const red    = Math.round((m / total) * colorantPct);
  const yellow = Math.round((y / total) * colorantPct);
  const black  = colorantPct - blue - red - yellow;

  const rows = [];
  if (whitePct > 0) rows.push({ label: 'White base',       pct: whitePct, color: '#d8d8d8' });
  if (red    > 0)   rows.push({ label: 'Pink / Red gel',   pct: red,      color: '#e85070' });
  if (blue   > 0)   rows.push({ label: 'Blue / Cyan gel',  pct: blue,     color: '#4a90d9' });
  if (yellow > 0)   rows.push({ label: 'Yellow gel',       pct: yellow,   color: '#f5c800' });
  if (black  > 0)   rows.push({ label: 'Black gel',        pct: black,    color: '#444'    });
  return rows;
}

// ── Liquid food color recipe (CMYK → Red/Blue/Yellow/Black drops) ────────────
function computeLiquidRecipe(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const maxC = Math.max(rn, gn, bn);
  const minC = Math.min(rn, gn, bn);

  const whitePct    = Math.round(minC * 100);
  const colorantPct = 100 - whitePct;

  if (colorantPct === 0) {
    return [{ label: 'White base', pct: 100, color: '#d8d8d8' }];
  }

  const k = maxC > 0 ? 1 - maxC : 1;
  let c = 0, m = 0, y = 0;
  if (k < 1) {
    c = (1 - rn - k) / (1 - k);
    m = (1 - gn - k) / (1 - k);
    y = (1 - bn - k) / (1 - k);
  }

  const total  = c + m + y + k || 1;
  const blue   = Math.round((c / total) * colorantPct);
  const red    = Math.round((m / total) * colorantPct);
  const yellow = Math.round((y / total) * colorantPct);
  const black  = colorantPct - blue - red - yellow;

  const rows = [];
  if (whitePct > 0) rows.push({ label: 'White base',    pct: whitePct, color: '#d8d8d8' });
  if (red    > 0)   rows.push({ label: 'Red liquid',    pct: red,      color: '#cc2233' });
  if (blue   > 0)   rows.push({ label: 'Blue liquid',   pct: blue,     color: '#3366dd' });
  if (yellow > 0)   rows.push({ label: 'Yellow liquid', pct: yellow,   color: '#f5c800' });
  if (black  > 0)   rows.push({ label: 'Black liquid',  pct: black,    color: '#222222' });
  return rows;
}

// ── Gel database (generic names, no brands) ───────────────────────────────────
const GEL_DB = [
  {
    name: 'White', rgb: [255,255,255],
    fondant: { components:[{color:'White fondant base',pct:100}], instructions:'Use white fondant as-is. Knead well before applying.', tips:'Add 1 drop of violet gel to cancel any warm yellow undertone.', warnings:[] },
    buttercream: { components:[{color:'White buttercream base',pct:100}], instructions:'Use a shortening-based buttercream for the brightest white.', tips:"Add 1–2 drops of white food color to offset butter's natural yellow tone.", warnings:[] },
  },
  {
    name: 'Ivory', rgb: [255,243,204],
    fondant: { components:[{color:'White fondant',pct:98},{color:'Yellow gel',pct:2}], instructions:'Add a tiny amount of yellow gel and knead until uniform.', tips:'Butter-based fondant naturally yellows — you may not need any gel at all.', warnings:[] },
    buttercream: { components:[{color:'Butter buttercream',pct:96},{color:'Yellow gel',pct:4}], instructions:'All-butter buttercream is naturally ivory. Add a trace of yellow if needed.', tips:'Skip the gel if using all-butter — the butter itself gives an ivory tint.', warnings:[] },
  },
  {
    name: 'Blush Pink', rgb: [255,190,200],
    fondant: { components:[{color:'White fondant',pct:92},{color:'Pink gel',pct:8}], instructions:'Add pink gel in small increments. Knead after each addition. Check in natural light.', tips:'Use a toothpick for precision — gel is very concentrated.', warnings:[] },
    buttercream: { components:[{color:'White buttercream',pct:90},{color:'Pink gel',pct:10}], instructions:'Add pink gel a little at a time. Mix thoroughly after each addition.', tips:'Add white food color if the shade comes out too bright.', warnings:[] },
  },
  {
    name: 'Dusty Rose', rgb: [210,140,150],
    fondant: { components:[{color:'White fondant',pct:80},{color:'Pink gel',pct:15},{color:'Brown gel',pct:5}], instructions:'Add pink gel, knead well, then add a tiny touch of brown to mute the shade. Rest 30 min.', tips:'Color deepens after resting — mix slightly lighter than your target.', warnings:['Mix lighter than target — color deepens for 1–2 hours.'] },
    buttercream: { components:[{color:'White buttercream',pct:80},{color:'Pink gel',pct:15},{color:'Brown gel',pct:5}], instructions:'Add pink gel then a tiny trace of brown to dull the shade. Rest 10 min before checking.', tips:'Rest the frosting before final evaluation — colors develop.', warnings:[] },
  },
  {
    name: 'Hot Pink', rgb: [220,50,110],
    fondant: { components:[{color:'White fondant',pct:65},{color:'Pink gel',pct:25},{color:'Red gel',pct:10}], instructions:'Add pink and red gels. Knead vigorously. Wrap and rest 30 min for full saturation.', tips:'Wear gloves — gel stains hands.', warnings:['Knead in a bag to avoid staining. Wear gloves.'] },
    buttercream: { components:[{color:'White buttercream',pct:60},{color:'Pink gel',pct:30},{color:'Red gel',pct:10}], instructions:'Add pink and red gels in stages. Rest 15 min before final color check.', tips:'Use good quality gels — high ratios can affect taste.', warnings:['Excessive gel can make buttercream bitter.'] },
  },
  {
    name: 'Red', rgb: [200,30,50],
    fondant: { components:[{color:'White fondant',pct:55},{color:'Red gel',pct:45}], instructions:'Add generous amounts of red gel. Knead well. Wrap and rest 24 hours for full color.', tips:'Pre-colored red fondant saves a lot of gel and effort.', warnings:['True red needs a very large amount of gel — prepare the day before.','Color deepens significantly overnight.'] },
    buttercream: { components:[{color:'White buttercream',pct:60},{color:'Red gel',pct:40}], instructions:'Add red gel in stages. Rest 30–60 minutes. True red is difficult to achieve.', tips:'A shortening-based buttercream takes red more vibrantly than butter-based.', warnings:['True red requires excessive gel — flavor impact is significant.'] },
  },
  {
    name: 'Burgundy', rgb: [128,0,32],
    fondant: { components:[{color:'White fondant',pct:50},{color:'Red gel',pct:30},{color:'Violet gel',pct:15},{color:'Black gel',pct:5}], instructions:'Add red and violet gels. Knead well. Add black in tiny increments. Rest 12–24 hours.', tips:'Start with a darker fondant base if available.', warnings:['Black gel is very concentrated — add one toothpick tip at a time.'] },
    buttercream: { components:[{color:'White buttercream',pct:55},{color:'Red gel',pct:28},{color:'Violet gel',pct:12},{color:'Black gel',pct:5}], instructions:'Add red and violet gels. Deepen with tiny amounts of black. Rest before checking.', tips:'Deep colors develop over time — always rest before final evaluation.', warnings:['Flavor impact is high with large gel amounts.'] },
  },
  {
    name: 'Peach', rgb: [255,200,165],
    fondant: { components:[{color:'White fondant',pct:88},{color:'Orange gel',pct:8},{color:'Pink gel',pct:4}], instructions:'Add orange gel then a small touch of pink. Knead and check in natural light.', tips:'Increase orange for apricot, reduce gel for a lighter peachy cream.', warnings:[] },
    buttercream: { components:[{color:'White buttercream',pct:88},{color:'Orange gel',pct:8},{color:'Pink gel',pct:4}], instructions:'Add orange then pink gel. Mix well and adjust ratio to taste.', tips:'A tiny drop of yellow can push peach toward apricot.', warnings:[] },
  },
  {
    name: 'Orange', rgb: [230,115,30],
    fondant: { components:[{color:'White fondant',pct:75},{color:'Orange gel',pct:20},{color:'Yellow gel',pct:5}], instructions:'Add orange gel then a touch of yellow to brighten. Knead well.', tips:'For terracotta/burnt orange, use brown instead of yellow.', warnings:[] },
    buttercream: { components:[{color:'White buttercream',pct:75},{color:'Orange gel',pct:22},{color:'Yellow gel',pct:3}], instructions:'Add orange gel, then brighten with a touch of yellow.', tips:'Always start with white base — orange turns muddy on a yellow base.', warnings:[] },
  },
  {
    name: 'Yellow', rgb: [255,225,60],
    fondant: { components:[{color:'White fondant',pct:85},{color:'Yellow gel',pct:15}], instructions:'Add yellow gel gradually and knead well after each addition.', tips:'Butter-based fondant has a natural yellow undertone — you may need less gel.', warnings:[] },
    buttercream: { components:[{color:'White buttercream',pct:85},{color:'Yellow gel',pct:15}], instructions:'Add yellow gel and mix until uniform.', tips:'Butter yellows naturally — for vivid yellow, use a shortening-based buttercream.', warnings:[] },
  },
  {
    name: 'Mint Green', rgb: [165,230,200],
    fondant: { components:[{color:'White fondant',pct:88},{color:'Green gel',pct:8},{color:'Blue gel',pct:4}], instructions:'Add green gel, then a touch of blue to get the cool mint tone. Knead well.', tips:'Build gradually — mint is light and very little gel goes a long way.', warnings:[] },
    buttercream: { components:[{color:'White buttercream',pct:88},{color:'Green gel',pct:8},{color:'Blue gel',pct:4}], instructions:'Add green gel then a touch of blue. Mix and check in natural light.', tips:'Mint can look more blue or green depending on the light source.', warnings:[] },
  },
  {
    name: 'Sage Green', rgb: [110,148,110],
    fondant: { components:[{color:'White fondant',pct:75},{color:'Green gel',pct:18},{color:'Black gel',pct:4},{color:'Brown gel',pct:3}], instructions:'Add green gel. Mute with tiny amounts of black and brown. Rest and re-check.', tips:'The key to sage is black — it "greys down" the green. Add very sparingly.', warnings:['Black is very concentrated — use one toothpick tip at a time.'] },
    buttercream: { components:[{color:'White buttercream',pct:75},{color:'Green gel',pct:18},{color:'Black gel',pct:4},{color:'Brown gel',pct:3}], instructions:'Add green, then mute with tiny amounts of black and brown. Rest 10 min.', tips:'Less is more with black gel.', warnings:[] },
  },
  {
    name: 'Olive Green', rgb: [128,138,70],
    fondant: { components:[{color:'White fondant',pct:55},{color:'Yellow gel',pct:22},{color:'Green gel',pct:18},{color:'Black gel',pct:5}], instructions:'Add yellow and green gels together. Knead well, then add black in tiny increments to mute the tone. Rest 30 min.', tips:'Add black very sparingly — one toothpick tip at a time. Too much quickly turns the color army green.', warnings:['Black gel is extremely concentrated — add less than you think you need.'] },
    buttercream: { components:[{color:'White buttercream',pct:55},{color:'Yellow gel',pct:22},{color:'Green gel',pct:18},{color:'Black gel',pct:5}], instructions:'Mix yellow and green gels into buttercream, then mute with a trace of black. Rest 15 min before checking.', tips:'Cool the bowl briefly — olive tones look truer when the buttercream is cold.', warnings:[] },
  },
  {
    name: 'Khaki', rgb: [168,160,108],
    fondant: { components:[{color:'White fondant',pct:62},{color:'Yellow gel',pct:20},{color:'Green gel',pct:12},{color:'Black gel',pct:6}], instructions:'Add yellow gel first for the warm base, then green, then tiny amounts of black to achieve the muted earthy tone. Rest 30 min.', tips:'Khaki sits between olive and beige — lean yellow for warmer khaki, lean green for a more olive result.', warnings:['Rest before evaluating — the muted tone develops as the gel oxidises into the base.'] },
    buttercream: { components:[{color:'White buttercream',pct:62},{color:'Yellow gel',pct:20},{color:'Green gel',pct:12},{color:'Black gel',pct:6}], instructions:'Add yellow then green gels. Mute with black in very small increments. Mix and rest 10–15 min.', tips:'Butter buttercream has a natural warm tone that helps build khaki without excess gel.', warnings:[] },
  },
  {
    name: 'Forest Green', rgb: [30,100,50],
    fondant: { components:[{color:'White fondant',pct:60},{color:'Green gel',pct:30},{color:'Black gel',pct:10}], instructions:'Add generous green gel. Deepen with black incrementally. Rest 2–4 hours.', tips:'Pre-colored green fondant saves significant time and gel.', warnings:['Large amounts of gel affect fondant texture — knead very thoroughly.'] },
    buttercream: { components:[{color:'White buttercream',pct:62},{color:'Green gel',pct:30},{color:'Black gel',pct:8}], instructions:'Add green then darken with black. Rest 20–30 min before final check.', tips:'Deep greens continue developing in color after mixing.', warnings:[] },
  },
  {
    name: 'Baby Blue', rgb: [173,216,230],
    fondant: { components:[{color:'White fondant',pct:90},{color:'Blue gel',pct:10}], instructions:'Add blue gel in very small amounts. Knead well. Build to desired shade.', tips:'Stop adding gel sooner than you think — baby blue is very light.', warnings:[] },
    buttercream: { components:[{color:'White buttercream',pct:90},{color:'Blue gel',pct:10}], instructions:'Add small drops of blue gel. Mix and check. Lighten with white food color if needed.', tips:'Butter yellowing can muddy light blues — use shortening-based for cleaner results.', warnings:[] },
  },
  {
    name: 'Royal Blue', rgb: [65,105,225],
    fondant: { components:[{color:'White fondant',pct:70},{color:'Blue gel',pct:25},{color:'Violet gel',pct:5}], instructions:'Add blue gel in stages. Add a touch of violet to warm the tone. Rest 30 min.', tips:'Blue deepens significantly after resting — always mix lighter than target.', warnings:['Blue stains heavily. Wear gloves and protect surfaces.'] },
    buttercream: { components:[{color:'White buttercream',pct:70},{color:'Blue gel',pct:26},{color:'Violet gel',pct:4}], instructions:'Add blue gel in stages. Add a trace of violet. Mix and rest.', tips:'Shortening-based buttercream gives a cleaner, truer blue.', warnings:[] },
  },
  {
    name: 'Navy Blue', rgb: [30,40,100],
    fondant: { components:[{color:'White fondant',pct:55},{color:'Blue gel',pct:35},{color:'Black gel',pct:10}], instructions:'Add large amounts of blue gel. Deepen with black. Rest overnight.', tips:'Start with a pre-colored dark blue fondant base if possible.', warnings:['Requires a large amount of gel — pre-colored fondant is recommended.'] },
    buttercream: { components:[{color:'White buttercream',pct:55},{color:'Blue gel',pct:35},{color:'Black gel',pct:10}], instructions:'Add blue gel, then deepen with black. Rest 1 hour before checking.', tips:'Navy looks grey-blue at first — rest overnight for a darker result.', warnings:['High gel content affects taste.'] },
  },
  {
    name: 'Lavender', rgb: [195,165,225],
    fondant: { components:[{color:'White fondant',pct:87},{color:'Violet gel',pct:10},{color:'Pink gel',pct:3}], instructions:'Add violet gel, then a small touch of pink for warmth. Knead thoroughly.', tips:'Build slowly — too much gel gives grape-purple instead of lavender.', warnings:[] },
    buttercream: { components:[{color:'White buttercream',pct:87},{color:'Violet gel',pct:10},{color:'Pink gel',pct:3}], instructions:'Add violet gel then pink for a warmer lavender tone. Mix well.', tips:'Chill the buttercream briefly — lavender looks brighter when cold.', warnings:[] },
  },
  {
    name: 'Purple', rgb: [120,40,150],
    fondant: { components:[{color:'White fondant',pct:65},{color:'Violet gel',pct:30},{color:'Pink gel',pct:5}], instructions:'Add violet gel generously. Add pink for warmth. Knead and rest 30–60 min.', tips:'Purple deepens after 30 min — mix slightly lighter than target.', warnings:[] },
    buttercream: { components:[{color:'White buttercream',pct:65},{color:'Violet gel',pct:30},{color:'Pink gel',pct:5}], instructions:'Add violet gel, warm with pink. Mix and rest.', tips:'Rest the frosting — purple continues to develop.', warnings:[] },
  },
  {
    name: 'Dusty Teal', rgb: [105,145,155],
    fondant: { components:[{color:'White fondant',pct:62},{color:'Blue gel',pct:20},{color:'Green gel',pct:13},{color:'Black gel',pct:5}], instructions:'Add blue gel first, then green, then a toothpick tip of black to achieve the muted dusty tone. Knead well and rest 30 min.', tips:'The black is what makes it dusty rather than bright — add very sparingly and build slowly.', warnings:['Black gel is very concentrated — one toothpick tip at a time.'] },
    buttercream: { components:[{color:'White buttercream',pct:62},{color:'Blue gel',pct:20},{color:'Green gel',pct:13},{color:'Black gel',pct:5}], instructions:'Add blue and green gels, then mute with a trace of black. Mix and rest 10 min before checking.', tips:'Chill the bowl before evaluating — dusty tones read truer when cold.', warnings:[] },
  },
  {
    name: 'Steel Blue', rgb: [100,125,150],
    fondant: { components:[{color:'White fondant',pct:60},{color:'Blue gel',pct:28},{color:'Black gel',pct:8},{color:'Violet gel',pct:4}], instructions:'Add blue gel, then a trace of violet for the cool grey undertone, then black to mute. Rest 30 min.', tips:'Steel blue should feel cold and grey — the violet helps shift it away from a flat greyish blue.', warnings:['Black is very concentrated — add one toothpick tip at a time.'] },
    buttercream: { components:[{color:'White buttercream',pct:60},{color:'Blue gel',pct:28},{color:'Black gel',pct:8},{color:'Violet gel',pct:4}], instructions:'Add blue gel, then violet, then mute with a trace of black. Rest 10–15 min before checking.', tips:'Shortening-based buttercream gives a cleaner, cooler steel blue than butter-based.', warnings:[] },
  },
  {
    name: 'Dusty Blue', rgb: [120,150,175],
    fondant: { components:[{color:'White fondant',pct:65},{color:'Blue gel',pct:25},{color:'Black gel',pct:6},{color:'Violet gel',pct:4}], instructions:'Add blue gel, a touch of violet to cool the tone, then a trace of black to soften. Knead and rest 30 min.', tips:'Mix lighter than your target — dusty blue deepens with rest.', warnings:[] },
    buttercream: { components:[{color:'White buttercream',pct:65},{color:'Blue gel',pct:25},{color:'Black gel',pct:6},{color:'Violet gel',pct:4}], instructions:'Add blue gel, then violet, then black. Mix and rest 10 min.', tips:'Add white food color to pull back if the shade comes out too deep.', warnings:[] },
  },
  {
    name: 'Teal', rgb: [30,150,150],
    fondant: { components:[{color:'White fondant',pct:70},{color:'Blue gel',pct:15},{color:'Green gel',pct:15}], instructions:'Mix equal parts blue and green gels into white fondant. Knead well and rest.', tips:'Adjust blue/green ratio to lean cooler (more blue) or warmer (more green).', warnings:[] },
    buttercream: { components:[{color:'White buttercream',pct:70},{color:'Blue gel',pct:15},{color:'Green gel',pct:15}], instructions:'Mix blue and green gels into white buttercream. Adjust ratio to preference.', tips:'Test in good lighting — teal reads differently under warm and cool light.', warnings:[] },
  },
  {
    name: 'Coral', rgb: [240,120,100],
    fondant: { components:[{color:'White fondant',pct:78},{color:'Orange gel',pct:12},{color:'Pink gel',pct:8},{color:'Yellow gel',pct:2}], instructions:'Add orange gel, then pink for warmth, then a touch of yellow to brighten.', tips:'Coral sits between pink and orange — adjust ratio to hit your exact shade.', warnings:[] },
    buttercream: { components:[{color:'White buttercream',pct:78},{color:'Orange gel',pct:12},{color:'Pink gel',pct:8},{color:'Yellow gel',pct:2}], instructions:'Add orange first, then pink, then brighten with yellow. Mix well.', tips:'Rest 10 min before final evaluation.', warnings:[] },
  },
  {
    name: 'Brown', rgb: [100,60,30],
    fondant: { components:[{color:'White fondant',pct:60},{color:'Brown gel',pct:30},{color:'Red gel',pct:7},{color:'Black gel',pct:3}], instructions:'Add brown gel, warm with red, deepen with a trace of black. Knead and rest.', tips:'Chocolate-flavored fondant naturally achieves brown without excessive gel.', warnings:[] },
    buttercream: { components:[{color:'White buttercream',pct:55},{color:'Cocoa powder',pct:35},{color:'Brown gel',pct:10}], instructions:'Mix cocoa powder into buttercream until smooth, then add brown gel for depth.', tips:'Cocoa powder gives natural brown without flavor-affecting gel.', warnings:['Cocoa powder can stiffen buttercream — adjust consistency with cream.'] },
  },
  {
    name: 'Gray', rgb: [128,128,128],
    fondant: { components:[{color:'White fondant',pct:80},{color:'Black gel',pct:20}], instructions:'Add black gel in very small increments. Knead after each addition. Rest 30 min.', tips:'Build from light to dark — going lighter is nearly impossible once dark.', warnings:['Black is extremely concentrated — add one toothpick tip at a time.'] },
    buttercream: { components:[{color:'White buttercream',pct:80},{color:'Black gel',pct:20}], instructions:'Add black gel incrementally. Mix and rest 10 minutes before checking color.', tips:'Dark frosting can stain mouths — inform customers.', warnings:['Dark frosting stains teeth and tongue — always inform the customer.'] },
  },
  {
    name: 'Black', rgb: [30,30,30],
    fondant: { components:[{color:'Dark fondant base',pct:40},{color:'Black gel',pct:60}], instructions:'Start with a dark or chocolate fondant base. Add black gel generously. Knead and rest overnight.', tips:'Pre-colored black fondant is strongly recommended over coloring white from scratch.', warnings:['Very large amounts of gel are needed for true black — rest overnight.','Black fondant can stain teeth and lips.'] },
    buttercream: { components:[{color:'Chocolate buttercream',pct:50},{color:'Black cocoa powder',pct:30},{color:'Black gel',pct:20}], instructions:'Make chocolate buttercream with dark cocoa. Add black gel. Mix well and rest 1–2 hours.', tips:'Starting with chocolate buttercream drastically reduces gel needed.', warnings:['Black buttercream stains teeth and mouths — always inform customers.'] },
  },
];

function findClosestGel(r, g, b) {
  let best = GEL_DB[0], minDist = Infinity;
  for (const c of GEL_DB) {
    const dr = r - c.rgb[0], dg = g - c.rgb[1], db = b - c.rgb[2];
    // Perceptual weighting: human eye is most sensitive to green, then red, then blue
    const d = 2*dr*dr + 4*dg*dg + 3*db*db;
    if (d < minDist) { minDist = d; best = c; }
  }
  return best;
}

function toHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Convert percentage array to simple integer portions (target total = 10)
function toPortions(pcts) {
  const n = pcts.length;
  if (n === 0) return [];
  const total = pcts.reduce((s, p) => s + p, 0);
  // Give each at least 1, distribute remainder proportionally
  const remainder = 10 - n;
  let portions = pcts.map(p => 1 + Math.round((p / total) * remainder));
  // Fix rounding so sum = 10
  const diff = 10 - portions.reduce((s, p) => s + p, 0);
  if (diff !== 0) {
    const idx = portions.indexOf(Math.max(...portions));
    portions[idx] = Math.max(1, portions[idx] + diff);
  }
  return portions;
}

// Map ingredient/label name to a display color
function ingredientColor(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('white') || n.includes('base') || n.includes('shortening'))
    return { bg: '#ffffff', border: '#ccc' };
  if (n.includes('butter') && !n.includes('cream'))
    return { bg: '#f5e6a0', border: '#d4c060' };
  if (n.includes('ivory'))
    return { bg: '#f5ead0', border: '#ccc' };
  if (n.includes('pink') || n.includes('rose'))
    return { bg: '#e85070', border: null };
  if (n.includes('red'))
    return { bg: '#cc2233', border: null };
  if (n.includes('orange'))
    return { bg: '#f07020', border: null };
  if (n.includes('yellow'))
    return { bg: '#f5c800', border: null };
  if (n.includes('green'))
    return { bg: '#33aa55', border: null };
  if (n.includes('blue') || n.includes('cyan'))
    return { bg: '#3366dd', border: null };
  if (n.includes('violet') || n.includes('purple'))
    return { bg: '#8833cc', border: null };
  if (n.includes('black'))
    return { bg: '#222222', border: null };
  if (n.includes('brown'))
    return { bg: '#7a4520', border: null };
  if (n.includes('cocoa'))
    return { bg: '#5c3a1e', border: null };
  if (n.includes('teal') || n.includes('turquoise'))
    return { bg: '#2aaa99', border: null };
  return { bg: '#aaaaaa', border: null };
}

// Render a row of portion circles for one ingredient
function PortionGroup({ label, portions, circleColor }) {
  const { bg, border } = circleColor;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
      {/* Circles — left-aligned, all rows start at same x */}
      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
        {Array.from({ length: portions }).map((_, i) => (
          <div key={i} style={{
            width: 26, height: 26, borderRadius: '50%',
            background: bg,
            border: `2px solid ${border || 'rgba(0,0,0,0.20)'}`,
            boxShadow: '0 1px 5px rgba(0,0,0,0.12)',
            flexShrink: 0,
          }} />
        ))}
      </div>
      {/* Label */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#1a1a1a' }}>{label}</span>
        <span style={{ fontSize: 9, color: '#aaa', fontWeight: 600 }}>
          {portions} {portions === 1 ? 'part' : 'parts'}
        </span>
      </div>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ColorGuide({ onClose, primaryColor = '#1a1a1a', accentColor = '#333333' }) {
  const [imageUrl,    setImageUrl]    = useState(null);
  const [picked,      setPicked]      = useState(null);
  const [medium,      setMedium]      = useState('fondant');
  const [tab,         setTab]         = useState('rgb');
  const [hovering,    setHovering]    = useState(false);
  const [hoverColor,  setHoverColor]  = useState(null); // live pixel preview
  const [hoverPos,    setHoverPos]    = useState({ x: 0, y: 0 });

  const canvasRef    = useRef(null);
  const fileInputRef = useRef(null);
  const brandGrad    = `linear-gradient(135deg, ${primaryColor}, ${accentColor})`;

  const drawImage = useCallback((src) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      // Scale to fit display area — canvas attribute size must equal rendered size
      // so that click coordinates map correctly via getImageData
      const MAX_W = 200, MAX_H = 200;
      const scale = Math.min(MAX_W / img.naturalWidth, MAX_H / img.naturalHeight, 1);
      canvas.width  = Math.round(img.naturalWidth  * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = src;
  }, []);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageUrl(e.target.result);
      setPicked(null);
      drawImage(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const readPixel = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top)  * scaleY);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    const px = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
    return { r: px[0], g: px[1], b: px[2], hex: toHex(px[0], px[1], px[2]) };
  };

  const handleCanvasMove = (e) => {
    const color = readPixel(e);
    if (color) { setHoverColor(color); setHoverPos({ x: e.clientX, y: e.clientY }); }
  };

  const handleCanvasClick = (e) => {
    const color = readPixel(e);
    if (color) setPicked(color);
  };

  const rgbRecipe = picked ? computeRgbRecipe(picked.r, picked.g, picked.b) : null;
  const gelMatch  = picked ? findClosestGel(picked.r, picked.g, picked.b) : null;
  const gelRecipe = gelMatch ? gelMatch[medium] : null;

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={s.header}>
          <div>
            <div style={s.title}>Color Guide</div>
            <div style={s.subtitle}>Upload a photo · click to pick a color · get a mixing recipe</div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Scrollable body */}
        <div style={s.body}>

          {/* ── Row 1: image (left) + controls (right) ── */}
          <div style={s.topRow}>

            {/* Image + change button stacked */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <div
                style={{ ...s.dropZone, ...(hovering ? s.dropZoneHover : {}), ...(imageUrl ? s.dropZoneHasImage : {}) }}
                onDragOver={e => { e.preventDefault(); setHovering(true); }}
                onDragLeave={() => setHovering(false)}
                onDrop={e => { e.preventDefault(); setHovering(false); handleFile(e.dataTransfer.files[0]); }}
                onClick={() => !imageUrl && fileInputRef.current?.click()}
              >
                {!imageUrl ? (
                  <div style={s.uploadPrompt}>
                    <div style={{ color: '#999', marginBottom: 4 }}><UploadIcon /></div>
                    <div style={s.uploadText}>Drop image</div>
                    <div style={s.uploadSub}>or click to browse</div>
                  </div>
                ) : (
                  <canvas
                    ref={canvasRef}
                    style={s.canvas}
                    onClick={handleCanvasClick}
                    onMouseMove={handleCanvasMove}
                    onMouseLeave={() => setHoverColor(null)}
                  />
                )}
              </div>
              {imageUrl && (
                <button style={s.changeBtn} onClick={() => { setImageUrl(null); setPicked(null); }}>
                  Change image
                </button>
              )}
            </div>

            {/* Right-side panel: color + medium only */}
            <div style={s.sidePanel}>
              {!imageUrl ? (
                <div style={s.uploadHintLarge}>
                  Upload a cake photo, then click anywhere on it to pick a color and get a mixing recipe.
                </div>
              ) : (
                <>
                  {picked ? (
                    <div style={s.colorCard}>
                      <div style={{ ...s.swatch, background: picked.hex }} />
                      <div>
                        <div style={s.hexVal}>{picked.hex.toUpperCase()}</div>
                        <div style={s.rgbVal}>RGB({picked.r}, {picked.g}, {picked.b})</div>
                      </div>
                    </div>
                  ) : (
                    <div style={s.pickHintBox}>Click the image to pick a color</div>
                  )}

                  <div style={s.controlGroup}>
                    <span style={s.controlLabel}>Medium</span>
                    <div style={s.segmented}>
                      {[['fondant','Fondant'],['buttercream','Buttercream']].map(([val, label]) => (
                        <button key={val}
                          style={{ ...s.segBtn, ...(medium === val ? { ...s.segBtnActive, background: brandGrad } : {}) }}
                          onClick={() => setMedium(val)}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Full-width recipe tabs ── */}
          {imageUrl && picked && (
            <div style={s.recipeTabs}>
              {[['gel','Gel Colors'],['liquid','Liquid Colors'],['rgb','Digital Reference']].map(([val, label]) => (
                <button key={val}
                  style={{ ...s.recipeTab, ...(tab === val ? s.recipeTabActive : {}) }}
                  onClick={() => setTab(val)}>
                  {label}
                </button>
              ))}
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])} />

          {/* ── Row 2: Mix Recipe (full width, only when color is picked) ── */}
          {picked && tab === 'rgb' && (() => {
            const portions = toPortions(rgbRecipe.map(r => r.pct));
            const sorted = rgbRecipe
              .map((row, i) => ({ ...row, portions: portions[i] }))
              .sort((a, b) => b.portions - a.portions);
            return (
              <div style={s.recipeCard}>
                <div style={s.recipeCardHeader}>
                  <span style={s.recipeCardTitle}>Mix Recipe</span>
                  <span style={s.recipeCardSub}>digital breakdown · for screen / design reference</span>
                </div>
                <div style={s.portionsRow}>
                  {sorted.map((row, i) => (
                    <PortionGroup key={i} label={row.label} portions={row.portions}
                      circleColor={{ bg: row.color, border: row.color === '#d8d8d8' ? '#bbb' : null }} />
                  ))}
                </div>
              </div>
            );
          })()}

          {picked && tab === 'gel' && gelRecipe && (() => {
            const portions = toPortions(gelRecipe.components.map(c => c.pct));
            const sorted = gelRecipe.components
              .map((c, i) => ({ ...c, portions: portions[i] }))
              .sort((a, b) => b.portions - a.portions);
            return (
              <>
                <div style={s.recipeCard}>
                  <div style={s.recipeCardHeader}>
                    <span style={s.recipeCardTitle}>Mix Recipe</span>
                    <span style={s.recipeCardSub}>common gel colors · any brand</span>
                  </div>
                  <div style={s.portionsRow}>
                    {sorted.map((c, i) => (
                      <PortionGroup key={i} label={c.color} portions={c.portions}
                        circleColor={ingredientColor(c.color)} />
                    ))}
                  </div>
                </div>
              </>
            );
          })()}

          {picked && tab === 'liquid' && (() => {
            const liquidRecipe = computeLiquidRecipe(picked.r, picked.g, picked.b);
            const portions = toPortions(liquidRecipe.map(r => r.pct));
            const sorted = liquidRecipe
              .map((row, i) => ({ ...row, portions: portions[i] }))
              .sort((a, b) => b.portions - a.portions);
            return (
              <div style={s.recipeCard}>
                <div style={s.recipeCardHeader}>
                  <span style={s.recipeCardTitle}>Mix Recipe</span>
                  <span style={s.recipeCardSub}>liquid food colors · adjust by drops</span>
                </div>
                <div style={s.portionsRow}>
                  {sorted.map((row, i) => (
                    <PortionGroup key={i} label={row.label} portions={row.portions}
                      circleColor={{ bg: row.color, border: row.color === '#d8d8d8' ? '#bbb' : null }} />
                  ))}
                </div>
              </div>
            );
          })()}

          <div style={{ height: 8 }} />
        </div>
      </div>

      {/* Floating hover swatch — follows cursor over image */}
      {hoverColor && (
        <div style={{
          position: 'fixed',
          left: hoverPos.x + 16,
          top: hoverPos.y - 36,
          background: '#fff',
          borderRadius: 8,
          padding: '5px 9px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
          display: 'flex', alignItems: 'center', gap: 7,
          pointerEvents: 'none', zIndex: 200,
          fontFamily: "'Quicksand', sans-serif",
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: 5,
            background: hoverColor.hex,
            border: '1.5px solid rgba(0,0,0,0.1)',
            flexShrink: 0,
          }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#1a1a1a', letterSpacing: 0.5 }}>
              {hoverColor.hex.toUpperCase()}
            </div>
            <div style={{ fontSize: 9, color: '#aaa', fontWeight: 500 }}>
              {hoverColor.r}, {hoverColor.g}, {hoverColor.b}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.22)',
    backdropFilter: 'blur(4px)', zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modal: {
    background: '#fff', borderRadius: 20,
    boxShadow: '0 8px 48px rgba(0,0,0,0.14)',
    width: '100%', maxWidth: 460,
    maxHeight: '92vh', display: 'flex', flexDirection: 'column',
    overflow: 'hidden', fontFamily: "'Quicksand', sans-serif",
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '16px 20px 12px', borderBottom: '1px solid #e8e8e8', flexShrink: 0,
  },
  title:    { fontSize: 14, fontWeight: 800, color: '#1a1a1a' },
  subtitle: { fontSize: 10, color: '#aaa', marginTop: 2, fontWeight: 500 },
  closeBtn: {
    background: '#f0f0f0', border: 'none', width: 28, height: 28, borderRadius: '50%',
    fontSize: 12, color: '#333', cursor: 'pointer', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
  },

  body: {
    overflowY: 'auto', flex: 1,
    padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10,
  },

  // Two-column top row
  topRow: {
    display: 'flex', gap: 12, alignItems: 'flex-start',
  },
  sidePanel: {
    flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0,
  },

  // Image area
  dropZone: {
    border: '2px dashed #d0d0d0', borderRadius: 12, background: '#fff',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 160, minHeight: 145, flexShrink: 0,
    overflow: 'hidden', transition: 'all 0.15s',
  },
  dropZoneHover:    { border: '2px dashed #888', background: '#f5f5f5' },
  dropZoneHasImage: { border: '1.5px solid #d0d0d0', cursor: 'crosshair', background: '#000', minHeight: 'auto' },
  uploadPrompt: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  uploadText:   { fontSize: 13, fontWeight: 700, color: '#1a1a1a' },
  uploadSub:    { fontSize: 11, color: '#aaa' },
  canvas:       { display: 'block', maxWidth: '100%' },

  imageFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  pickHint:    { fontSize: 10, color: '#bbb', fontWeight: 500 },
  pickHintBox: {
    fontSize: 11, color: '#bbb', fontWeight: 500,
    background: '#f8f8f8', borderRadius: 8, padding: '10px 12px',
    textAlign: 'center',
  },
  uploadHintLarge: {
    fontSize: 12, color: '#aaa', fontWeight: 500, lineHeight: 1.6,
    padding: '8px 2px',
  },
  changeBtn: {
    background: 'none', border: '1.5px solid #ddd', borderRadius: 6,
    padding: '5px 0', fontSize: 10, fontWeight: 700, color: '#888',
    cursor: 'pointer', fontFamily: "'Quicksand', sans-serif", width: '100%',
  },

  // Picked color card
  colorCard: {
    display: 'flex', alignItems: 'center', gap: 12,
    background: '#f8f8f8', borderRadius: 12, padding: '10px 14px',
    border: '1px solid #e8e8e8',
  },
  swatch: {
    width: 44, height: 44, borderRadius: 10, flexShrink: 0,
    border: '1.5px solid rgba(0,0,0,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  },
  hexVal: { fontSize: 17, fontWeight: 800, color: '#1a1a1a', letterSpacing: 0.8 },
  rgbVal: { fontSize: 10, color: '#aaa', fontWeight: 500, marginTop: 2 },

  // Controls (medium + recipe type)
  controls: {
    display: 'flex', gap: 10,
  },
  controlGroup: {
    flex: 1, display: 'flex', flexDirection: 'column', gap: 5,
  },
  controlLabel: {
    fontSize: 9, fontWeight: 800, color: '#bbb', letterSpacing: 1.2, textTransform: 'uppercase',
  },
  segmented: {
    display: 'flex', borderRadius: 8, overflow: 'hidden',
    border: '1.5px solid #e0e0e0', background: '#f5f5f5',
  },
  segBtn: {
    flex: 1, padding: '7px 0', border: 'none', background: 'transparent',
    fontSize: 11, fontWeight: 700, color: '#666', cursor: 'pointer',
    fontFamily: "'Quicksand', sans-serif", transition: 'all 0.15s',
  },
  segBtnActive: {
    color: '#fff', borderRadius: 6,
  },

  // Full-width recipe tab strip
  recipeTabs: {
    display: 'flex', borderBottom: '2px solid #e8e8e8',
  },
  recipeTab: {
    flex: 1, padding: '9px 0', border: 'none', background: 'transparent',
    fontSize: 11, fontWeight: 700, color: '#aaa', cursor: 'pointer',
    fontFamily: "'Quicksand', sans-serif",
    borderBottom: '2px solid transparent', marginBottom: -2,
    transition: 'color 0.15s',
  },
  recipeTabActive: {
    color: '#1a1a1a', borderBottom: '2px solid #1a1a1a',
  },

  // Recipe card (highlighted)
  recipeCard: {
    background: '#fff',
    border: '2px solid #1a1a1a',
    borderRadius: 14,
    padding: '16px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    display: 'flex', flexDirection: 'column', gap: 14,
  },
  recipeCardHeader: {
    display: 'flex', alignItems: 'baseline', gap: 8,
  },
  recipeCardTitle: {
    fontSize: 13, fontWeight: 800, color: '#1a1a1a', letterSpacing: 0.2,
  },
  recipeCardSub: {
    fontSize: 10, color: '#aaa', fontWeight: 500,
  },
  portionsRow: {
    display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start',
  },

  // Instructions
  instructionBlock: { display: 'flex', flexDirection: 'column', gap: 5 },
  instructionTitle: { fontSize: 11, fontWeight: 800, color: '#555', letterSpacing: 0.3 },
  instructionText:  { fontSize: 12, color: '#444', lineHeight: 1.7, fontWeight: 500 },

  tipsBox: {
    background: '#fffbeb', border: '1px solid #f0d060', borderRadius: 8,
    padding: '8px 10px', display: 'flex', gap: 7, alignItems: 'flex-start',
  },
  tipsIcon: { fontSize: 12, flexShrink: 0, marginTop: 1 },
  tipsText: { fontSize: 11, color: '#6b5000', fontWeight: 500, lineHeight: 1.55 },

  // Warnings — amber, not pink
  warnBox:   {
    background: '#fffbeb', border: '1px solid #f59e0b',
    borderRadius: 8, padding: '10px 12px',
  },
  warnTitle: { fontSize: 11, fontWeight: 800, color: '#92400e', marginBottom: 4 },
  warnItem:  { fontSize: 11, color: '#78350f', fontWeight: 500, lineHeight: 1.6 },
};
