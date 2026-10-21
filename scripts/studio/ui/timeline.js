// The timeline (design sketch): a ruler, the scenes row with its cut wedges, one lane per slot
// name, cues, moves, the music grid and the gate lane, drawn from the timeline model
// (scripts/studio/model.js) with scripts/studio/geometry.js. render() rebuilds the rows; the playhead,
// the marks and the snap guide are moved imperatively and never rebuild anything. The ruler and the
// scenes row stick to the top and the gate row to the bottom while the lanes scroll. Zoom is
// pixels per second, Ctrl/⌘ + wheel anchored under the pointer; it follows the window ("fit") until the
// first edit or the first manual zoom pins it.
//
// Keyboard: the timeline is one Tab stop. Its items (scene blocks and beat clips) carry a roving
// tabindex; ←/→ move to the previous or next item of the row, ↑/↓ to the nearest item of the row above
// or below, and the selection follows the focus. The edit keys on an item live in app.js.
import { clampZoom, fitZoom, zoomAt } from '../geometry.js';
import { createGestures } from './gestures.js';
import { fixed, h } from './dom.js';

export const LABEL_W = 120;
export const PAD = 16;
const END_PAD = 40;   // room after the end of the piece for the last ruler label
const ITEM = '[data-clip], [data-scene-block]';

const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60];

/** Where a piece of gate evidence sits on the timeline: its instant, else the scene end or the beat landing its selector names. */
export function markTime(model, { instant, selector, id } = {}) {
  if (typeof instant === 'number') return instant;
  if (selector) {
    const sc = /^\[data-scene="([^"]+)"\]$/.exec(selector);
    if (sc) { const s = model.scenes.find((x) => x.id === sc[1]); if (s) return s.end; }
    const c = model.lanes.flatMap((l) => l.clips).find((x) => x.selector === selector && !x.parent);
    if (c) return c.segments.enter[1];
  }
  return id === 'G-LENGTH' ? model.duration : null;
}

/** The marks of the verdicts that do not pass: one per piece of evidence. */
function placeVerdicts(rows, model) {
  const marks = [];
  for (const r of rows) {
    if (r.status !== 'FAIL' && r.status !== 'WARN') continue;
    const ev = r.evidence ?? {};
    for (const e of Array.isArray(ev.all) && ev.all.length ? ev.all : [ev]) {
      const selector = e.selector ?? ev.selector ?? null;
      const t = markTime(model, { instant: e.instant, selector, id: r.id }) ?? 0;
      marks.push({ id: r.id, status: r.status, t, selector, reason: e.reason ?? ev.reason ?? r.id });
    }
  }
  return marks;
}

