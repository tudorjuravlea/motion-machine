// transitions/re-ink: a print-shop cut in two linear squeegee pulls behind a ragged, slightly
// tilted front. The first pull lays the incoming scene over the outgoing one in a second role set
// of the brand (the same palette with its roles swapped: ink ground and canvas type, or the scene
// printed on the accent). The second pull re-inks that same geometry into the brand's own roles:
// only the inks change, nothing moves.
//
// First pull: the incoming section is clipped to the region behind the front and wears the second
// role set through custom properties on its inline style; the outgoing section is untouched.
// Second pull: the outgoing section is hidden; the incoming section is drawn as itself; a copy of
// it, made after the seek has drawn every element (so it carries the same entrance state), wears
// the second role set and is clipped to the region the front has not reached. The copy is marked
// data-mm-overlay, so the kit removes it on every seek. Every pixel shows one print of one scene.
//
// A scene that draws on a canvas, a video, a device screen or footage cannot be copied (a cloned
// canvas is blank, and a picture is not re-inked by a role swap). Which scenes those are is read from
// what the story puts in them, not from the canvases present when the cut runs (a pattern may make its
// canvas only once it runs, after the cut has begun): a canvas, video, footage or device screen in the
// markup at mount, a slot whose pattern draws on a canvas (every 3d/ pattern, and the PAINTERS), or a
// scene move among the PAINTERS. Into such a scene the cut is a plate wipe from its first frame: the first pull lays a plate of the second set's ground role over the outgoing scene
// behind the front, the second strips it off the incoming scene, drawn as itself. The plate is an
// overlay node beside the sections, marked data-mm-overlay.
//
// Role values are read from the computed style, so the pattern holds no colour of its own. Pulls
// run on the cut's linear time: a squeegee does not ease.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r1 = (x) => String(Math.round(x * 10) / 10);
const ROLES = ['canvas', 'ink', 'muted', 'surface', 'line', 'accent', 'accentInk'];
// Properties the kit derives from roles at the root: re-declared on a re-inked section so they
// follow the swap.
const DERIVED = ['--mm-color-surfaceInk', '--mm-accent-text', '--mm-surface-muted'];
const OWN = ['clip-path', 'opacity', 'visibility', '--mm-tx-reink', ...ROLES.map((r) => `--mm-color-${r}`), ...DERIVED];
const TILT = 0.2;      // radians the front leans from square
const COLUMNS = 32;    // teeth along the front

const params = {
  inks: { type: 'enum(invert|accent)', default: 'invert', meaning: 'the second role set: invert swaps canvas and ink (and surface and muted); accent prints the scene on the accent in its ink' },
  side: { type: 'enum(left|right|top|bottom)', default: 'left', meaning: 'the frame edge each pull starts from' },
};

// Each role set maps a role to the role whose colour it takes; unnamed roles keep their own.
export const ROLE_SETS = {
  invert: { canvas: 'ink', ink: 'canvas', muted: 'surface', surface: 'muted', line: 'muted' },
  accent: { canvas: 'accent', ink: 'accentInk', muted: 'accentInk', line: 'accentInk', surface: 'ink', accent: 'ink', accentInk: 'accent' },
};
// What a copy of a section cannot show: pictures in the markup at mount, and the patterns that draw
// the scene on a canvas of their own once they run (besides every 3d/ pattern).
const PICTURES = 'canvas, video, [data-footage], .mm-screen';
export const PAINTERS = ['entrances/assemble', 'entrances/photo-wake', 'moves/depth-parallax'];
/** Whether the pattern named ref draws on a canvas of its own in the page. */
export const paints = (ref) => typeof ref === 'string' && (ref.startsWith('3d/') || PAINTERS.includes(ref));
const PAINTED = ['[data-fx^="3d/"]', ...PAINTERS.map((r) => `[data-fx="${r}"]`)].join(', ');
// Whether the scene holds, or will hold once its patterns run, pixels a copy cannot show: read from the
// markup at mount, its slots' patterns (data-fx) and its move (the kit's schedule).
function pictured(to, scene) {
  if (to.querySelector?.(`${PICTURES}, ${PAINTED}`)) return true;
  const scenes = to.ownerDocument?.defaultView?.mm?.schedule?.scenes;
  const id = scene ?? to.dataset?.scene;
  return Array.isArray(scenes) && paints(scenes.find((s) => s.id === id)?.move);
}
const DIRS = { left: [1, 0], right: [-1, 0], top: [0, 1], bottom: [0, -1] };

