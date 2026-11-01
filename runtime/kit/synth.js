// Web Audio building blocks for the sound patterns: a seeded noise buffer, a gain envelope, a
// pitched tone and a filtered noise burst, each scheduled on an AudioContext at a time in seconds.
// Pure in their arguments: the noise comes from a seeded generator (mulberry32, not the kit's
// random(): the cues' calibration was measured against this sequence), so a cue renders to the same
// samples every time. Below them, cues as data: recipes rendered to samples and voiced by a sound profile.

import { MODE_SLOPE, modePartials } from './modes.js';

const rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
export function noiseBuf(ctx, secs, seed) {
  const n = Math.max(1, Math.round(ctx.sampleRate * secs));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0), r = rng(seed);
  for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
  return buf;
}
const FLOOR = 0.0001;
// Envelope: silence, a short attack to peak, then an exponential decay that ends at at + dur.
// With swell: a rise from the floor to peak at the end, released over the last 20 ms.
// With soft: the decay stops at 6 % of peak at 85 % of the length and falls linearly to silence,
// so a chord rings for most of its length instead of dying early.
function shape(g, at, peak, atk, dur, swell, soft) {
  const p = g.gain;
  if (swell) {
    p.setValueAtTime(FLOOR, at);
    p.exponentialRampToValueAtTime(peak, at + dur - 0.02);
    p.linearRampToValueAtTime(0, at + dur);
    return;
  }
  p.setValueAtTime(0, at);
  p.linearRampToValueAtTime(peak, at + atk);
  if (soft) {
    p.exponentialRampToValueAtTime(peak * 0.06, at + dur * 0.85);
    p.linearRampToValueAtTime(0, at + dur);
    return;
  }
  p.exponentialRampToValueAtTime(FLOOR, at + dur);
  p.setValueAtTime(0, at + dur);
}
export function tone(ctx, o) {
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f0, o.at);
  if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(o.f1, o.at + o.dur);
  const g = ctx.createGain();
  shape(g, o.at, o.peak, o.atk ?? 0.003, o.dur, o.swell, o.soft);
  if (o.lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    osc.connect(f);
    f.connect(g);
  } else osc.connect(g);
  g.connect(ctx.destination);
  osc.start(o.at);
  osc.stop(o.at + o.dur + 0.02);
}
export function burst(ctx, o) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf(ctx, o.dur + 0.05, o.seed);
  const f = ctx.createBiquadFilter();
  f.type = o.kind || 'bandpass';
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.f0, o.at);
  if (o.f1 && o.f1 !== o.f0) f.frequency.exponentialRampToValueAtTime(o.f1, o.at + o.dur);
  const g = ctx.createGain();
  shape(g, o.at, o.peak, o.atk ?? 0.002, o.dur, o.swell, o.soft);
  src.connect(f);
  f.connect(g);
  g.connect(ctx.destination);
  src.start(o.at);
  src.stop(o.at + o.dur + 0.02);
}

// ------------------------------------------------------------------------------------------------
// Recipes: a cue as data (contracts/sound-recipe.schema.json). `renderRecipe` turns one into samples in plain
// JavaScript and `layers` plays them on a context; `applyProfile` voices a recipe in a sound profile first;
// `recipeModule` wraps it all as the sound pattern module the loaders expect. Nothing here reads a clock
// or an unseeded random number, and no audio graph computes a sample: the same recipe, seed, emphasis and profile give
// the same samples, in a browser and in Node.

export const NATIVE_LUFS = -30;       // the level a recipe's masterGain is set for, rendered as written (loudest 100 ms, K-weighted)
export const REF_SEND_DB = -22;       // the room send a recipe's own `room.send` is written against
export const SIDE_MID_DB = -22;       // the stereo width of a recipe rendered without a profile
export const FLOOR_T60_S = 0.028;     // a higher partial never decays faster than this
const STRUCK_ATTACK_S = 0.01;         // an attack up to this is a struck note and sits inside a profile's attack range; a longer one is a swell
export const EMPHASIS_RANKS ={ subtle: 0, normal: 1, strong: 2 };
const ROOM_SEED = 95;                // one seeded room for every cue: what makes a palette one place. The seed with the smallest worst left/right lean over the shipped palette in both profiles at every emphasis, of the first 96
const PITCH_CLASS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const dbToLin = (d) => 10 ** (d / 20);
const FADE_S = 0.01;                 // every layer ends in a 10 ms fade

// What a field of a `pass` or `gated` layer is when the recipe leaves it out. `aim` fills a missing field from here, never from the middle of its range.
export const PASS_DEFAULTS = { apexAt: 0.6, riseK: 0.8, fallK: 1.2, startDb: -36, endDb: -60, f: 420, upOct: 1.5, downOct: 1.8, track: 0.5, qAir: 1.1, lpRatio: 3, doppler: 0, dopplerS: 0.03 };
export const PASS_SUB_DEFAULTS = { low: { db: -12, f: 130, smoothS: 0.03 }, sub: { db: -20, f: 60, glideOct: 0.3, drive: 0.5 }, hiss: { db: -18, hpHz: 2500, open: 1.2, pow: 1.8 } };
export const GATED_DEFAULTS = { source: 'noise', duty: 0.5, depth: 1, openS: 0.03, rampS: 0.0012, riseDb: 0, curve: 2, periodCurve: 1.4 };
export const GATE_RELEASE_S = 0.004;  // the ramp of a layer's or the cue's `gate`
const TIME_KEYS = ['envelope', 'gate', 'tremolo', 'drive', 'sweep', 'chain'];

/** Seconds from the start of a layer to the end of it: its length, the last point of its envelope, or attack + T60; a hard gate ends it sooner. */
export function layerLenS(l) {
  let len = l.kind === 'pass' || l.kind === 'gated' ? l.lengthS : l.envelope ? l.envelope[l.envelope.length - 1][0] : (l.attackS ?? 0.002) + l.t60;
  if (l.gate && (l.gate.dropDb ?? 90) >= 90) len = Math.min(len, l.gate.atS + (l.gate.releaseS ?? GATE_RELEASE_S));
  return len;
}
/** Seconds from the start of the cue to the end of a layer. */
export const layerEndS = (l) => (l.offsetS ?? 0) + layerLenS(l);
// The time a layer takes to fall silent, for the profile's length ladder: its T60, its length, or the end of its envelope.
const layerSpanS = (l) => (l.kind === 'pass' || l.kind === 'gated' ? l.lengthS : l.envelope ? l.envelope[l.envelope.length - 1][0] : l.t60);

/** The length ladder: input up to 0.06 s, surface up to 0.3 s, outcome up to 0.65 s, then a swell. */
export const familyOf = (durationS) => (durationS <= 0.06 ? 'input' : durationS <= 0.3 ? 'surface' : durationS <= 0.65 ? 'outcome' : 'swell');

