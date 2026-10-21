// Timeline gestures, each one edit op: drag a beat clip → beat.at; drag its
// tail → beat.out; drag a scene's right edge → scene.duration; drag a scene in the scenes row →
// scene.order. A press only selects; a drag starts after 3 px. Snapping is on unless Alt is held (or
// snap is off), against the targets of the model as it was when the drag began (geometry.snapTargets,
// which leaves out what is being dragged); a value that snaps to nothing lands on the 30 fps frame grid
//. A drag stopped by a bound says so in the guide: a beat's entrance must finish inside
// its scene, and a scene end stops at its W-READ floor (unless Alt is held), then at its last beat.
// Escape cancels with no edit. The pointer is followed on window, so the rows may be rebuilt under it
// while the preview redraws. The bounds are shared with the keyboard edits in app.js.
import { roundTime } from '../ops.js';
import { snap, snapSpan, snapTargets } from '../geometry.js';
import { FPS } from './transport.js';

const THRESHOLD_PX = 3;
const FRAME_SNAP = 4;   // frame targets snap silently; the guide line is drawn for the others

/** The raw beat a model path names: '/scenes/i/beats/j' or '/scenes/i/variants/f/beats/j'. */
export function rawAt(story, path) {
  let v = story;
  for (const k of path.split('/').slice(1)) v = v?.[k.replace(/~1/g, '/').replace(/~0/g, '~')];
  return v;
}
const beatIndex = (path) => Number(path.split('/').pop());
const sceneIndexOf = (path) => Number(path.split('/')[2]);
const down = (t) => Math.floor(t * 100 + 1e-6) / 100;

/** The nearest frame of the 30 fps grid, written to 0.01 s as every time is. */
export const onFrame = (t) => roundTime(Math.round(t * FPS) / FPS);
/** `t` moved by `n` whole frames, from the frame it is nearest. */
export const frameStep = (t, n) => roundTime((Math.round(t * FPS) + n) / FPS);

/** Where a beat's `at` may go: from 0 until its entrance (enterD s) still finishes in the scene, and before its out. */
export function atBounds(beat, sc, enterD) {
  const hi = Math.max(0, down(Math.min(sc.duration - Math.max(enterD, 0.01), beat.out != null ? beat.out - 0.01 : Infinity)));
  return { lo: 0, hi, byOut: beat.out != null && beat.out - 0.01 <= sc.duration - Math.max(enterD, 0.01) };
}

/** Where a beat's `out` may go: after its at, up to the scene end. */
export const outBounds = (beat, sc) => ({ lo: roundTime(beat.at + 0.01), hi: sc.duration });

/** The shortest a scene may be: past its last arrival and at least its last out, in every format (the rule ops.js checks). */
export function minDuration(sc) {
  const beats = [sc.beats ?? [], ...Object.values(sc.variants ?? {}).map((v) => v.beats ?? [])].flat();
  const lastAt = Math.max(0, ...beats.map((b) => b.at));
  const lastOut = Math.max(0, ...beats.map((b) => b.out ?? 0));
  return roundTime(Math.max(lastAt + 0.01, lastOut, 0.01));
}

