// The pure half of `mm footage review`, `cut --cuts` and the transcript sanity check, on synthetic word
// lists (no recording, no ffmpeg): the stutter / segment / retake / false-start rules and their named
// constants, the emphasis false positive, fillers and long pauses, the speaker-relative gap audit, the
// approved-cuts file, and the sanity every footage command that reads words runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../../scripts/lib/footage-review.mjs';
import { checkTranscript, WORDS_MARK_SHARE, UNRELIABLE_S, FILLER_MIN_S } from '../../scripts/lib/footage-words.mjs';
import { DEFAULTS, planEdit } from '../../scripts/lib/footage.mjs';

/**
 * A word list from `[text, gapBefore?]` pairs: each word lasts `dur` s, the first starts at t0.
 * A number alone is a longer gap before the next word.
 */
function say(items, { t0 = 0.5, dur = 0.3, gap = 0.1 } = {}) {
  const out = [];
  let t = t0;
  for (const it of items) {
    if (typeof it === 'number') { t += it; continue; }
    const [text, g = gap] = Array.isArray(it) ? it : [it];
    if (out.length) t += g;
    out.push({ text, start: Math.round(t * 1000) / 1000, end: Math.round((t + dur) * 1000) / 1000 });
    t += dur;
  }
  return out;
}
const sentence = (s, opts) => say(s.split(' '), opts);
/** Several word lists joined, each starting `gap` s after the one before. */
function join(lists, gap = 1.2) {
  const out = [];
  for (const l of lists) {
    const shift = out.length ? out.at(-1).end + gap - l[0].start : 0;
    for (const w of l) out.push({ ...w, start: Math.round((w.start + shift) * 1000) / 1000, end: Math.round((w.end + shift) * 1000) / 1000 });
  }
  return out;
}
const allKinds = (r) => r.cuts.map((c) => c.kind);
const kinds = (r) => allKinds(r).filter((k) => k !== 'long-pause');   // joined takes leave gaps; pauses have their own test

test('the rules are named constants with the brief\'s values', () => {
  assert.equal(R.STUTTER_WITHIN_S, 0.5);
  assert.equal(R.SEGMENT_GAP_S, 0.85);
  assert.equal(R.SEGMENT_SENTENCE_S, 7.5);
  assert.equal(R.SEGMENT_MAX_S, 16);
  assert.equal(R.RETAKE_SEGMENTS, 9);
  assert.equal(R.RETAKE_WITHIN_S, 75);
  assert.equal(R.RETAKE_OVERLAP, 0.34);
  assert.equal(R.RETAKE_OVERLAP_SAME_OPENING, 0.24);
  assert.equal(R.FALSE_START_MAX_S, 6);
  assert.equal(R.FALSE_START_WITHIN_S, 12);
  assert.equal(R.TIGHT_GAP_RATIO, 0.1);
  assert.deepEqual(R.KEPT_BREATH_S, { afterLongPause: 0.24, afterSentence: 0.2, otherwise: 0.14 });
  assert.equal(R.LONG_PAUSE_S, 2);
  assert.equal(R.HEAD_PAD_S, 0.22);
  assert.equal(R.TAIL_PAD_S, 0.34);
});

test('words are compared without case, punctuation or diacritics (Romanian first)', () => {
  assert.equal(R.normWord('Știință,'), 'stiinta');
  assert.equal(R.normWord('ÎNCEPEM!'), 'incepem');
  assert.equal(R.normWord('Țară…'), 'tara');
  assert.equal(R.normWord('— '), '');
  assert.equal(R.normWord('don’t'), 'dont');
});

test('stutter: the same word again within 0.5 s is cut, keeping the last', () => {
  const words = say(['So', ['I', 0.1], ['I', 0.2], ['want', 0.1], 'to', 'start', 'now.']);
  const r = R.review(words);
  assert.deepEqual(kinds(r), ['stutter']);
  const c = r.cuts[0];
  assert.deepEqual(c.words, ['I']);
  assert.equal(c.start, words[1].start, 'the earlier "I" goes');
  assert.ok(c.end <= words[2].start - R.ONSET_ROOM_S + 1e-9 && c.end > words[1].end, 'the cut stops short of the kept word\'s onset');
  assert.ok(c.confidence > 0 && c.confidence <= 1 && c.reason.length > 10);
  // 0.6 s apart is no stutter
  assert.deepEqual(kinds(R.review(say(['So', ['I', 0.1], ['I', 0.6], 'want', 'it.']))), []);
});

