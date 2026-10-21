// Timeline algebra and the schedule of a story (SPEC §6, §10). Pure, shared by the kit and the
// gate; importable in Node and in the browser.
//
// A node is { d, f }: a measured duration and a function of local time u, clamped outside [0, d].

import { spring } from './springs.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// Schedule times are rounded to the millisecond, so 3.5 + 0.52 − 0.52 is 3.5 and a film's
// duration is exactly the sum of its scenes.
const ms = (x) => Math.round(x * 1000) / 1000;

export const clip = (d, f = (u) => u) => ({ d, f: (u) => f(Math.min(d, Math.max(0, u))) });

export const seq = (...n) => {
  const starts = [];
  let at = 0;
  for (const c of n) { starts.push(at); at += c.d; }
  return { d: at, starts, f: (u) => n.map((c, i) => c.f(u - starts[i])) };
};

export const par = (...n) => ({ d: Math.max(0, ...n.map((c) => c.d)), f: (u) => n.map((c) => c.f(u)) });

export const delay = (x, n) => ({ d: x + n.d, f: (u) => n.f(u - x) });

// Children in turn. from: 'first' | 'center' | 'last' | 'index' (with opts.index); opts.ease
// (a function of 0..1) bends the spacing; opts.cap bounds the whole cascade (style.motion.stagger.capS).
export const stagger = (each, items, { from = 'first', index = 0, ease = null, cap = null } = {}) => {
  const n = items.length;
  const rank = items.map((_, i) =>
    from === 'last' ? n - 1 - i
      : from === 'center' ? Math.abs(i - (n - 1) / 2)
        : from === 'index' ? Math.abs(i - index)
          : i);
  const top = Math.max(0, ...rank);
  const step = cap != null && top * each > cap ? cap / top : each;
  const offsets = rank.map((r) => (ease && top > 0 ? ease(r / top) * top * step : r * step));
  const node = par(...items.map((c, i) => delay(offsets[i], c)));
  node.offsets = offsets;
  return node;
};

export const overlap = (a, b, o) => {
  const s = a.d - o;
  return { d: Math.max(a.d, s + b.d), starts: [0, s], f: (u) => [a.f(u), b.f(u - s)] };
};

// An overlap by d whose progress p (0..1 across the overlap) drives the pattern over both nodes.
export const transition = (a, b, pattern, d) => {
  const o = overlap(a, b, d);
  const s = o.starts[1];
  return {
    ...o,
    pattern,
    f: (u) => ({ a: a.f(u), b: b.f(u - s), pattern, p: d > 0 ? clamp01((u - s) / d) : u >= s ? 1 : 0 }),
  };
};

// ---------------------------------------------------------------------------------------------
// schedule(story, style, { patterns, each }) — patterns optionally maps a ref ('entrances/pop') to
// the pattern module or its metadata: { dur: role | seconds, spring: role | params }; a sound
// pattern ('sound/riser') may give { anchor: 'end', durationS }. each maps a beat's slot selector
// to { n, stagger? } when the kit has counted the children of a cascade slot (a layout element
// with data-each, or a fragment); without it a beat with params.each cascades over the parts of
// its text (eachParts).
//
// Output (SPEC §6): film { kind, duration, scenes, events, rests, holds, items, timeline,
// warnings }; deck { kind, presses, pressLengths, scenes, events, rests, items, timeline,
// warnings }; scenes[] = { id, start, end, cut: { pattern, d }, position, move }. Every time is
// rounded to the millisecond.

const HARD_CUT = 'transitions/hard-cut';
const ROLE = /^style:(headline|body|figure|plate)$/;

export const selectorOf = (scene, slot) => `[data-scene="${scene}"] [data-slot="${slot}"]`;
const sceneSelector = (scene) => `[data-scene="${scene}"]`;

// a scene may be drawn differently in one format (`variants: { "9x16": { layout, beats, … } }`).
// Returns the story as that format draws it, with no variants field left; duration, cut and id stay
// shared, so every format runs the same length. The input is not changed.
export function forFormat(story, format) {
  return { ...story, scenes: story.scenes.map(({ variants, ...sc }) => (variants?.[format] ? { ...sc, ...variants[format] } : sc)) };
}

