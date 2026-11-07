// `mm sound suggest` (SPEC §9), the pure part: the moments of a film's schedule that could take a sound, a cue and a
// weight for each, and the choice among them under a budget. No Node built-in, so the studio can load it.
//
//   settingsOf(style)                     the defaults with the style's `sound.suggest` laid over them
//   budgetFor({ flag, style })            { perTen, note }: the flag, else the middle of the style's cuesPer10s band, else 5; never above the band
//   momentsOf({ schedule, story, style, cueMeta? })
//                                         every moment: { id, kind, t, frame, scene, slot, selector, cue, strength, weight, why, beat }
//                                         kinds: entrance, type, count, cut, press, settle, exit. `beat` is { scene, index } when
//                                         that beat's own cue would sound at the moment (the kit plays a beat's cue as the beat
//                                         arrives, or ends it on the landing for a cue that declares anchor "end"), else null.
//                                         A moment whose beat already has a cue is covered and not listed.
//   chooseMoments(moments, { durationS, budgetPer10s, existing, durOf, cfg })
//                                         { chosen, left }: greedy by weight under the budget, each role's minimum gap
//                                         (sound-roles.mjs), the repeat gap of one cue, two sounding at once at most, one
//                                         moment per beat, and a hook in the first 0.6 s
//   proposalOf({ schedule, story, style, existing?, budgetPer10s, exists, durOf?, cueMeta? })
//                                         the proposal file: chosen rows say whether `apply` writes them, they `need cue` or `need beat`
//   editsOf(rows)                         the beat.set edit ops of the rows that write
//   tableOf(proposal)                     the readable table
import { CUE_ROLE, ROLES } from './sound-roles.mjs';
import { cueEvents } from './cues.mjs';

export const FPS = 30;

/** The moment kinds a style may name a cue for, and the cue each takes unless it says otherwise. */
export const CUE_KINDS = ['entrance', 'type', 'count', 'cut', 'hit', 'tap', 'click', 'settle', 'exit'];

export const DEFAULTS = {
  budgetPer10s: 5,           // cues per 10 s, unless the style's cuesPer10s band or --budget says otherwise
  hookS: 0.6,                // a film opens with a sound by here
  earlyS: 2,                 // the first seconds are favoured ...
  earlyBoost: 1.3,
  heroBoost: 1.25,           // ... so is a headline ...
  ctaBoost: 1.25,            // ... and the last scene, where the call to action stands
  hitShare: 1 / 3,           // the share of sounding cuts, strongest first, that take a hit rather than a whoosh
  repeatGapMs: 350,          // one cue does not sound again sooner than this
  atOnce: 2,                 // at most this many sounds at once
  applyEarlyS: 0.045,        // a beat carries a moment when its cue would sound no more than this before it ...
  applyLateS: 0.075,         // ... and no more than this after it (a sound leading by more than 45 ms reads early, a peak 75 ms late reads late)
  instantS: 0.05,            // an entrance this short is already there
  typeGroupS: 1.5,           // a type-on is proposed in groups of this length
  holdS: 0.5,                // a scene's settle is a moment when the scene then holds this long
  fallbackDurS: 0.15,        // a cue whose length is unknown sounds this long
  weights: { cut: 1, count: 0.85, press: 0.8, type: 0.75, entrance: 0.7, settle: 0.55, exit: 0.4 },
  cues: { entrance: 'pop-in', type: 'key', count: 'counter', cut: 'whoosh', hit: 'cut-hit', tap: 'tap', click: 'click', settle: 'ready', exit: 'swipe' },
};

const TYPE_FX = new Set(['entrances/typewriter']);
const COUNT_FX = new Set(['entrances/count', 'data/counter', 'data/odometer', 'data/stat-tile']);
const PRESS_PATTERNS = new Set(['screen/tap']);
const TOUCH_FX = ['devices/phone', 'devices/tablet'];

/** How hard an entrance lands, 0 to 1; a pattern not listed is 0.5, a device 0.8. */
const ENTRANCE_STRENGTH = {
  'entrances/slam': 1, 'entrances/punch': 1, 'entrances/pop': 0.9, 'entrances/drop': 0.9, 'entrances/scatter-settle': 0.8,
  'entrances/card-flip': 0.8, 'entrances/swing': 0.7, 'entrances/rise': 0.5, 'entrances/fade': 0.3, 'entrances/ghost-fade': 0.3,
};
/** How hard a transition cuts, 0 to 1; a pattern not listed is 0.6. */
const CUT_STRENGTH = {
  'transitions/impact': 1, 'transitions/anticipation': 0.9, 'transitions/whip-pan': 0.9, 'transitions/zoom-through': 0.85, 'transitions/hard-cut': 0.7,
  'transitions/flood': 0.7, 'transitions/push': 0.7, 'transitions/flip': 0.7, 'transitions/wipe': 0.65, 'transitions/brush-wipe': 0.65,
  'transitions/cover': 0.6, 'transitions/zoom-out': 0.6, 'transitions/split': 0.55, 'transitions/beam': 0.55, 'transitions/re-ink': 0.55,
  'transitions/clock-wipe': 0.5, 'transitions/iris': 0.5, 'transitions/blinds': 0.5, 'transitions/shared-element': 0.5,
  'transitions/sketch-to-ink': 0.4, 'transitions/grid-dissolve': 0.4,
};
/** Transitions that dissolve rather than cut: a sound on them would be a sound on nothing. */
const SILENT_CUTS = new Set(['transitions/crossfade', 'transitions/blur-crossfade', 'transitions/dissolve-edge', 'transitions/color-dip', 'transitions/light-leak']);