test('deliberate repetition is no stutter: no gap and no sentence break is emphasis', () => {
  const emphasis = say(['It', 'is', 'never,', ['never', 0.02], 'going', 'to', 'work.']);
  assert.deepEqual(kinds(R.review(emphasis)), []);
  // a sentence break between the two is a new sentence, not a stutter
  assert.deepEqual(kinds(R.review(say(['No.', ['No', 0.3], 'thank', 'you.']))), []);
  // the same pair with a real gap is a stutter
  assert.deepEqual(kinds(R.review(say(['It', 'is', 'never', ['never', 0.2], 'going', 'to', 'work.']))), ['stutter']);
});

test('a run of repeats keeps only the last: one cut, every earlier word listed', () => {
  const r = R.review(say(['we', ['the', 0.15], ['the', 0.15], ['the', 0.15], 'plan', 'works.']));
  assert.equal(r.cuts.length, 1);
  assert.deepEqual(r.cuts[0].words, ['the', 'the']);
});

test('segments split at a gap over 0.85 s, at a sentence end after 7.5 s, and at 16 s', () => {
  const a = sentence('one two three four five');
  const b = sentence('six seven eight nine ten');
  assert.equal(R.segmentsOf(join([a, b], 0.86)).length, 2);
  assert.equal(R.segmentsOf(join([a, b], 0.85)).length, 1, 'exactly 0.85 s is not over');
  // a sentence end after 7.5 s of speech closes the segment; before it, it does not
  const long = say(Array.from({ length: 20 }, (_, i) => (i === 19 ? `w${i}.` : `w${i}`)), { dur: 0.4, gap: 0.0 });   // 8.0 s, ends a sentence
  const tail = sentence('and then more', { t0: long.at(-1).end + 0.1 });
  const segs = R.segmentsOf([...long, ...tail]);
  assert.equal(segs.length, 2);
  const short = say(Array.from({ length: 10 }, (_, i) => (i === 9 ? `w${i}.` : `w${i}`)), { dur: 0.4, gap: 0.0 });   // 4.0 s
  assert.equal(R.segmentsOf([...short, ...sentence('and then more', { t0: short.at(-1).end + 0.1 })]).length, 1);
  // no sentence end at all: split at 16 s
  const run = say(Array.from({ length: 50 }, (_, i) => `w${i}`), { dur: 0.4, gap: 0.0 });   // 20 s
  const parts = R.segmentsOf(run);
  assert.equal(parts.length, 2);
  assert.ok(parts[0].end - parts[0].start <= R.SEGMENT_MAX_S + 1e-9);
});

const TAKE = 'today we are going to look at the new dashboard and how people read it in the first week of use';
test('retake: a later segment with the same words makes the earlier take a retake; the last clean take stays', () => {
  const first = sentence('today we are going to look at the new dashboard and how people read it', { dur: 0.45 });
  const second = sentence(TAKE, { dur: 0.35 });
  const words = join([first, second], 3);
  const r = R.review(words);
  assert.deepEqual(kinds(r), ['retake']);
  const c = r.cuts[0];
  assert.equal(c.start, first[0].start);
  assert.ok(c.end < words[first.length].start && c.end >= first.at(-1).end, 'the first take goes, whole, up to the second one\'s onset');
  assert.ok(c.confidence >= 0.5);
});

test('retake: the overlap is Jaccard on normalised words, 0.34, or 0.24 when the opening matches', () => {
  const take = (words) => say(words.split(' '), { dur: 0.8 });
  const two = (a, b) => join([take(a), take(b)], 2);
  // 6 shared of 10 + 10: 6 / 14 = 0.43, over 0.34 with no opening in common
  const A1 = 'a1 a2 a3 a4 a5 a6 x1 x2 x3 x4', B1 = 'a1 a2 a3 a4 a5 a6 y1 y2 y3 y4';
  assert.ok(Math.abs(R.jaccard(A1.split(' '), B1.split(' ')) - 6 / 14) < 1e-9);
  assert.deepEqual(kinds(R.review(two(A1, B1))), ['retake']);
  // 4 shared of 8 + 8: 4 / 12 = 0.333, under 0.34 with different openings: no retake
  assert.deepEqual(kinds(R.review(two('p1 a2 a3 a4 a5 x1 x2 x3', 'q1 a2 a3 a4 a5 y1 y2 y3'))), []);
  // the same 0.333 with the same first two words: over 0.24, a retake
  assert.deepEqual(kinds(R.review(two('so then a3 a4 x1 x2 x3 x4', 'so then a3 a4 y1 y2 y3 y4'))), ['retake']);
  // 3 shared of 8 + 8 = 0.23 is under 0.24 even with the same opening
  assert.deepEqual(kinds(R.review(two('so then a3 x1 x2 x3 x4 x5', 'so then a3 y1 y2 y3 y4 y5'))), []);
});