/** A stable seed from a cue's name (FNV-1a), so each cue's noise and variation are its own. */
export function seedOf(name) {
  let h = 0x811c9dc5;
  for (const ch of String(name)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const nearestKeyHz = (f, key) => {
  const m = 69 + 12 * Math.log2(f / 440);
  let best = null;
  for (const name of key) {
    const k = PITCH_CLASS[name];
    if (k === undefined) continue;
    const n = k + 12 * Math.round((m - k) / 12);
    if (best === null || Math.abs(m - n) < Math.abs(m - best)) best = n;
  }
  return best === null || Math.abs(m - best) <= 0.2 ? f : 440 * 2 ** ((best - 69) / 12);   // within 20 cents is in key (a twin's slow beat survives)
};

// A layer that names a table of modes (`modes: "tubular"`) gets those partials, unless it lists its own.
function expandModes(r) {
  for (const l of r.layers) if (l.kind === 'tone' && l.modes && !l.partials) l.partials = modePartials(l.modes);
}

// A layer's times grow or shrink together: its T60, length, offset, glide, and the time of every breakpoint of its envelope, sweep and gate.
function scaleLayerTime(l, k) {
  if (l.t60 !== undefined) l.t60 *= k;
  if (l.lengthS !== undefined) l.lengthS *= k;
  if (l.offsetS) l.offsetS *= k;
  if (l.glideS) l.glideS *= k;
  if (l.envelope) l.envelope = l.envelope.map(([t, db]) => [t * k, db]);
  if (l.sweep) l.sweep = l.sweep.map(([t, hz]) => [t * k, hz]);
  if (l.gate) l.gate = { ...l.gate, atS: l.gate.atS * k };
}
/** Scales every time of a recipe (its length, the layers', the cue's own gate) by `k`; pure. Used by `aim` and by a profile's length ceiling. */
export function scaleRecipeTime(recipe, k) {
  const r = clone(recipe);
  r.durationS *= k;
  for (const l of r.layers) scaleLayerTime(l, k);
  if (r.finish?.gate) r.finish.gate.atS *= k;
  return r;
}

const interval = (from, to) => {
  const a = PITCH_CLASS[from], b = PITCH_CLASS[to];
  if (a === undefined || b === undefined) throw new Error(`unknown key "${a === undefined ? from : to}": use a pitch class such as C, F# or Bb`);
  return ((((b - a) % 12) + 12 + 6) % 12) - 6;      // the shortest way, -6 up to +5 semitones
};

/**
 * The recipe a render starts from, given a beat's knobs: `variant` merges one of the recipe's `variants` over its layers
 * (the base is the default variant); `key` moves the layers marked `keyed` from the recipe's own key (`key`, C by default)
 * to that pitch class by the shortest interval; `durS` aims the cue at that length (see aim.js). Pure; a recipe with no
 * knobs set comes back unchanged.
 */
export function resolveRecipe(recipe, opts = {}) {
  let r = recipe;
  if (r.variants) {
    const name = opts.variant ?? r.variant ?? Object.keys(r.variants)[0];
    const patch = r.variants[name] ?? (name === r.variant ? {} : undefined);
    if (!patch) throw new Error(`${r.name}: unknown variant "${name}" (${Object.keys(r.variants).join(', ')})`);
    r = clone(r);
    delete r.variants;
    r.variant = name;
    if (patch.durationS !== undefined) r.durationS = patch.durationS;
    if (patch.masterGain !== undefined) r.masterGain = patch.masterGain;
    if (patch.finish) r.finish = { ...(r.finish ?? {}), ...patch.finish };
    for (const [i, edit] of Object.entries(patch.layers ?? {})) {
      if (!r.layers[i]) throw new Error(`${r.name}: variant "${name}" edits layer ${i}, which does not exist`);
      Object.assign(r.layers[i], edit);
    }
  }
  if (opts.key !== undefined && opts.key !== null && opts.key !== '') {
    const semis = interval(r.key ?? 'C', String(opts.key));
    if (semis !== 0 && r.layers.some((l) => l.keyed)) {
      r = clone(r);
      const up = 2 ** (semis / 12);
      for (const l of r.layers) if (l.keyed) {
        l.f *= up;
        if (typeof l.glideTo === 'number') l.glideTo *= up;
        if (l.sweep) l.sweep = l.sweep.map(([t, hz]) => [t, hz * up]);
      }
    }
  }
  if (Number(opts.durS) > 0) r = aim(r, { durS: Number(opts.durS) });
  return r;
}

/**
 * Voices a recipe in a sound profile; pure, the recipe is not changed. Returns { recipe, sideMidDb }.
 * modes: `none` strips partials, `string` snaps them to whole numbers. register: fundamentals fold by
 * octaves into [minHz, maxCentreHz], band centres are capped, partials outside the range are dropped.
 * key: a fundamental more than 20 cents from every note of the key moves to the nearest. envelope:
 * a struck attack is held inside the profile's range, and when the cue's slowest T60 is over the
 * family's longest, every time of the cue shrinks in proportion (a swell has no band). room: the
 * profile's shape, the recipe's own send kept relative to the reference. loudness: masterGain is
 * moved from the matched native level to the profile's. A `pass` layer's air centre and the sub under it
 * are held in the register too, and a layer's `chain` stages that centre a band are capped like a band-pass.
 */
export function applyProfile(recipe, profile) {
  const r = clone(recipe);
  expandModes(r);
  if (!profile) return { recipe: r, sideMidDb: SIDE_MID_DB };
  const { register, key, envelope, modes } = profile;
  const fold = (f) => {
    let shift = 0;
    while (f > register.maxCentreHz && f / 2 >= register.minHz) { f /= 2; shift--; }
    while (f < register.minHz && f * 2 <= register.maxCentreHz) { f *= 2; shift++; }
    return { f, shift };
  };
  for (const l of r.layers) {
    if (l.kind === 'tone' || (l.kind === 'gated' && l.source === 'tone')) {
      const folded = fold(l.f);
      const shift = folded.shift;
      let f = folded.f;
      l.f = f;
      if (typeof l.glideTo === 'number') l.glideTo *= 2 ** shift;
      if (l.sweep) l.sweep = l.sweep.map(([t, hz]) => [t, hz * 2 ** shift]);
      if (key?.length) { l.f = nearestKeyHz(l.f, key); if (typeof l.glideTo === 'number') l.glideTo = nearestKeyHz(l.glideTo, key); }
      if (l.kind === 'tone') {
        let ps = l.partials ?? [[1, 0]];
        if (modes === 'none') ps = [[1, 0]];
        else if (modes === 'string') {
          const by = new Map();
          for (const [ratio, db] of ps) { const n = Math.max(1, Math.round(ratio)); by.set(n, Math.max(by.get(n) ?? -Infinity, db)); }
          ps = [...by].sort((a, b) => a[0] - b[0]).map(([n, db]) => [n, db]);
        }
        l.partials = ps.filter(([ratio]) => l.f * ratio >= register.minHz && l.f * ratio <= 18000);
        if (!l.partials.length) l.partials = [[1, 0]];
      }
    } else if (l.kind === 'pass') {
      const cap = register.maxCentreHz / 2.5;       // the top of the three bands sits at 2.5 f
      l.f = Math.min(l.f ?? PASS_DEFAULTS.f, cap);
      if (l.sub) {                                    // the sub stays over the floor: lifted by octaves until it is, then its sink is
        const S = { ...PASS_SUB_DEFAULTS.sub, ...l.sub };   // shortened (lifting it further for the sink makes a whistle, not a sub)
        let f = S.f, glideOct = S.glideOct ?? 0;
        while (f < register.minHz && f * 2 <= register.maxCentreHz) f *= 2;
        if (f * 2 ** -glideOct < register.minHz) glideOct = Math.max(0, Math.log2(f / register.minHz));
        l.sub = { ...l.sub, f, glideOct };
      }
      if (l.low) l.low = { ...l.low, f: Math.max(l.low.f ?? PASS_SUB_DEFAULTS.low.f, 3 * register.minHz) };   // its high-pass sits at f / 2.5, a second-order slope that leaks a little under it
    } else if (l.filter?.type === 'bandpass') {
      const cap = register.maxCentreHz;
      if (l.filter.f > cap) { if (typeof l.glideTo === 'number') l.glideTo *= cap / l.filter.f; l.filter.f = cap; }
      if (typeof l.glideTo === 'number') l.glideTo = Math.min(l.glideTo, cap);
      if (l.sweep) l.sweep = l.sweep.map(([t, hz]) => [t, Math.min(hz, cap)]);
    }
    for (const stage of l.chain ?? []) if (['bandpass', 'peaking', 'notch'].includes(stage.type) && stage.f > register.maxCentreHz) stage.f = register.maxCentreHz;
    if (!l.envelope && (l.kind === 'tone' || l.kind === 'noise') && (l.attackS ?? 0.002) <= STRUCK_ATTACK_S) l.attackS = Math.min(envelope.attackS[1], Math.max(envelope.attackS[0], l.attackS ?? 0.002));
  }
  const family = familyOf(r.durationS);
  const hi = envelope.t60[family]?.[1];
  const slowest = Math.max(...r.layers.map(layerSpanS));
  if (hi && slowest > hi) {
    const k = hi / slowest;
    r.durationS *= k;
    for (const l of r.layers) scaleLayerTime(l, k);
    if (r.finish?.gate) r.finish.gate.atS *= k;
  }
  const send = r.room ? r.room.send + (profile.room.send - REF_SEND_DB) : profile.room.send;
  r.room = { send, predelayS: profile.room.predelayS, sizeS: profile.room.sizeS, lowpassHz: profile.room.lowpassHz };
  r.masterGain = (r.masterGain ?? 1) * dbToLin(profile.loudness.cueLufs100ms - NATIVE_LUFS);
  return { recipe: r, sideMidDb: profile.stereo.sideMidDb };
}

/** The length of a cue as a profile voices it, with a beat's knobs (variant, key, durS) applied: what its family follows from. */
export const cueDurationS = (recipe, profile = null, opts = {}) => applyProfile(resolveRecipe(recipe, opts), profile).recipe.durationS;

/**
 * The voice list a recipe resolves to for one render: { layers, room, gain, sideAmp, durationS, finish }, each
 * layer { kind, start, attack, t60, seed, glideS, filter, voices: [{ f, g, t60, glideTo }] } with times
 * relative to the cue and `g` the linear level of the voice before the cue gain. A layer that uses the newer
 * fields also carries them (`envelope`, `gate`, `tremolo`, `drive`, `sweep`, `chain`, a voice's `beat`), a `pass`
 * or `gated` layer carries its whole `spec`. `opts.step` raises every tone by that many semitones (a ladder of
 * repeats). Pure; `layers` draws it.
 */
export function plan(recipe, opts = {}) {
  const { emphasis = 'normal', gain = 1, seed = seedOf(recipe.name), profile = null, step = 0 } = opts;
  const { recipe: r, sideMidDb } = applyProfile(resolveRecipe(recipe, opts), profile);
  const rank = (r.emphasis ?? EMPHASIS_RANKS)[emphasis] ?? EMPHASIS_RANKS[emphasis] ?? 1;
  const draw = rng((seed ^ 0x9e3779b9) >>> 0)() * 2 - 1;      // one draw: pitch and force vary together
  const pitch = 1 + (r.vary?.pitch ?? 0) * draw;
  const force = 1 + (r.vary?.force ?? 0) * draw;
  const up = 2 ** ((Number(step) || 0) / 12);
  const out = [];
  r.layers.forEach((l, i) => {
    if ((l.from ?? 0) > rank || !((l.peak ?? 1) > 0)) return;
    const base = { kind: l.kind, start: l.offsetS ?? 0, attack: l.attackS ?? 0.002, t60: l.t60, seed: (seed + i * 7919) >>> 0, glideS: l.glideS ?? 0, filter: l.filter ?? { type: 'none' } };
    const fx = {};
    for (const k of TIME_KEYS) if (l[k] !== undefined) fx[k] = l[k];
    const moves = l.kind === 'tone' ? pitch * up : pitch;
    if (fx.sweep) fx.sweep = fx.sweep.map(([t, hz]) => [t, hz * moves]);
    if (fx.chain) fx.chain = fx.chain.map((s) => ({ ...s, f: s.f * pitch }));
    if (l.kind === 'pass' || l.kind === 'gated') {
      const spec = { ...l, ...(l.f !== undefined || l.kind === 'pass' ? { f: (l.f ?? PASS_DEFAULTS.f) * moves } : {}) };
      if (l.kind === 'gated' && l.filter?.f !== undefined) spec.filter = { ...l.filter, f: l.filter.f * pitch };
      out.push({ ...base, t60: 0, attack: 0, ...fx, voices: [], spec, fx: true });
      return;
    }
    if (l.kind === 'tone') {
      const slope = l.slope ?? MODE_SLOPE;
      const voices = (l.partials ?? [[1, 0]]).map(([ratio, db, mult], vi) => {
        const t60 = l.t60 ?? 0, own = mult === undefined ? t60 : t60 * mult;
        const v = {
          f: l.f * ratio * pitch * up, g: (l.peak ?? 1) * dbToLin(db),
          t60: ratio > 1 ? Math.max(Math.min(FLOOR_T60_S, own), own * ratio ** -slope) : own,
          glideTo: typeof l.glideTo === 'number' ? l.glideTo * ratio * pitch * up : null,
        };
        if (l.sweep) v.ratio = ratio;
        if (l.beatHz) v.beat = l.beatHz * (ratio < 1 ? 0.5 : 1) * (0.4 + 1.2 * rng((base.seed + vi * 104729) >>> 0)());
        return v;
      });
      const usesFx = l.beatHz || Object.keys(fx).length;
      out.push({ ...base, ...fx, voices, ...(usesFx ? { fx: true } : {}) });
    } else {
      out.push({ ...base, ...fx, voices: [{ f: (l.filter?.f ?? 1000) * pitch, g: l.peak ?? 1, t60: l.t60, glideTo: typeof l.glideTo === 'number' ? l.glideTo * pitch : null }], ...(Object.keys(fx).length ? { fx: true } : {}) });
    }
  });
  return { layers: out, room: r.room ?? null, gain: (r.masterGain ?? 1) * gain * force, sideAmp: dbToLin(sideMidDb), durationS: r.durationS, ...(r.finish ? { finish: r.finish } : {}) };
}

// A biquad (RBJ cookbook, linear Q) as five coefficients [b0, b1, b2, a1, a2], each divided by a0.
function biquadCoeffs(type, f, q, sr) {
  const w0 = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr, cos = Math.cos(w0), alpha = Math.sin(w0) / (2 * q);
  let b0, b1, b2;
  if (type === 'lowpass') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
  else if (type === 'highpass') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
  else { b0 = alpha; b1 = 0; b2 = -alpha; }           // band-pass, 0 dB at the centre
  const a0 = 1 + alpha;
  return [b0 / a0, b1 / a0, b2 / a0, (-2 * cos) / a0, (1 - alpha) / a0];
}

// Radix-2 FFT in place on float64 arrays (inverse when `inv`), twiddles from Math.cos/Math.sin.
function fftInPlace(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const a = re[i]; re[i] = re[j]; re[j] = a; const b = im[i]; im[i] = im[j]; im[j] = b; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, step = ((inv ? 2 : -2) * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const wr = Math.cos(step * k), wi = Math.sin(step * k), a = i + k, b = a + half;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

// x convolved with each of `irs`, the first `len` samples of each.
function convolveMany(x, irs, len) {
  let n = 1;
  while (n < x.length + irs[0].length) n <<= 1;
  const xr = new Float64Array(n), xi = new Float64Array(n);
  xr.set(x);
  fftInPlace(xr, xi, false);
  return irs.map((ir) => {
    const hr = new Float64Array(n), hi = new Float64Array(n);
    hr.set(ir);
    fftInPlace(hr, hi, false);
    for (let k = 0; k < n; k++) { const r = xr[k] * hr[k] - xi[k] * hi[k], i = xr[k] * hi[k] + xi[k] * hr[k]; hr[k] = r; hi[k] = i; }
    fftInPlace(hr, hi, true);
    return hr.subarray(0, len);
  });
}

// The shared room's impulse responses: two independent seeded channels, an exponential tail of `sizeS`,
// each scaled to unit energy so the room leans neither way.
function roomIr(sr, sizeS, seed) {
  const n = Math.max(2, Math.round(sr * sizeS * 1.2));
  return [0, 1].map((c) => {
    const d = new Float64Array(n), r = rng(seed + c * 7919);
    let e = 0;
    for (let i = 0; i < n; i++) { d[i] = (r() * 2 - 1) * Math.exp((-6.9078 * i) / (sr * sizeS)); e += d[i] * d[i]; }
    const s = 1 / Math.sqrt(e);
    for (let i = 0; i < n; i++) d[i] *= s;
    return d;
  });
}

// ------------------------------------------------------------------------------------------------
// The newer layers: a layer that uses an envelope, a gate, a tremolo, a drive, a sweep, a chain of filters or a
// doublet beat, and the `pass` and `gated` kinds, are rendered into their own buffers (a mid and a side) and added
// to the cue. A layer that uses none of them is drawn by the loop in `renderRecipe`, unchanged. Ported in idea from
// Earshot's designed sounds (MIT, see NOTICE): its whoosh pass engine, its accelerating stutter gate, breakpoint
// envelopes in dB, a hard-end gate, soft saturation and its sweeping filters; the code is our own, seeded and in
// float64 so a render is the same on every machine.

const TAU = 2 * Math.PI;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function runBiquad(x, c) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = c[0] * x[i] + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

// The RBJ cookbook for the stages a chain may hold: the three of `biquadCoeffs` and a peaking dip or boost, a notch, two shelves.
function stageCoeffs(type, f, q, db, sr) {
  if (type === 'lowpass' || type === 'highpass' || type === 'bandpass') return biquadCoeffs(type, f, q, sr);
  const w0 = (TAU * Math.min(f, sr * 0.45)) / sr, cos = Math.cos(w0), sin = Math.sin(w0), A = 10 ** (db / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'notch') {
    const al = sin / (2 * q);
    b0 = 1; b1 = -2 * cos; b2 = 1; a0 = 1 + al; a1 = -2 * cos; a2 = 1 - al;
  } else if (type === 'peaking') {
    const al = sin / (2 * q);
    b0 = 1 + al * A; b1 = -2 * cos; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cos; a2 = 1 - al / A;
  } else {
    const al = (sin / 2) * Math.sqrt(2), s = 2 * Math.sqrt(A) * al;        // shelf slope 1
    if (type === 'lowshelf') {
      b0 = A * (A + 1 - (A - 1) * cos + s); b1 = 2 * A * (A - 1 - (A + 1) * cos); b2 = A * (A + 1 - (A - 1) * cos - s);
      a0 = A + 1 + (A - 1) * cos + s; a1 = -2 * (A - 1 + (A + 1) * cos); a2 = A + 1 + (A - 1) * cos - s;
    } else {
      b0 = A * (A + 1 + (A - 1) * cos + s); b1 = -2 * A * (A - 1 + (A + 1) * cos); b2 = A * (A + 1 + (A - 1) * cos - s);
      a0 = A + 1 - (A - 1) * cos + s; a1 = 2 * (A - 1 - (A + 1) * cos); a2 = A + 1 - (A - 1) * cos - s;
    }
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/** A chain of filter stages (`{ type, f, q?, db?, stages? }`), each repeated `stages` times, run over a copy of `x`. */
function chainRun(x, chain, sr) {
  let y = x;
  for (const st of chain) {
    const c = stageCoeffs(st.type, st.f, st.q ?? Math.SQRT1_2, st.db ?? 0, sr);
    for (let i = 0; i < (st.stages ?? 1); i++) y = runBiquad(y, c);
  }
  return y;
}

// A filter whose centre moves: the coefficients are redrawn every `every` samples from the frequency track.
function varying(x, type, freq, q, sr, every = 8) {
  const y = new Float64Array(x.length);
  let c = biquadCoeffs(type, freq[0], q, sr), x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    if (i % every === 0) c = biquadCoeffs(type, freq[i], q, sr);
    const v = c[0] * x[i] + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
const staticFilter = (x, type, f, q, sr) => runBiquad(x, biquadCoeffs(type, f, q, sr));
// A fourth-order high-pass: two sections with the Butterworth Qs.
const highpass4 = (x, f, sr) => staticFilter(staticFilter(x, 'highpass', f, 0.5412, sr), 'highpass', f, 1.3066, sr);

/** Hz at time t from breakpoints [[t, hz], ...]: exponential between them, held at the ends. */
function sweepFn(points) {
  return (t) => {
    if (t <= points[0][0]) return points[0][1];
    for (let j = 1; j < points.length; j++) {
      if (t <= points[j][0]) { const [t0, h0] = points[j - 1], [t1, h1] = points[j]; return t1 > t0 ? h0 * (h1 / h0) ** ((t - t0) / (t1 - t0)) : h1; }
    }
    return points[points.length - 1][1];
  };
}

/** Linear level from breakpoints [[t, dB], ...] (dB straight between them), silent before the first and after the last, which fades in 10 ms. */
function envelopeArray(pts, len, sr) {
  const out = new Float64Array(len), last = pts[pts.length - 1];
  let j = 0;
  for (let k = 0; k < len; k++) {
    const t = k / sr;
    if (t < pts[0][0]) continue;
    if (t > last[0]) { out[k] = last[1] <= -90 ? 0 : dbToLin(last[1]) * Math.max(0, 1 - (t - last[0]) / FADE_S); continue; }
    while (j < pts.length - 2 && t > pts[j + 1][0]) j++;
    const [t0, d0] = pts[j], [t1, d1] = pts[j + 1];
    const db = t1 > t0 ? d0 + ((d1 - d0) * (t - t0)) / (t1 - t0) : d1;
    out[k] = db <= -90 ? 0 : dbToLin(db);
  }
  return out;
}

const gateGain = (gate, t) => {
  if (t <= gate.atS) return 1;
  const G = (gate.dropDb ?? 90) >= 90 ? 0 : dbToLin(-gate.dropDb), rel = gate.releaseS ?? GATE_RELEASE_S;
  return t >= gate.atS + rel ? G : 1 + (G - 1) * (0.5 - 0.5 * Math.cos((Math.PI * (t - gate.atS)) / rel));
};

// Tremolo, gate, an envelope on a pass or gated layer, then the chain of filters, over a layer's buffers.
function applyLayerFx(l, sr, m, s) {
  const env = l.envelope && (l.kind === 'pass' || l.kind === 'gated') ? envelopeArray(l.envelope, m.length, sr) : null;
  if (env || l.tremolo || l.gate) {
    for (let k = 0; k < m.length; k++) {
      const t = k / sr;
      let g = env ? env[k] : 1;
      if (l.tremolo) g *= dbToLin(-l.tremolo.depthDb * (0.5 - 0.5 * Math.cos(TAU * l.tremolo.hz * t)));
      if (l.gate) g *= gateGain(l.gate, t);
      m[k] *= g; s[k] *= g;
    }
  }
  if (l.chain) { m.set(chainRun(m, l.chain, sr)); s.set(chainRun(s, l.chain, sr)); }
}

const tanhShape = (drive) => { const g = 1 + 2 * drive, tg = Math.tanh(g); return (x) => Math.tanh(g * x) / tg; };

// A tone layer with the newer fields: each partial a sine (a doublet when it beats) shaped by the layer's drive and its own or the shared envelope.
function toneLocal(l, sr, len, m, s, polarity) {
  const shape = l.drive ? tanhShape(l.drive) : (x) => x;
  const shared = l.envelope ? envelopeArray(l.envelope, len, sr) : null;
  const sw = l.sweep ? sweepFn(l.sweep) : null;
  const attackN = Math.max(1, Math.round(l.attack * sr));
  for (const v of l.voices) {
    if (!sw && v.f >= sr * 0.45) continue;
    const vlen = shared ? len : Math.min(len, Math.ceil((l.attack + v.t60 + FADE_S) * sr));
    const glide = !sw && v.glideTo && v.glideTo !== v.f, glideN = Math.max(1, Math.round(l.glideS * sr));
    let phase = 0, phase2 = 0;
    for (let k = 0; k < vlen; k++) {
      const t = k / sr;
      let e;
      if (shared) e = v.g * shared[k];
      else if (k < attackN) e = (v.g * k) / attackN;
      else if (t <= l.attack + v.t60) e = v.g * 10 ** ((-3 * (t - l.attack)) / v.t60);
      else e = v.g * 0.001 * Math.max(0, 1 - (t - l.attack - v.t60) / FADE_S);
      const f = sw ? sw(t) * v.ratio : glide ? v.f * (v.glideTo / v.f) ** Math.min(1, k / glideN) : v.f;
      let a = Math.sin(phase), b = Math.cos(phase);
      if (v.beat) { a = (a + 0.7 * Math.sin(phase2)) / 1.7; b = (b + 0.7 * Math.cos(phase2)) / 1.7; phase2 += (TAU * (f + v.beat)) / sr; }
      m[k] += e * shape(a);
      s[k] += polarity * e * shape(b);
      phase += (TAU * f) / sr;
    }
  }
}

// A noise layer with the newer fields: seeded noise through its filter (swept by breakpoints when it has them), shaped and enveloped.
function noiseLocal(l, sr, len, m, s, polarity) {
  const shape = l.drive ? tanhShape(l.drive) : (x) => x;
  const shared = l.envelope ? envelopeArray(l.envelope, len, sr) : null;
  const v = l.voices[0], type = l.filter.type, q = l.filter.q ?? 1;
  const sw = l.sweep ? sweepFn(l.sweep) : null;
  const attackN = Math.max(1, Math.round(l.attack * sr));
  const vlen = shared ? len : Math.min(len, Math.ceil((l.attack + v.t60 + FADE_S) * sr));
  const glide = !sw && v.glideTo && v.glideTo !== v.f, glideN = Math.max(1, Math.round(l.glideS * sr));
  const moves = sw || glide;
  const freq = (k) => (sw ? sw(k / sr) : glide ? v.f * (v.glideTo / v.f) ** Math.min(1, k / glideN) : v.f);
  for (const quad of [false, true]) {
    const r = rng(l.seed + (quad ? 1 : 0));
    let c = type === 'none' ? null : biquadCoeffs(type, freq(0), q, sr);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let k = 0; k < vlen; k++) {
      const x = r() * 2 - 1, t = k / sr;
      let y = x;
      if (c) {
        if (moves) c = biquadCoeffs(type, freq(k), q, sr);
        y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
      }
      let e;
      if (shared) e = v.g * shared[k];
      else if (k < attackN) e = (v.g * k) / attackN;
      else if (t <= l.attack + v.t60) e = v.g * 10 ** ((-3 * (t - l.attack)) / v.t60);
      else e = v.g * 0.001 * Math.max(0, 1 - (t - l.attack - v.t60) / FADE_S);
      (quad ? s : m)[k] += (quad ? polarity : 1) * e * shape(y);
    }
  }
}

const boxSmooth = (x, half) => {
  const n = x.length, pre = new Float64Array(n + 1), out = new Float64Array(n);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + x[i];
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - half), b = Math.min(n - 1, i + half); out[i] = (pre[b + 1] - pre[a]) / (b - a + 1); }
  return out;
};
// The peak of the 10 ms RMS: the level a sub-layer is mixed at.
const tenMsPeak = (x, sr) => {
  const w = Math.max(1, Math.round(sr * 0.01));
  let best = 0;
  for (let i = 0; i + w <= x.length; i += w) { let e = 0; for (let k = i; k < i + w; k++) e += x[k] * x[k]; best = Math.max(best, Math.sqrt(e / w)); }
  return best + 1e-12;
};
const peakAbs = (x) => { let p = 0; for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i])); return p; };

/**
 * One channel of a `pass` layer: a whoosh. A level curve in dB rises into the apex (`riseK` below 1 accelerates into
 * it) and falls out of it (`fallK` above 1 holds, then drops); one motion value, the level to the power `track`,
 * drives three band-passes at f, 1.6 f and 2.5 f (the air), a low-pass above them, and the optional `low` (brown
 * noise), `sub` (a soft-saturated sine sinking after the apex) and `hiss` (high-passed noise whose top opens with the
 * motion); `doppler` glides every band high before the apex and low after it. `quad` makes the side channel: the same
 * pass on independent noise, the sub in quadrature.
 */
function passChannel(spec, sr, len, quad, seed, polarity) {
  const P = { ...PASS_DEFAULTS, ...spec }, L = spec.lengthS, tp = P.apexAt * L, n = len;
  const raw = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const t = k / sr;
    const db = t < tp ? -Math.abs(P.startDb) * ((tp - t) / tp) ** P.riseK : -Math.abs(P.endDb) * Math.min(1, (t - tp) / (L - tp)) ** P.fallK;
    raw[k] = dbToLin(db);
  }
  const half = Math.max(1, Math.round((clamp(0.3 * Math.min(tp, L - tp), 0.004, 0.1) * sr) / 2));
  const a = boxSmooth(boxSmooth(raw, half), half);
  const top = peakAbs(a);
  for (let k = 0; k < n; k++) a[k] /= top;
  const mot = a.map((x) => x ** P.track), dop = new Float64Array(n), fa = new Float64Array(n);
  const dopW = Math.max(P.dopplerS, 0.005);
  for (let k = 0; k < n; k++) {
    const t = k / sr;
    dop[k] = 2 ** (-(P.doppler / 12) * 0.5 * Math.tanh((t - tp) / dopW));
    fa[k] = 2 ** (Math.log2(P.f) - (t < tp ? P.upOct : P.downOct) * (1 - mot[k])) * dop[k];
  }
  // every noise source has its own stream, so cutting the pass short (a gate, a shorter cue) leaves the part that plays unchanged
  const stream = (i) => rng((seed + (quad ? 1 : 0) + 7919 * (i + 1)) >>> 0);
  const white = (i) => { const r = stream(i), x = new Float64Array(n); for (let k = 0; k < n; k++) x[k] = r() * 2 - 1; return x; };
  let air = new Float64Array(n);
  for (const [i, [ratio, g]] of [[1, 1], [1.6, 0.55], [2.5, 0.3]].entries()) {
    const band = varying(white(i), 'bandpass', fa.map((f) => clamp(f * ratio, 30, 20000)), P.qAir, sr);
    for (let k = 0; k < n; k++) air[k] += g * band[k];
  }
  air = varying(air, 'lowpass', fa.map((f) => clamp(f * P.lpRatio, 60, 20000)), 0.7, sr);
  for (let k = 0; k < n; k++) air[k] *= a[k];
  const mix = new Float64Array(n), add = (y, db) => { const g = dbToLin(db) / tenMsPeak(y, sr); for (let k = 0; k < n; k++) mix[k] += g * y[k]; };
  add(air, 0);
  if (spec.low) {
    const S = { ...PASS_SUB_DEFAULTS.low, ...spec.low };
    const brown = new Float64Array(n), r = stream(3);
    let acc = 0;
    for (let k = 0; k < n; k++) { acc = 0.995 * acc + (r() * 2 - 1); brown[k] = acc; }
    let low = varying(brown, 'lowpass', mot.map((x) => clamp(S.f * (0.6 + 0.4 * x), 25, 2000)), 0.75, sr);
    low = staticFilter(low, 'highpass', Math.max(28, S.f / 2.5), Math.SQRT1_2, sr);
    const sm = boxSmooth(a, Math.max(1, Math.round((S.smoothS * sr) / 2)));
    const smTop = peakAbs(sm);
    for (let k = 0; k < n; k++) low[k] *= sm[k] / smTop;
    add(low, S.db);
  }
  if (spec.sub) {
    const S = { ...PASS_SUB_DEFAULTS.sub, ...spec.sub }, shape = tanhShape(S.drive);
    const sub = new Float64Array(n);
    let phase = 0;
    for (let k = 0; k < n; k++) {
      const t = k / sr, sink = 0.5 + 0.5 * Math.tanh((t - tp) / (0.15 * L + 0.01));
      sub[k] = shape(quad ? Math.cos(phase) : Math.sin(phase)) * (quad ? polarity : 1);
      phase += (TAU * S.f * 2 ** (-S.glideOct * sink)) / sr;
    }
    const sm = boxSmooth(a, Math.max(1, Math.round(0.01 * sr)));
    const smTop = peakAbs(sm);
    const lp = staticFilter(sub, 'lowpass', 600, Math.SQRT1_2, sr);
    for (let k = 0; k < n; k++) lp[k] *= sm[k] / smTop;
    add(lp, S.db);
  }
  if (spec.hiss) {
    const S = { ...PASS_SUB_DEFAULTS.hiss, ...spec.hiss };
    const hp = highpass4(white(4), S.hpHz, sr);
    const hiss = varying(hp, 'lowpass', mot.map((x, k) => clamp(S.hpHz * 2 ** (S.open * x) * 1.5 * dop[k], 500, 20000)), 0.6, sr);
    for (let k = 0; k < n; k++) hiss[k] *= a[k] ** S.pow;
    add(hiss, S.db);
  }
  const ramp = Math.max(1, Math.round(0.0015 * sr));
  for (let k = 0; k < ramp && k < n; k++) mix[k] *= Math.sin((Math.PI / 2) * (k / ramp)) ** 2;
  for (let k = Math.max(0, Math.round(L * sr)); k < n; k++) mix[k] *= Math.max(0, 1 - (k / sr - L) / FADE_S);
  return mix;
}

