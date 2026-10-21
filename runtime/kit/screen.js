// The screen fold. What a device screen shows at t is a fold over its beat's
// `screen` actions in start order: each action is a pattern in patterns/screen/ whose
// reduce(state, p, ctx) returns the next state at its own progress p, so a later action always
// continues from wherever the earlier ones left the screen, in any seek order. The pure half
// (initialState, fold, frameIndex, locate) runs in Node for the tests; the DOM half (mountLayer,
// paint) draws one screen layer the kit owns, rewriting everything it owns on every seek.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * The content a beat's asset names: a still picture, a frame sequence or a captured page (a folder whose
 * media.json says `kind: sequence` or `kind: page`).
 * @param {string} asset @param {object|null} meta media.json, null for a still
 */
export function initialState(asset, meta) {
  const kind = meta?.kind === 'sequence' || meta?.kind === 'page' ? meta.kind : 'still';
  return { content: { kind, base: asset, meta: meta ?? null }, frameTime: 0, scrollY: 0, zoom: { x: 0.5, y: 0.5, s: 1 }, swapping: [] };
}

/**
 * @param {object} initial  initialState(...)
 * @param {{ action: object, module: { reduce: Function }, start: number, d: number }[]} timed  in start order
 * @param {number} t  film seconds, or a deck's fractional press
 * @param {(entry: object) => object} ctxOf  the reduce context for an entry (params, ease, …)
 * @returns {{ state: object, active: object[] }}  active: the entries still under way, each with its p
 */
export function fold(initial, timed, t, ctxOf) {
  let state = initial;
  const active = [], started = new Set(), held = new Set();
  for (const e of timed) {
    if (t < e.start) {
      // a module that holdsBefore (screen/play) shows its p = 0 state until it starts, unless an
      // earlier action of the same kind already runs: the picture never jumps when it begins
      if (e.module.holdsBefore && !started.has(e.action.do) && !held.has(e.action.do)) {
        state = e.module.reduce(state, 0, ctxOf(e));
        held.add(e.action.do);
      }
      continue;
    }
    started.add(e.action.do);
    const p = e.d > 0 ? clamp01((t - e.start) / e.d) : 1;
    state = e.module.reduce(state, p, ctxOf(e));
    if (p > 0 && p < 1) active.push({ ...e, p });   // under way: not before its first instant, not once done
  }
  return { state, active };
}

/** The 1-based frame of a sequence at state.frameTime, held at the first and last frames. */
export function frameIndex(state) {
  const m = state.content.meta;
  const i = Math.floor(state.frameTime * m.fps + 1e-6) + 1;
  return Math.min(m.frames, Math.max(1, i));
}

/**
 * where a captured page's overlay (a fixed or sticky element) sits in viewport css px at a
 * scroll: a fixed one never moves; a sticky one scrolls with the page until it reaches its top.
 */
export function overlayY(o, scrollY) {
  return o.position === 'sticky' ? Math.max(o.top ?? 0, o.y - scrollY) : o.y;
}

/**
 * The zoom as drawn: a push-in on the screen's own picture, so its centre is clamped to keep the view
 * inside the screen (what lay above the visible page, or behind a pinned header, never shows).
 */
export function view(z) {
  const s = Math.max(1, z.s), m = 0.5 / s;
  const c = (v) => Math.min(1 - m, Math.max(m, v));
  return { x: c(z.x), y: c(z.y), s };
}

/**
 * Where a target sits on the screen, as fractions of the screen box (0..1 each way), under the
 * current scroll and zoom. A target is a mark label from media.json or "x%,y%" of the screen.
 */