// the story may name the style's vocabulary instead of a pattern. `fx: "style:<role>"`
// becomes style.entrances.<role>; a scene with `position` and no `cut` takes
// style.transitions.<position>. Returns a new story; refs that are already patterns pass through.
export function resolveStory(story, style) {
  const scenes = story.scenes.map((sc) => {
    let cut = sc.cut;
    if (cut == null) {
      if (sc.position == null) throw new RangeError(`schedule: scene "${sc.id}" has neither cut nor position`);
      cut = style.transitions?.[sc.position];
      if (!cut) throw new RangeError(`schedule: scene "${sc.id}": style.transitions has no "${sc.position}"`);
    }
    const beats = sc.beats.map((b) => {
      if (typeof b.fx !== 'string' || !b.fx.startsWith('style:')) return b;
      const m = ROLE.exec(b.fx);
      const fx = m && style.entrances?.[m[1]];
      if (!fx) throw new RangeError(`schedule: scene "${sc.id}" slot "${b.slot}": unknown entrance role "${b.fx}"`);
      return { ...b, fx };
    });
    return { ...sc, cut, beats };
  });
  return { ...story, scenes };
}

function roleSeconds(role, style) {
  if (typeof role === 'number') return ms(role);
  const v = style.motion.durations[role];
  if (v == null) throw new RangeError(`schedule: unknown duration role "${role}"`);
  return v / 1000;
}

function springParams(sp, style) {
  const p = typeof sp === 'string' ? style.motion.spring[sp] : sp;
  if (!p) throw new RangeError(`schedule: unknown spring "${sp}"`);
  return p;
}

// Entrance timing: a beat's params.spring / params.dur, else the pattern's, else role 'standard'.
// params.instant (or a deck's step 0) takes 0 s: the beat is finished from its at.
export function entranceTiming(beat, style, meta = {}, instant = false) {
  const prm = beat.params || {};
  if (instant || prm.instant === true) return { d: 0, spring: null, role: null };
  const sp = prm.spring ?? meta.spring;
  if (sp != null) {
    const p = springParams(sp, style);
    return { d: ms(spring.settle(p)), spring: p, role: null };
  }
  const role = prm.dur ?? meta.dur ?? 'standard';
  return { d: roleSeconds(role, style), spring: null, role };
}

// The parts a cascade beat's text splits into (params.sep, default "|"); the kit makes one child each.
export const eachParts = (text, sep = '|') => String(text ?? '').split(String(sep)).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

// A data-each cascade (SPEC §6): children in turn, spaced by params.stagger (else the kit's
// data-stagger, else style.motion.stagger.eachS), the spread of starts capped at stagger.capS.
// An instant beat does not cascade: it is there, whole.
function cascade(beat, style, d, given, warn) {
  const prm = beat.params || {};
  if ((!prm.each && !given) || d === 0) return null;
  const n = given?.n ?? eachParts(beat.text, prm.sep).length;
  if (!(n > 0)) return null;
  let each = Number(prm.stagger ?? given?.stagger ?? style.motion.stagger.eachS);
  if (!(each >= 0 && each < Infinity)) {
    warn?.(`params.stagger ${JSON.stringify(prm.stagger ?? given?.stagger)} is not a number of seconds >= 0; using the style's ${style.motion.stagger.eachS} s`);
    each = style.motion.stagger.eachS;
  }
  const node = stagger(each, Array.from({ length: n }, () => clip(d)), { cap: style.motion.stagger.capS });
  const offsets = node.offsets.map(ms);
  return { n, step: n > 1 ? offsets[n - 1] / (n - 1) : each, offsets, d, total: ms(offsets[n - 1] + d) };
}

export function cutSeconds(ref, style, meta = {}) {
  if (ref === HARD_CUT || meta.dur === 0) return 0;
  return roleSeconds(meta.dur ?? 'standard', style);
}

