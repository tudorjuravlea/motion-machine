// The arithmetic of `mm footage cut`, pure and in Node: from decoded mono samples to an edit list.
// Loudness is measured window by window. The room is the level of the quietest windows; the voice is
// the mean power of the windows that rise well clear of the room, so neither needs the take to hold a
// set share of silence or of speech. Anything under a threshold between the two is quiet; a quiet
// stretch longer than the max pause is dead air and is taken out, keeping a little before the next
// sound and a little after the last, so no cut clips an onset or a decay. The quiet before the first
// sound and after the last is trimmed the same way. Kept ranges snap to whole frames with the rounding
// carried from range to range, so the total stays within half a frame of the exact sum. The voice
// follows the picture sample for sample and crosses each join in a short equal-power fade.

// 25 ms windows every 10 ms: a window holds two periods of a low (80 Hz) voice, so voiced sound reads
// steady, and the 10 ms hop is a third of a 30 fps frame, finer than the frame grid cuts snap to.
export const HOP_S = 0.01;
export const WIN_S = 0.025;
// The room: the level under which the quietest 2 % of windows fall (a quarter second in a 12 s take,
// which any lead-in or breath provides; a few dropped-out windows at a splice stay below it).
export const FLOOR_SHARE = 0.02;
// A window 10 dB over the room carries ten times the room's power, so it is mostly something else:
// the voice is the mean power of those windows.
export const GATE_DB = 10;
// The voice must stand 12 dB over the room for pauses to be told from soft speech: the quiet threshold
// then sits about 5 dB over the room, clear of the room's own 1 to 2 dB flicker, and 7 dB under the voice.
export const MIN_GAP_DB = 12;
// A take whose loudness never moves more than 3 dB holds no speech (speech swings by syllable).
export const FLAT_DB = 3;
// Under -90 dBFS a take is silent (16-bit dither sits near -96).
export const SILENT_DB = -90;
// maxPause: half a second still reads as a beat of the speaker's rhythm; longer reads as dead air.
// lead: an onset (a plosive's burst, a breath before a phrase) starts up to about 100 ms before the
// loudness crosses the threshold. tail: a word's decay and a small room's reverberation take about a
// quarter second to fall into the room. quietShare: 40 % of the way from room to voice, nearer the
// room, so a breath or a soft consonant counts as sound only when it is closer to speech than to the
// room. join: 30 ms, longer than a click (a few ms) and shorter than a syllable.
export const DEFAULTS = Object.freeze({ maxPause: 0.5, lead: 0.1, tail: 0.25, quietShare: 0.4, join: 0.03 });
const r3 = (x) => Math.round(x * 1000) / 1000;

/** Loudness in dBFS per hop: window i covers samples [i·hop, i·hop + win). */
export function loudnessCurve(samples, rate) {
  const hop = Math.round(HOP_S * rate), k = Math.max(1, Math.round(WIN_S / HOP_S)), win = hop * k;
  if (samples.length < win) return new Float64Array(0);
  const blocks = new Float64Array(Math.floor(samples.length / hop));
  for (let b = 0; b < blocks.length; b++) {
    let e = 0;
    for (let i = b * hop, end = i + hop; i < end; i++) e += samples[i] * samples[i];
    blocks[b] = e;
  }
  const out = new Float64Array(Math.floor((samples.length - win) / hop) + 1);
  for (let i = 0; i < out.length; i++) {
    let e = 0;
    for (let j = 0; j < k; j++) e += blocks[i + j];
    out[i] = 10 * Math.log10(e / win + 1e-12);
  }
  return out;
}

/** The level under which a share q of the sorted curve falls. */
function levelAt(sorted, q) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
}

/**
 * { floorDb, speechDb, quietDb, gapDb }: the room (FLOOR_SHARE), the voice (mean power of the windows
 * GATE_DB over the room; the loudest window when none is), and the quiet threshold between them.
 * Throws when the take is silent or flat (no speech to cut by); a small gap is planEdit's to judge.
 */