/**
 * One channel of a `gated` layer: a source (seeded noise through `filter`, swept by `sweep` or `glideTo`, or a sine at
 * `f`) chopped by a pulse train whose period shrinks from `periodS[0]` to `periodS[1]` and which is laid out backwards from
 * the end of the layer, so the last pulse is open on the final sample. The level rises `riseDb` along u^`curve`; the gate
 * opens over the last `openS`; the layer ends in an `endFadeS` fade.
 */
function gatedChannel(spec, sr, len, quad, seed, polarity) {
  const G = { endFadeS: 0.004, ...GATED_DEFAULTS, ...spec }, L = spec.lengthS, n = len, end = Math.min(n, Math.round(L * sr));
  const [p0, p1] = spec.periodS;
  const per = new Float64Array(n), cyc = new Float64Array(n);
  for (let k = 0; k < n; k++) per[k] = p0 * (p1 / p0) ** (Math.min(1, k / sr / L) ** G.periodCurve);
  let acc = 0;
  for (let k = end - 1; k >= 0; k--) { acc += 1 / per[k] / sr; cyc[k] = acc; }
  const src = new Float64Array(end), sw = spec.sweep ? sweepFn(spec.sweep) : null;
  if (G.source === 'tone') {
    let phase = 0;
    for (let k = 0; k < end; k++) {
      const t = k / sr, f = sw ? sw(t) : spec.glideTo ? spec.f * (spec.glideTo / spec.f) ** Math.min(1, t / (spec.glideS || L)) : spec.f;
      src[k] = quad ? polarity * Math.cos(phase) : Math.sin(phase);
      phase += (TAU * f) / sr;
    }
  } else {
    const r = rng(seed + (quad ? 1 : 0)), fl = spec.filter, white = new Float64Array(end);
    for (let k = 0; k < end; k++) white[k] = r() * 2 - 1;
    if (!fl || fl.type === 'none') src.set(white);
    else {
      const freq = new Float64Array(end);
      for (let k = 0; k < end; k++) { const t = k / sr; freq[k] = sw ? sw(t) : spec.glideTo ? fl.f * (spec.glideTo / fl.f) ** Math.min(1, t / (spec.glideS || L)) : fl.f; }
      src.set(varying(white, fl.type, freq, fl.q ?? 1, sr));
    }
  }
  const out = new Float64Array(n);
  for (let k = 0; k < end; k++) {
    const t = k / sr, u = Math.min(1, t / L);
    const fr = (((0.5 * G.duty - cyc[k]) % 1) + 1) % 1;
    const on = clamp((fr * per[k]) / G.rampS, 0, 1), off = clamp(((G.duty - fr) * per[k]) / (G.rampS * 1.5), 0, 1);
    let fin = clamp((L - t) / G.openS, 0, 1);
    fin = fin * fin * (3 - 2 * fin);
    const depth = G.depth * fin;
    const taper = clamp((L - t) / G.endFadeS, 0, 1);
    out[k] = src[k] * (1 - depth * (1 - Math.min(on, off))) * dbToLin(-G.riseDb * (1 - u ** G.curve)) * (0.5 - 0.5 * Math.cos(Math.PI * taper));
  }
  return out;
}