// a cue sits on its beat's arrival; a sound pattern with anchor 'end' (and a durationS)
// is placed so it ends on the beat's landing, the instant its entrance (a cascade: its last child)
// finishes. Never before 0.
function cueTiming(beat, arrive, d, meta) {
  const m = meta(`sound/${beat.cue}`);
  const len = typeof m.durationS === 'number' && m.durationS > 0 ? ms(m.durationS) : 0;
  if (m.anchor === 'end' && len > 0) return { at: Math.max(0, ms(arrive + d - len)), d: len, anchor: 'end' };
  return { at: arrive, d: len, anchor: 'start' };
}

export function schedule(story, style, { patterns = {}, each = {} } = {}) {
  const meta = (ref) => (ref && patterns[ref]) || {};
  const resolved = resolveStory(story, style);
  return resolved.kind === 'deck' ? deckSchedule(resolved, style, meta, each) : filmSchedule(resolved, style, meta, each);
}

// A beat's item. A cascade beat's item is the parent: it lasts the whole cascade, carries `each`
// and owns the exit and the emphasis; childrenOf() lists one item per child.
function beatItem(sc, beat, style, meta, eachOpts, instant = false, warnings = null) {
  const timing = entranceTiming(beat, style, meta(beat.fx), instant);
  const selector = selectorOf(sc.id, beat.slot);
  const each = cascade(beat, style, timing.d, eachOpts[selector], warnings && ((m) => warnings.push(`${selector}: ${m}`)));
  return {
    selector, scene: sc.id, slot: beat.slot, fx: beat.fx,
    d: each ? each.total : timing.d, spring: timing.spring, role: timing.role, beat, each,
  };
}

function childrenOf(it) {
  if (!it.each) return [];
  return it.each.offsets.map((off, k) => ({
    selector: `${it.selector} > :nth-child(${k + 1})`, scene: it.scene, slot: it.slot, fx: it.fx,
    d: it.each.d, spring: it.spring, role: it.role, beat: it.beat, parent: it, offset: off, exit: null, emphasis: null,
  }));
}

// Exits take exitRatio of one entrance (a cascade's departure never staggers).
const unitD = (it) => (it.each ? it.each.d : it.d);

const sceneEntry = (sc, start, end, cutD) => ({ id: sc.id, start, end, cut: { pattern: sc.cut, d: cutD }, position: sc.position ?? null, move: sc.move ?? null });

