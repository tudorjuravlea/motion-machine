// Timeline geometry: time ↔ pixels, zoom, and snapping. Pure, browser-safe, no imports.
// A view is v = { pxPerS, scrollS = 0, padPx = 16 }: time scrollS sits padPx from the left edge.
// Zoom runs from "the whole piece fits" to 900 px/s (30 px a frame at 30 fps).

export const MAX_PX_PER_S = 900;

export const fitZoom = (duration, widthPx, padPx = 16) => (duration > 0 ? Math.max(1e-6, widthPx - 2 * padPx) / duration : MAX_PX_PER_S);

export function clampZoom(pxPerS, duration, widthPx) {
  const lo = Math.min(fitZoom(duration, widthPx), MAX_PX_PER_S);
  return Math.min(MAX_PX_PER_S, Math.max(lo, pxPerS));
}

export const timeToX = (t, { pxPerS, scrollS = 0, padPx = 16 }) => padPx + (t - scrollS) * pxPerS;
export const xToTime = (x, { pxPerS, scrollS = 0, padPx = 16 }) => scrollS + (x - padPx) / pxPerS;

// The time under anchorX stays under it, unless the scroll would pass either end of the piece.
// A non-finite factor (NaN, Infinity, undefined) leaves the view as it was.
export function zoomAt(v, factor, anchorX, { duration, widthPx }) {
  if (!Number.isFinite(factor)) return v;
  const padPx = v.padPx ?? 16;
  const t = xToTime(anchorX, v);
  const pxPerS = clampZoom(v.pxPerS * factor, duration, widthPx);
  const maxScroll = Math.max(0, duration - (widthPx - 2 * padPx) / pxPerS);
  const scrollS = Math.min(maxScroll, Math.max(0, t - (anchorX - padPx) / pxPerS));
  return { pxPerS, scrollS, padPx };
}

// Snap targets, by priority: playhead 0, music beat 1, scene edge 2, clip edge 3, frame 4. Each target
// is { t, kind, priority, source, edge? }: source is 'playhead', 'beat:<n>' (the n-th grid beat),
// 'scene:<index>:start|end', the clip's id (edge 'start'|'end'), or 'frame'.
// exclude, what is being dragged, so that a drag never snaps to its own echoes:
//   { clip }   a clip id or the clip: that clip, its cascade children, and the cue, move and screen clips
//              that play on its beat (clip.beat === its path).
//   { scene }  a scene index (or the scene): both its edges. With sceneEnd: true (dragging its end), its
//              end, and every target that moves with that end: the ends of its clips that end there
//              only because the scene does (no exit of their own), and every later scene and its clips.
// excludeClip is the older spelling of exclude.clip. fps must be > 0 for frame targets.
const sameT = (a, b) => Math.abs(a - b) < 1e-9;
export function snapTargets(model, { playhead, exclude = {}, excludeClip, fps = 30 } = {}) {
  const clips = model.lanes.flatMap((l) => l.clips);
  const want = exclude.clip ?? excludeClip;
  const skip = typeof want === 'string' ? want : want?.id;
  const dragged = skip == null ? null : clips.find((c) => c.id === skip) ?? (typeof want === 'object' ? want : null);
  const si = typeof exclude.scene === 'number' ? exclude.scene : exclude.scene?.index;
  const sc = si == null ? null : model.scenes[si];
  const endDrag = sc && exclude.sceneEnd === true;
  const later = (c) => endDrag && c.sceneStart >= sc.end - 1e-9 && c.sceneStart > sc.start + 1e-9;   // in a scene after the dragged one
  const out = [];
  if (typeof playhead === 'number') out.push({ t: playhead, kind: 'playhead', priority: 0, source: 'playhead' });
  (model.grid?.beats ?? []).forEach((t, n) => out.push({ t, kind: 'beat', priority: 1, source: `beat:${n}` }));
  model.scenes.forEach((s, i) => {
    if (sc && (endDrag ? i > si : i === si)) return;   // the dragged scene, or, dragging its end, every later one
    out.push({ t: s.start, kind: 'scene', priority: 2, source: `scene:${i}:start` });
    if (!(endDrag && i === si)) out.push({ t: s.end, kind: 'scene', priority: 2, source: `scene:${i}:end` });
  });
  for (const c of clips) {
    if (skip != null && (c.id === skip || c.parent === skip)) continue;
    if (dragged?.path != null && c.beat === dragged.path) continue;
    if (later(c)) continue;
    out.push({ t: c.start, kind: 'clip', priority: 3, source: c.id, edge: 'start' });
    const boundToEnd = endDrag && sameT(c.sceneStart, sc.start) && sameT(c.end, sc.end) && !c.segments?.exit;
    if (!boundToEnd) out.push({ t: c.end, kind: 'clip', priority: 3, source: c.id, edge: 'end' });
  }
  if (fps > 0 && Number.isFinite(fps) && Number.isFinite(model.duration)) {
    const frames = Math.floor(model.duration * fps + 1e-9);
    for (let k = 0; k <= frames; k++) out.push({ t: k / fps, kind: 'frame', priority: 4, source: 'frame' });
  }
  return out;
}

// The lowest priority value within radiusPx wins; ties go to the nearest. target is null when nothing is
// near, and when t, a target's t or pxPerS is missing or NaN (a NaN distance is never within the radius).
export function snap(t, targets, { pxPerS, radiusPx = 8 } = {}) {
  let best = null, bestDist = Infinity;
  for (const x of targets) {
    const dist = Math.abs(x.t - t) * pxPerS;
    if (!(dist <= radiusPx)) continue;
    if (!best || x.priority < best.priority || (x.priority === best.priority && dist < bestDist)) { best = x; bestDist = dist; }
  }
  return best ? { t: best.t, target: best } : { t, target: null };
}

// A moved span snaps by whichever edge has the better target: the lower priority value, then the
// nearer (the same rule as snap()). delta is what to add to both edges.
export function snapSpan(start, end, targets, opts) {
  const a = snap(start, targets, opts), b = snap(end, targets, opts);
  const da = a.target ? a.t - start : null, db = b.target ? b.t - end : null;
  if (da == null && db == null) return { delta: 0, target: null };
  if (db == null) return { delta: da, target: a.target };
  if (da == null) return { delta: db, target: b.target };
  const useA = a.target.priority < b.target.priority || (a.target.priority === b.target.priority && Math.abs(da) <= Math.abs(db));
  return useA ? { delta: da, target: a.target } : { delta: db, target: b.target };
}