export function locate(state, target, box) {
  let x, y;
  const pct = /^\s*(-?\d+(?:\.\d+)?)%\s*,\s*(-?\d+(?:\.\d+)?)%\s*$/.exec(String(target));
  if (pct) { x = Number(pct[1]) / 100; y = Number(pct[2]) / 100; } else {
    const meta = state.content.meta;
    const m = meta?.marks?.[target];
    if (!m) return { x: 0.5, y: 0.5 };   // an unknown mark fails G-PATTERN-REF statically; drawing never throws
    const k = box.w / meta.viewport.w;
    const o = m.overlay != null ? meta.overlays?.[m.overlay] : null;   // a pinned mark stays in viewport coordinates
    x = ((m.x + m.w / 2) * k) / box.w;
    y = ((o ? overlayY(o, state.scrollY) + m.y - o.y : m.y - state.scrollY) + m.h / 2) * k / box.h;
  }
  const z = view(state.zoom);
  return { x: 0.5 + z.s * (x - z.x), y: 0.5 + z.s * (y - z.y) };
}

// ---------------------------------------------------------------------------------------------
// DOM

function contentEl(doc, asset, meta) {
  const el = doc.createElement('div');
  el.className = 'mm-screen__content';
  if (meta?.kind === 'page') {
    for (const t of meta.tiles) {
      const img = doc.createElement('img');
      img.className = 'mm-screen__tile'; img.alt = ''; img.decoding = 'sync';
      img.dataset.src = asset + t.file;   // given a src only while it overlaps the visible window (placeContent)
      el.append(img);
    }
    for (const o of meta.overlays ?? []) {   // drawn over the tiles, pinned (placeContent)
      const img = doc.createElement('img');
      img.className = 'mm-screen__overlay'; img.alt = ''; img.decoding = 'sync';
      img.setAttribute('src', asset + o.file);
      el.append(img);
    }
  } else {
    const img = doc.createElement('img');
    img.className = 'mm-screen__media'; img.alt = ''; img.decoding = 'sync';
    if (meta?.kind !== 'sequence') img.setAttribute('src', asset);
    el.append(img);
  }
  return el;
}

/**
 * Builds the layer inside the screen element: the content, one content per swap target, and one
 * overlay per action that draws. `data-mm-own` tells the kit's snapshot to leave its markup alone.
 * @returns {HTMLElement}
 */
export function mountLayer(screenEl, initial, swaps, actions) {
  const doc = screenEl.ownerDocument;
  const layer = doc.createElement('div');
  layer.className = 'mm-screen';
  layer.setAttribute('data-mm-own', '');
  layer.setAttribute('data-media', '');
  if (initial.content.base) {
    const first = contentEl(doc, initial.content.base, initial.content.meta);
    first.dataset.asset = initial.content.base;
    layer.append(first);
  } else layer.classList.add('mm-screen--bare');   // no asset: the device keeps its own screen; only overlays and paint() draw
  for (const [asset, meta] of swaps) {
    if (asset === initial.content.base) continue;
    const c = contentEl(doc, asset, meta);
    c.dataset.asset = asset;
    layer.append(c);
  }
  actions.forEach((a, i) => {
    const fx = doc.createElement('div');
    fx.className = 'mm-screen-fx';
    fx.dataset.do = a.do;
    fx.dataset.i = String(i);
    layer.append(fx);
  });
  screenEl.append(layer);
  return layer;
}

function placeContent(el, content, state, box, track, warn) {
  const meta = content.meta;
  if (meta?.kind === 'page') {
    const k = box.w / meta.viewport.w;
    const maxY = Math.max(0, meta.height - box.h / k);
    const y = Math.min(maxY, Math.max(0, state.scrollY));
    el.querySelectorAll('.mm-screen__tile').forEach((img, i) => {
      const t = meta.tiles[i];
      // whole device pixels at the tile edges, so two tiles never leave a gap or a double row
      const top = Math.round((t.y - y) * k);
      const bottom = Math.round((t.y + t.h - y) * k);
      img.style.cssText = `top:${top}px;height:${bottom - top}px;width:${box.w}px;`;
      // only a tile that overlaps the screen is decoded, and settle() waits for it
      if (bottom > 0 && top < box.h) {
        if (img.getAttribute('src') !== img.dataset.src) { img.setAttribute('src', img.dataset.src); track(img.decode().catch(() => warn?.(img.dataset.src))); }
      } else if (img.hasAttribute('src')) img.removeAttribute('src');
    });
    el.querySelectorAll('.mm-screen__overlay').forEach((img, i) => {
      const o = meta.overlays[i];
      const top = Math.round(overlayY(o, y) * k);
      img.style.cssText = `left:${Math.round(o.x * k)}px;top:${top}px;width:${Math.round(o.w * k)}px;height:${Math.round(o.h * k)}px;`;
    });
    return;
  }
  const img = el.querySelector('.mm-screen__media');
  if (meta?.kind === 'sequence') {
    const src = `${content.base}f${String(frameIndex({ ...state, content })).padStart(5, '0')}.jpg`;
    if (img.getAttribute('src') !== src) { img.setAttribute('src', src); track(img.decode().catch(() => warn?.(src))); }
  }
}

