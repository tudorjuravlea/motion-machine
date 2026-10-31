// `mm footage review`: from a word list to a list of proposed cuts, each with a kind, the source
// seconds, the words removed, a reason and a confidence. Pure, from words alone (no sound is decoded),
// so every rule is a named constant and a test.
//
//   stutter      the same word again within STUTTER_WITHIN_S (the last is kept); a word repeated with
//                no gap, or across a sentence end, is emphasis ("never, never"), not a stutter
//   retake       a later segment whose words overlap this one's (Jaccard on folded words) at least
//                RETAKE_OVERLAP, or RETAKE_OVERLAP_SAME_OPENING when the openings match: this one goes
//   false-start  a first take under FALSE_START_MAX_S, restarted within FALSE_START_WITHIN_S
//   filler       a transcribed um / uh / ăă
//   long-pause   the stretches between words `mm footage cut --fillers` cuts (unspokenRuns), with a
//                breath kept after the last word. Given the clip's sound (scripts/lib/footage-acoustic.mjs),
//                only the part of such a stretch whose sound is silence or noise, not a voice the
//                transcript missed: at least MIN_DEAD_AIR_S of it, DEAD_AIR_PAD_S left at either end
//
// A span ends ONSET_ROOM_S before the word that stays, so no cut clips an onset. The approved-cuts file
// (cuts.approved.json) is the same entries plus `approved`; only the cuts marked true are applied.
import { DEFAULTS, mergeSpans, unspokenRuns } from './footage.mjs';
import { FILLER_WORDS, normWord } from './footage-words.mjs';
import { DEAD_AIR_PAD_S, MIN_DEAD_AIR_S, deadAirIn } from './footage-acoustic.mjs';
import { snapSpan } from './footage-scenes.mjs';

export { mergeSpans, normWord };
export const STUTTER_WITHIN_S = 0.5;
/** A repeated word closer than this is spoken as one emphasised phrase, not a stumble. */
export const EMPHASIS_GAP_S = 0.06;
export const SEGMENT_GAP_S = 0.85;
export const SEGMENT_SENTENCE_S = 7.5;
export const SEGMENT_MAX_S = 16;
export const RETAKE_SEGMENTS = 9;
export const RETAKE_WITHIN_S = 75;
export const RETAKE_OVERLAP = 0.34;
export const RETAKE_OVERLAP_SAME_OPENING = 0.24;
/** The first this many folded words of two segments matching is "the same opening". */
export const OPENING_WORDS = 2;
/** Fewer folded words than this and the overlap of two segments is chance, not a retake. */
export const MIN_SEGMENT_WORDS = 3;
export const FALSE_START_MAX_S = 6;
export const FALSE_START_WITHIN_S = 12;
/** Room kept before the word that stays after a cut. */
export const ONSET_ROOM_S = 0.06;
/** A cut shorter than this is not worth a splice. */
export const MIN_CUT_S = 0.1;
/** A sentence gap under this share of the speaker's median sentence gap sounds like a stutter. */
export const TIGHT_GAP_RATIO = 0.1;
/** The median of fewer sentence gaps than this says nothing about the speaker. */
export const MIN_SENTENCE_GAPS = 5;
/** The breath kept after a cut: after a pause of LONG_PAUSE_S or more, after a sentence end, otherwise. */
export const KEPT_BREATH_S = Object.freeze({ afterLongPause: 0.24, afterSentence: 0.2, otherwise: 0.14 });
export const LONG_PAUSE_S = 2;
/** The room kept before the first word and after the last of a take, by the reference these were measured against. */
export const HEAD_PAD_S = 0.22;
export const TAIL_PAD_S = 0.34;
export const CUT_KINDS = Object.freeze(['retake', 'false-start', 'stutter', 'filler', 'long-pause']);

const r3 = (x) => Math.round(x * 1000) / 1000;
const r2 = (x) => Math.round(x * 100) / 100;
const fail = (message) => Object.assign(new Error(message), { exitCode: 2 });
const SENTENCE_END = /[.!?…]["'”’)\]»]*$/;
const endsSentence = (w) => SENTENCE_END.test(String(w.text).trim());

/** Jaccard overlap of two lists of folded words, as sets. */
export function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 0;
  let both = 0;
  for (const x of A) if (B.has(x)) both++;
  return both / (A.size + B.size - both);
}

/**
 * Segments of the word list: a new one at a gap over SEGMENT_GAP_S, after a sentence end once the
 * segment has run SEGMENT_SENTENCE_S, and whenever a word would carry it past SEGMENT_MAX_S.
 * Each: { first, last (word indices), start, end, tokens (folded words) }.
 */
