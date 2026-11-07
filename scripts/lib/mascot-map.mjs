// Turns the named layers of a mascot drawing (scripts/lib/mascot-svg.mjs) into a brand's `mascot`
// block (SPEC §3), the contract runtime/kit/rig.js draws:
//   body                 the silhouette (required); its stroke, if any, becomes the rig's outline
//   face                 a group holding the eyes and the mouth; a filled shape directly in it is a
//                        screen face's plate
//   eye-left, eye-right  the eye line's centre, the gap between the eyes and the eye height; one
//                        `eye` alone is a side view's near eye; no mouth layer means an eyes-only face
//   mouth                its distance below the eye line
//   arm-…, leg-…         limbs: a leg hangs from the top of its drawing, an arm from the end nearest
//                        the body; `far` in the name draws it in the shade colour; a stroked line
//                        gives its width from the stroke
//   shadow (or ground)   where the ground is; with no legs, a gap between the body and its shadow
//                        is the character's float
//   front, side, three-quarter, back   top-level groups holding a view each (else the drawing is the front)
//   anything else        an extra part: anchored where it meets the body (an open stroke at its end
//                        nearest the body, a filled shape at the middle of what it shares with the
//                        body), behind the body when drawn before it, with a swing by its name
//                        (`data-swing` and `data-anchor` on the layer override both)
// The front's ground sits at the origin and its height (ground to the highest point) is 10 u.
// Every colour maps to the nearest palette role, else to an sRGB blend of two roles, else to the
// nearest role with a warning naming the colour.
import { readSvg, flatten, boxOf, pathText, transformSegs, parsePaint } from './mascot-svg.mjs';
import { rgbToLab, deltaE } from '../check/_pixels.mjs';

export const ROLES = ['canvas', 'ink', 'muted', 'surface', 'line', 'accent', 'accentInk'];
const VIEW_NAMES = { front: 'front', side: 'side', back: 'back', 'three-quarter': 'threeQuarter', threequarter: 'threeQuarter', 'three-quarters': 'threeQuarter', '3-4': 'threeQuarter' };
const HEIGHT = 10;
const ROLE_DE = 10, BLEND_DE = 6;
const SWINGS = [[/tail/, 1.2], [/antenna|antennae|feeler|stalk/, 1], [/hair|tuft|sprout|leaf|curl|plume|feather/, 0.9], [/wing/, 0.8], [/ear/, 0.6], [/hat|cap|crown|helmet/, 0.25], [/shine|highlight|spot|mark|stripe|pattern|patch|freckle|logo|badge/, 0]];

const fail = (message) => Object.assign(new Error(message), { exitCode: 1 });
const r3 = (v) => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? 0 : r; };
const hexOf = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const rgbOf = (hex) => { const x = String(hex).replace('#', ''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); };

/**
 * The palette part that explains a colour: { part, de, warn }. `part` is a role, or { role, mix,
 * share } (an sRGB blend, as color-mix in srgb draws it); `warn` names a colour no role explains.
 */