/**
 * Draws the state: the current content (scrolled, at its frame, zoomed) and, during a screen/swap,
 * the incoming content sliding or fading in over it. Swaps that overlap stack in start order:
 * each later one arrives over the earlier ones, and a sliding one pushes the layer under it left. Overlays are hidden here; the kit then calls
 * each active action's draw() on its overlay.
 * @param {HTMLElement} layer @param {object} state @param {{ track: Function, box: { w: number, h: number }, swaps: Map, warn?: (src: string) => void }} o
 */
export function paint(layer, state, { track, box, swaps, warn }) {
  const z = view(state.zoom);
  const zoom = `translate(${box.w / 2 - z.s * z.x * box.w}px, ${box.h / 2 - z.s * z.y * box.h}px) scale(${z.s})`;
  const cur = state.content.base ?? '';
  const sw = (state.swapping ?? []).filter((x) => x.p > 0 && x.p < 1);
  const push = (k) => (sw[k]?.how === 'slide' ? `translateX(${-0.3 * sw[k].p * box.w}px) ` : '');   // the layer under a sliding swap
  for (const el of layer.querySelectorAll(':scope > .mm-screen__content')) {
    const asset = el.dataset.asset;
    const k = sw.findLastIndex((x) => x.to === asset);
    if (asset === cur && k < 0) {
      el.style.cssText = `transform:${push(0)}${zoom};`;
      placeContent(el, state.content, state, box, track, warn);
    } else if (k >= 0) {
      const x = sw[k], under = push(k + 1);
      const content = { kind: swaps.get(asset)?.kind ?? 'still', base: asset, meta: swaps.get(asset) ?? null };
      el.style.cssText = x.how === 'slide' ? `transform:${under}translateX(${(1 - x.p) * box.w}px);z-index:${k + 1};`
        : `${under ? `transform:${under.trim()};` : ''}opacity:${Math.round(x.p * 1000) / 1000};z-index:${k + 1};`;
      placeContent(el, content, { ...state, content, scrollY: 0, frameTime: 0, zoom: { x: 0.5, y: 0.5, s: 1 } }, box, track, warn);
    } else if (state.compare && asset === state.compare.to && state.compare.x < 1) {
      // screen/compare: the revealed content right of the line, on the action's own clock;
      // data-clip tells a 3D device's texture where the cut is (it does not read clip-path)
      const c = state.compare, content = { kind: swaps.get(asset)?.kind ?? 'still', base: asset, meta: swaps.get(asset) ?? null };
      el.style.cssText = `clip-path:inset(0 0 0 ${Math.round(c.x * 1e4) / 100}%);z-index:${sw.length + 1};`;
      el.dataset.clip = String(c.x);
      placeContent(el, content, { ...state, content, scrollY: 0, frameTime: c.time, zoom: { x: 0.5, y: 0.5, s: 1 } }, box, track, warn);
      continue;
    } else el.style.cssText = 'visibility:hidden;';
    delete el.dataset.clip;
  }
  for (const fx of layer.querySelectorAll(':scope > .mm-screen-fx')) fx.style.cssText = 'display:none;';
}