test('retake: a diacritic-free second take of a Romanian sentence still matches', () => {
  const ro1 = sentence('Astăzi vorbim despre știința din spatele unei decizii bune și despre cum o luăm împreună', { dur: 0.45 });
  const ro2 = sentence('Astazi vorbim despre stiinta din spatele unei decizii bune si despre cum o luam impreuna', { dur: 0.45 });
  assert.deepEqual(kinds(R.review(join([ro1, ro2], 2.5))), ['retake']);
});

test('false start: a first take under 6 s restarted within 12 s; a longer first take is a retake', () => {
  const start = sentence('so what I want to', { dur: 0.4 });                 // short: ~2.4 s
  const again = sentence('so what I want to show you today is the new dashboard', { dur: 0.4 });
  const r = R.review(join([start, again], 1.5));
  assert.deepEqual(kinds(r), ['false-start']);
  assert.deepEqual(r.cuts[0].words.map(R.normWord), ['so', 'what', 'i', 'want', 'to']);
  // restarted after 13 s: not a false start (a retake only if the overlap still says so)
  const late = R.review(join([start, again], 13));
  assert.ok(!kinds(late).includes('false-start'));
});

test('retake window: within 9 segments and 75 s, or the earlier take is not a retake', () => {
  const take = (dur) => sentence(TAKE, { dur });
  const fillerSeg = (i) => sentence(`unrelated${i} words${i} about${i} something${i} else${i} entirely${i}`, { dur: 0.3 });
  const mid = (n) => Array.from({ length: n }, (_, i) => fillerSeg(i));
  const within = R.review(join([take(0.4), ...mid(8), take(0.35)], 1.2));
  assert.ok(kinds(within).includes('retake'), 'the 9th segment later is inside');
  const tooMany = R.review(join([take(0.4), ...mid(9), take(0.35)], 1.2));
  assert.ok(!kinds(tooMany).includes('retake'), 'the 10th segment later is outside');
  // 75 s apart: put one long quiet-free filler between (2 segments, 80 s)
  const far = R.review(join([take(0.4), take(0.35)], 80));
  assert.ok(!kinds(far).includes('retake'));
  const near = R.review(join([take(0.4), take(0.35)], 70));
  assert.ok(kinds(near).includes('retake'));
});

test('fillers: a transcribed um is cut; a pause between words becomes a long-pause cut with a kept breath by the preceding gap', () => {
  const words = say(['so', ['um', 0.1], ['the', 0.1], 'plan']);
  const f = R.review(words);
  assert.deepEqual(kinds(f), ['filler']);
  assert.deepEqual(f.cuts[0].words, ['um']);
  const ro = R.review(say(['deci', ['ăăă', 0.1], 'începem']));
  assert.deepEqual(kinds(ro), ['filler']);

  // pause classes: 2 s or more -> 0.24, after a sentence end -> 0.20, otherwise 0.14
  const gapRun = (text, gap) => R.review(say([text, gap, 'next']));
  const long = gapRun('end.', 2.5);
  assert.deepEqual(allKinds(long), ['long-pause']);
  const c = long.cuts[0], a = 0.5 + 0.3, b = a + 2.5 + 0.1;
  assert.ok(Math.abs(c.start - (a + R.KEPT_BREATH_S.afterLongPause)) < 0.002, `${c.start}`);
  assert.ok(Math.abs(c.end - (b - DEFAULTS.lead)) < 0.002, `${c.end}`);
  const sent = gapRun('end.', 1.0).cuts[0];
  assert.ok(Math.abs(sent.start - (0.8 + R.KEPT_BREATH_S.afterSentence)) < 0.002);
  const other = gapRun('mid', 1.0).cuts[0];
  assert.ok(Math.abs(other.start - (0.8 + R.KEPT_BREATH_S.otherwise)) < 0.002);
  // a gap under the cut's max pause is no candidate
  assert.deepEqual(allKinds(gapRun('mid', 0.3)), []);
});

