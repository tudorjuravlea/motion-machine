// Scene cuts in a recording, and what an edit does about them. Pure: frames in, seconds out.
//
// The measure is a colour difference between a frame and the one before it: each pixel of a small
// (SCAN_W x SCAN_H) copy is taken to hue, saturation and value, and the difference is the mean over the
// pixels of (hue distance x the lesser saturation + saturation distance + value distance) / 3: 0 for
// the same picture, 0.2 for red against blue, 0.3 for black against white (the hue of a grey is nothing,
// so it counts for nothing). A cut is a SPIKE in that series, not a high value in it: a frame whose
// difference is at least SPIKE_RATIO times the largest difference among the NEIGHBOURS frames either side
// and over MIN_DIFF, so a handheld shake (every frame different, none far above the next) is no cut. Two cuts closer
// than MIN_SCENE_S are one: the stronger stays, and no scene starts or ends in less than that either.
//
// An edit that removes a stretch leaves a join. When a scene change sits just beyond a join, a few
// frames of the other shot would show before it: `snapSpan` moves the cut's edge onto the scene change
// (the cut grows by those frames), unless a word is in the way: the edge never moves into a word, and
// the cut says so (`held`).

export const SCAN_W = 64;
export const SCAN_H = 64;
export const SPIKE_RATIO = 1.8;
export const MIN_SCENE_S = 0.5;
/** Frames either side whose largest difference a spike is measured against. */
export const NEIGHBOURS = 4;
/** A difference under this is never a cut, whatever it stands over: sensor noise on a still shot is 3x its neighbours now and then. */
export const MIN_DIFF = 0.04;
/** A scene change within this many seconds beyond a cut's edge would leave a sliver of the other shot. */
export const SLIVER_S = 0.25;
/** A snap never leaves a kept stretch shorter than this. */
export const MIN_KEPT_S = 0.1;

const r3 = (x) => Math.round(x * 1000) / 1000;

/** Hue (0 to 1), saturation and value of every pixel of an RGB frame (3 bytes a pixel). */
export function hsvOf(rgb) {
  const n = rgb.length / 3, h = new Float32Array(n), s = new Float32Array(n), v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgb[3 * i] / 255, g = rgb[3 * i + 1] / 255, b = rgb[3 * i + 2] / 255;
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    v[i] = max; s[i] = max ? d / max : 0;
    h[i] = !d ? 0 : (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
  }
  return { h, s, v };
}

/** The colour difference of two frames given as `hsvOf` results: 0 (the same) to 1. */
export function colourDifference(a, b) {
  const n = a.h.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const dh = Math.abs(a.h[i] - b.h[i]);
    sum += (Math.min(dh, 1 - dh) * 2 * Math.min(a.s[i], b.s[i]) + Math.abs(a.s[i] - b.s[i]) + Math.abs(a.v[i] - b.v[i])) / 3;
  }
  return n ? sum / n : 0;
}

/** diffs[i] is the difference between frame i - 1 and frame i (diffs[0] is 0), from RGB frames. */
export function differences(frames) {
  const out = new Float64Array(frames.length);
  let prev = null;
  frames.forEach((f, i) => { const cur = hsvOf(f); if (prev) out[i] = colourDifference(prev, cur); prev = cur; });
  return out;
}

/**
 * The scene cuts in a series of differences at `fps`: [{ at, frame, strength, ratio }], `at` the second
 * the new shot's first frame shows, `ratio` how many times its largest neighbour the difference stands (null: its neighbours are the same picture).
 */