function filmSchedule(story, style, meta, eachOpts) {
  const scenes = story.scenes;
  const cutD = scenes.map((sc) => cutSeconds(sc.cut, style, meta(sc.cut)));
  const items = [], events = [], rests = [], holds = [], warnings = [];

  // Measure: each scene is a par of delayed entrances, clipped to its own duration plus the tail
  // it lingers into the next scene's transition; the film is their transition-joined seq.
  const nodes = scenes.map((sc, i) => {
    const tail = i + 1 < scenes.length ? cutD[i + 1] : 0;
    const beats = sc.beats.map((b) => delay(b.at, clip(beatItem(sc, b, style, meta, eachOpts).d)));
    const inner = par(...beats);
    return clip(sc.duration + tail, (u) => inner.f(u));
  });
  let timeline = nodes[0];
  const starts = [0];
  for (let i = 1; i < nodes.length; i++) {
    timeline = transition(timeline, nodes[i], scenes[i].cut, cutD[i]);
    starts.push(ms(timeline.starts[1]));
  }
  const duration = ms(timeline.d);

  const sceneList = scenes.map((sc, i) => sceneEntry(sc, starts[i], ms(starts[i] + sc.duration), cutD[i]));

  // A scene's rest: the instant its cut, every arrival and every emphasis have ended. Its
  // hold runs from the rest to the scene's end. Exits do not move the rest.
  scenes.forEach((sc, i) => {
    const start = starts[i], end = sceneList[i].end;
    events.push({ t: start, kind: 'cut', selector: sceneSelector(sc.id), scene: sc.id, pattern: sc.cut, d: cutD[i] });
    if (sc.move) events.push({ t: start, kind: 'move', selector: `${sceneSelector(sc.id)} .mm-camera`, scene: sc.id, pattern: sc.move, d: ms(sc.duration) });
    let settled = start + cutD[i];
    for (const beat of sc.beats) {
      const it = beatItem(sc, beat, style, meta, eachOpts, false, warnings);
      it.start = ms(start + beat.at);
      it.exit = null;
      it.emphasis = null;
      const kids = childrenOf(it);
      for (const c of kids) c.start = ms(it.start + c.offset);
      for (const a of kids.length ? kids : [it]) events.push({ t: a.start, kind: 'arrive', selector: a.selector, scene: sc.id, fx: beat.fx, d: a.d, spring: a.spring, role: a.role });
      // a pattern that keeps moving after it arrives (a 3D turn) is a move until its scene ends; it does not move the rest
      if (meta(beat.fx).ambient && beat.params?.move !== 'still' && end > it.start) events.push({ t: it.start, kind: 'move', selector: it.selector, scene: sc.id, pattern: beat.fx, d: ms(end - it.start), ambient: true });
      if (beat.cue) {
        const c = cueTiming(beat, it.start, it.d, meta);
        events.push({ t: c.at, kind: 'cue', selector: it.selector, scene: sc.id, cue: beat.cue, d: c.d, anchor: c.anchor });
      }
      settled = Math.max(settled, it.start + it.d);
      if (beat.emphasis) {
        const ed = roleSeconds(meta(beat.emphasis).dur ?? 'slow', style);
        it.emphasis = { start: ms(it.start + it.d), d: ed, pattern: beat.emphasis };
        events.push({ t: it.emphasis.start, kind: 'move', selector: it.selector, scene: sc.id, pattern: beat.emphasis, d: ed });
        settled = Math.max(settled, it.emphasis.start + ed);
      }
      // screen actions play on the beat's device screen; the scene rests after the last
      for (const a of beat.screen ?? []) {
        const sd = ms(a.d ?? roleSeconds(meta(a.do).dur ?? 'standard', style));
        const t = ms(it.start + (a.at ?? 0));
        events.push({ t, kind: 'move', selector: it.selector, scene: sc.id, pattern: a.do, d: sd, screen: true });
        settled = Math.max(settled, t + sd);
      }
      if (beat.out != null) {
        const xd = ms(style.motion.exitRatio * unitD(it));
        it.exit = { start: ms(start + beat.out), d: xd, pattern: beat.exit ?? null };
        events.push({ t: it.exit.start, kind: 'depart', selector: it.selector, scene: sc.id, pattern: beat.exit ?? null, d: xd });
      }
      if (it.start + it.d > end + 1e-9) warnings.push(`${it.selector} is still arriving when its scene ends`);
      items.push(it, ...kids);
    }
    settled = ms(settled);
    if (settled < end || (i === scenes.length - 1 && settled <= end)) {
      rests.push(settled);
      holds.push({ scene: sc.id, from: settled, to: end });
    }
  });

  if (story.kind === 'loop' && story.autoReturn) autoReturn(items, events, holds, sceneList, duration);
  events.sort((a, b) => a.t - b.t);
  return { kind: 'film', duration, scenes: sceneList, events, rests, holds, items, timeline, warnings };
}

/**
 * A loop's automatic return. Over the last R = min(1.2 s, 15 %) before the last
 * exported frame (duration − 1/30 s, where G-LOOP compares), every beat of the last scene that
 * arrived with an entrance plays it back to p = 0, the last arrival first, staggered so the first
 * arrival lands on that frame. `it.ret = { start, d }`; the kit mirrors the entrance's time.
 * Instant beats (d = 0) are already there at frame 0 and stay; a beat with its own exit is left alone.
 */