export function levels(curve, { quietShare = DEFAULTS.quietShare } = {}) {
  if (!curve.length) throw new Error(`the recording is shorter than one ${WIN_S * 1000} ms window`);
  const sorted = Float64Array.from(curve).sort();
  const loudest = sorted[sorted.length - 1];
  if (loudest < SILENT_DB) throw new Error(`the recording is silent (its loudest moment is ${r3(loudest)} dBFS): no speech to cut by`);
  const floorDb = levelAt(sorted, FLOOR_SHARE);
  let p = 0, n = 0;
  for (const v of curve) if (v >= floorDb + GATE_DB) { p += 10 ** (v / 10); n++; }
  const speechDb = n ? 10 * Math.log10(p / n) : loudest;
  const gapDb = speechDb - floorDb;
  if (gapDb < FLAT_DB) throw new Error(`no speech found: the loudness stays within ${r3(gapDb)} dB of the room (${r3(floorDb)} dBFS) all through`);
  return { floorDb, speechDb, quietDb: floorDb + quietShare * gapDb, gapDb };
}

/** Runs of windows under `quietDb`, as seconds { a, b, head, tail }: every window inside [a, b] is quiet. */
export function quietRuns(curve, quietDb) {
  const runs = [];
  for (let i = 0; i < curve.length; i++) {
    if (!(curve[i] < quietDb)) continue;
    let j = i;
    while (j + 1 < curve.length && curve[j + 1] < quietDb) j++;
    runs.push({ a: i * HOP_S, b: j * HOP_S + WIN_S, head: i === 0, tail: j === curve.length - 1 });
    i = j;
  }
  return runs;
}

/**
 * The stretches between transcribed words longer than maxPause, as runs { a, b } in seconds. A
 * transcriber writes words, not hesitations: a sound in such a stretch (an "um", a breath, a click) is
 * no word, so with `fillers` it is cut like quiet.
 */
export function unspokenRuns(words, maxPause = DEFAULTS.maxPause) {
  const w = [...words].sort((p, q) => p.start - q.start), out = [];
  let end = -Infinity;
  for (let i = 0; i < w.length; i++) {
    if (i > 0 && w[i].start - end > maxPause) out.push({ a: end, b: w[i].start, head: false, tail: false });
    end = Math.max(end, w[i].end);
  }
  return out;
}

/**
 * Source ranges [{ s, e }] in seconds that survive the cut. `words` (source seconds) are never cut
 * through. With `fillers` (and words), the long stretches between words are cut too, whatever sound
 * they hold (unspokenRuns), and the take opens a lead before the first word and ends a tail after the last.
 */
export function keptRanges(runs, duration, { maxPause = DEFAULTS.maxPause, lead = DEFAULTS.lead, tail = DEFAULTS.tail, words = [], fillers = false } = {}) {
  const head = runs.find((r) => r.head), last = runs.find((r) => r.tail);
  if (head && head === last) throw new Error('the recording holds no speech: every window is under the quiet threshold');
  let start = head ? Math.max(0, head.b - lead) : 0;
  let end = last ? Math.min(duration, last.a + tail) : duration;
  if (words.length) {
    const first = Math.max(0, Math.min(...words.map((w) => w.start)) - lead), last = Math.min(duration, Math.max(...words.map((w) => w.end)) + tail);
    // with fillers the words alone bound the take: a breath before the first or a click after the last goes
    start = fillers ? first : Math.min(start, first);
    end = fillers ? last : Math.max(end, last);
  }
  // each long run gives one cut [out, in] (a tail after the sound before it, a lead before the next);
  // a cut through a word is dropped; the cuts of quiet runs and of unspoken stretches that overlap are one
  const runsToCut = [...runs.filter((r) => !r.head && !r.tail), ...(fillers ? unspokenRuns(words, maxPause) : [])];
  const cuts = [];
  for (const r of runsToCut) {
    if (r.b - r.a <= maxPause) continue;
    const cutOut = r.a + tail, cutIn = r.b - lead;
    if (cutIn <= cutOut || cutOut <= start || cutIn >= end) continue;
    if (words.some((w) => w.start < cutIn && w.end > cutOut)) continue;
    cuts.push([cutOut, cutIn]);
  }
  cuts.sort((p, q) => p[0] - q[0]);
  const out = [];
  let s = start;
  for (const [cutOut, cutIn] of cuts) {
    if (cutOut <= s) { s = Math.max(s, cutIn); continue; }
    out.push({ s, e: cutOut });
    s = cutIn;
  }
  out.push({ s, e: end });
  return out;
}