export function segmentsOf(words) {
  const segs = [];
  let cur = null;
  words.forEach((w, i) => {
    if (cur) {
      const prev = words[i - 1];
      const split = r3(w.start - prev.end) > SEGMENT_GAP_S
        || (endsSentence(prev) && prev.end - cur.start >= SEGMENT_SENTENCE_S)
        || w.end - cur.start > SEGMENT_MAX_S;
      if (split) { segs.push(cur); cur = null; }
    }
    if (!cur) cur = { first: i, last: i, start: w.start, end: w.end, tokens: [] };
    cur.last = i; cur.end = w.end;
    const t = normWord(w.text);
    if (t) cur.tokens.push(t);
  });
  if (cur) segs.push(cur);
  return segs;
}

function stutters(words) {
  const out = [];
  for (let i = 0; i < words.length - 1;) {
    const t = normWord(words[i].text);
    let k = i;
    while (t && k + 1 < words.length && normWord(words[k + 1].text) === t) {
      const gap = words[k + 1].start - words[k].end;
      if (r3(gap) > STUTTER_WITHIN_S || r3(gap) < EMPHASIS_GAP_S || endsSentence(words[k])) break;
      k++;
    }
    if (k > i) {
      const kept = words[k], gone = words.slice(i, k);
      const comma = /[,—–-]$/.test(String(words[k - 1].text).trim());
      const shaky = gone.some((w) => w.unreliable) || kept.unreliable;
      out.push({
        kind: 'stutter', start: words[i].start, end: Math.max(words[k - 1].end, kept.start - ONSET_ROOM_S),
        words: gone.map((w) => w.text), confidence: r2(comma ? 0.5 : shaky ? 0.6 : 0.8),
        reason: `"${gone[0].text.replace(/[,.]$/, '')}" said ${gone.length + 1} times within ${STUTTER_WITHIN_S} s; the last stays${comma ? ' (a comma follows it, so it may be deliberate)' : ''}`,
      });
    }
    i = k + 1;
  }
  return out;
}

function takes(words, segs) {
  const out = [];
  segs.forEach((a, i) => {
    let match = null;
    for (let j = i + 1; j < segs.length && j <= i + RETAKE_SEGMENTS; j++) {
      const b = segs[j];
      if (r3(b.start - a.end) > RETAKE_WITHIN_S) break;
      const sim = jaccard(a.tokens, b.tokens);
      const opening = a.tokens.length >= OPENING_WORDS && b.tokens.length >= OPENING_WORDS
        && a.tokens.slice(0, OPENING_WORDS).every((t, k) => t === b.tokens[k]);
      const prefix = a.tokens.length >= OPENING_WORDS && b.tokens.length > a.tokens.length && a.tokens.every((t, k) => t === b.tokens[k]);
      const enough = a.tokens.length >= MIN_SEGMENT_WORDS && b.tokens.length >= MIN_SEGMENT_WORDS;
      if (prefix || (enough && (sim >= RETAKE_OVERLAP || (opening && sim >= RETAKE_OVERLAP_SAME_OPENING)))) match = { j, sim, prefix };
    }
    if (!match) return;
    const b = segs[match.j];
    const short = r3(a.end - a.start) < FALSE_START_MAX_S && r3(b.start - a.end) <= FALSE_START_WITHIN_S;
    const gone = words.slice(a.first, a.last + 1);
    const after = words[a.last + 1];
    const far = b.start - a.end > 30;
    const sim = match.prefix ? 1 : match.sim;
    out.push({
      kind: short ? 'false-start' : 'retake',
      start: a.start, end: after ? Math.max(a.end, after.start - ONSET_ROOM_S) : a.end,
      words: gone.map((w) => w.text),
      confidence: r2(Math.max(0.3, Math.min(0.95, 0.3 + sim) - (far ? 0.1 : 0) - (gone.some((w) => w.unreliable) ? 0.1 : 0))),
      reason: short
        ? `a ${r2(a.end - a.start)} s first take that starts again ${r2(b.start - a.end)} s later (${match.prefix ? 'the restart begins with the same words' : `${Math.round(sim * 100)} % of the words repeat`}); the later take stays`
        : `${Math.round(sim * 100)} % of its words are said again ${r2(b.start - a.end)} s later; the last take stays`,
    });
  });
  return out;
}

function hesitations(words) {
  const out = [];
  words.forEach((w, i) => {
    if (!FILLER_WORDS.has(normWord(w.text))) return;
    const next = words[i + 1];
    out.push({
      kind: 'filler', start: w.start, end: next ? Math.max(w.end, next.start - ONSET_ROOM_S) : w.end,
      words: [w.text], confidence: r2(w.unreliable ? 0.6 : 0.85), reason: `a hesitation ("${w.text}", ${r2(w.end - w.start)} s), not a word`,
    });
  });
  return out;
}