function autoReturn(items, events, holds, sceneList, duration) {
  const last = sceneList[sceneList.length - 1].id;
  const h = holds.find((x) => x.scene === last);
  // never before the last scene rests (an emphasis or a long play can rest late): the return shrinks to fit
  const end = ms(duration - 1 / 30), from = ms(Math.max(end - Math.min(1.2, 0.15 * duration), h?.from ?? end));
  const R = ms(end - from);
  if (R <= 0) return;
  const back = items.filter((it) => !it.parent && it.scene === last && it.d > 0 && !it.exit).sort((a, b) => b.start - a.start);
  const n = back.length;
  const rd = n > 1 ? R / 2 : R, step = n > 1 ? (R - rd) / (n - 1) : 0;
  back.forEach((it, k) => {
    const start = ms(from + k * step);
    it.ret = { start, d: k === n - 1 ? ms(end - start) : ms(rd) };   // the last one lands exactly on the last frame
    events.push({ t: it.ret.start, kind: 'depart', selector: it.selector, scene: it.scene, pattern: null, d: it.ret.d, ret: true });
  });
  if (n && h) h.to = Math.max(h.from, from);
}

function deckSchedule(story, style, meta, eachOpts) {
  const scenes = story.scenes;
  const firstPress = [];
  let presses = 0;
  for (const sc of scenes) { firstPress.push(presses); presses += sc.presses; }
  const cutD = scenes.map((sc, i) => (i === 0 ? 0 : cutSeconds(sc.cut, style, meta(sc.cut))));
  const items = [], warnings = [];
  const L = new Array(presses + 1).fill(0);

  scenes.forEach((sc, i) => {
    const P = firstPress[i];
    if (i > 0) L[P + 1] = Math.max(L[P + 1], cutD[i]);
    for (const beat of sc.beats) {
      let step = beat.step ?? 1;
      if (step > sc.presses) { warnings.push(`${selectorOf(sc.id, beat.slot)}: step ${step} beyond the scene's ${sc.presses} presses`); step = sc.presses; }
      // step 0 is present at the scene's first rest (rest 0 for the first scene, the rest
      // the scene cuts in from for the others), finished, with no animation.
      const still = step === 0;
      const it = beatItem(sc, beat, style, meta, eachOpts, still, warnings);
      it.press = P + step;
      it.at = still ? 0 : ms(beat.at);
      it.exit = null;
      it.emphasis = null;
      const kids = childrenOf(it);
      for (const c of kids) { c.press = it.press; c.at = ms(it.at + c.offset); }
      if (!still) L[it.press] = Math.max(L[it.press], ms(it.at + it.d));
      if (beat.emphasis && still) warnings.push(`${it.selector}: step 0 has no press to play its emphasis in; ignored`);
      else if (beat.emphasis) {
        const ed = roleSeconds(meta(beat.emphasis).dur ?? 'slow', style);
        it.emphasis = { at: ms(it.at + it.d), d: ed, pattern: beat.emphasis };
        L[it.press] = Math.max(L[it.press], ms(it.emphasis.at + ed));
      }
      // a screen action plays across its whole press, which lasts at least the action
      // a step past the scene is clamped to its last press, with a screen warning; the kit
      // reads the clamped press from it.screenPresses, so both draw the action on the same press
      it.screenPresses = (beat.screen ?? []).map((a) => {
        const want = it.press + (a.step ?? 0);
        if (want > P + sc.presses) warnings.push(`screen: ${it.selector}: ${a.do} step ${a.step} beyond the scene's ${sc.presses} presses; it plays on the last`);
        const press = Math.min(P + sc.presses, want);
        L[press] = Math.max(L[press], ms(a.d ?? roleSeconds(meta(a.do).dur ?? 'standard', style)));
        return press;
      });
      if (beat.until != null && beat.until <= sc.presses) {
        const xd = ms(style.motion.exitRatio * unitD(it));
        it.exit = { press: P + beat.until, d: xd, pattern: beat.exit ?? null };
        L[it.exit.press] = Math.max(L[it.exit.press], xd);
      }
      items.push(it, ...kids);
    }
  });

  const pos = (press, at) => (L[press] > 0 ? press - 1 + at / L[press] : press);
  const span = (it, at, d) => (it.beat.step === 0 ? { from: it.press, to: it.press } : { from: pos(it.press, at), to: pos(it.press, ms(at + d)) });
  const events = [];
  scenes.forEach((sc, i) => {
    const press = i === 0 ? 0 : firstPress[i] + 1;
    events.push({ press, kind: 'cut', selector: sceneSelector(sc.id), scene: sc.id, pattern: sc.cut, d: cutD[i], at: 0,
      from: i === 0 ? 0 : press - 1, to: i === 0 ? 0 : pos(press, cutD[i]) });
  });
  scenes.forEach((sc, i) => {
    if (!sc.move) return;
    const from = firstPress[i], to = from + sc.presses;
    events.push({ press: from + 1, kind: 'move', selector: `${sceneSelector(sc.id)} .mm-camera`, scene: sc.id, pattern: sc.move,
      d: ms(L.slice(from + 1, to + 1).reduce((a, b) => a + b, 0)), at: 0, from, to });
  });
  for (const it of items) {
    if (!it.each) {   // a cascade arrives through its children
      events.push({ press: it.press, kind: 'arrive', selector: it.selector, scene: it.scene, fx: it.fx, d: it.d, spring: it.spring, role: it.role,
        at: it.at, ...span(it, it.at, it.d) });
    }
    if (it.beat.cue && !it.parent) {
      const c = cueTiming(it.beat, it.at, it.d, meta);
      events.push({ press: it.press, kind: 'cue', selector: it.selector, scene: it.scene, cue: it.beat.cue, d: c.d, anchor: c.anchor, at: c.at, ...span(it, c.at, 0) });
    }
    if (it.emphasis) events.push({ press: it.press, kind: 'move', selector: it.selector, scene: it.scene, pattern: it.emphasis.pattern, d: it.emphasis.d,
      at: it.emphasis.at, from: pos(it.press, it.emphasis.at), to: pos(it.press, ms(it.emphasis.at + it.emphasis.d)) });
    // a screen action plays across its whole press (the kit draws it at start press - 1, d 1)
    (it.screenPresses ?? []).forEach((press, k) => {
      const a = it.beat.screen[k];
      events.push({ press, kind: 'move', selector: it.selector, scene: it.scene, pattern: a.do, d: L[press], at: 0, from: press - 1, to: press, screen: true });
    });
    if (it.exit) events.push({ press: it.exit.press, kind: 'depart', selector: it.selector, scene: it.scene, pattern: it.exit.pattern, d: it.exit.d,
      at: 0, from: pos(it.exit.press, 0), to: pos(it.exit.press, it.exit.d) });
  }
  events.sort((a, b) => a.from - b.from);

  // The press clock: each press is a segment measured in seconds (used for walkthroughs).
  const timeline = seq(...L.slice(1).map((d) => clip(d)));
  const sceneList = scenes.map((sc, i) => sceneEntry(sc, firstPress[i], firstPress[i] + sc.presses, cutD[i]));
  const rests = Array.from({ length: presses + 1 }, (_, n) => n);
  return { kind: 'deck', presses, pressLengths: L, scenes: sceneList, events, rests, items, timeline, warnings };
}

