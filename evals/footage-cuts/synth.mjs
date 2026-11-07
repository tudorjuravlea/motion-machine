// The synthetic sound of a gold fixture: no person, no recording. A fixture lists where the voice is
// (its words), and what else the room holds: a voiced sound with no word to it ("voice"), noise
// (white or brown) and a room tone under everything. Every sample is a function of the fixture and a
// seeded generator, so the same fixture is the same samples on every machine.
export const RATE = 16000;
/** Speech-like sound is merged across word gaps up to this long: a voice does not stop between words of a phrase. */
export const PHRASE_GAP_S = 0.25;

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = (rnd) => (rnd() + rnd() + rnd() + rnd() - 2) * 1.7320508;   // sum of four uniforms: close enough to normal, unit variance

/** Adds `x` into `out` at second `from`, scaled to `db` dBFS RMS, with a 10 ms fade at either end so a span does not click. */
function place(out, from, x, db, rate) {
  let e = 0;
  for (const v of x) e += v * v;
  const k = e ? 10 ** (db / 20) / Math.sqrt(e / x.length) : 0;
  const fade = Math.round(0.01 * rate), s0 = Math.round(from * rate);
  for (let i = 0; i < x.length; i++) {
    const g = Math.min(1, i / fade, (x.length - 1 - i) / fade);
    if (s0 + i >= 0 && s0 + i < out.length) out[s0 + i] += x[i] * k * g;
  }
}

/** A voiced sound: a gliding pitch with eight harmonics falling as 1/h, shaped by a syllable rhythm. */
function voiced(n, rate, seed) {
  const rnd = mulberry32(seed), x = new Float64Array(n), f0 = 120 + 40 * rnd(), wob = 1.5 + 2 * rnd(), syl = 3.5 + 1.5 * rnd();
  let phase = rnd() * 6.283;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    phase += (2 * Math.PI * (f0 + 25 * Math.sin(2 * Math.PI * wob * t))) / rate;
    let s = 0;
    for (let h = 1; h <= 8; h++) s += Math.sin(h * phase) / h;
    x[i] = s * (0.3 + 0.7 * Math.abs(Math.sin(Math.PI * syl * t)));
  }
  return x;
}

function noisy(n, colour, seed) {
  const rnd = mulberry32(seed), x = new Float64Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const w = gauss(rnd);
    y = colour === 'brown' ? 0.995 * y + w : w;
    x[i] = y;
  }
  return x;
}

/** Speech spans of a fixture: its words, merged across gaps of PHRASE_GAP_S or less. */
export function speechSpans(words, gap = PHRASE_GAP_S) {
  const spans = [];
  for (const w of [...words].sort((a, b) => a.start - b.start)) {
    const last = spans.at(-1);
    if (last && w.start - last.to <= gap) last.to = Math.max(last.to, w.end);
    else spans.push({ from: w.start, to: w.end });
  }
  return spans;
}

/**
 * The samples of a fixture: { duration, words, sound: { room?, speechDb?, voiced?, extra?: [{ kind: 'voice'|'noise', from, to, db?, colour? }] } }.
 * The words are voiced (speechDb, -20 by default; not at all when `voiced` is false) over their phrases; `extra` adds what the transcript does not
 * hold; the room tone sits under everything (-55 dBFS by default).
 */
export function synthesize(fixture, rate = RATE) {
  const { duration, words = [], sound = {} } = fixture;
  const acc = new Float64Array(Math.round(duration * rate));
  place(acc, 0, noisy(acc.length, 'white', 1), sound.room ?? -55, rate);
  if (sound.voiced !== false) speechSpans(words).forEach((s, i) => place(acc, s.from, voiced(Math.round((s.to - s.from) * rate), rate, 100 + i), sound.speechDb ?? -20, rate));
  (sound.extra ?? []).forEach((e, i) => {
    const n = Math.round((e.to - e.from) * rate);
    place(acc, e.from, e.kind === 'voice' ? voiced(n, rate, 500 + i) : noisy(n, e.colour ?? 'white', 900 + i), e.db ?? (e.kind === 'voice' ? -22 : -32), rate);
  });
  return Float32Array.from(acc);
}