// A `pass` or `gated` layer into its own mid and side: both channels share one scale, so the pair keeps its width.
function stencilLocal(l, sr, len, m, s, polarity) {
  const spec = l.spec, gain = spec.peak ?? 1;
  const make = l.kind === 'pass' ? passChannel : gatedChannel;
  const mid = make(spec, sr, len, false, l.seed, polarity), side = make(spec, sr, len, true, l.seed, polarity);
  const k = gain / Math.max(peakAbs(mid), 1e-12);
  for (let i = 0; i < len; i++) { m[i] += k * mid[i]; s[i] += k * side[i]; }
}

// The cue's own finish: a high-pass, a peaking dip, soft saturation that keeps the peak, a gate.
function applyFinish(fin, sr, mid, side) {
  const run = (f) => { const a = f(mid), b = f(side); mid.set(a); side.set(b); };
  if (fin.highpassHz) { const c = biquadCoeffs('highpass', fin.highpassHz, Math.SQRT1_2, sr); run((x) => (fin.highpassHz > 800 ? runBiquad(runBiquad(x, c), c) : runBiquad(x, c))); }
  if (fin.dip) { const c = stageCoeffs('peaking', fin.dip.f, fin.dip.q ?? 1.2, fin.dip.db, sr); run((x) => runBiquad(x, c)); }
  if (fin.drive) {
    const pk = Math.max(peakAbs(mid), peakAbs(side)), g = 1 + 2 * fin.drive, tg = Math.tanh(g);
    if (pk > 0) for (let k = 0; k < mid.length; k++) { mid[k] = (pk * Math.tanh((g * mid[k]) / pk)) / tg; side[k] = (pk * Math.tanh((g * side[k]) / pk)) / tg; }
  }
  if (fin.gate) for (let k = 0; k < mid.length; k++) { const g = gateGain(fin.gate, k / sr); mid[k] *= g; side[k] *= g; }
}

