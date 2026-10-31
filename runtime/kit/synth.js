// Web Audio building blocks for the sound patterns: a seeded noise buffer, a gain envelope, a
// pitched tone and a filtered noise burst, each scheduled on an AudioContext at a time in seconds.
// Pure in their arguments: the noise comes from a seeded generator (mulberry32, not the kit's
// random(): the cues' calibration was measured against this sequence), so a cue renders to the same
// samples every time. Below them, cues as data: recipes rendered to samples and voiced by a sound profile.

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

/**
 * Voices a recipe in a sound profile; pure, the recipe is not changed. Returns { recipe, sideMidDb }.
 * modes: `none` strips partials, `string` snaps them to whole numbers. register: fundamentals fold by
 * octaves into [minHz, maxCentreHz], band centres are capped, partials outside the range are dropped.
 * key: a fundamental more than 20 cents from every note of the key moves to the nearest. envelope:
 * a struck attack is held inside the profile's range, and when the cue's slowest T60 is over the
 * family's longest, every time of the cue shrinks in proportion (a swell has no band). room: the
 * profile's shape, the recipe's own send kept relative to the reference. loudness: masterGain is
 * moved from the matched native level to the profile's.
 */
export function applyProfile(recipe, profile) {
  const r = clone(recipe);
  if (!profile) return { recipe: r, sideMidDb: SIDE_MID_DB };
  const { register, key, envelope, modes } = profile;
  for (const l of r.layers) {
    if (l.kind === 'tone') {
      let shift = 0;
      let f = l.f;
      while (f > register.maxCentreHz && f / 2 >= register.minHz) { f /= 2; shift--; }
      while (f < register.minHz && f * 2 <= register.maxCentreHz) { f *= 2; shift++; }
      l.f = f;
      if (typeof l.glideTo === 'number') l.glideTo *= 2 ** shift;
      if (key?.length) { l.f = nearestKeyHz(l.f, key); if (typeof l.glideTo === 'number') l.glideTo = nearestKeyHz(l.glideTo, key); }
      let ps = l.partials ?? [[1, 0]];
      if (modes === 'none') ps = [[1, 0]];
      else if (modes === 'string') {
        const by = new Map();
        for (const [ratio, db] of ps) { const n = Math.max(1, Math.round(ratio)); by.set(n, Math.max(by.get(n) ?? -Infinity, db)); }
        ps = [...by].sort((a, b) => a[0] - b[0]).map(([n, db]) => [n, db]);
      }
      l.partials = ps.filter(([ratio]) => l.f * ratio >= register.minHz && l.f * ratio <= 18000);
      if (!l.partials.length) l.partials = [[1, 0]];
    } else if (l.filter?.type === 'bandpass') {
      const cap = register.maxCentreHz;
      if (l.filter.f > cap) { if (typeof l.glideTo === 'number') l.glideTo *= cap / l.filter.f; l.filter.f = cap; }
      if (typeof l.glideTo === 'number') l.glideTo = Math.min(l.glideTo, cap);
    }
    if ((l.attackS ?? 0.002) <= STRUCK_ATTACK_S) l.attackS = Math.min(envelope.attackS[1], Math.max(envelope.attackS[0], l.attackS ?? 0.002));
  }
  const family = familyOf(r.durationS);
  const hi = envelope.t60[family]?.[1];
  const slowest = Math.max(...r.layers.map((l) => l.t60));
  if (hi && slowest > hi) {
    const k = hi / slowest;
    r.durationS *= k;
    for (const l of r.layers) { l.t60 *= k; if (l.offsetS) l.offsetS *= k; if (l.glideS) l.glideS *= k; }
  }
  const send = r.room ? r.room.send + (profile.room.send - REF_SEND_DB) : profile.room.send;
  r.room = { send, predelayS: profile.room.predelayS, sizeS: profile.room.sizeS, lowpassHz: profile.room.lowpassHz };
  r.masterGain = (r.masterGain ?? 1) * dbToLin(profile.loudness.cueLufs100ms - NATIVE_LUFS);
  return { recipe: r, sideMidDb: profile.stereo.sideMidDb };
}

/**
 * The voice list a recipe resolves to for one render: { layers, room, gain, sideAmp, durationS }, each
 * layer { kind, start, attack, t60, seed, glideS, filter, voices: [{ f, g, t60, glideTo }] } with times
 * relative to the cue and `g` the linear level of the voice before the cue gain. Pure; `layers` draws it.
 */
