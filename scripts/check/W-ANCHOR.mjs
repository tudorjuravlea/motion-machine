// W-ANCHOR (SPEC §7): a beat may name the spoken word it illustrates (`anchor: "word or phrase"`). A
// picture that arrives far from its word reads as a mistake: before the word it spoils it, after it
// the viewer has moved on. The beat's arrival must fall from EARLY_S before to LATE_S after the first
// word of the anchor. The words come from the footage edit (`footage.asset`/edit.json, `words`, on
// the film's clock), else from the voice: `<track basename>.words.json` beside `audio.track`, in the
// format `mm footage cut --words` reads (`[{text,start,end}]`, `{words}` or WhisperX). Statuses per
// anchored beat: ok, late, early, anchor-miss (the phrase is not in the words), no-words (an anchor
// and no words to check it against). A phrase spoken more than once is matched at the occurrence
// nearest the beat. Any late, early or anchor-miss warns; an anchor that could not be checked is a
// partial SKIP, never a PASS. A style's `gate.anchor` sets { earlyS, lateS }. A deck has no clock.
// A cue marker `<<slot>>` in the scene's `say` is an anchor too (scripts/lib/say.mjs): the beat with that slot is anchored to the
// word the marker precedes and the two after it, unless the beat names an `anchor` of its own.
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { rule } from '../lib/rule.mjs';
import { wordsFrom } from '../lib/footage.mjs';
import { cueAnchors } from '../lib/say.mjs';
import { round } from './_lib.mjs';

export const EARLY_S = 1.8;
export const LATE_S = 0.2;
export const LEAD_S = 0.5;   // the suggested fix: arrive at the word minus this

const norm = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

/** Every start time of the phrase in the word list (a phrase is its words in a row), in seconds. */
export function occurrences(words, phrase) {
  const want = norm(phrase);
  if (!want.length) return [];
  const have = words.map((w) => norm(w.text)).map((t) => t.join(' '));
  const out = [];
  for (let i = 0; i + want.length <= words.length; i++) {
    if (want.every((w, k) => have[i + k] === w)) out.push(words[i].start);
  }
  return out;
}

/** The film's words as [{ text, start, end }] on the film's clock, and where they came from: { words, source } or { words: null, why }. */
export function wordsOf(dir, story) {
  const edit = story.footage?.asset ? join(dir, story.footage.asset, 'edit.json') : null;
  if (edit && existsSync(edit)) {
    let e;
    try { e = JSON.parse(readFileSync(edit, 'utf8')); } catch { return { words: null, why: `${story.footage.asset}edit.json is not JSON` }; }
    if (Array.isArray(e.words) && e.words.length) return { words: e.words.map((w) => ({ text: w.text, start: w.at, end: w.end ?? w.at })), source: `${story.footage.asset}edit.json` };
  }
  const track = story.audio?.track;
  if (track) {
    const side = join(dirname(track), `${basename(track, extname(track))}.words.json`);
    if (existsSync(join(dir, side))) {
      try { return { words: wordsFrom(JSON.parse(readFileSync(join(dir, side), 'utf8'))), source: side }; } catch (e) { return { words: null, why: `${side}: ${e.message}` }; }
    }
    return { words: null, why: `no ${side} beside audio.track` };
  }
  return { words: null, why: edit ? `${story.footage.asset}edit.json holds no words` : 'the story has neither footage words nor an audio.track with a .words.json' };
}

export default async function (ctx) {
  if (ctx.schedule.kind === 'deck') return rule('W-ANCHOR', 'SKIP', { reason: 'a deck has no clock for a spoken word to anchor to' });
  const cues = new Map(cueAnchors(ctx.story).anchors.map((a) => [`${a.scene}/${a.slot}`, a.anchor]));
  const anchorOf = (it) => it.beat?.anchor ?? (it.beat?.slot ? cues.get(`${it.scene}/${it.beat.slot}`) : undefined);
  const anchored = ctx.schedule.items.filter((it) => !it.parent && anchorOf(it));
  if (!anchored.length) return rule('W-ANCHOR', 'SKIP', { reason: 'no beat names an anchor' });
  const earlyS = ctx.style?.gate?.anchor?.earlyS ?? EARLY_S, lateS = ctx.style?.gate?.anchor?.lateS ?? LATE_S;
  const { words, source, why } = wordsOf(ctx.dir, ctx.story);
  const sceneStart = (id) => ctx.schedule.scenes.find((s) => s.id === id)?.start ?? 0;
  const rows = anchored.map((it) => {
    const base = { selector: it.selector, anchor: anchorOf(it), arrives: round(it.start) };
    if (!words) return { ...base, status: 'no-words' };
    const at = occurrences(words, base.anchor);
    if (!at.length) return { ...base, status: 'anchor-miss' };
    const word = at.reduce((a, b) => (Math.abs(b - it.start) < Math.abs(a - it.start) ? b : a));
    const delta = it.start - word;
    const status = delta > lateS + 1e-9 ? 'late' : delta < -earlyS - 1e-9 ? 'early' : 'ok';
    const fixAt = Math.max(0, round(word - LEAD_S - sceneStart(it.scene)));
    return { ...base, status, word: round(word), deltaS: round(delta), ...(status === 'ok' ? {} : { suggestedAt: fixAt }) };
  });
  const bad = rows.filter((r) => ['late', 'early', 'anchor-miss'].includes(r.status));
  const unchecked = rows.filter((r) => r.status === 'no-words');
  const threshold = `${earlyS} s before to ${lateS} s after the word`;
  if (bad.length) {
    const w = bad[0];
    const reason = w.status === 'anchor-miss'
      ? `"${w.anchor}" is not in the words (${source}); check the phrase or the transcript`
      : `${w.selector} arrives ${Math.abs(w.deltaS)} s ${w.status === 'late' ? 'after' : 'before'} "${w.anchor}" (${w.word} s); arrive at the word minus ${LEAD_S} s: \`at\` ${w.suggestedAt}`;
    return rule('W-ANCHOR', 'WARN', { instant: w.arrives, selector: w.selector, measured: w.deltaS ?? null, threshold, status: w.status, reason: bad.length > 1 ? `${reason} (+${bad.length - 1} more)` : reason, anchors: rows });
  }
  if (unchecked.length) return rule('W-ANCHOR', 'SKIP', { partial: true, reason: `partial: ${unchecked.length} anchor${unchecked.length > 1 ? 's' : ''} could not be checked: no words (${why})`, anchors: rows });
  return rule('W-ANCHOR', 'PASS', { measured: Math.max(...rows.map((r) => Math.abs(r.deltaS))), threshold, anchors: rows });
}