/**
 * Renders a recipe to samples in plain JavaScript: { channels: [left, right] (Float32Array), sampleRate,
 * length }. The same recipe, options and sample rate give the same samples on every machine and in every
 * browser: float64 arithmetic from a seeded generator, no audio graph and no clock. `opts` as for `layers`,
 * plus sampleRate (48000).
 * A tone is its partials: each a sine with a linear attack and an exponential decay to -60 dB at its T60,
 * glided exponentially; a noise layer is the seeded noise through one biquad, its centre gliding the same
 * way. A `pass` layer is a whoosh and a `gated` layer a pulse train (see passChannel, gatedChannel); a layer may
 * also carry an envelope in dB, a gate, a tremolo, a drive, a sweep, a chain of filters or a doublet beat. Stereo is a mid and a side (the side in quadrature with the mid, or independent noise), left =
 * mid + side and right = mid - side, so the two carry the same power; the room is a seeded stereo
 * convolution of the mid after a predelay and a low-pass.
 */
export function renderRecipe(recipe, opts = {}) {
  const sr = opts.sampleRate ?? 48000;
  const p = plan(recipe, opts);
  let end = 0;
  for (const l of p.layers) {
    if (l.spec || l.envelope || l.gate) end = Math.max(end, l.start + layerLenS(l.spec ?? { ...l, kind: l.kind, t60: l.voices[0]?.t60 ?? 0, attackS: l.attack }) + FADE_S);
    else for (const v of l.voices) end = Math.max(end, l.start + l.attack + v.t60 + FADE_S);
  }
  const hardEnd = p.finish?.gate && (p.finish.gate.dropDb ?? 90) >= 90 ? p.finish.gate.atS + (p.finish.gate.releaseS ?? GATE_RELEASE_S) : null;
  if (hardEnd !== null) end = Math.min(end, hardEnd + 2 / sr);
  const n = Math.max(1, Math.ceil(end * sr) + 1);
  const mid = new Float64Array(n), side = new Float64Array(n);
  for (const l of p.layers) {
    const i0 = Math.round(l.start * sr);
    const polarity = rng(l.seed ^ 0x51ed)() < 0.5 ? -1 : 1;       // the seeded spread: which way this layer's side leans
    if (l.fx) {
      const lenS = l.spec ? layerLenS(l.spec) + FADE_S : l.envelope ? l.envelope[l.envelope.length - 1][0] + FADE_S : Math.max(...l.voices.map((v) => l.attack + v.t60)) + FADE_S;
      const hard = l.gate && (l.gate.dropDb ?? 90) >= 90 ? l.gate.atS + (l.gate.releaseS ?? GATE_RELEASE_S) + 2 / sr : Infinity;
      const len = Math.min(n - i0, Math.ceil(Math.min(lenS, hard) * sr));
      if (len <= 0) continue;
      const m = new Float64Array(len), s = new Float64Array(len);
      if (l.spec) stencilLocal(l, sr, len, m, s, polarity);
      else if (l.kind === 'tone') toneLocal(l, sr, len, m, s, polarity);
      else noiseLocal(l, sr, len, m, s, polarity);
      applyLayerFx(l, sr, m, s);
      for (let k = 0; k < len; k++) { mid[i0 + k] += m[k]; side[i0 + k] += s[k]; }
      continue;
    }
    for (const v of l.voices) {
      const attackN = Math.max(1, Math.round(l.attack * sr)), len = Math.min(n - i0, Math.ceil((l.attack + v.t60 + FADE_S) * sr));
      const env = (k) => {
        const t = k / sr;
        if (k < attackN) return (v.g * k) / attackN;
        if (t <= l.attack + v.t60) return v.g * 10 ** ((-3 * (t - l.attack)) / v.t60);
        return v.g * 0.001 * Math.max(0, 1 - (t - l.attack - v.t60) / FADE_S);
      };
      const glide = v.glideTo && v.glideTo !== v.f, glideN = Math.max(1, Math.round(l.glideS * sr));
      const freq = (k) => (glide ? v.f * (v.glideTo / v.f) ** Math.min(1, k / glideN) : v.f);
      if (l.kind === 'tone') {
        if (v.f >= sr * 0.45) continue;
        let phase = 0;
        for (let k = 0; k < len; k++) {
          const e = env(k);
          mid[i0 + k] += e * Math.sin(phase);
          side[i0 + k] += polarity * e * Math.cos(phase);
          phase += (TAU * freq(k)) / sr;
        }
      } else {
        const type = l.filter.type, q = l.filter.q ?? 1;
        for (const quad of [false, true]) {
          const r = rng(l.seed + (quad ? 1 : 0));
          let c = type === 'none' ? null : biquadCoeffs(type, freq(0), q, sr);
          let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
          for (let k = 0; k < len; k++) {
            const x = r() * 2 - 1;
            let y = x;
            if (c) {
              if (glide) c = biquadCoeffs(type, freq(k), q, sr);
              y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
              x2 = x1; x1 = x; y2 = y1; y1 = y;
            }
            (quad ? side : mid)[i0 + k] += (quad ? polarity : 1) * env(k) * y;
          }
        }
      }
    }
  }
  if (p.finish) applyFinish(p.finish, sr, mid, side);
  const sideAmp = p.sideAmp;
  for (let i = 0; i < n; i++) { mid[i] *= p.gain; side[i] *= p.gain * sideAmp; }
  let wet = null, len = n;
  if (p.room) {
    const ir = roomIr(sr, p.room.sizeS ?? 0.25, opts.roomSeed ?? ROOM_SEED);
    len = n + Math.round((p.room.predelayS ?? 0) * sr) + ir[0].length;
    const send = dbToLin(p.room.send), delay = Math.round((p.room.predelayS ?? 0) * sr);
    const x = new Float64Array(len - ir[0].length);
    const c = biquadCoeffs('lowpass', p.room.lowpassHz ?? 3500, Math.SQRT1_2, sr);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const s = i - delay >= 0 && i - delay < n ? mid[i - delay] * send : 0;
      const y = c[0] * s + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
      x2 = x1; x1 = s; y2 = y1; y1 = y;
      x[i] = y;
    }
    wet = convolveMany(x, ir, len);
  }
  const left = new Float32Array(len), right = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const m = i < n ? mid[i] : 0, s = i < n ? side[i] : 0;
    left[i] = m + s + (wet ? wet[0][i] : 0);
    right[i] = m - s + (wet ? wet[1][i] : 0);
  }
  return { channels: [left, right], sampleRate: sr, length: len };
}