export function createTimeline(root, hooks) {
  const scroll = root.querySelector('.tl-scroll');
  let content = null, playheadEl = null, guideEl = null, marksEl = null, insertEl = null, segs = [];
  let data = null, pxPerS = 100, pinned = false, lastT = 0, guideAt = null, insertAt = null;
  let current = null, restoring = false;   // the roving item's key ('beat:0.1' or 'scene:2')

  const trackViewW = () => Math.max(80, scroll.clientWidth - LABEL_W);
  const fitW = () => Math.max(80, trackViewW() - (END_PAD - PAD));
  const x = (t) => PAD + t * pxPerS;
  const view = () => ({ pxPerS, scrollS: scroll.scrollLeft / pxPerS, padPx: PAD });
  /** The time under a clientX. */
  const timeAt = (clientX) => (clientX - scroll.getBoundingClientRect().left - LABEL_W + scroll.scrollLeft - PAD) / pxPerS;

  function fit() {
    if (!data) return;
    pxPerS = clampZoom(fitZoom(data.model.duration, fitW(), PAD), data.model.duration, fitW());
  }

  const gestures = createGestures({
    timeAt, getView: () => ({ pxPerS }),
    context: () => ({ ...hooks.context(), model: data.model, floors: data.floors }),
    onPreview: hooks.onPreview, onCommit: hooks.onCommit, onSelect: hooks.onSelect,
    guide(target) { guideAt = target; drawGuides(); },
    insert(t) { insertAt = t; drawGuides(); },
    dragging(on) { root.classList.toggle('is-dragging', on); hooks.onDragging?.(on); },
  });

  function row(kind, label, { title } = {}) {
    const r = h('div', `row row-${kind}`);
    r.append(h('div', 'lbl', title ? { title } : {}, label), h('div', 'track'));
    return r;
  }

  const keyOf = (el) => (el?.dataset.clip ? el.dataset.clip : el?.dataset.sceneBlock != null ? `scene:${el.dataset.sceneBlock}` : null);
  const elOf = (key) => (!key || !content ? null : key.startsWith('scene:') ? content.querySelector(`[data-scene-block="${key.slice(6)}"]`) : content.querySelector(`[data-clip="${CSS.escape(key)}"]`));
  function keyOfPath(path) {
    if (!path || !data) return null;
    const s = data.model.scenes.find((sc) => sc.path === path);
    if (s) return `scene:${s.index}`;
    return data.model.lanes.flatMap((l) => l.clips).find((c) => c.path === path && !c.parent)?.id ?? null;
  }
  /** Makes `el` the one item Tab stops at. */
  function rove(el) {
    if (!content || !el) return;
    for (const o of content.querySelectorAll('[tabindex="0"]')) if (o.matches(ITEM) && o !== el) o.tabIndex = -1;
    el.tabIndex = 0;
    current = keyOf(el);
  }

  function render(next) {
    data = next;
    const { model, verdicts, floors, selection, readOnly } = data;
    if (!pinned) fit();
    const ae = document.activeElement;
    const hadFocus = !!content && content.contains(ae) && ae.matches(ITEM);
    const scrollLeft = scroll.scrollLeft, scrollTop = scroll.scrollTop;
    const deck = model.kind === 'deck';
    const trackW = Math.max(trackViewW(), PAD + model.duration * pxPerS + END_PAD);
    content = h('div', 'tl-content');
    content.style.width = `${LABEL_W + trackW}px`;
    content.style.setProperty('--track-w', `${trackW}px`);
    root.classList.toggle('is-readonly', !!readOnly);
    segs = [];
    const seg = (track, knob) => { const s = h('i', `ph-seg${knob ? ' with-knob' : ''}`, { 'aria-hidden': 'true' }); track.append(s); segs.push(s); };

    // ruler (sticky): seconds, or presses on a deck
    const ruler = row('ruler', '');
    const tools = ruler.querySelector('.lbl');
    tools.append(
      h('button', 'tool', { type: 'button', 'data-zoom': 'out', title: 'Zoom out (−)', 'aria-label': 'Zoom out' }, '−'),
      h('button', 'tool', { type: 'button', 'data-zoom': 'fit', title: 'Fit the piece (Shift+Z)', 'aria-label': 'Fit the piece to the width' }, 'Fit'),
      h('button', 'tool', { type: 'button', 'data-zoom': 'in', title: 'Zoom in (=)', 'aria-label': 'Zoom in' }, '+'),
    );
    const rt = ruler.querySelector('.track');
    const step = deck ? Math.max(1, STEPS.find((s) => s >= 1 && s * pxPerS >= 72) ?? 1) : STEPS.find((s) => s * pxPerS >= 72) ?? 60;
    const minor = deck ? step : step / (step >= 1 && step % 5 === 0 ? 5 : step === 2 ? 4 : 5);
    for (let k = 0; k * minor <= model.duration + 1e-9; k++) {
      const t = k * minor, major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
      const tick = h('i', major ? 'tick major' : 'tick');
      tick.style.left = `${x(t)}px`;
      rt.append(tick);
      if (major) {
        const text = deck ? String(Math.round(t)) : t >= 60 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}` : `${step < 1 ? t.toFixed(1) : Math.round(t)}s`;
        const lab = h('span', 'tick-label', {}, text);
        lab.style.left = `${x(t)}px`;
        rt.append(lab);
      }
    }
    seg(rt, true);
    content.append(ruler);

    // scenes (sticky): blocks, the cut wedge at the start of each incoming scene, the end handles
    const scenes = row('scenes', deck ? 'Slides' : 'Scenes');
    const st = scenes.querySelector('.track');
    model.scenes.forEach((s, i) => {
      const sel = selection?.path === s.path;
      const editable = !readOnly && s.editable.duration;
      const cutName = s.cut ? s.cut.pattern.split('/').pop() : null;
      const w = Math.max(2, (s.end - s.start) * pxPerS);
      // what a narrow block keeps: its name first, then its duration, then its cut
      const fit = w < 64 ? ' tiny' : w < 132 ? ' narrow' : '';
      const b = h('div', `scene${i % 2 ? ' alt' : ''}${sel ? ' selected' : ''}${editable ? ' editable' : ''}${fit}`, {
        tabindex: -1, role: 'button', 'data-scene-block': i,
        'aria-label': `Scene ${s.id}, ${fixed(s.duration)} ${deck ? 'presses' : 's'}, ${s.layout}${cutName && i > 0 ? `, enters by ${cutName}${s.cut.d ? ` over ${fixed(s.cut.d)} s` : ''}` : ''}${s.reason ? `; ${s.reason}` : ''}`,
        'aria-pressed': sel ? 'true' : 'false',
      });
      b.style.left = `${x(s.start)}px`;
      b.style.width = `${w}px`;
      // the kit schedules a cut as the incoming scene's first cut.d seconds, the outgoing one lingering under it
      const wedgeW = i > 0 && s.cut?.d > 0 ? s.cut.d * pxPerS : 0;
      if (wedgeW) {
        const wd = h('i', 'wedge', { 'data-cut': i, title: `${cutName}: ${fixed(s.cut.d)} s from ${model.scenes[i - 1].id}` });
        wd.style.width = `${wedgeW}px`;
        b.append(wd);
        b.style.paddingLeft = `${Math.min(wedgeW, w / 2) + 7}px`;
      }
      b.append(h('span', 'scene-name', {}, s.id), h('span', 'scene-dur', {}, `${fixed(s.duration)}${deck ? '' : 's'}`));
      if (wedgeW) b.append(h('span', 'scene-cut', {}, cutName));
      b.addEventListener('pointerdown', (e) => gestures.sceneDown(e, s));
      st.append(b);
      if (editable) {
        const end = h('i', 'scene-end', { 'data-scene-end': i, title: `Drag to change ${s.id}'s duration (or ] and [ on the scene)` });
        end.style.left = `${x(s.end)}px`;
        end.addEventListener('pointerdown', (e) => gestures.sceneEndDown(e, s));
        st.append(end);
      }
    });
    seg(st);
    content.append(scenes);

    // slot lanes, cues, moves
    for (const lane of model.lanes) {
      if (lane.kind !== 'slot' && !lane.clips.length) continue;
      const r = row(lane.kind === 'slot' ? 'lane' : lane.kind, lane.label);
      const tr = r.querySelector('.track');
      for (const c of lane.clips) tr.append(lane.kind === 'slot' ? clipEl(c, lane, selection, readOnly) : eventEl(c));
      content.append(r);
    }

    // music grid
    if (model.grid.beats.length) {
      const g = row('grid', 'Grid', { title: model.grid.bpm ? `${model.grid.bpm} bpm` : 'music beats' });
      const gt = g.querySelector('.track');
      const strongSet = new Set(model.grid.strong.map((t) => Math.round(t * 1000)));
      for (const t of model.grid.beats) {
        const tick = h('i', strongSet.has(Math.round(t * 1000)) ? 'beat strong' : 'beat');
        tick.style.left = `${x(t)}px`;
        gt.append(tick);
      }
      const strong = model.grid.strong;
      if (strong.length) {   // bar numbers beside the downbeats, thinned so that labels never touch
        const every = Math.max(1, Math.ceil(44 / Math.max(1e-6, pxPerS * ((strong[1] ?? strong[0] + 2) - strong[0]))));
        strong.forEach((t, n) => {
          if (n % every) return;
          const b = h('span', 'bar-label', {}, `bar ${n + 1}`);
          b.style.left = `${x(t)}px`;
          gt.append(b);
        });
      }
      content.append(g);
    }

    // gate lane (sticky): live verdicts at their instants, W-READ floors at scene ends, G-DEAD windows
    const gate = row('gate', 'Gate');
    const gt = gate.querySelector('.track');
    for (const d of floors.dead ?? []) {
      const el = h('div', 'dead', { title: `G-DEAD: nothing happens for ${d.gap} s` }, `dead ${d.gap} s`);
      el.style.left = `${x(d.from)}px`; el.style.width = `${(d.to - d.from) * pxPerS}px`;
      gt.append(el);
    }
    for (const f of floors.scenes ?? []) {
      const s = model.scenes.find((sc) => sc.id === f.id);
      if (!s || f.minDuration == null) continue;
      const ft = s.start + f.minDuration;
      const sel = selection?.path === s.path;
      if (f.minDuration > s.duration + 1e-9) {
        const short = h('div', 'floor-short', { title: `W-READ: ${s.id} needs ${fixed(f.minDuration)} s (${f.reason})`, 'data-floor': s.index }, (ft - s.end) * pxPerS >= 76 ? `needs ${fixed(f.minDuration)} s` : null);
        short.style.left = `${x(s.end)}px`; short.style.width = `${(ft - s.end) * pxPerS}px`;
        gt.append(short);
      } else {
        const fl = h('div', `floor${sel ? ' sel' : ''}`, { title: `${s.id} can shrink to ${fixed(f.minDuration)} s before W-READ warns (${f.reason})`, 'data-floor': s.index });
        fl.style.left = `${x(ft)}px`;
        fl.style.width = `${Math.max(0, (s.end - ft) * pxPerS)}px`;
        fl.append(h('span', 'floor-label', {}, `floor ${fixed(f.minDuration)} s`));
        gt.append(fl);
      }
    }
    for (const m of placeVerdicts(verdicts, model)) {
      const el = h('button', `verdict ${m.status === 'FAIL' ? 'fail' : 'warn'}`, { type: 'button', title: `${m.id}: ${m.reason}`, 'aria-label': `${m.id} ${m.status}: ${m.reason}`, 'data-verdict': m.id });
      el.style.left = `${x(m.t)}px`;
      el.addEventListener('click', () => hooks.onVerdict(m));
      gt.append(el);
    }
    seg(gt);
    content.append(gate);

    marksEl = h('div', 'marks', { hidden: true });
    playheadEl = h('div', 'playhead', { 'aria-hidden': 'true' });
    guideEl = h('div', 'snap-guide', { 'data-snap-guide': '', hidden: true, 'aria-hidden': 'true' });
    guideEl.append(h('span', 'snap-tag'));
    insertEl = h('div', 'insert-guide', { hidden: true, 'aria-hidden': 'true' });
    content.append(marksEl, guideEl, insertEl, playheadEl);
    rt.addEventListener('pointerdown', (e) => gestures.scrubDown(e));
    tools.addEventListener('click', (e) => { const z = e.target.closest('[data-zoom]')?.dataset.zoom; if (z) zoom(z); });
    content.addEventListener('focusin', (e) => {
      const el = e.target.closest?.(ITEM);
      if (!el) return;
      rove(el);
      if (!restoring) hooks.onSelect(el.dataset.clip ? data.model.lanes.flatMap((l) => l.clips).find((c) => c.id === el.dataset.clip)?.path : data.model.scenes[Number(el.dataset.sceneBlock)]?.path, { from: 'focus' });
    });

    scroll.replaceChildren(content);
    // the timeline is as tall as its rows (plus a scrollbar), up to 46 % of the window; it never
    // gives up its rows to the stage or the inspector
    const rowsH = [...content.children].reduce((n, el) => n + (el.classList.contains('row') ? el.offsetHeight : 0), 0);
    scroll.style.height = `${Math.round(Math.max(150, Math.min(rowsH + (scroll.offsetHeight - scroll.clientHeight || 12), innerHeight * 0.46)))}px`;
    scroll.scrollLeft = scrollLeft;
    scroll.scrollTop = scrollTop;
    playhead(lastT);
    setMarks(data.marks);
    drawGuides();
    // the one Tab stop: the selection, else the last item focused, else the first clip
    const stop = elOf(keyOfPath(selection?.path)) ?? elOf(current) ?? content.querySelector('[data-clip]') ?? content.querySelector('[data-scene-block]');
    rove(stop);
    if (hadFocus && stop) { restoring = true; try { stop.focus({ preventScroll: true }); } finally { restoring = false; } }
  }

  function clipEl(c, lane, selection, readOnly) {
    if (c.parent) {   // a cascade child: drawn as a tick under its parent, never dragged alone
      const k = h('i', 'kid', { title: `${c.label}: ${c.reason ?? ''}` });
      k.style.left = `${x(c.start)}px`;
      k.style.width = `${Math.max(2, (c.segments.enter[1] - c.start) * pxPerS)}px`;
      return k;
    }
    const sel = selection?.path === c.path;
    const canAt = !readOnly && c.editable.at, canOut = !readOnly && c.editable.out;
    const at = c.start - c.sceneStart;
    // a flag only for a problem with an editable beat; why a locked clip is locked is not a warning
    const flagged = canAt && !!c.reason;
    const el = h('div', `clip${sel ? ' selected' : ''}${canAt ? ' editable' : ' locked'}${flagged ? ' flagged' : ''}`, {
      'data-clip': c.id, tabindex: -1, role: 'button', 'aria-pressed': sel ? 'true' : 'false',
      'aria-label': `${lane.label} beat "${c.label}" in ${c.scene}, at ${fixed(at)} s, ${String(c.fx).split('/').pop()}${c.reason ? `; ${c.reason}` : ''}${canAt ? '. Alt+arrows nudge, [ and ] trim, Delete removes, Enter edits' : ''}`,
      title: `${c.label}\n${c.fx} · at ${fixed(at)} s${c.reason ? `\n${c.reason}` : ''}`,
    });
    el.style.left = `${x(c.start)}px`;
    el.style.width = `${Math.max(3, (c.end - c.start) * pxPerS)}px`;
    for (const [name, span] of Object.entries(c.segments)) {
      if (!span) continue;
      const w = (span[1] - span[0]) * pxPerS;
      if (name === 'enter' && w < 1) { const i = h('i', 'cseg instant'); i.style.left = '0px'; el.append(i); continue; }
      const seg = h('i', `cseg cseg-${name}`);
      seg.style.left = `${(span[0] - c.start) * pxPerS}px`;
      seg.style.width = `${Math.max(0, w)}px`;
      el.append(seg);
    }
    el.append(h('span', 'clip-label', {}, c.label));
    if (canOut) {
      const handleT = c.segments.exit ? c.segments.exit[0] : c.end;
      const tail = h('i', 'tail', { 'data-tail': c.id, title: 'Drag to set when it leaves (out)' });
      tail.style.left = `${(handleT - c.start) * pxPerS}px`;
      tail.addEventListener('pointerdown', (e) => gestures.tailDown(e, c));
      el.append(tail);
    }
    el.addEventListener('pointerdown', (e) => gestures.clipDown(e, c));
    return el;
  }

  function eventEl(c) {
    const el = h('i', `event event-${c.kind}`, { title: `${c.label} (${c.fx})${c.reason ? `\n${c.reason}` : ''}` });
    el.style.left = `${x(c.start)}px`;
    if (c.kind !== 'cue') el.style.width = `${Math.max(2, (c.end - c.start) * pxPerS)}px`;
    return el;
  }

  /** What a snap target is, in a word or two: "playhead", "beat 12", "intro end", "clip start", "scene end". */
  function guideName(tg) {
    if (tg.kind === 'clamp') return tg.label;
    if (tg.kind === 'beat') return `beat ${Number(tg.source.split(':')[1]) + 1}`;
    if (tg.kind === 'scene') { const [, i, edge] = tg.source.split(':'); return `${data?.model.scenes[Number(i)]?.id ?? 'scene'} ${edge}`; }
    if (tg.kind === 'clip') return `clip ${tg.edge ?? 'edge'}`;
    return tg.kind;
  }

  /** Hides an overlay line while it sits under the sticky label column. */
  const place = (el, px) => { el.style.transform = `translateX(${px}px)`; el.classList.toggle('under-labels', px < scroll.scrollLeft + LABEL_W); };

  /** The snap guide and the insertion guide survive a rebuild of the rows under the pointer. */
  function drawGuides() {
    if (guideEl) {
      guideEl.hidden = !guideAt;
      if (guideAt) {
        place(guideEl, LABEL_W + x(guideAt.t));
        guideEl.dataset.source = guideAt.source;
        guideEl.classList.toggle('clamp', guideAt.kind === 'clamp');
        guideEl.firstChild.textContent = guideName(guideAt);
      }
    }
    if (insertEl) {
      insertEl.hidden = insertAt == null;
      if (insertAt != null) place(insertEl, LABEL_W + x(insertAt));
    }
  }

  function playhead(t) {
    lastT = t;
    if (playheadEl) playheadEl.style.transform = `translateX(${LABEL_W + x(t)}px)`;
    for (const s of segs) s.style.transform = `translateX(${x(t)}px)`;
  }

  function setMarks(m) {
    if (!marksEl || !m) return;
    const a = m.in ?? 0, b = m.out ?? data?.model.duration ?? 0;
    marksEl.hidden = m.in == null && m.out == null;
    marksEl.style.transform = `translateX(${LABEL_W + x(a)}px)`;
    marksEl.style.width = `${Math.max(0, (b - a) * pxPerS)}px`;
    marksEl.classList.toggle('open-in', m.in == null);
    marksEl.classList.toggle('open-out', m.out == null);
  }

  /** Keeps the playhead in view while playing or stepping. */
  function follow(t) {
    const px = x(t), left = scroll.scrollLeft, w = trackViewW();
    if (px < left + PAD || px > left + w - PAD) scroll.scrollLeft = Math.max(0, px - w * 0.25);
  }

  function applyZoom(factor, anchorClientX) {
    if (!data) return;
    const anchorX = anchorClientX == null ? x(lastT) - scroll.scrollLeft : anchorClientX - scroll.getBoundingClientRect().left - LABEL_W;
    const v = zoomAt(view(), factor, anchorX, { duration: data.model.duration, widthPx: fitW() });
    pinned = true;
    pxPerS = v.pxPerS;
    render(data);
    scroll.scrollLeft = v.scrollS * v.pxPerS;
  }

  function zoom(kind) {
    if (kind === 'fit') { pinned = false; fit(); render(data); scroll.scrollLeft = 0; return; }
    applyZoom(kind === 'in' ? 1.5 : 1 / 1.5);
  }

  scroll.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    applyZoom(Math.exp(-e.deltaY * 0.0025), e.clientX);
  }, { passive: false });
  scroll.addEventListener('scroll', () => drawGuides(), { passive: true });
  new ResizeObserver(() => { if (data) render(data); }).observe(scroll);

  /** Marks the selected clip or scene in place (no rebuild, so a press keeps its element and focus). */
  function setSelection(path) {
    if (!data) return;
    data = { ...data, selection: path ? { path } : null };
    for (const el of scroll.querySelectorAll('.selected')) { el.classList.remove('selected'); el.setAttribute('aria-pressed', 'false'); }
    for (const el of scroll.querySelectorAll('.floor.sel')) el.classList.remove('sel');
    const el = elOf(keyOfPath(path));
    if (!el) return;
    el.classList.add('selected');
    el.setAttribute('aria-pressed', 'true');
    if (el.dataset.sceneBlock != null) scroll.querySelector(`.floor[data-floor="${el.dataset.sceneBlock}"]`)?.classList.add('sel');
    rove(el);
  }

  const center = (el) => parseFloat(el.style.left) + parseFloat(el.style.width) / 2;
  const itemsOf = (r) => [...r.querySelectorAll(ITEM)].sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left));

  /** Moves the focus (and so the selection) from item `el` to its neighbour: 'left' | 'right' | 'up' | 'down'. */
  function navigate(el, dir) {
    const r = el.closest('.row');
    let target = null;
    if (dir === 'left' || dir === 'right') {
      const items = itemsOf(r);
      target = items[items.indexOf(el) + (dir === 'right' ? 1 : -1)] ?? null;
    } else {
      const rows = [...content.querySelectorAll('.row')].filter((x) => x.querySelector(ITEM));
      const next = rows[rows.indexOf(r) + (dir === 'down' ? 1 : -1)];
      if (next) { const c = center(el); target = itemsOf(next).reduce((best, x) => (Math.abs(center(x) - c) < Math.abs(center(best) - c) ? x : best)); }
    }
    if (target) focusEl(target);
    return !!target;
  }

  function focusEl(el) {
    rove(el);
    el.focus({ preventScroll: true });
    // keep it in view, clear of the sticky label column
    const left = parseFloat(el.style.left) + LABEL_W, w = parseFloat(el.style.width);
    if (left < scroll.scrollLeft + LABEL_W) scroll.scrollLeft = Math.max(0, left - LABEL_W - PAD);
    else if (left + Math.min(w, 200) > scroll.scrollLeft + scroll.clientWidth) scroll.scrollLeft = left + Math.min(w, 200) - scroll.clientWidth + PAD;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /** The item a keyboard event's target is: { kind: 'clip', clip, el } | { kind: 'scene', scene, el } | null. */
  function itemOf(target) {
    const el = target?.closest?.(ITEM);
    if (!el || !content?.contains(el) || !data) return null;
    if (el.dataset.clip) return { kind: 'clip', clip: data.model.lanes.flatMap((l) => l.clips).find((c) => c.id === el.dataset.clip), el };
    return { kind: 'scene', scene: data.model.scenes[Number(el.dataset.sceneBlock)], el };
  }

  return {
    render, playhead, setMarks, follow, zoom, setSelection, navigate, itemOf,
    /** Puts the focus on the item of `path` (Escape from the inspector). */
    focusPath(path) { const el = elOf(keyOfPath(path)) ?? elOf(current); if (el) focusEl(el); return !!el; },
    pin() { pinned = true; },
    view,
    cancelDrag: () => gestures.cancel(),
    get dragging() { return gestures.active; },
  };
}