export function plan(recipe, { emphasis = 'normal', gain = 1, seed = seedOf(recipe.name), profile = null } = {}) {
  const { recipe: r, sideMidDb } = applyProfile(recipe, profile);
  const rank = (r.emphasis ?? EMPHASIS_RANKS)[emphasis] ?? EMPHASIS_RANKS[emphasis] ?? 1;
  const draw = rng((seed ^ 0x9e3779b9) >>> 0)() * 2 - 1;      // one draw: pitch and force vary together
  const pitch = 1 + (r.vary?.pitch ?? 0) * draw;
  const force = 1 + (r.vary?.force ?? 0) * draw;
  const out = [];
  r.layers.forEach((l, i) => {
    if ((l.from ?? 0) > rank || !((l.peak ?? 1) > 0)) return;
    const base = { kind: l.kind, start: l.offsetS ?? 0, attack: l.attackS ?? 0.002, t60: l.t60, seed: (seed + i * 7919) >>> 0, glideS: l.glideS ?? 0, filter: l.filter ?? { type: 'none' } };
    if (l.kind === 'tone') {
      const voices = (l.partials ?? [[1, 0]]).map(([ratio, db]) => ({
        f: l.f * ratio * pitch, g: (l.peak ?? 1) * dbToLin(db),
        t60: ratio > 1 ? Math.max(Math.min(FLOOR_T60_S, l.t60), l.t60 * ratio ** -0.75) : l.t60,
        glideTo: typeof l.glideTo === 'number' ? l.glideTo * ratio * pitch : null,
      }));
      out.push({ ...base, voices });
    } else {
      out.push({ ...base, voices: [{ f: (l.filter?.f ?? 1000) * pitch, g: l.peak ?? 1, t60: l.t60, glideTo: typeof l.glideTo === 'number' ? l.glideTo * pitch : null }] });
    }
  });
  return { layers: out, room: r.room ?? null, gain: (r.masterGain ?? 1) * gain * force, sideAmp: dbToLin(sideMidDb), durationS: r.durationS };
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

/**
 * Renders a recipe to samples in plain JavaScript: { channels: [left, right] (Float32Array), sampleRate,
 * length }. The same recipe, options and sample rate give the same samples on every machine and in every
 * browser: float64 arithmetic from a seeded generator, no audio graph and no clock. `opts` as for `layers`,
 * plus sampleRate (48000).
 * A tone is its partials: each a sine with a linear attack and an exponential decay to -60 dB at its T60,
 * glided exponentially; a noise layer is the seeded noise through one biquad, its centre gliding the same
 * way. Stereo is a mid and a side (the side in quadrature with the mid, or independent noise), left =
 * mid + side and right = mid - side, so the two carry the same power; the room is a seeded stereo
 * convolution of the mid after a predelay and a low-pass.
 */
export function renderRecipe(recipe, opts = {}) {
  const sr = opts.sampleRate ?? 48000;
  const p = plan(recipe, opts);
  const TAU = 2 * Math.PI;
  const FADE_S = 0.01;
  let end = 0;
  for (const l of p.layers) for (const v of l.voices) end = Math.max(end, l.start + l.attack + v.t60 + FADE_S);
  const n = Math.max(1, Math.ceil(end * sr) + 1);
  const mid = new Float64Array(n), side = new Float64Array(n);
  for (const l of p.layers) {
    const i0 = Math.round(l.start * sr);
    const polarity = rng(l.seed ^ 0x51ed)() < 0.5 ? -1 : 1;       // the seeded spread: which way this layer's side leans
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

/**
 * A recipe as the sound pattern module the loaders expect: { name, group, params, durationS,
 * render(ctx, at, feel, opts), recipe, profile }. `feel` is the palette and is not read (a recipe
 * is voiced by its profile); 'none' renders nothing. durationS is the length in that profile.
 */
export function recipeModule(recipe, profile = null) {
  const { recipe: voiced } = applyProfile(recipe, profile);
  return {
    name: recipe.name,
    group: 'sound',
    recipe,
    profile,
    params: {
      gain: { type: 'number', default: 1, meaning: 'a multiplier on the cue (1 is its matched level)' },
      seed: { type: 'number', default: seedOf(recipe.name), meaning: 'seed for the noise, the spread and the variation; the same seed renders the same samples' },
      emphasis: { type: 'string', default: 'normal', meaning: 'subtle, normal or strong: which layers play' },
    },
    durationS: voiced.durationS,
    render(ctx, at, feel = 'soft-ui', opts = {}) {
      if (feel === 'none') return;
      layers(ctx, at, recipe, { emphasis: opts.emphasis, gain: opts.gain === undefined ? 1 : Number(opts.gain), seed: opts.seed === undefined ? undefined : Number(opts.seed) >>> 0, profile, roomSeed: opts.roomSeed });
    },
  };
}