test('a stutter or filler inside a retaken take is not proposed twice', () => {
  const first = sentence('today we are going to look at the um the new dashboard and how people read it', { dur: 0.45 });
  const second = sentence(TAKE, { dur: 0.35 });
  const r = R.review(join([first, second], 3));
  assert.deepEqual(kinds(r), ['retake']);
});

test('gap audit: a sentence gap under a tenth of the speaker\'s median is flagged; the pads are compared with the cut\'s', () => {
  const items = [];
  for (let i = 0; i < 8; i++) items.push([`sentence${i}.`, 0], i === 5 ? 0.04 : 0.9);   // seven long gaps, one tight
  items.pop();
  const words = say(items, { dur: 0.4, gap: 0 });
  const r = R.review(words);
  const g = r.gaps;
  assert.ok(Math.abs(g.medianSentenceGap - 0.9) < 0.01, `${g.medianSentenceGap}`);
  assert.equal(g.tight.length, 1);
  assert.match(g.tight[0].note, /stutter/);
  assert.equal(g.pads.head.reference, 0.22);
  assert.equal(g.pads.head.current, DEFAULTS.lead);
  assert.equal(g.pads.tail.reference, 0.34);
  assert.equal(g.pads.tail.current, DEFAULTS.tail);
  assert.deepEqual(g.breath, R.KEPT_BREATH_S);
});

test('the proposal lists ids, kinds, source seconds, words, a reason and a confidence', () => {
  const words = say(['so', ['I', 0.1], ['I', 0.2], 'want', 'to', 'start.', 2.2, 'next', 'bit', 'here.']);
  const r = R.review(words, { language: 'en' });
  assert.equal(r.kind, 'cuts');
  assert.equal(r.status, 'proposed');
  assert.equal(r.language, 'en');
  for (const c of r.cuts) {
    assert.match(c.id, /^c\d{3}$/);
    assert.ok(R.CUT_KINDS.includes(c.kind));
    assert.ok(c.start >= 0 && c.end > c.start && c.end <= r.duration + 1e-9);
    assert.ok(Array.isArray(c.words) && typeof c.reason === 'string' && c.confidence >= 0 && c.confidence <= 1);
  }
  assert.ok(r.cuts.every((c, i, a) => i === 0 || a[i - 1].start <= c.start), 'in source order');
});

test('transcript sanity: music marks over 20 % fail with the reason; a few are dropped; short um/uh dropped; short words unreliable', () => {
  assert.equal(WORDS_MARK_SHARE, 0.2);
  assert.equal(UNRELIABLE_S, 0.05);
  assert.equal(FILLER_MIN_S, 0.1);
  const base = sentence('a b c d e f g h');
  const marks = (n) => Array.from({ length: n }, (_, i) => ({ text: i % 2 ? '♪' : '�', start: 20 + i, end: 20.5 + i }));
  assert.throws(() => checkTranscript([...base, ...marks(3)]), (e) => e.exitCode === 2 && /music|replacement/i.test(e.message) && /\d+ of \d+/.test(e.message));
  const ok = checkTranscript([...base, ...marks(1), { text: '[Music]', start: 30, end: 31 }]);
  assert.equal(ok.words.length, 8, 'the marks are dropped');
  const w = checkTranscript([{ text: 'um', start: 1, end: 1.08 }, { text: 'uh', start: 2, end: 2.12 }, { text: 'hm', start: 3, end: 3.05 }, { text: 'real', start: 4, end: 4.04 }, { text: 'word', start: 5, end: 5.3 }]);
  assert.deepEqual(w.words.map((x) => x.text), ['uh', 'real', 'word'], 'um 0.08 s and hm 0.05 s are dropped, uh 0.12 s kept');
  assert.deepEqual(w.words.filter((x) => x.unreliable).map((x) => x.text), ['real']);
});

test('transcript sanity: a transcript in another language than the story\'s warns (declared, or read as English)', () => {
  const ro = sentence('astăzi vorbim despre decizii și despre cum le luăm împreună cu echipa noastră');
  assert.deepEqual(checkTranscript(ro, { storyLanguage: 'ro', declared: 'ro' }).warnings, []);
  const declared = checkTranscript(ro, { storyLanguage: 'ro', declared: 'en' });
  assert.equal(declared.warnings.length, 1);
  assert.match(declared.warnings[0], /language/i);
  const en = sentence('the plan is that we will look at the new thing and the old thing and then what you do with it');
  const guess = checkTranscript(en, { storyLanguage: 'ro' });
  assert.equal(guess.warnings.length, 1);
  assert.match(guess.warnings[0], /English/);
  assert.deepEqual(checkTranscript(en, { storyLanguage: 'en' }).warnings, []);
  assert.deepEqual(checkTranscript(en, {}).warnings, [], 'no story language: nothing to compare with');
});