// A hash of two integers to [0, 1).
function hash(a, b) {
  let h = Math.imul(a + 3, 374761393) ^ Math.imul(b + 5, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * The pull at x (0..1 through one pull), in frame pixels: `behind` is the region the front has
 * passed and `ahead` the region it has not, each a polygon whose first points are the ragged front.
 */
export function front(W, H, x, side = 'left') {
  const [dx, dy] = DIRS[side] ?? DIRS.left;
  const c = Math.cos(TILT), s = Math.sin(TILT);
  const n = [dx * c - dy * s, dx * s + dy * c], tv = [-n[1], n[0]];
  const corners = [[-W / 2, -H / 2], [W / 2, -H / 2], [-W / 2, H / 2], [W / 2, H / 2]];
  const S = Math.max(...corners.map(([a, b]) => Math.abs(a * n[0] + b * n[1])));
  const T = Math.max(...corners.map(([a, b]) => Math.abs(a * tv[0] + b * tv[1])));
  const tail = 0.05 * Math.max(W, H);
  const f = -S - 1 + clamp01(x) * (2 * S + tail + 2);   // every tooth is outside the frame at 0 and at 1
  const at = (t, d) => [W / 2 + d * n[0] + t * tv[0], H / 2 + d * n[1] + t * tv[1]];
  const teeth = [];
  for (let j = 0; j < COLUMNS; j++) {
    const back = tail * (0.65 * hash(j, 1) + 0.35 * hash(j, 2));
    const t0 = -T - 1 + ((2 * T + 2) * j) / COLUMNS, t1 = -T - 1 + ((2 * T + 2) * (j + 1)) / COLUMNS;
    teeth.push(at(t0, f - back), at(t1, f - back));
  }
  const far = S + tail + 50;
  return {
    behind: [...teeth, at(T + 1, -far), at(-T - 1, -far)],
    ahead: [...teeth, at(T + 1, far), at(-T - 1, far)],
  };
}

const polygon = (pts) => `polygon(${pts.map(([x, y]) => `${r1(x)}px ${r1(y)}px`).join(', ')})`;

// The second role set as property values, read from the section's computed (unswapped) style.
function swapped(section, inks) {
  const view = section.ownerDocument?.defaultView ?? globalThis;
  const cs = view.getComputedStyle(section);
  const base = Object.fromEntries(ROLES.map((r) => [r, cs.getPropertyValue(`--mm-color-${r}`).trim()]));
  const map = ROLE_SETS[inks] ?? ROLE_SETS.invert;
  const out = {};
  for (const r of ROLES) if (base[map[r] ?? r]) out[`--mm-color-${r}`] = base[map[r] ?? r];
  for (const k of DERIVED) {
    const v = cs.getPropertyValue(k).trim();
    const role = v && ROLES.find((r) => base[r] === v);
    if (role && base[map[role] ?? role]) out[k] = base[map[role] ?? role];
  }
  return out;
}
function wear(el, props) {
  for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v);
  el.style.setProperty('--mm-tx-reink', '1');
}

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 're-ink',
  group: 'transitions',
  dur: 'slow',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    const from = ctx.from;
    clear(from); clear(to);
    if (p >= 1) return;
    const prm = { ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default])), ...ctx.params };
    const l = ctx.d > 0 && Number.isFinite(ctx.u) ? clamp01(ctx.u / ctx.d) : clamp01(p);
    const W = to.offsetWidth || 1, H = to.offsetHeight || 1;
    const hide = (el) => { if (el) { el.style.opacity = '0'; el.style.visibility = 'hidden'; } };
    if (pictured(to, ctx.scene)) {
      // a plate wipe: the plate covers the outgoing scene behind the front, then uncovers the incoming one
      hide(l < 0.5 ? to : from);
      if (!to.parentNode) return;
      const plate = to.ownerDocument.createElement('div');
      plate.className = 'mm-tx-reink-plate';
      plate.setAttribute('data-mm-overlay', '');
      plate.setAttribute('aria-hidden', 'true');
      plate.style.background = `var(--mm-color-${(ROLE_SETS[prm.inks] ?? ROLE_SETS.invert).canvas})`;
      plate.style.clipPath = polygon(l < 0.5 ? front(W, H, l / 0.5, prm.side).behind : front(W, H, (l - 0.5) / 0.5, prm.side).ahead);
      to.parentNode.insertBefore(plate, to.nextSibling);
      return;
    }
    const props = swapped(to, prm.inks);
    if (l < 0.5) {
      // first pull: the incoming scene, in the second role set, behind the front
      wear(to, props);
      to.style.clipPath = polygon(front(W, H, l / 0.5, prm.side).behind);
      return;
    }
    // second pull: the incoming scene as itself under a re-inked copy that the front strips away
    hide(from);
    const clip = polygon(front(W, H, (l - 0.5) / 0.5, prm.side).ahead);
    const lay = () => {
      if (!to.parentNode) return;
      const copy = to.cloneNode(true);
      copy.removeAttribute('data-scene');
      copy.setAttribute('data-mm-overlay', '');
      copy.setAttribute('aria-hidden', 'true');
      wear(copy, props);
      copy.style.clipPath = clip;
      to.parentNode.insertBefore(copy, to.nextSibling);
    };
    if (ctx.afterSettle) ctx.afterSettle(lay); else lay();
  },
};