/** Whole-frame clips { start, from, length } (output frame, 0-based source frame, frames); rounding is carried, never summed. */
export function quantize(ranges, fps, frames) {
  const out = [];
  let cum = 0, start = 0;
  for (const r of ranges) {
    const from = Math.max(0, Math.round(r.s * fps));
    const a = Math.round(cum * fps);
    cum += r.e - r.s;
    const length = Math.min(Math.round(cum * fps) - a, frames - from);
    if (length < 1) continue;
    out.push({ start, from, length });
    start += length;
  }
  return out;
}

/** Each join: output second `at`, the source second the outgoing clip leaves (`out`) and the incoming one enters (`in`). */
export const cutsOf = (picture, fps) => picture.slice(1).map((c, i) => ({ at: r3(c.start / fps), out: r3((picture[i].from + picture[i].length) / fps), in: r3(c.from / fps) }));

/** Cuts whose source instants are not inside a quiet run by half a window: listed so a person can listen to them. */
export function onSoundOf(cuts, runs) {
  const quiet = (t) => runs.some((r) => t >= r.a + WIN_S / 2 - 1e-9 && t <= r.b - WIN_S / 2 + 1e-9);
  return cuts.flatMap((c) => [['out', c.out], ['in', c.in]].filter(([, t]) => !quiet(t)).map(([side, t]) => ({ at: c.at, side, source: t })));
}

/** Words [{ text, start, end }] (source seconds) on the output clock [{ text, at, end }]; a word that starts in a removed span is dropped. */
export function mapWords(words, picture, fps) {
  const out = [];
  for (const w of words) {
    const c = picture.find((p) => w.start * fps >= p.from - 1e-9 && w.start * fps < p.from + p.length);
    if (!c) continue;
    const at = (c.start + w.start * fps - c.from) / fps;
    const end = (c.start + Math.min(w.end * fps, c.from + c.length) - c.from) / fps;
    out.push({ text: String(w.text), at: r3(at), end: r3(Math.max(at, end)) });
  }
  return out.sort((p, q) => p.at - q.at);
}

/** The voice for the edit: each clip's source samples, and an equal-power crossfade of `join` seconds centred on each join. */
export function renderVoice(src, picture, fps, { rate = 48000, join = DEFAULTS.join } = {}) {
  const total = picture.reduce((n, c) => n + c.length, 0);
  const N = Math.round((total * rate) / fps);
  const out = new Float32Array(N);
  const O = (k) => Math.round((picture[k].start * rate) / fps), S = (k) => Math.round((picture[k].from * rate) / fps);
  const at = (i) => (i >= 0 && i < src.length ? src[i] : 0);
  picture.forEach((_, k) => {
    const o0 = O(k), o1 = k + 1 < picture.length ? O(k + 1) : N, s0 = S(k);
    for (let n = o0; n < o1; n++) out[n] = at(s0 + n - o0);
  });
  const half = Math.round((join * rate) / 2);
  for (let k = 1; k < picture.length && half > 0; k++) {
    if (picture[k].from === picture[k - 1].from + picture[k - 1].length) continue;   // continuous in the source: nothing to join
    const J = O(k);
    for (let n = Math.max(0, J - half); n < Math.min(N, J + half); n++) {
      const x = (n - (J - half)) / (2 * half);
      out[n] = at(S(k - 1) + n - O(k - 1)) * Math.cos((Math.PI * x) / 2) + at(S(k) + n - J) * Math.sin((Math.PI * x) / 2);
    }
  }
  return out;
}

/** One static gain toward `target` LUFS (within ±20 dB), lowered when it would lift the sample peak over `ceilingDb`. */
export function gainFor({ lufs, peakDb }, target, { ceilingDb = -1, clampDb = 20 } = {}) {
  let gainDb = Number.isFinite(lufs) ? Math.max(-clampDb, Math.min(clampDb, target - lufs)) : 0;
  let peakLimited = false;
  if (Number.isFinite(peakDb) && peakDb + gainDb > ceilingDb) { gainDb = ceilingDb - peakDb; peakLimited = true; }
  return { gainDb: r3(gainDb), peakLimited };
}

export const peakDbOf = (s) => { let p = 0; for (const x of s) p = Math.max(p, Math.abs(x)); return p > 0 ? 20 * Math.log10(p) : -Infinity; };

/** Mono 16-bit PCM WAV, rounded half away from zero, so the same samples are the same bytes. */
export function wav16(samples, rate) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0, 'latin1'); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8, 'latin1');
  buf.write('fmt ', 12, 'latin1'); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'latin1'); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i])) * 32767;
    buf.writeInt16LE(Math.sign(v) * Math.round(Math.abs(v)), 44 + 2 * i);
  }
  return buf;
}