/**
 * Draws a recipe on `ctx` at `at` seconds: renders it with `renderRecipe` at the context's rate and plays the
 * stereo buffer, so a cue is the same samples in an OfflineAudioContext, in a live one and in Node. `opts`:
 * emphasis (subtle | normal | strong), gain (a multiplier, 1), seed (the noise, the spread and the variation),
 * profile (a sound profile object, or none), roomSeed (the shared room's seed; leave it out). On a mono
 * context the two channels fold to the mid.
 */
export function layers(ctx, at, recipe, opts = {}) {
  const { channels, length } = renderRecipe(recipe, { ...opts, sampleRate: ctx.sampleRate });
  const buf = ctx.createBuffer(2, length, ctx.sampleRate);
  buf.copyToChannel(channels[0], 0);
  buf.copyToChannel(channels[1], 1);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(at);
}

/** The knobs a beat's `params.cue` (or a brand's style.patterns["sound/<cue>"]) can set on a recipe, picked out of a params bag: `variant`, `step`, `key`, `durS`. */
export const recipeOpts = (bag = {}) => {
  const o = {};
  for (const k of ['variant', 'step', 'key', 'durS']) if (bag[k] !== undefined && bag[k] !== null && bag[k] !== '') o[k] = bag[k];
  return o;
};