/** The breath kept after the word before a gap: LONG_PAUSE_S or more, after a sentence end, otherwise. */
export function breathAfter(prev, gap) {
  return gap >= LONG_PAUSE_S ? KEPT_BREATH_S.afterLongPause : endsSentence(prev) ? KEPT_BREATH_S.afterSentence : KEPT_BREATH_S.otherwise;
}

function pauses(words, maxPause, sound) {
  const out = [];
  for (const run of unspokenRuns(words, maxPause)) {
    const prev = [...words].reverse().find((w) => w.end <= run.a + 1e-9) ?? words[0];
    const gap = run.b - run.a;
    const breath = breathAfter(prev, gap);
    if (sound?.stretches) {
      // the transcript has no word here; the sound decides which part of it is dead air
      for (const air of deadAirIn(sound, run, { minS: Math.max(MIN_DEAD_AIR_S, maxPause) })) {
        const start = air.a <= run.a + 1e-9 ? Math.max(air.a + DEAD_AIR_PAD_S, run.a + breath) : air.a + DEAD_AIR_PAD_S, end = air.b - DEAD_AIR_PAD_S;
        if (end - start < MIN_CUT_S) continue;
        out.push({
          kind: 'long-pause', start, end, words: [], confidence: 0.95, sound: air.sound,
          reason: `${r2(air.b - air.a)} s with no word and no speech sound in it (${air.sound}); ${r2(start - air.a)} s of room stays before the cut and ${DEAD_AIR_PAD_S} s after it`,
        });
      }
      continue;
    }
    const start = run.a + breath, end = run.b - DEFAULTS.lead;
    if (end - start < MIN_CUT_S) continue;
    out.push({
      kind: 'long-pause', start, end, words: [], confidence: 0.9,
      reason: `${r2(gap)} s with no word in it (a breath or an "um" there is no word); ${r2(breath)} s of room stays after "${prev.text.replace(/[,.!?]$/, '')}" and ${DEFAULTS.lead} s before the next word`,
    });
  }
  return out;
}

/** Sentence gaps much tighter than this speaker's median, the kept breaths, and the pads compared with the cut's. */
export function gapAudit(words) {
  const gaps = [];
  for (let i = 0; i < words.length - 1; i++) if (endsSentence(words[i])) gaps.push({ at: words[i].end, gap: r3(words[i + 1].start - words[i].end), before: words[i].text, after: words[i + 1].text });
  const sorted = gaps.map((g) => g.gap).filter((g) => g > 0).sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : 0;
  const enough = sorted.length >= MIN_SENTENCE_GAPS && median > 0;
  const tight = enough ? gaps.filter((g) => g.gap < median * TIGHT_GAP_RATIO).map((g) => ({
    at: r3(g.at), gap: g.gap, ratio: r3(g.gap / median), note: `${g.gap} s after "${g.before}" is ${r3(g.gap / median)} of this speaker's median sentence gap (${r3(median)} s): sounds like a stutter or a clipped breath`,
  })) : [];
  return {
    sentenceGaps: gaps.length, medianSentenceGap: r3(median), ...(enough ? {} : { note: `fewer than ${MIN_SENTENCE_GAPS} sentence gaps: no median to judge a tight one by` }), tight,
    breath: { ...KEPT_BREATH_S },
    pads: { head: { current: DEFAULTS.lead, reference: HEAD_PAD_S }, tail: { current: DEFAULTS.tail, reference: TAIL_PAD_S } },
  };
}

/**
 * The proposal for a word list (source seconds, as `readWordsFile` returns them):
 * { kind: 'cuts', status: 'proposed', language, duration, cuts: [{ id, kind, start, end, words, reason, confidence }], gaps }.
 * A stutter, hesitation or pause inside a retaken or restarted take is not proposed a second time.
 * `sound` is the clip's analysis (`analyse` in footage-acoustic.mjs), or { class: 'no-audio' }: with a
 * speech clip's, a long pause is cut only where the sound is silence or noise, not a voice the transcript
 * missed, and the cut says which (`sound`); a clip whose sound holds no speech (silent, noise) proposes
 * no cut at all, since its words cannot be trusted; with no audio the words alone judge, as without `sound`.
 * `scenes` are the scene changes (seconds of the sound): a cut edge that would leave a sliver of the other
 * shot moves onto the scene change, unless a word lies between (`scene` on the cut says what happened).
 */