/**
 * a beat whose asset is a frame sequence and that has no screen/play plays the
 * clip from its arrival. Written into the story as an explicit screen/play lasting the clip, so the
 * kit and the gate schedule the same motion. `metaOf(asset)` returns the folder's media.json (the kit
 * fetches it, the gate reads it from disk) or null. Mutates and returns the story.
 */
export function addImplicitPlays(story, metaOf) {
  const clipS = (m) => (m?.kind === 'sequence' && m.fps > 0 && m.frames > 0 ? m.frames / m.fps : null);
  for (const sc of story.scenes) for (const b of sc.beats) {
    // a screen/play with no d lasts the rest of the clip on screen when it starts, from `from` at `rate`
    for (const { a, asset } of screenTimeline(b)) {
      if (a.do !== 'screen/play' || a.d != null) continue;
      const len = clipS(metaOf(asset));
      if (len == null) continue;
      const rate = Number(a.params?.rate) > 0 ? Number(a.params.rate) : 1;
      a.d = ms(Math.max(0, len - Math.max(0, Number(a.params?.from) || 0)) / rate);
    }
    if (!b.asset?.endsWith('/') || (b.screen ?? []).some((a) => a.do === 'screen/play')) continue;
    const len = clipS(metaOf(b.asset));
    if (len != null) b.screen = [{ do: 'screen/play', at: 0, d: ms(len) }, ...(b.screen ?? [])];
  }
  return story;
}