const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const frameOf = (t) => Math.round(t * FPS);
const roleKey = (cue) => CUE_ROLE[String(cue).replace(/^sound\//, '')] ?? 'tone';
const refKey = (b) => (b ? `${b.scene}#${b.index}` : null);

/** The defaults with the style's `sound.suggest` ({ cues, hitShare, repeatGapMs }) laid over them. */
export function settingsOf(style) {
  const s = style?.sound?.suggest ?? {};
  return {
    ...DEFAULTS,
    cues: { ...DEFAULTS.cues, ...(s.cues ?? {}) },
    ...(typeof s.hitShare === 'number' ? { hitShare: s.hitShare } : {}),
    ...(typeof s.repeatGapMs === 'number' ? { repeatGapMs: s.repeatGapMs } : {}),
  };
}

/** The cues per 10 s to plan for: the flag, else the middle of the style's cuesPer10s band, else 5; capped at the band's top. */
export function budgetFor({ flag = null, style = null } = {}) {
  const band = style?.sound?.cuesPer10s;
  const hi = Array.isArray(band) ? band[1] : null;
  const wanted = flag ?? (Array.isArray(band) ? (band[0] + band[1]) / 2 : DEFAULTS.budgetPer10s);
  if (hi != null && wanted > hi) return { perTen: hi, note: `--budget ${wanted} is above the style's band ${band[0]}-${band[1]} per 10 s: planning for ${hi}` };
  return { perTen: wanted, note: null };
}

/** The moments of a film's schedule. `cueMeta(name)` returns { anchor, durationS } of a cue pattern, or {} when it has none. */
export function momentsOf({ schedule, story, style, cueMeta = () => ({}) }) {
  if (schedule?.kind !== 'film') return [];
  const cfg = settingsOf(style);
  const lastScene = story.scenes.at(-1)?.id;
  const parents = schedule.items.filter((it) => !it.parent);

  // every beat with its schedule item, by scene and index
  const beats = [];
  story.scenes.forEach((sc, si) => {
    const items = parents.filter((it) => it.scene === sc.id);
    sc.beats.forEach((beat, index) => {
      const it = items.length === sc.beats.length ? items[index] : items.find((i) => i.beat === beat);
      if (it) beats.push({ it, beat, scene: sc.id, si, index, ref: { scene: sc.id, index } });
    });
  });

  const meets = (b, cue) => { const m = cueMeta(cue); return m.anchor === 'end' && m.durationS > 0 ? b.it.start + b.it.d : b.it.start; };
  // the beat among `cands` whose cue would sound at t; covered when the beat that fits already has a cue
  const carry = (t, cue, cands) => {
    const fit = cands.filter((b) => { const d = meets(b, cue) - t; return d >= -cfg.applyEarlyS - 1e-9 && d <= cfg.applyLateS + 1e-9; });
    const free = fit.find((b) => !b.beat.cue);
    if (free) return { ref: free.ref, covered: null };
    return { ref: null, covered: fit.length ? fit[0].beat.cue : null };
  };

  const out = [];
  const add = (m, cands = []) => {
    const cue = m.cue;
    const { ref, covered } = carry(m.t, cue, cands);
    if (covered) return;
    const importance = (m.hero ? cfg.heroBoost : 1) * (m.scene === lastScene ? cfg.ctaBoost : 1);
    const early = m.t < cfg.earlyS ? cfg.earlyBoost : 1;
    const weight = r2(cfg.weights[m.kind] * (0.4 + 0.6 * m.strength) * importance * early);
    out.push({ id: `${m.kind}:${m.scene}:${Math.round(m.t * 1000)}`, kind: m.kind, t: r3(m.t), frame: frameOf(m.t), scene: m.scene, slot: m.slot ?? null,
      selector: m.selector ?? null, cue, strength: r2(m.strength), weight, why: m.why, beat: ref });
  };

  for (const b of beats) {
    const { it, beat, scene } = b;
    const hero = beat.slot === 'headline' || (b.si === 0 && b.index === 0);
    const base = { scene, slot: it.slot, selector: it.selector, hero };
    const label = `${it.fx}${it.slot ? ` in ${it.slot}` : ''}, scene ${scene}`;
    if (TYPE_FX.has(it.fx)) {
      const groups = Math.max(1, Math.ceil(it.d / cfg.typeGroupS - 1e-9));
      for (let k = 0; k < groups; k++) add({ ...base, kind: 'type', t: it.start + k * cfg.typeGroupS, cue: cfg.cues.type, strength: 0.8, why: `a line typed out (${label})${groups > 1 ? `, stroke group ${k + 1} of ${groups}` : ''}` }, k === 0 ? [b] : []);
    } else if (COUNT_FX.has(it.fx)) {
      add({ ...base, kind: 'count', t: it.d > cfg.instantS ? it.start + it.d : it.start, cue: cfg.cues.count, strength: 0.9, why: `a figure lands on its value (${label})` }, [b]);
    } else if (it.d > cfg.instantS || (hero && it.start < cfg.earlyS)) {
      const strength = ENTRANCE_STRENGTH[it.fx] ?? (it.fx?.startsWith('devices/') ? 0.8 : 0.5);
      add({ ...base, kind: 'entrance', t: it.start, cue: cfg.cues.entrance, strength, why: `${hero ? 'the headline arrives' : 'an entrance'} (${label})` }, [b]);
    }
    for (const a of beat.screen ?? []) {
      if (!PRESS_PATTERNS.has(a.do)) continue;
      const touch = TOUCH_FX.some((p) => it.fx?.startsWith(p));
      add({ ...base, kind: 'press', t: it.start + (a.at ?? 0), cue: touch ? cfg.cues.tap : cfg.cues.click, strength: 0.9, why: `a press on the screen (${label})` }, [b]);
    }
    if (it.exit) add({ ...base, kind: 'exit', t: it.exit.start, cue: cfg.cues.exit, strength: 0.5, why: `the beat leaves (${label})` });
  }

  // cuts: every scene after the first whose transition moves; the strongest third (of those that sound) take a hit
  const cuts = (schedule.scenes ?? []).slice(1).map((s, i) => ({ s, pattern: s.cut?.pattern, si: i + 1 }))
    .filter((c) => !SILENT_CUTS.has(c.pattern))
    .map((c) => ({ ...c, strength: CUT_STRENGTH[c.pattern] ?? 0.6 }));
  const strongest = new Set([...cuts].sort((a, b) => b.strength - a.strength || a.si - b.si).slice(0, Math.ceil(cuts.length * cfg.hitShare - 1e-9)).map((c) => c.s.id));
  for (const c of cuts) {
    add({ kind: 'cut', t: c.s.start, scene: c.s.id, selector: `[data-scene="${c.s.id}"]`, cue: strongest.has(c.s.id) ? cfg.cues.hit : cfg.cues.cut, strength: c.strength,
      why: `the cut into ${c.s.id} (${String(c.pattern).replace('transitions/', '')})${strongest.has(c.s.id) ? ', one of the strongest' : ''}` }, beats.filter((b) => b.scene === c.s.id));
  }

  // settles: a scene that comes to rest and then holds
  for (const h of schedule.holds ?? []) {
    if (h.to - h.from < cfg.holdS - 1e-9) continue;
    add({ kind: 'settle', t: h.from, scene: h.scene, cue: cfg.cues.settle, strength: 0.6, why: `scene ${h.scene} comes to rest and holds ${r2(h.to - h.from)} s` });
  }
  return out.sort((a, b) => a.t - b.t || b.weight - a.weight || a.id.localeCompare(b.id));
}

/**
 * Chooses among the moments: the hook first (the best moment in the first `hookS` when the film has no sound there),
 * then by weight, until the budget is spent. `existing` ([{ t, name }]) are sounds already in the film; they take
 * their share of the budget and their place in the gaps. `durOf(cue)` is a cue's length in seconds.
 */
export function chooseMoments(moments, { durationS, budgetPer10s, existing = [], durOf = () => DEFAULTS.fallbackDurS, cfg = DEFAULTS }) {
  const total = Math.max(0, Math.round((durationS / 10) * budgetPer10s));
  let room = Math.max(0, total - existing.length);
  const taken = existing.map((e) => ({ t: e.t, cue: e.name, beat: null }));
  const chosen = [];
  const why = new Map();

  const blocked = (c) => {
    const all = [...taken, ...chosen];
    for (const s of all) {
      const dt = Math.abs(s.t - c.t);
      if (s.cue === c.cue && dt * 1000 < cfg.repeatGapMs - 1e-6) return `${c.cue} sounded ${Math.round(dt * 1000)} ms away (the same cue waits ${cfg.repeatGapMs} ms)`;
      const role = roleKey(c.cue);
      if (role === roleKey(s.cue) && dt * 1000 < ROLES[role].minGapMs - 1e-6) return `a ${role} sounded ${Math.round(dt * 1000)} ms away (a ${role} waits ${ROLES[role].minGapMs} ms)`;
      if (c.beat && s.beat && refKey(c.beat) === refKey(s.beat)) return `beat ${refKey(c.beat)} already takes a cue`;
    }
    const events = [...all, c];
    const len = (e) => durOf(e.cue) ?? cfg.fallbackDurS;
    for (const p of [c.t, ...events.filter((e) => e.t > c.t && e.t < c.t + len(c)).map((e) => e.t)]) {
      if (events.filter((e) => e.t <= p + 1e-9 && e.t + len(e) > p + 1e-9).length > cfg.atOnce) return `a third would sound at once (at most ${cfg.atOnce === 2 ? 'two' : cfg.atOnce} at once)`;
    }
    return null;
  };
  const take = (c, extra = {}) => { chosen.push({ ...c, ...extra }); room--; };
  const ranked = [...moments].sort((a, b) => b.weight - a.weight || a.t - b.t || a.id.localeCompare(b.id));

  if (room > 0 && !existing.some((e) => e.t <= cfg.hookS + 1e-9)) {
    const hook = ranked.find((c) => c.t <= cfg.hookS + 1e-9 && !blocked(c));
    if (hook) take(hook, { hook: true });
  }
  for (const c of ranked) {
    if (chosen.some((o) => o.id === c.id)) continue;
    if (room <= 0) { why.set(c.id, `the budget of ${total} (${budgetPer10s} per 10 s) is spent`); continue; }
    const reason = blocked(c);
    if (reason) why.set(c.id, reason); else take(c);
  }
  chosen.sort((a, b) => a.t - b.t || b.weight - a.weight);
  const left = ranked.filter((c) => !chosen.some((o) => o.id === c.id)).map((c) => ({ ...c, reason: why.get(c.id) ?? 'not chosen' }));
  return { chosen, left, budget: total };
}

/** The proposal file for a film. */
export function proposalOf({ schedule, story, style, existing = null, budgetPer10s, exists, durOf = null, cueMeta = () => ({}) }) {
  const cfg = settingsOf(style);
  const have = existing ?? cueEvents(schedule).filter((c) => c.name !== 'bed').map((c) => ({ t: c.t, name: c.name }));
  const moments = momentsOf({ schedule, story, style, cueMeta });
  const dur = durOf ?? ((cue) => cueMeta(cue).durationS ?? cfg.fallbackDurS);
  const res = chooseMoments(moments, { durationS: schedule.duration, budgetPer10s, existing: have, durOf: dur, cfg });
  const row = (c) => ({
    id: c.id, kind: c.kind, t: c.t, frame: c.frame, scene: c.scene, slot: c.slot, cue: c.cue, role: roleKey(c.cue), weight: c.weight, why: c.why, beat: c.beat,
    apply: c.beat ? (exists(c.cue) ? 'write' : 'needs cue') : 'needs beat', ...(c.hook ? { hook: true } : {}),
  });
  const chosen = res.chosen.map(row);
  return {
    version: 1, piece: story.id, duration: schedule.duration, fps: FPS, budgetPer10s, budget: res.budget, existing: have.length,
    perTen: r2(((chosen.length + have.length) / schedule.duration) * 10),
    candidates: moments.length, chosen,
    left: res.left.slice(0, 40).map((c) => ({ ...row(c), reason: c.reason })),
  };
}

/** The beat.set ops of the rows `apply` writes (a row the person marked `approved: false` is left out). */
export const editsOf = (rows) => rows.filter((r) => r.apply === 'write' && r.beat && r.approved !== false)
  .map((r) => ({ op: 'beat.set', scene: r.beat.scene, beat: r.beat.index, key: 'cue', value: r.cue }));

const pad = (s, n) => String(s).padEnd(n);

/** The readable table of a proposal. */
export function tableOf(p) {
  const rows = p.chosen.map((c) => `${pad(c.t.toFixed(2), 7)}${pad(c.frame, 7)}${pad(c.kind, 9)}${pad(c.cue, 10)}${pad(c.weight.toFixed(2), 7)}${pad(c.apply, 11)}${c.hook ? '(hook) ' : ''}${c.why}`);
  return [
    `${p.chosen.length} cues proposed for ${p.duration} s (${p.budget} in the budget of ${p.budgetPer10s} per 10 s, ${p.existing} already in the film; ${p.candidates} moments considered)`,
    `${pad('t', 7)}${pad('frame', 7)}${pad('moment', 9)}${pad('cue', 10)}${pad('weight', 7)}${pad('apply', 11)}why`,
    ...rows,
  ].join('\n');
}