export function sceneCuts(diffs, fps, { spike = SPIKE_RATIO, minSceneS = MIN_SCENE_S, neighbours = NEIGHBOURS, minDiff = MIN_DIFF } = {}) {
  const found = [];
  for (let i = 1; i < diffs.length; i++) {
    const d = diffs[i];
    if (d < minDiff) continue;
    let around = 0;
    for (let j = Math.max(1, i - neighbours); j <= Math.min(diffs.length - 1, i + neighbours); j++) if (j !== i) around = Math.max(around, diffs[j]);
    const ratio = around > 1e-9 ? d / around : Infinity;
    if (ratio >= spike) found.push({ at: i / fps, frame: i, strength: d, ratio });
  }
  // the strongest first; each must stand a minimum scene away from the ones kept, and from either end of the recording
  const end = diffs.length / fps, kept = [];
  for (const c of found.sort((a, b) => b.strength - a.strength || a.frame - b.frame)) {
    if (c.at < minSceneS - 1e-9 || end - c.at < minSceneS - 1e-9) continue;
    if (kept.every((k) => Math.abs(k.at - c.at) >= minSceneS - 1e-9)) kept.push(c);
  }
  return kept.sort((a, b) => a.at - b.at).map((c) => ({ at: r3(c.at), frame: c.frame, strength: r3(c.strength), ratio: Number.isFinite(c.ratio) ? r3(c.ratio) : null }));
}

/** The scenes between the cuts of a recording of `duration` seconds: [{ start, end }]. */
export function scenesOf(cuts, duration) {
  const edges = [0, ...cuts.map((c) => c.at), duration];
  return edges.slice(0, -1).map((a, i) => ({ start: r3(a), end: r3(edges[i + 1]) }));
}

/** The scene-change seconds of a parsed scenes file, on another clock (`shift` is added to each), sorted; exit 2 for a shape that is no scenes file. */
export function sceneTimes(doc, shift = 0) {
  const list = Array.isArray(doc?.cuts) ? doc.cuts : null;
  if (!list || !list.every((c) => Number.isFinite(c?.at))) throw Object.assign(new Error('the scenes file must be { "cuts": [ { "at": seconds } ] } (from mm footage scenes)'), { exitCode: 2 });
  return list.map((c) => c.at + shift).sort((a, b) => a - b);
}

/**
 * A cut { start, end } (seconds) and the scene changes `scenes` (seconds, same clock): each edge that would
 * leave a sliver of the other shot (a scene change within SLIVER_S past the edge, on the kept side) moves
 * onto the scene change, unless a word of `words` lies between the edge and the scene change, or the move would
 * pass `floor` (before the cut) or `ceil` (after it): the kept stretch is never shortened to nothing.
 * Returns { start, end, snapped: [{ edge, from, to }], held: [{ edge, scene, word }] }.
 */
export function snapSpan(span, scenes, words = [], { floor = -Infinity, ceil = Infinity } = {}) {
  let { start, end } = span;
  const snapped = [], held = [];
  const wordIn = (a, b) => words.find((w) => w.start < b - 1e-9 && w.end > a + 1e-9);
  for (const t of scenes) {
    // the kept side before the cut ends at `start`: a scene change just before it leaves a sliver of the new shot
    if (t < start - 1e-3 && start - t < SLIVER_S && t > floor) {
      const w = wordIn(t, start);
      if (w) held.push({ edge: 'start', scene: r3(t), word: w.text }); else { snapped.push({ edge: 'start', from: r3(start), to: r3(t) }); start = t; }
    }
    // the kept side after the cut begins at `end`: a scene change just after it leaves a sliver of the old shot
    if (t > end + 1e-3 && t - end < SLIVER_S && t < ceil) {
      const w = wordIn(end, t);
      if (w) held.push({ edge: 'end', scene: r3(t), word: w.text }); else { snapped.push({ edge: 'end', from: r3(end), to: r3(t) }); end = t; }
    }
  }
  return { start, end, snapped, held };
}

/**
 * Kept ranges [{ s, e }] with each join (the gap between two ranges) snapped to the scene changes:
 * { ranges, snapped, held }, each entry also saying `at`, the second the join was at before.
 */
export function snapRanges(ranges, scenes, words = []) {
  const out = ranges.map((r) => ({ ...r })), snapped = [], held = [];
  for (let i = 0; i + 1 < out.length; i++) {
    const r = snapSpan({ start: out[i].e, end: out[i + 1].s }, scenes, words, { floor: out[i].s + MIN_KEPT_S, ceil: out[i + 1].e - MIN_KEPT_S });
    for (const x of r.snapped) snapped.push({ ...x, at: r3(out[i].e) });
    for (const x of r.held) held.push({ ...x, at: r3(out[i].e) });
    out[i].e = r.start; out[i + 1].s = r.end;
  }
  return { ranges: out, snapped, held };
}