test('the approved-cuts file: only approved:true cuts apply; an empty list is valid; bad shapes and unknown ids are refused', () => {
  const doc = { cuts: [{ id: 'c001', start: 1, end: 2, approved: true }, { id: 'c002', start: 3, end: 4, approved: false }, { id: 'c003', start: 5, end: 6 }] };
  assert.deepEqual(R.approvedCuts(doc).map((c) => c.id), ['c001']);
  assert.deepEqual(R.approvedCuts({ cuts: [] }), []);
  assert.deepEqual(R.approvedCuts([{ start: 1, end: 2, approved: true }]).map((c) => c.start), [1], 'a bare list is read too');
  assert.throws(() => R.approvedCuts({ cuts: [{ id: 'x', start: 2, end: 1, approved: true }] }), (e) => e.exitCode === 2 && /x/.test(e.message));
  assert.throws(() => R.approvedCuts({ cuts: [{ start: 'a', end: 1, approved: true }] }), (e) => e.exitCode === 2);
  assert.throws(() => R.approvedCuts({ nope: 1 }), (e) => e.exitCode === 2);
});

test('approved spans are merged and checked against the source: outside it is an error', () => {
  assert.deepEqual(R.mergeSpans([{ s: 5, e: 6 }, { s: 1, e: 2 }, { s: 1.5, e: 3 }, { s: 3, e: 3.2 }]), [{ s: 1, e: 3.2 }, { s: 5, e: 6 }]);
  assert.deepEqual(R.spansWithin([{ id: 'c1', start: 1, end: 2 }], 10, { id: 'c1' }), [{ s: 1, e: 2 }]);
  assert.throws(() => R.spansWithin([{ id: 'c9', start: 9, end: 11 }], 10), (e) => e.exitCode === 2 && /c9/.test(e.message) && /outside/.test(e.message));
  assert.throws(() => R.spansWithin([{ id: 'c8', start: -1, end: 1 }], 10), (e) => e.exitCode === 2);
});

// planEdit with approved cuts, on a synthetic sound (the measuring half is the cut tests' business)
const RATE = 48000;
function tone(len) {
  const n = Math.round(len * RATE), out = new Float32Array(n);
  let s = 7;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const t = i / RATE, on = (t % 3) < 2;                                   // speech 2 s, a 1 s pause, repeated
    out[i] = 0.003 * (2 * (s / 0x7fffffff) - 1) + (on ? 0.25 * (0.75 + 0.25 * Math.sin(2 * Math.PI * 5 * t)) * Math.sin(2 * Math.PI * 180 * t) : 0);
  }
  return out;
}

test('planEdit with cuts: an empty list is the identity edit; a cut leaves the rest, in whole frames, and words follow the cut map', () => {
  const samples = tone(9), fps = 30, frames = 270;
  const words = [{ text: 'a', start: 0.2, end: 0.6 }, { text: 'b', start: 4.1, end: 4.5 }, { text: 'c', start: 7.0, end: 7.4 }];
  const id = planEdit({ samples, rate: RATE, fps, frames, words, cuts: [] });
  assert.equal(id.frames, 270);
  assert.equal(id.picture.length, 1);
  assert.deepEqual(id.picture[0], { start: 0, from: 0, length: 270 });
  assert.equal(id.cuts.length, 0);
  assert.deepEqual(id.words.map((w) => w.at), [0.2, 4.1, 7]);

  const cut = planEdit({ samples, rate: RATE, fps, frames, words, cuts: [{ s: 3, e: 6 }] });
  assert.equal(cut.frames, 270 - 90);
  assert.equal(cut.picture.length, 2);
  assert.deepEqual(cut.picture[1], { start: 90, from: 180, length: 90 });
  assert.deepEqual(cut.cuts, [{ at: 3, out: 3, in: 6 }]);
  assert.deepEqual(cut.words.map((w) => w.text), ['a', 'c'], 'the word inside the cut is gone');
  assert.equal(cut.words[1].at, 4, 'c: 7.0 s of the source is 4.0 s of the edit, from the cut map');
  assert.throws(() => planEdit({ samples, rate: RATE, fps, frames, words, cuts: [{ s: 8, e: 10 }] }), /outside/);
});