// A beat's screen actions in the order they start (at, or a deck's step), each with the asset on the
// screen when it starts: the beat's asset, or the target of the last screen/swap that has finished by
// then, as the kit's fold sees it (a swap changes the content at p = 1; `cut` at once; a deck swap
// plays across its press). `swapS(a)` is a swap's length in seconds; without one (no style), a swap
// counts from its start.
function screenTimeline(b, swapS = () => 0, deck = false) {
  const when = (a) => (deck ? a.step ?? 0 : a.at ?? 0);
  const order = (b.screen ?? []).map((a, i) => ({ a, i })).sort((p, q) => when(p.a) - when(q.a) || p.i - q.i);
  let asset = b.asset ?? null;
  const pending = [];
  return order.map(({ a }) => {
    const w = when(a);
    while (pending.length && pending[0].end <= w + 1e-9) asset = pending.shift().to;
    const row = { a, asset };
    if (a.do === 'screen/swap' && a.params?.to) {
      const end = a.params.how === 'cut' ? w : w + (deck ? 1 : swapS(a));
      pending.push({ to: a.params.to, end });
      pending.sort((p, q) => p.end - q.end);
    }
    return row;
  });
}

const PCT = /^\s*-?\d+(?:\.\d+)?%\s*,\s*-?\d+(?:\.\d+)?%\s*$/;
const MARK_PARAM = { 'screen/tap': 'at', 'screen/zoom-to': 'at', 'screen/callout': 'at', 'screen/scroll': 'to' };

/**
 * The static screen checks the kit and the gate share. `fail`: a mark a
 * screen action names that the screen it acts on does not carry (G-PATTERN-REF fails). `warn`:
 * values the kit replaces (a play rate of 0 or less plays at 1; a laptop menu keeps its first 5
 * items). Every message starts with `screen: ` and names the beat. `metaOf(asset)` → media.json or null.
 */
export function screenIssues(story, metaOf, style = null, patterns = {}) {
  const fail = [], warn = [];
  const swapS = (a) => (a.d != null ? a.d : style ? roleSeconds(patterns['screen/swap']?.dur ?? 'standard', style) : 0);
  for (const sc of story.scenes) for (const b of sc.beats) {
    const where = selectorOf(sc.id, b.slot);
    for (const { a, asset } of screenTimeline(b, swapS, story.kind === 'deck')) {
      if (a.do === 'screen/play' && a.params?.rate != null && !(Number(a.params.rate) > 0)) warn.push(`screen: ${where}: screen/play rate ${a.params.rate} is not above 0; it plays at 1`);
      const key = MARK_PARAM[a.do], target = key && a.params?.[key];
      if (target == null || target === '' || typeof target === 'number' || PCT.test(String(target)) || /^-?\d+(\.\d+)?$/.test(String(target))) continue;
      const m = asset?.endsWith('/') ? metaOf(asset) : null;
      if (asset?.endsWith('/') && !m) continue;   // a folder with no media.json: G-LOCAL's finding
      if (!m?.marks?.[target]) fail.push(`screen: ${where}: ${a.do} names mark "${target}", which ${asset ?? 'the bare screen'} does not carry${m?.marks ? ` (marks: ${Object.keys(m.marks).join(', ')})` : ''}`);
    }
    if (b.fx === 'devices/laptop' && b.params?.menu) {
      const items = String(b.params.menu).split(',').map((x) => x.trim()).filter(Boolean);
      if (items.length > 5) warn.push(`screen: ${where}: the laptop menu has ${items.length} items; it shows 5 and drops ${items.slice(5).join(', ')}`);
    }
  }
  return { fail, warn };
}
