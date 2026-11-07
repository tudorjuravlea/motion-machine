// W-TOKENS (SPEC §7): a designed piece repeats a few values; a machine-made one has a new stroke
// width, size or corner radius for every element. Across the rest frames of a format, the rule counts
// the distinct stroke widths (a painted border, an outline, an SVG stroke), font sizes and corner
// radii the picture shows, each as rendered on screen and rounded to a whole pixel, so 17 and 18 are
// two values. It warns above STROKES, SIZES and RADII. A radius of half the box or more (a pill, a
// disc) counts as one value, "round". A style's `gate.tokens` sets { strokes, sizes, radii }. Two
// values are one when they round alike: an element at a rest is read where it sits.
import { rule } from '../lib/rule.mjs';
import { restInstants } from './_lib.mjs';

export const scope = 'format';
export const STROKES = 4;
export const SIZES = 5;
export const RADII = 3;

/** Runs in the page: the stroke widths, font sizes and corner radii of every visible element of the stage, in rendered px. */
export function tokensInPage() {
  const stage = document.querySelector('.mm-stage');
  const out = { strokes: [], sizes: [], radii: [] };
  if (!stage) return out;
  const transparent = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
  const opacity = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
  for (const el of stage.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || cs.display === 'none' || !el.getClientRects().length || opacity(el) < 0.01) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 && r.height < 0.5) continue;
    const svg = el instanceof SVGElement;
    const ctm = svg && el.getScreenCTM ? el.getScreenCTM() : null;
    const scale = svg ? (ctm ? Math.min(Math.hypot(ctm.a, ctm.b), Math.hypot(ctm.c, ctm.d)) : 1) : (el.offsetWidth > 0 ? r.width / el.offsetWidth : 1);
    const s = Math.abs(scale - 1) < 0.005 ? 1 : scale;
    if (svg) {
      if (/^(path|line|rect|circle|ellipse|polyline|polygon)$/i.test(el.localName) && cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0 && parseFloat(cs.strokeOpacity) > 0) out.strokes.push(parseFloat(cs.strokeWidth) * s);
      continue;
    }
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const w = parseFloat(cs[`border${side}Width`]);
      if (w > 0 && !['none', 'hidden'].includes(cs[`border${side}Style`]) && !transparent(cs[`border${side}Color`])) out.strokes.push(w * s);
    }
    if (parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none' && !transparent(cs.outlineColor)) out.strokes.push(parseFloat(cs.outlineWidth) * s);
    if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) out.sizes.push(parseFloat(cs.fontSize) * s);
    const painted = !transparent(cs.backgroundColor) || cs.backgroundImage !== 'none' || ['Top', 'Right', 'Bottom', 'Left'].some((d) => parseFloat(cs[`border${d}Width`]) > 0) || /^(img|video|canvas)$/i.test(el.localName);
    if (painted) {
      const half = Math.min(r.width, r.height) / 2 / (s || 1);
      for (const corner of ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft']) {
        const v = cs[`border${corner}Radius`].split(/\s+/)[0];
        const px = v.endsWith('%') ? (parseFloat(v) / 100) * Math.min(el.offsetWidth, el.offsetHeight) : parseFloat(v);
        if (px > 0) out.radii.push(px >= half - 0.5 ? 'round' : px * s);
      }
    }
  }
  return out;
}

const whole = (v) => (v === 'round' ? v : Math.round(v));

export default async function (ctx) {
  const limit = { strokes: ctx.style?.gate?.tokens?.strokes ?? STROKES, sizes: ctx.style?.gate?.tokens?.sizes ?? SIZES, radii: ctx.style?.gate?.tokens?.radii ?? RADII };
  const seen = { strokes: new Set(), sizes: new Set(), radii: new Set() };
  const rests = restInstants(ctx.schedule);
  for (const t of rests) {
    await ctx.mm.seek(t);
    const got = await ctx.page.evaluate(tokensInPage);
    for (const k of Object.keys(seen)) for (const v of got[k]) seen[k].add(whole(v));
  }
  const values = Object.fromEntries(Object.keys(seen).map((k) => [k, [...seen[k]].sort((a, b) => (a === 'round' ? 1 : b === 'round' ? -1 : a - b))]));
  const counts = Object.fromEntries(Object.keys(seen).map((k) => [k, seen[k].size]));
  const over = Object.keys(seen).filter((k) => counts[k] > limit[k]);
  const ev = { instants: rests.length, counts, threshold: `strokes ${limit.strokes}, sizes ${limit.sizes}, radii ${limit.radii}`, values };
  if (over.length) {
    const k = over[0], name = { strokes: 'stroke widths', sizes: 'font sizes', radii: 'corner radii' };
    return rule('W-TOKENS', 'WARN', { ...ev, measured: counts[k], reason: over.map((x) => `${counts[x]} distinct ${name[x]} (${values[x].join(', ')}) against ${limit[x]}: pick a few and reuse them`).join('; ') });
  }
  return rule('W-TOKENS', 'PASS', ev);
}