/**
 * The whole plan from samples covering the prepared sequence (`frames` at `fps`):
 * { levels, picture, frames, duration, cuts, onSound, note?, words? }. When the voice stands less than
 * MIN_GAP_DB over the room, the take is refused only if it holds quiet stretches longer than the max
 * pause, which could be pauses or soft speech; when it holds none, the speech fills it and nothing is cut.
 */
export function planEdit({ samples, rate, fps, frames, words = null, maxPause = DEFAULTS.maxPause, lead = DEFAULTS.lead, tail = DEFAULTS.tail, fillers = false }) {
  const curve = loudnessCurve(samples, rate);
  const lv = levels(curve);
  const runs = quietRuns(curve, lv.quietDb);
  const long = runs.some((r) => r.b - r.a > maxPause);
  let ranges, note;
  if (lv.gapDb < MIN_GAP_DB) {
    if (long) throw new Error(`speech stands only ${r3(lv.gapDb)} dB over the room (room ${r3(lv.floorDb)} dBFS, speech ${r3(lv.speechDb)} dBFS) and the take has quiet stretches over ${maxPause} s, so its pauses cannot be told from soft speech; cuts need ${MIN_GAP_DB} dB`);
    ranges = [{ s: 0, e: frames / fps }];
  } else ranges = keptRanges(runs, frames / fps, { maxPause, lead, tail, words: words ?? [], fillers });
  const picture = quantize(ranges, fps, frames);
  const total = picture.reduce((n, c) => n + c.length, 0);
  const cuts = cutsOf(picture, fps);
  if (!cuts.length) note = `no pause longer than ${maxPause} s inside the speech: nothing to cut${total < frames ? ' (the quiet before and after it is trimmed)' : ''}`;
  return {
    levels: { floorDb: r3(lv.floorDb), speechDb: r3(lv.speechDb), quietDb: r3(lv.quietDb) },
    picture, frames: total, duration: r3(total / fps), cuts, onSound: onSoundOf(cuts, runs),
    ...(note ? { note } : {}),
    ...(words ? { words: mapWords(words, picture, fps) } : {}),
  };
}

/**
 * wordsFrom(json): a word list in source seconds, [{ text, start, end }] sorted by start, from either
 * the plain list (or { words: [...] }) or a WhisperX result: its `word_segments`, else every
 * `segments[].words`, where each word is { word, start, end, score }. WhisperX leaves a word it could
 * not align (a number, a symbol) without times: such a word is placed between its neighbours, from the
 * end of the word before to the start of the word after, so the caption keeps it. Throws when nothing
 * readable is there.
 */
export function wordsFrom(json) {
  const plainShape = 'a list of { text, start, end } in source seconds (end ≥ start ≥ 0), { words: [...] }, or WhisperX output (word_segments or segments[].words)';
  const plain = Array.isArray(json) ? json : Array.isArray(json?.words) ? json.words : null;
  if (plain) {
    const ok = plain.every((w) => typeof w?.text === 'string' && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start && w.start >= 0);
    if (!ok) throw new Error(`the words must be ${plainShape}`);
    return plain.map((w) => ({ text: w.text, start: w.start, end: w.end })).sort((a, b) => a.start - b.start);
  }
  const raw = Array.isArray(json?.word_segments) && json.word_segments.length ? json.word_segments
    : Array.isArray(json?.segments) ? json.segments.flatMap((s) => (Array.isArray(s?.words) ? s.words : [])) : null;
  if (!raw) throw new Error(`the words must be ${plainShape}`);
  const list = raw.filter((w) => typeof w?.word === 'string' && w.word.trim()).map((w) => ({ text: w.word.trim(), start: w.start, end: w.end }));
  const timed = (w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start && w.start >= 0;
  if (!list.some(timed)) throw new Error('the WhisperX output holds no timed word');
  for (let i = 0; i < list.length; i++) {
    if (timed(list[i])) continue;
    const before = list.slice(0, i).reverse().find(timed), after = list.slice(i + 1).find(timed);
    const start = before ? before.end : after.start;
    list[i] = { text: list[i].text, start, end: Math.max(start, after ? after.start : before.end) };
  }
  return list.sort((a, b) => a.start - b.start);
}
