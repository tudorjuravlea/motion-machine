// lens.js: a lens's colour fringe, drawn only in palette roles. A lens parts the colours of an edge
// the more the nearer it lies to the frame's rim and not at all at the middle. Here the picture is
// not split into its colour planes (that would show reds and cyans no brand owns): what is drawn is
// two ghosts of everything on the canvas, one pulled outward and one pulled inward by a radial
// displacement, each flooded in a palette role and laid over the picture only where the ghost has more
// of a shape than the picture does (the ghost less the picture, so with no displacement nothing is
// drawn). The fringe is an edge of role colour along each shape, wider the nearer the rim.
// The displacement is a ramp image (red = the way across, green = the way down) made once on a canvas,
// so it is the same bytes in every page and every render; no random, no clock. Shared by the brand
// finish (`chroma`, a filter on the stage) and by `transitions/impact` (a fringe that peaks at the
// cut, a filter on one scene).

/** The pixels on a side of the ramp image: the filter stretches it over the frame. */
export const RAMP_SIZE = 128;
/** How much of its colour a ghost lays over bare canvas, 0 to 1. */
export const GHOST = 0.75;
/**
 * What the fringe counts as a shape: the picture's mean distance from the canvas, per channel, over FLOOR,
 * stretched by MASK. The finish's own layers (grain, halftone, scanlines, paper) lie at 0.08 at most, so
 * they stay under the floor and are not ghosted; type, strokes and fills of any contrast are over it.
 */
const FLOOR = 0.12, MASK = 1;

let ramp = null;

/** The ramp as a PNG data URL, or null where there is no canvas (Node). Made once. */
export function rampUrl() {
  if (ramp) return ramp;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = RAMP_SIZE;
  const g = c.getContext('2d');
  const img = g.createImageData(RAMP_SIZE, RAMP_SIZE);
  for (let y = 0; y < RAMP_SIZE; y++) for (let x = 0; x < RAMP_SIZE; x++) {
    const i = (y * RAMP_SIZE + x) * 4;
    img.data[i] = Math.round((255 * (x + 0.5)) / RAMP_SIZE);
    img.data[i + 1] = Math.round((255 * (y + 0.5)) / RAMP_SIZE);
    img.data[i + 2] = 0;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  ramp = c.toDataURL('image/png');
  return ramp;
}

/** Resolves once the ramp image is decoded, so a filter that reads it draws the fringe on its first frame. */
export function warmRamp() {
  const url = rampUrl();
  if (!url || typeof Image === 'undefined') return Promise.resolve();
  const img = new Image();
  img.src = url;
  return img.decode().catch(() => {});
}

const r3 = (x) => String(Math.round(x * 1000) / 1000);
const rgbOf = (hex) => { const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255); };

/**
 * Filter primitives (a string) that lay a fringe over `input`: `a` is how far the two ghosts lie
 * apart at the frame's edge, in px of the page, over a frame of w x h px; `canvas` is the ground's
 * hex (what counts as bare), `outer` and `inner` the hex of the ghost pulled toward the rim and of the
 * one pulled toward the middle; `href` is the ramp's URL; `id` prefixes the result names so two
 * fringes can share a filter. The last result is named `result`.
 */
export function fringePrimitives({ id = 'mm-lens', input = 'SourceGraphic', result = `${id}-out`, a, w, h, href, canvas, outer, inner }) {
  const cv = rgbOf(canvas);
  const fn = (sign) => ['R', 'G', 'B'].map((ch, k) => `<feFunc${ch} type="linear" slope="${sign}" intercept="${r3(-sign * cv[k])}"/>`).join('');   // sign 1: the picture over the canvas, -1: under it
  const ghost = (name, scale, hex) => `<feDisplacementMap in="${id}-m" in2="${id}-map" scale="${r3(scale)}" xChannelSelector="R" yChannelSelector="G" result="${id}-${name}"/>`
    + `<feComposite in="${id}-${name}" in2="${id}-m" operator="arithmetic" k1="0" k2="1" k3="-1" k4="0" result="${id}-${name}-edge"/>`
    + `<feComponentTransfer in="${id}-${name}-edge" result="${id}-${name}-soft"><feFuncA type="linear" slope="${GHOST}" intercept="0"/></feComponentTransfer>`
    + `<feFlood flood-color="${hex}" result="${id}-${name}-ink"/>`
    + `<feComposite in="${id}-${name}-ink" in2="${id}-${name}-soft" operator="in" result="${id}-${name}-col"/>`;
  return `<feImage href="${href}" x="0" y="0" width="${r3(w)}" height="${r3(h)}" preserveAspectRatio="none" result="${id}-map"/>`
    // everything on the canvas: the picture's distance from the canvas colour, up and down, as an alpha
    + `<feComponentTransfer in="${input}" result="${id}-up">${fn(1)}</feComponentTransfer>`
    + `<feComponentTransfer in="${input}" result="${id}-dn">${fn(-1)}</feComponentTransfer>`
    + `<feComposite in="${id}-up" in2="${id}-dn" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="${id}-d"/>`
    + `<feColorMatrix in="${id}-d" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${r3(MASK)} ${r3(MASK)} ${r3(MASK)} 0 ${r3(-MASK * 3 * FLOOR)}" result="${id}-m"/>`
    + ghost('o', -a, outer) + ghost('i', a, inner)
    + `<feMerge result="${result}"><feMergeNode in="${input}"/><feMergeNode in="${id}-o-col"/><feMergeNode in="${id}-i-col"/></feMerge>`;
}

/**
 * A node to append to the stage (marked `data-mm-overlay`, so the kit removes it on every seek) that
 * holds one filter named `id`: a fringe of `a` px (see fringePrimitives) over a frame of w x h px, in
 * the palette hexes `canvas`, `outer` and `inner`. A scene wears it with `filter: url(#id)`. Null
 * where there is no document.
 */
export function fringeNode(doc, { id, a, w, h, canvas, outer, inner }) {
  const href = rampUrl();
  if (!doc || !href) return null;
  const holder = doc.createElement('div');
  // parsed as HTML so the SVG namespace needs no URL in the runtime (SPEC §2.6)
  holder.innerHTML = '<svg aria-hidden="true" width="0" height="0" style="position:absolute" data-mm-overlay></svg>';
  const svg = holder.firstElementChild;
  svg.innerHTML = `<filter id="${id}" x="0" y="0" width="${r3(w)}" height="${r3(h)}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">`
    + `${fringePrimitives({ id: `${id}-c`, a, w, h, href, canvas, outer, inner, result: `${id}-end` })}</filter>`;
  return svg;
}