export function nearestPaint(rgb, color) {
  const lab = rgbToLab(...rgb);
  const roles = ROLES.filter((r) => /^#[0-9a-f]{6}$/i.test(color?.[r] ?? '')).map((r) => ({ r, rgb: rgbOf(color[r]) }));
  let best = null;
  for (const { r, rgb: c } of roles) { const de = deltaE(lab, rgbToLab(...c)); if (!best || de < best.de) best = { part: r, de }; }
  if (!best) return { part: 'accent', de: Infinity, warn: `${hexOf(rgb)}: the brand has no palette to map it to` };
  if (best.de <= ROLE_DE) return { ...best, warn: null };
  let blend = null;
  for (let i = 0; i < roles.length; i++) for (let j = 0; j < roles.length; j++) {
    if (i === j) continue;
    for (let k = 1; k < 20; k++) {
      const share = k / 20, c = roles[i].rgb.map((v, n) => v * (1 - share) + roles[j].rgb[n] * share);
      const de = deltaE(lab, rgbToLab(...c));
      if (!blend || de < blend.de - 1e-9) blend = { part: { role: roles[i].r, mix: roles[j].r, share }, de };
    }
  }
  if (blend && blend.de <= BLEND_DE) return { ...blend, warn: null };
  return { ...best, warn: `${hexOf(rgb)}: no palette role explains it (drawn as ${best.part}, ΔE ${best.de.toFixed(1)})` };
}

// ---------------------------------------------------------------- geometry helpers

const union = (shapes) => boxOf(shapes.flatMap((s) => s.subs));
const centre = (b) => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
const open = (s) => !s.segs.some((g) => g[0] === 'Z') && !paintOf(s.style.fill, {}) && !!paintOf(s.style.stroke, {});

function paintOf(v, gradients) {
  const p = parsePaint(v);
  if (p && p.gradient) {
    const stops = (gradients[p.gradient] ?? []).map(parsePaint).filter((c) => Array.isArray(c));
    return stops.length ? stops[0].map((_, i) => stops.reduce((a, c) => a + c[i], 0) / stops.length) : undefined;
  }
  return p;
}

// even-odd inside test against the body's flattened outline
function inside(subs, x, y) {
  let c = false;
  for (const s of subs) for (let i = 0, j = s.length - 1; i < s.length; j = i++) {
    const [xi, yi] = s[i], [xj, yj] = s[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function distTo(subs, x, y) {
  let d = Infinity;
  for (const s of subs) for (let i = 1; i < s.length; i++) {
    const [ax, ay] = s[i - 1], [bx, by] = s[i], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return d;
}
// how far a point lies from the body: 0 inside it, else its distance to the outline
const fromBody = (bodySubs, [x, y]) => (inside(bodySubs, x, y) ? 0 : distTo(bodySubs, x, y));

// ---------------------------------------------------------------- the import

function partName(names) {
  const rest = names.filter((n) => !VIEW_NAMES[n]);
  if (!rest.length) return null;
  return rest[0] === 'face' && rest.length > 1 ? rest[1] : rest[0];
}
const viewOf = (names) => VIEW_NAMES[names.find((n) => VIEW_NAMES[n])] ?? 'front';
const isLimb = (n) => /^(arm|leg)(-|$)/.test(n);
const FACE = new Set(['face', 'eye-left', 'eye-right', 'eye', 'mouth']);

/**
 * A mascot block from SVG text and the brand half it is for: { mascot, warnings, notes, summary }.
 * Throws (exit code 1) on a drawing it cannot use.
 */
export function importMascot(text, brand) {
  const { shapes, notes, gradients } = readSvg(text);
  const warnings = [];
  const color = brand?.color ?? {};
  const paints = new Map();
  const roleOf = (rgb, what) => {
    if (rgb === undefined) { warnings.push(`${what}: a colour the importer cannot read; drawn in the accent`); return 'accent'; }
    const hex = hexOf(rgb);
    if (!paints.has(hex)) {
      const p = nearestPaint(rgb, color);
      paints.set(hex, p);
      if (p.warn) warnings.push(`${what}: ${p.warn}`);
    }
    return paints.get(hex).part;
  };
  const fillOrStroke = (s) => { const f = paintOf(s.style.fill, gradients); return f !== null ? { paint: f, stroke: 0 } : { paint: paintOf(s.style.stroke, gradients), stroke: Number.parseFloat(s.style['stroke-width'] ?? '1') * s.scale }; };

  // shapes by view and by layer name
  const views = {};
  let unnamed = 0;
  for (const s of shapes) {
    const name = partName(s.names);
    if (!name) { unnamed++; continue; }
    const v = (views[viewOf(s.names)] ??= {});
    // a filled shape directly in the face group is the plate; a part in the face group keeps its own name
    (v[name] ??= []).push(s);
    if (Number.parseFloat(s.style.opacity ?? '1') < 1 || Number.parseFloat(s.style['fill-opacity'] ?? '1') < 1) {
      if (!['shadow', 'ground'].includes(name)) notes.push(`${name}: transparency is drawn opaque`);
    }
  }
  if (unnamed) notes.push(`${unnamed} shape${unnamed > 1 ? 's' : ''} outside any named layer skipped`);
  const front = views.front;
  if (!front?.body?.length) throw fail('no layer named "body" in the drawing (name the silhouette\'s layer or group "body")');

  // the frame: each view's ground; the front's height sets the unit
  const frame = (v) => {
    const body = union(v.body), legs = Object.keys(v).filter((n) => /^leg(-|$)/.test(n)).map((n) => union(v[n]));
    const shadow = v.shadow ?? v.ground;
    const sb = shadow ? union(shadow) : null;
    const gy = legs.length ? Math.max(body.y1, ...legs.map((b) => b.y1)) : body.y1;
    const gx = sb ? centre(sb)[0] : centre(body)[0];
    const float = !legs.length && sb ? Math.max(0, centre(sb)[1] - body.y1) : 0;
    const drawn = Object.entries(v).filter(([n]) => n !== 'shadow' && n !== 'ground').flatMap(([, ss]) => ss);
    const all = union(drawn);
    return { gx, gy, float, all, body };
  };
  const F = frame(front);
  const heightPx = F.gy - F.all.y0;
  if (!(heightPx > 0)) throw fail('the drawing has no height above its ground');
  const s = HEIGHT / heightPx;
  const toU = (fr) => [s, 0, 0, s, -fr.gx * s, -fr.gy * s];
  const pt = (fr, [x, y]) => [r3((x - fr.gx) * s), r3((y - fr.gy) * s)];

  const out = { box: [0, HEIGHT], ground: [0, 0], views: {} };
  const parts = {};
  let reachX = 0, outline = 0;
  const bodyOrder = (v) => Math.min(...v.body.map((b) => b.order));

  const viewBlock = (name, v, fr) => {
    const bodySubs = v.body.flatMap((b) => b.subs);
    for (const sh of Object.values(v).flat()) if (sh !== v.shadow?.[0]) for (const [x] of sh.subs.flat()) reachX = Math.max(reachX, Math.abs(x - fr.gx) * s);
    const block = { body: pathText(v.body.flatMap((b) => transformSegs(b.segs, toU(fr)))) };
    if (name === 'front') {
      const filled = v.body.find((b) => paintOf(b.style.fill, gradients) !== null) ?? v.body[0];
      parts.body = roleOf(paintOf(filled.style.fill, gradients), 'body');
      const stroked = v.body.find((b) => paintOf(b.style.stroke, gradients) && Number.parseFloat(b.style['stroke-width'] ?? '1') > 0);
      if (stroked) {
        outline = Math.min(3, Math.max(0.2, (Number.parseFloat(stroked.style['stroke-width'] ?? '1') * stroked.scale * s) / 0.16));
        parts.outline = roleOf(paintOf(stroked.style.stroke, gradients), 'body outline');
      }
    }
    // the face
    const eyes = ['eye-left', 'eye-right'].filter((n) => v[n]).map((n) => union(v[n]));
    const one = !eyes.length && v.eye ? union(v.eye) : null;
    if (eyes.length || one) {
      const cs = (one ? [one] : eyes).map(centre);
      const cx = cs.reduce((a, c) => a + c[0], 0) / cs.length, cy = cs.reduce((a, c) => a + c[1], 0) / cs.length;
      const size = (one ? [one] : eyes).reduce((a, b) => a + (b.y1 - b.y0), 0) / cs.length;
      const [fx, fy] = pt(fr, [cx, cy]);
      const face = { cx: fx, cy: fy, gap: r3(eyes.length === 2 ? Math.abs(cs[1][0] - cs[0][0]) * s : 0), size: r3(Math.min(20, Math.max(0.05, size * s))) };
      if (one) face.sides = 'near';
      if (v.mouth) face.mouth = r3(Math.max(-20, Math.min(20, (centre(union(v.mouth))[1] - cy) * s)));
      const plate = (v.face ?? []).find((p) => paintOf(p.style.fill, gradients) !== null);
      if (plate) {
        const b = plate.rect ?? { ...plate.box, w: plate.box.x1 - plate.box.x0, h: plate.box.y1 - plate.box.y0, x: plate.box.x0, y: plate.box.y0 };
        if (!plate.rect) notes.push(`${name} face plate: a ${plate.tag} drawn as a rounded rectangle`);
        const r = plate.rect ? plate.rect.r : 0.2 * Math.min(b.w, b.h);
        face.plate = { w: r3(b.w * s), h: r3(b.h * s), r: r3(r * s), y: r3((b.y + b.h / 2 - cy) * s) };
        if (Math.abs(b.x + b.w / 2 - cx) > 0.1 * b.w) notes.push(`${name} face plate sits off the eyes' centre; the rig centres it on them`);
        if (name === 'front') parts.plate = roleOf(paintOf(plate.style.fill, gradients), 'face plate');
      }
      block.face = face;
      if (name === 'front') {
        const e = (v['eye-left'] ?? v['eye-right'] ?? v.eye)[0];
        parts.eyes = roleOf(fillOrStroke(e).paint, 'eyes');
        if (v.mouth) parts.mouth = roleOf(fillOrStroke(v.mouth[0]).paint, 'mouth');
        else out.faces = { mouths: ['none'] };
      }
    } else {
      block.face = null;
      if (name === 'front') notes.push('no eye layers: the character has no face');
    }
    // limbs
    const limbs = [];
    const bc = centre(fr.body);
    for (const n of Object.keys(v).filter(isLimb)) {
      const ss = v[n], kind = n.startsWith('arm') ? 'arm' : 'leg';
      const L = { kind };
      const line = ss.length === 1 && open(ss[0]) ? ss[0] : null;
      if (line) {
        const pts = line.subs.flat(), p0 = pts[0], p1 = pts[pts.length - 1];
        const w = Number.parseFloat(line.style['stroke-width'] ?? '1') * line.scale * s;
        const near0 = Math.hypot(p0[0] - bc[0], p0[1] - bc[1]) <= Math.hypot(p1[0] - bc[0], p1[1] - bc[1]);
        const a = kind === 'leg' ? (p0[1] <= p1[1] ? p0 : p1) : near0 ? p0 : p1, b2 = a === p0 ? p1 : p0;
        [L.x, L.y] = pt(fr, a);
        if (kind === 'arm') L.length = r3(Math.hypot(b2[0] - a[0], b2[1] - a[1]) * s);
        L.width = r3(Math.max(0.05, w));
      } else {
        const b = union(ss), w = b.x1 - b.x0, h = b.y1 - b.y0;
        if (kind === 'leg') { [L.x, L.y] = pt(fr, [(b.x0 + b.x1) / 2, b.y0]); L.width = r3(Math.max(0.05, w * s)); }
        else {
          [L.x, L.y] = pt(fr, [Math.max(b.x0, Math.min(b.x1, bc[0])), Math.max(b.y0, Math.min(b.y1, bc[1]))]);
          L.length = r3(Math.max(w, h) * s); L.width = r3(Math.max(0.05, Math.min(w, h) * s));
        }
      }
      if (kind === 'arm' && L.length > 0.5 * HEIGHT) { notes.push(`${n}: longer than half the character; shortened`); L.length = 0.5 * HEIGHT; }
      if (/(^|-)left(-|$)/.test(n)) L.side = 'left'; else if (/(^|-)right(-|$)/.test(n)) L.side = 'right';
      L.layer = Math.min(...ss.map((x) => x.order)) < bodyOrder(v) ? 'back' : 'front';
      if (/(^|-)far(-|$)/.test(n)) L.far = true;
      limbs.push(L);
      if (name === 'front' && !parts.limbs) {
        const role = roleOf(fillOrStroke(ss[0]).paint, n);
        if (JSON.stringify(role) !== JSON.stringify(parts.body)) parts.limbs = role;
      }
    }
    if (limbs.length > 8) { notes.push(`${name}: ${limbs.length - 8} limbs past the eighth dropped`); limbs.length = 8; }
    if (limbs.length) block.limbs = limbs;
    else if (name === 'front') notes.push('no arm or leg layers: the character has no limbs');
    // extra parts
    for (const n of Object.keys(v)) {
      if (n === 'body' || n === 'shadow' || n === 'ground' || FACE.has(n) || isLimb(n)) continue;
      if (name !== 'front' && front[n]) { notes.push(`${n} in the ${name} view: the front's drawing is used in every view`); continue; }
      const ss = v[n];
      const pts = ss.flatMap((x) => x.subs.flat());
      let anchor = ss.find((x) => x.anchor)?.anchor ?? null;
      if (!anchor) {
        const ends = ss.filter(open).flatMap((x) => { const p = x.subs.flat(); return [p[0], p[p.length - 1]]; });
        const cand = (ends.length ? ends : pts).map((p) => ({ p, d: fromBody(bodySubs, p) }));
        const dmin = Math.min(...cand.map((c) => c.d));
        if (ends.length) {
          anchor = cand.filter((c) => c.d <= dmin + 1e-6).sort((a, b) => Math.hypot(a.p[0] - bc[0], a.p[1] - bc[1]) - Math.hypot(b.p[0] - bc[0], b.p[1] - bc[1]))[0].p;
        } else {
          const near = cand.filter((c) => c.d <= dmin + 0.04 * heightPx);
          anchor = [near.reduce((a, c) => a + c.p[0], 0) / near.length, near.reduce((a, c) => a + c.p[1], 0) / near.length];
        }
      }
      const tip = centre(boxOf([pts]));
      const named = ss.find((x) => x.swing)?.swing?.v;
      const swing = named ?? SWINGS.find(([re]) => re.test(n))?.[1] ?? 0.5;
      const layer = Math.min(...ss.map((x) => x.order)) < bodyOrder(v) ? 'back' : 'front';
      // shapes of one look draw as one part; a part of several looks splits, sharing anchor and tip
      const looks = [];
      for (const x of ss) {
        const fs = fillOrStroke(x), key = `${JSON.stringify(fs.paint)}|${r3(fs.stroke)}`;
        let g = looks.find((l) => l.key === key);
        if (!g) looks.push(g = { key, fs, shapes: [] });
        g.shapes.push(x);
      }
      looks.forEach((g, i) => {
        const id = i ? `${n}-${i + 1}` : n;
        const p = { d: pathText(g.shapes.flatMap((x) => transformSegs(x.segs, toU(fr)))), anchor: pt(fr, anchor) };
        if (layer === 'back') p.layer = 'back';
        p.swing = swing;
        p.color = roleOf(g.fs.paint, id);
        if (g.fs.stroke) p.stroke = r3(Math.min(5, Math.max(0.01, g.fs.stroke * s)));
        if (looks.length > 1) p.tip = pt(fr, tip);
        if (name !== 'front') p.views = [name];
        parts[id] = p;
      });
    }
    return block;
  };

  out.views.front = viewBlock('front', front, F);
  for (const [name, v] of Object.entries(views)) {
    if (name === 'front') continue;
    if (!v.body?.length) { notes.push(`the ${name} view has no body layer and is skipped`); continue; }
    out.views[name] = viewBlock(name, v, frame(v));
  }
  out.box = [Math.ceil(2 * reachX * 100 + 1e-6) / 100, HEIGHT];
  out.parts = parts;
  if (F.float > 0) out.float = r3(Math.min(20, F.float * s));
  out.outline = r3(outline);
  const order = ['box', 'ground', 'float', 'views', 'parts', 'outline', 'moods', 'faces'];
  const mascot = Object.fromEntries(order.filter((k) => out[k] !== undefined).map((k) => [k, out[k]]));
  const summary = {
    views: Object.keys(mascot.views), limbs: (mascot.views.front.limbs ?? []).map((L) => `${L.kind}${L.far ? ' (far)' : ''}`),
    face: mascot.views.front.face ? (mascot.views.front.face.plate ? 'screen' : out.faces ? 'eyes only' : 'eyes and mouth') : 'none',
    extras: Object.keys(parts).filter((k) => typeof parts[k] === 'object' && parts[k].d), float: mascot.float ?? 0,
    colors: [...paints].map(([hex, p]) => `${hex} → ${typeof p.part === 'string' ? p.part : `${p.part.role} + ${Math.round(p.part.share * 100)} % ${p.part.mix}`}`),
  };
  return { mascot, warnings, notes, summary };
}