export function review(words, { language = null, maxPause = DEFAULTS.maxPause, sound = null, scenes = null } = {}) {
  const w = [...words].sort((a, b) => a.start - b.start);
  const trusted = !sound || sound.class === 'speech' || sound.class === 'no-audio';
  const segs = segmentsOf(w);
  const big = trusted ? takes(w, segs) : [];
  const inside = (c) => big.some((t) => c.start >= t.start - 1e-9 && c.end <= t.end + 1e-9);
  const small = trusted ? [...stutters(w), ...hesitations(w), ...pauses(w, maxPause, sound?.class === 'speech' ? sound : null)].filter((c) => !inside(c)) : [];
  const cuts = [...big, ...small].sort((a, b) => a.start - b.start || a.end - b.end).map((c, i) => {
    const at = scenes?.length ? snapSpan(c, scenes, w) : null;
    const note = at && (at.snapped.length || at.held.length) ? sceneNote(at) : null;
    return {
      id: `c${String(i + 1).padStart(3, '0')}`, kind: c.kind, start: r3(at ? at.start : c.start), end: r3(at ? at.end : c.end), words: c.words, reason: note ? `${c.reason}; ${note}` : c.reason, confidence: c.confidence,
      ...(c.sound ? { sound: c.sound } : {}),
      ...(note ? { scene: { snapped: at.snapped, held: at.held } } : {}),
    };
  });
  return {
    kind: 'cuts', status: 'proposed', language, duration: w.length ? r3(Math.max(...w.map((x) => x.end))) : 0, params: { maxPause }, cuts, gaps: gapAudit(w),
    ...(sound ? { sound: soundSummary(sound) } : {}),
  };
}

/** A sentence for a cut whose edges met scene changes. */
function sceneNote({ snapped, held }) {
  return [...snapped.map((x) => `its ${x.edge} moved ${r2(Math.abs(x.to - x.from))} s ${x.to < x.from ? 'earlier' : 'later'} onto a scene change (${r2(x.to)} s), so no sliver of the other shot stays`),
    ...held.map((x) => `its ${x.edge} was left where it is: a scene change at ${r2(x.scene)} s falls inside "${x.word}"`)].join('; ');
}

/** What the proposal says about the clip's sound: its class, levels, seconds of each, and a note when it changes what is proposed. */
function soundSummary(sound) {
  const { class: cls, speechDb, gateDb, speechS, noiseS, silenceS } = sound;
  const note = cls === 'no-audio' ? 'the file has no audio stream: the pauses are judged by the words alone, which cannot tell a silent one from a noisy or a voiced one'
    : cls === 'speech' ? null
      : `${cls === 'silent' ? 'the sound is silent' : 'the sound is noise'}: it holds no speech sound, so the transcript is not to be trusted (a transcriber invents words over silence and noise) and no cut is proposed; transcribe the right file or check the recording`;
  return { class: cls, ...(speechDb != null ? { speechDb, gateDb, speechS, noiseS, silenceS } : {}), ...(note ? { note } : {}) };
}

/**
 * The cuts to apply from a parsed approved-cuts file ({ cuts: [...] } or a bare list): the entries marked
 * `approved: true`, nothing else. An empty list is valid (the identity edit). Exit 2 for a shape that is not a cut list.
 */
export function approvedCuts(doc) {
  const list = Array.isArray(doc) ? doc : Array.isArray(doc?.cuts) ? doc.cuts : null;
  if (!list) throw fail('the cuts file must be { "cuts": [ { "start", "end", "approved" } ] } (or a list of cuts)');
  list.forEach((c, i) => {
    const name = c?.id ?? `#${i + 1}`;
    if (!Number.isFinite(c?.start) || !Number.isFinite(c?.end)) throw fail(`cut ${name}: start and end must be numbers of seconds`);
    if (c.approved === true && !(c.end > c.start)) throw fail(`cut ${name}: end (${c.end}) must be after start (${c.start})`);
  });
  return list.filter((c) => c.approved === true);
}

/**
 * The approved cuts as spans { s, e } within a source of `duration` seconds (`tolerance` s of slack at either end,
 * for a transcriber's clock). A cut outside the source is an error naming it; the source and the edit clocks are
 * never mixed: these are source seconds only.
 */
export function spansWithin(cuts, duration, { tolerance = 0 } = {}) {
  return cuts.map((c, i) => {
    if (c.start < -tolerance - 1e-9 || c.end > duration + tolerance + 1e-9) {
      throw fail(`cut ${c.id ?? `#${i + 1}`} (${c.start}-${c.end} s) is outside the source, which runs 0-${r3(duration)} s: cuts are in source seconds, not the edit's`);
    }
    return { s: Math.max(0, c.start), e: Math.min(duration, c.end) };
  });
}