// What each named knob of a recipe's `knobs` adds to the module's params. gain, seed and emphasis are always there.
const KNOBS = {
  variant: (recipe) => ({ type: 'string', default: recipe.variant ?? Object.keys(recipe.variants ?? {})[0], values: [...new Set([recipe.variant, ...Object.keys(recipe.variants ?? {})].filter(Boolean))], meaning: 'which version of the cue plays; the brand sets it once' }),
  step: () => ({ type: 'number', default: 0, meaning: 'semitones the whole cue is raised, so a run of repeats climbs a ladder' }),
  key: (recipe) => ({ type: 'string', default: recipe.key ?? 'C', meaning: 'the pitch class the tonal layers are in (C, F#, Bb ...)' }),
  durS: () => ({ type: 'number', default: 0, meaning: 'seconds the cue is aimed to last (0 plays it as written)' }),
};

/**
 * A recipe as the sound pattern module the loaders expect: { name, group, params, durationS,
 * render(ctx, at, feel, opts), recipe, profile }. `feel` is the palette and is not read (a recipe
 * is voiced by its profile); 'none' renders nothing. durationS is the length in that profile. A recipe's
 * `knobs` (variant, step, key, durS) add their params to gain, seed and emphasis.
 */
export function recipeModule(recipe, profile = null) {
  const { recipe: voiced } = applyProfile(resolveRecipe(recipe, {}), profile);
  return {
    name: recipe.name,
    group: 'sound',
    recipe,
    profile,
    params: {
      gain: { type: 'number', default: 1, meaning: 'a multiplier on the cue (1 is its matched level)' },
      seed: { type: 'number', default: seedOf(recipe.name), meaning: 'seed for the noise, the spread and the variation; the same seed renders the same samples' },
      emphasis: { type: 'string', default: 'normal', meaning: 'subtle, normal or strong: which layers play' },
      ...Object.fromEntries((recipe.knobs ?? []).filter((k) => KNOBS[k]).map((k) => [k, KNOBS[k](recipe)])),
    },
    durationS: voiced.durationS,
    render(ctx, at, feel = 'soft-ui', opts = {}) {
      if (feel === 'none') return;
      layers(ctx, at, recipe, { emphasis: opts.emphasis, gain: opts.gain === undefined ? 1 : Number(opts.gain), seed: opts.seed === undefined ? undefined : Number(opts.seed) >>> 0, profile, roomSeed: opts.roomSeed, ...recipeOpts(opts) });
    },
  };
}

// Aim knobs: land a cue's duration, its apex and its pitch through the recipe's own fields, never by resampling.
// Restated from Earshot's knobs (MIT, see NOTICE): a target is met by rendering, measuring and correcting along a
// secant until it is inside its tolerance, keeping the closest render. Pure and seeded like the recipes it renders.
//
//   aim(recipe, { durS, apexS, pitchHz })   a recipe whose dry render lasts durS, peaks at apexS and sounds at pitchHz
//   measureCue(recipe, opts)                { durS, apexS, pitchHz } of the dry render, the numbers aim steers by
//   estimatePitch(channels, sr, nearHz)     the strongest spectral peak within an octave of nearHz, in Hz, or null
//   AIM_TOL                                 the tolerances: durS 5 ms, apexS 2.5 ms, pitch 50 cents
//
// duration  every time of the recipe (layers, envelopes, offsets, glides) is scaled, then the cue is gated: it holds to durS and
//           ends in a 4 ms ramp, so the dry cue lasts durS (its last sound above -60 dB of its peak is inside 5 ms of it).
// apex      the loudest 5 ms window. A `pass` layer's `apexAt` moves; else the envelope's peak point or the loudest
//           layer's `attackS`. A noisy peak jumps when its field moves, so the field is steered to land the apex at or
//           just before the target and the whole cue is then started a few ms later (`offsetS` on every layer).
// pitch     every tone layer is scaled by target / measured; a cue with no tone layer refuses and says why.
// A field the recipe leaves out is never filled from the middle of its range: aim writes only the field it moves.

export const AIM_TOL = { durS: 0.005, apexS: 0.0025, pitchCents: 50 };
const SR = 48000;
const dry = (r) => { const d = clone(r); delete d.room; delete d.vary; return d; };
const render = (r, o = {}) => renderRecipe(dry(r), { sampleRate: SR, seed: seedOf(r.name), ...o });

// RMS envelope of both channels: window and hop in samples; [value per frame].
function rmsFrames(ch, win, hop) {
  const n = ch[0].length, pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + (ch[0][i] * ch[0][i] + ch[1][i] * ch[1][i]) / 2;
  const out = [];
  for (let s = 0; s + win <= n; s += hop) out.push(Math.sqrt((pre[s + win] - pre[s]) / win));
  return out;
}