export function createGestures({ timeAt, getView, context, onPreview, onCommit, onSelect, guide, insert, dragging }) {
  let g = null;

  function begin(e, spec) {
    if (e.button !== 0) return;
    const ctx = context();
    if (ctx.readOnly || g) return;
    g = { ...spec, ctx, x0: e.clientX, moved: false, edit: null, targets: null };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
  }

  function end() {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', key, true);
    guide(null); insert(null); dragging(false);
    g = null;
  }

  function key(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); } }

  function cancel() {
    if (!g) return;
    const was = g.moved;
    end();
    if (was) onPreview(null);
  }

  function up() {
    if (!g) return;
    const { moved, edit, label } = g;
    end();
    if (moved && edit) onCommit(edit, label);
    else if (moved) onPreview(null);
  }

  function move(e) {
    if (!g) return;
    if (!g.moved && Math.abs(e.clientX - g.x0) < THRESHOLD_PX) return;
    if (!g.moved) { g.moved = true; dragging(true); }
    const { pxPerS } = getView();
    const dt = (e.clientX - g.x0) / pxPerS;
    const snapping = g.ctx.snap && !e.altKey;
    const r = g.step(dt, { snapping, pxPerS, clientX: e.clientX, alt: e.altKey });
    g.edit = r.edit;
    g.label = r.label;
    guide(r.target && r.target.priority < FRAME_SNAP ? r.target : null);
    if (g.kind === 'order') insert(r.insertAt ?? null);
    onPreview(r.edit);
  }

  const targets = (opts) => (g.targets ??= snapTargets(g.ctx.model, { playhead: g.ctx.playhead, ...opts }));
  /** A bound that stopped the drag, drawn as a guide with its name. */
  const clamp = (t, label) => ({ kind: 'clamp', t, label, source: 'clamp', priority: 0 });

  return {
    get active() { return !!g?.moved; },
    cancel,

    clipDown(e, c) {
      onSelect(c.path, { from: 'pointer' });
      if (!c.editable.at) return;
      const { story, format } = context();
      const beat = rawAt(story, c.path), sc = story.scenes[sceneIndexOf(c.path)];
      if (!beat || !sc) return;
      const d = c.segments.enter[1] - c.segments.enter[0];
      const { hi, byOut } = atBounds(beat, sc, d);
      begin(e, {
        kind: 'at',
        step(dt, { snapping, pxPerS }) {
          let start = c.start + dt, target = null;
          if (snapping) { const s = snapSpan(start, start + d, targets({ exclude: { clip: c.id } }), { pxPerS }); start += s.delta; target = s.target; }
          const raw = beat.at + (start - c.start);
          const want = target ? roundTime(raw) : onFrame(raw);
          const at = roundTime(Math.min(hi, Math.max(0, want)));
          if (at !== want) target = at === hi ? clamp(c.sceneStart + at + (byOut ? 0 : d), byOut ? 'its out' : 'scene end') : clamp(c.sceneStart, 'scene start');
          return { edit: at === beat.at ? null : { op: 'beat.at', scene: sc.id, beat: beatIndex(c.path), value: at, format }, target, label: `move ${c.label} to ${at} s` };
        },
      });
    },

    tailDown(e, c) {
      e.stopPropagation();
      onSelect(c.path, { from: 'pointer' });
      const { story, format } = context();
      const beat = rawAt(story, c.path), sc = story.scenes[sceneIndexOf(c.path)];
      if (!beat || !sc) return;
      const h0 = c.segments.exit ? c.segments.exit[0] : c.end;
      begin(e, {
        kind: 'out',
        step(dt, { snapping, pxPerS }) {
          let t = h0 + dt, target = null;
          if (snapping) { const s = snap(t, targets({ exclude: { clip: c.id } }), { pxPerS }); t = s.t; target = s.target; }
          const want = target ? roundTime(t - c.sceneStart) : onFrame(t - c.sceneStart);
          const { lo, hi } = outBounds(beat, sc);
          const out = roundTime(Math.min(hi, Math.max(lo, want)));
          if (out !== want) target = out === hi ? clamp(c.sceneStart + hi, 'scene end') : clamp(c.sceneStart + lo, 'its at');
          const same = beat.out != null ? out === beat.out : out >= sc.duration;
          return { edit: same ? null : { op: 'beat.out', scene: sc.id, beat: beatIndex(c.path), value: out, format }, target, label: `${c.label} leaves at ${out} s` };
        },
      });
    },

    sceneEndDown(e, s) {
      e.stopPropagation();
      onSelect(s.path, { from: 'pointer' });
      const { story } = context();
      const sc = story.scenes[s.index], lo = minDuration(sc);
      // the W-READ floor stops the drag first, when the scene is not already under it
      const floor = context().floors?.scenes?.find((f) => f.id === s.id)?.minDuration;
      const readLo = floor != null && floor <= sc.duration + 1e-9 && floor > lo ? roundTime(floor) : null;
      begin(e, {
        kind: 'duration',
        step(dt, { snapping, pxPerS, alt }) {
          let t = s.end + dt, target = null;
          if (snapping) { const r = snap(t, targets({ exclude: { scene: s.index, sceneEnd: true } }), { pxPerS }); t = r.t; target = r.target; }
          const want = target ? roundTime(sc.duration + (t - s.end)) : onFrame(sc.duration + (t - s.end));
          const floorLo = !alt && readLo != null ? readLo : lo;
          const d = roundTime(Math.min(60, Math.max(floorLo, want)));
          if (d !== want) target = clamp(s.start + d, d === 60 ? 'at most 60 s' : d === readLo && !alt ? 'W-READ floor (Alt: past it)' : 'last beat');
          return { edit: d === sc.duration ? null : { op: 'scene.duration', scene: sc.id, value: d }, target, label: `${sc.id} lasts ${d} s` };
        },
      });
    },

    sceneDown(e, s) {
      onSelect(s.path, { from: 'pointer' });
      if (!s.editable.order) return;
      const { model } = context();
      begin(e, {
        kind: 'order',
        step(dt, { clientX }) {
          const t = timeAt(clientX);
          const others = model.scenes.filter((x) => x.index !== s.index);
          const index = others.filter((x) => (x.start + x.end) / 2 < t).length;
          const insertAt = index >= others.length ? others[others.length - 1]?.end : others[index].start;
          return { edit: index === s.index ? null : { op: 'scene.order', scene: s.id, index }, insertAt, target: null, label: `move ${s.id} to position ${index + 1}` };
        },
      });
    },

    scrubDown(e) {
      if (e.button !== 0) return;
      e.preventDefault();
      const seek = (ev) => context().seek(Math.max(0, timeAt(ev.clientX)));
      seek(e);
      const stop = () => { window.removeEventListener('pointermove', seek); window.removeEventListener('pointerup', stop); };
      window.addEventListener('pointermove', seek);
      window.addEventListener('pointerup', stop);
    },
  };
}