/** The strongest spectral peak of the first 0.6 s from the onset, within `spanSt` semitones of `nearHz` (an octave each way by default), refined by a parabola on the log power. */
export function estimatePitch(channels, sr, nearHz, spanSt = 12) {
  const mono = channels[0].map((x, i) => (x + channels[1][i]) / 2);
  let peak = 0;
  for (const x of mono) peak = Math.max(peak, Math.abs(x));
  if (!(peak > 0)) return null;
  let on = 0;
  while (Math.abs(mono[on]) < peak * 0.1) on++;
  const N = Math.min(mono.length - on, Math.round(0.6 * sr));
  let size = 1;
  while (size < N * 4) size *= 2;
  const re = new Float64Array(size), im = new Float64Array(size);
  for (let i = 0; i < N; i++) re[i] = mono[on + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  fft(re, im);
  const lo = Math.max(1, Math.floor((nearHz * 2 ** (-spanSt / 12) * size) / sr)), hi = Math.min(size / 2 - 2, Math.ceil((nearHz * 2 ** (spanSt / 12) * size) / sr));
  let best = lo, bp = -1;
  for (let k = lo; k <= hi; k++) { const p = re[k] * re[k] + im[k] * im[k]; if (p > bp) { bp = p; best = k; } }
  if (!(bp > 0)) return null;
  const lp = (k) => Math.log(re[k] * re[k] + im[k] * im[k] + 1e-30);
  const a = lp(best - 1), b = lp(best), c = lp(best + 1), d = a - 2 * b + c;
  return (((d === 0 ? 0 : (0.5 * (a - c)) / d) + best) * sr) / size;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const a = re[i]; re[i] = re[j]; re[j] = a; const b = im[i]; im[i] = im[j]; im[j] = b; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, step = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < half; k++) {
      const wr = Math.cos(step * k), wi = Math.sin(step * k), a = i + k, b = a + half;
      const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
}

const toneLayers = (r) => r.layers.filter((l) => l.kind === 'tone' && (l.peak ?? 1) > 0);
// The pitch the cue is written at: the fundamental of its loudest tone layer.
const nominalHz = (r) => toneLayers(r).sort((a, b) => (b.peak ?? 1) - (a.peak ?? 1))[0].f;

/** What aim steers by, measured on the dry render at normal emphasis: durS (the last 2 ms-window above -60 dB of the peak), apexS (the centre of the loudest 5 ms), pitchHz (null for a cue with no tone layer). */
export function measureCue(recipe, opts = {}) {
  const r = recipe.variants ? resolveRecipe(recipe, opts) : recipe;
  const { channels } = render(r, opts);
  const win = Math.round(0.002 * SR), hop = Math.round(0.0005 * SR);
  const e = rmsFrames(channels, win, hop), top = Math.max(...e);
  let last = 0;
  for (let i = 0; i < e.length; i++) if (e[i] >= top * 1e-3) last = i;
  const w5 = Math.round(0.005 * SR), e5 = rmsFrames(channels, w5, hop), apex = e5.indexOf(Math.max(...e5));
  return {
    durS: (last * hop + win) / SR,
    apexS: (apex * hop + w5 / 2) / SR,
    pitchHz: toneLayers(r).length ? estimatePitch(channels, SR, nominalHz(r)) : null,
  };
}

function scaleTones(r, ratio) {
  for (const l of r.layers) if (l.kind === 'tone' || (l.kind === 'gated' && l.source === 'tone')) {
    l.f *= ratio;
    if (typeof l.glideTo === 'number') l.glideTo *= ratio;
    if (l.sweep) l.sweep = l.sweep.map(([t, hz]) => [t, hz * ratio]);
    if (l.f < 20 || l.f > 20000) throw new Error(`${r.name}: aiming the pitch puts a tone at ${l.f.toFixed(1)} Hz, outside 20 Hz to 20 kHz`);
  }
}

function aimPitch(r, targetHz) {
  if (!toneLayers(r).length) {
    const kinds = [...new Set(r.layers.map((l) => l.kind))].join(', ');
    throw new Error(`${r.name} has no pitch to aim: its layers are ${kinds}, and noise has no note. A pitch target needs a tone layer.`);
  }
  let best = { r: clone(r), cents: Infinity };
  let cur = clone(r), near = targetHz;
  for (let i = 0; i < 5; i++) {
    const got = estimatePitch(render(cur).channels, SR, near, 18);
    if (got === null) break;
    const cents = 1200 * Math.log2(got / targetHz);
    if (Math.abs(cents) < Math.abs(best.cents)) best = { r: clone(cur), cents };
    if (Math.abs(cents) <= 8) break;
    scaleTones(cur, targetHz / got);
    near = targetHz;
  }
  return best.r;
}

function aimDuration(r, durS) {
  let cur = clone(r), best = { r: clone(r), err: Infinity }, s = 1;
  for (let i = 0; i < 5; i++) {
    const d = measureCue(cur).durS, err = Math.abs(d - durS);
    if (err < best.err) best = { r: clone(cur), err };
    if (err <= 0.002) break;
    s *= durS / d;
    cur = scaleRecipeTime(r, s);
  }
  return best.r;
}

// The field that moves the apex: [get, set] over a recipe, and a first guess for it.
function apexControl(r, apexS) {
  const pi = r.layers.findIndex((l) => l.kind === 'pass');
  if (pi >= 0) {
    const L = r.layers[pi].lengthS;
    return { x0: clamp(apexS / L, 0.05, 0.95), set: (rr, x) => { rr.layers[pi].apexAt = clamp(x, 0.05, 0.95); } };
  }
  const voices = r.layers.map((l, i) => ({ l, i })).filter(({ l }) => (l.kind === 'tone' || l.kind === 'noise') && (l.peak ?? 1) > 0).sort((a, b) => (b.l.peak ?? 1) - (a.l.peak ?? 1));
  if (!voices.length) throw new Error(`${r.name} has no layer whose apex can be moved`);
  const { l, i } = voices[0];
  if (l.envelope) {
    const k = l.envelope.reduce((best, p, j) => (p[1] > l.envelope[best][1] ? j : best), 0), tpk = l.envelope[k][0];
    return { x0: tpk, set: (rr, x) => { rr.layers[i].envelope = l.envelope.map(([t, db], j) => [j < k ? (t * x) / tpk : j === k ? x : t + (x - tpk), db]); } };
  }
  return { x0: clamp(apexS - (l.offsetS ?? 0), 0.0005, 0.6), set: (rr, x) => { rr.layers[i].attackS = clamp(x, 0.0005, 0.6); } };
}

function aimApex(r, apexS) {
  const ctl = apexControl(r, apexS);
  let x = ctl.x0, early = null, closest = null;
  const cur = clone(r);
  for (let i = 0; i < 14; i++) {
    ctl.set(cur, x);
    const m = measureCue(cur).apexS, gap = apexS - m;
    if (!closest || Math.abs(gap) < Math.abs(closest.gap)) closest = { r: clone(cur), gap, x };
    if (gap >= 0 && (!early || gap < early.gap)) early = { r: clone(cur), gap, x };
    if (early && early.gap <= AIM_TOL.apexS / 2) break;
    // first move in proportion, then walk the field in small steps either side of the best so far (a noisy peak jumps when the field moves)
    if (i < 3) x *= apexS / Math.max(m, 1e-3);
    else x = (early ?? closest).x * (1 + (i % 2 ? 1 : -1) * 0.004 * Math.ceil((i - 2) / 2));
  }
  const pick = early ?? closest, out = pick.r;
  if (pick.gap > 0.0001) {                       // start the cue pick.gap later: the apex lands on the target to the sample
    for (const l of out.layers) l.offsetS = (l.offsetS ?? 0) + pick.gap;
    out.durationS += pick.gap;
  }
  return out;
}

/**
 * A recipe whose dry render (no room) lasts `durS`, has its loudest 5 ms at `apexS` and sounds at `pitchHz`; any may be left out.
 * Pure: the recipe given is not changed. A pitch target on a cue with no tone layer throws, saying why.
 */
export function aim(recipe, { durS, apexS, pitchHz } = {}) {
  let r = clone(recipe.variants ? resolveRecipe(recipe, {}) : recipe);
  if (pitchHz !== undefined) r = aimPitch(r, pitchHz);
  if (durS !== undefined && apexS !== undefined) {
    // each fit nudges the other (moving the apex changes where the tail crosses -60 dB): fit the duration, then the apex, then
    // trim the duration again without moving the apex (a pass lengthens its fall and keeps its apex point; any other cue takes turns)
    r = aimDuration(r, durS);
    r = aimApex(r, apexS);
    const pi = r.layers.findIndex((l) => l.kind === 'pass');
    let prev = null;
    for (let i = 0; i < 8; i++) {
      const d = measureCue(r).durS, err = durS - d;
      if (Math.abs(err) <= 0.002) break;
      if (pi >= 0) {
        const l = r.layers[pi], tp = l.apexAt * l.lengthS;
        const slope = prev && Math.abs(l.lengthS - prev.L) > 1e-6 ? clamp((d - prev.d) / (l.lengthS - prev.L), 0.2, 2) : 0.9;
        prev = { L: l.lengthS, d };
        l.lengthS = Math.max(tp * 1.05, l.lengthS + err / slope);
        l.apexAt = tp / l.lengthS;
        r.durationS = durS;
      } else { r = aimDuration(r, durS); r = aimApex(r, apexS); }
    }
  } else if (durS !== undefined) r = aimDuration(r, durS);
  else if (apexS !== undefined) r = aimApex(r, apexS);
  if (durS !== undefined) {
    r.finish = { ...(r.finish ?? {}), gate: { atS: Math.max(0.001, durS), dropDb: 90, releaseS: GATE_RELEASE_S } };
    r.durationS = durS;
  }
  return r;
}

