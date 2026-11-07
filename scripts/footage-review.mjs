#!/usr/bin/env node
// mm footage review <words.json> [--out <dir>] [--piece <dir>] [--language <code>] [--max-pause 0.5] [--audio <video|audio>] [--scenes <scenes.json>]
// A talking-head transcript ([{ text, start, end }] in seconds of the sound, { words }, or WhisperX output)
// becomes a list of PROPOSED cuts in <out>/cuts.proposed.json: retakes, false starts, stutters, hesitations
// and long pauses, each with its source seconds, the words removed, a reason and a confidence
// (scripts/lib/footage-review.mjs holds the rules). Nothing is cut: the director copies the file to
// cuts.approved.json, marks each cut `approved: true` or `false` (with an optional `note`), and
// `mm footage cut --cuts cuts.approved.json` applies only the approved ones. The report also lists this
// speaker's sentence gaps that are far tighter than their median (they sound like a stutter), the breath
// kept after a cut, and the head and tail pads next to the cut's own. The words are checked first (a
// transcript that is mostly music marks exits 2; another language than the story's is a warning).
// With --audio (the recording the words were transcribed from) the sound is heard too: each stretch is
// speech, noise or silence, a long pause is proposed only where the transcript has no word AND the sound
// is not speech, and the clip is classed no-audio, silent, noise or speech in the report (a clip with no
// speech in it proposes no cut: its words cannot be trusted). With --scenes (from `mm footage scenes`)
// a cut that would leave a sliver of the next shot is moved onto the scene change, unless a word is there.
// Exit 0 written, 2 usage or an unusable transcript.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { isArgsError, usageText } from './lib/cli.mjs';
import { DEFAULTS } from './lib/footage.mjs';
import { soundOf } from './lib/footage-audio.mjs';
import { review } from './lib/footage-review.mjs';
import { fenceLine } from './lib/fence.mjs';
import { sceneTimes } from './lib/footage-scenes.mjs';
import { materialNote, readWordsFile, storyLanguageOf } from './lib/footage-words.mjs';

const fail = (message, exitCode) => Object.assign(new Error(message), { exitCode });
const r2 = (x) => Math.round(x * 100) / 100;

export async function reviewFile({ words: wordsFile, out = '.', piece = null, language = null, maxPause = DEFAULTS.maxPause, audio = null, scenes = null }) {
  const lang = language ?? (piece ? storyLanguageOf(resolve(piece)) : null);
  const read = readWordsFile(wordsFile, { storyLanguage: lang });
  const sound = audio ? await soundOf(audio) : null;
  let times = null;
  if (scenes) {
    let j;
    try { j = JSON.parse(readFileSync(scenes, 'utf8')); } catch (e) { throw fail(`--scenes: cannot read ${scenes}: ${e.message}`, 2); }
    // the scenes are on the picture's clock; the words count from the sound's first sample
    try { times = sceneTimes(j, -(Number(j.offset) || 0)); } catch (e) { throw fail(`--scenes: ${e.message}`, 2); }
  }
  const proposal = review(read.words, { language: lang ?? read.language, maxPause, sound, scenes: times });
  const warnings = [...read.warnings, ...(proposal.sound?.note ? [proposal.sound.note] : [])];
  const doc = { ...proposal, source: { words: basename(wordsFile), ...(audio ? { audio: basename(audio) } : {}), ...(scenes ? { scenes: basename(scenes) } : {}) }, material: materialNote(['cuts[].words', 'cuts[].reason', 'gaps.tight[].note']), ...(warnings.length ? { warnings } : {}) };
  const dir = resolve(out);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'cuts.proposed.json');
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
  return { file, doc, read };
}

export async function main(argv) {
  try {
    const { values: v, positionals: p } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
      out: { type: 'string' }, piece: { type: 'string' }, language: { type: 'string' }, 'max-pause': { type: 'string' }, audio: { type: 'string' }, scenes: { type: 'string' } } });
    if (p.length !== 1) throw fail(usageText('footage review'), 2);
    const maxPause = v['max-pause'] == null ? DEFAULTS.maxPause : Number(v['max-pause']);
    if (!(maxPause > 0)) throw fail('--max-pause must be a number of seconds above 0', 2);
    if (v.audio && !existsSync(v.audio)) throw fail(`--audio: no such file: ${v.audio}`, 2);
    if (v.scenes && !existsSync(v.scenes)) throw fail(`--scenes: no such file: ${v.scenes}`, 2);
    const { file, doc, read } = await reviewFile({ words: p[0], out: v.out ?? '.', piece: v.piece ?? null, language: v.language ?? null, maxPause, audio: v.audio ?? null, scenes: v.scenes ?? null });
    for (const w of doc.warnings ?? []) console.error(`warning: ${w}`);
    if (read.dropped) console.log(`${read.dropped} tokens set aside (music marks, hesitations shorter than 0.1 s)`);
    const total = doc.cuts.reduce((n, c) => n + (c.end - c.start), 0);
    const by = Object.entries(doc.cuts.reduce((m, c) => ({ ...m, [c.kind]: (m[c.kind] ?? 0) + 1 }), {})).map(([k, n]) => `${n} ${k}`).join(', ');
    console.log(`${doc.cuts.length} cuts proposed${by ? ` (${by})` : ''}, ${r2(total)} s of ${doc.duration} s`);
    if (doc.sound?.speechS != null) console.log(`sound: ${doc.sound.class} (${doc.sound.speechS} s speech, ${doc.sound.noiseS} s noise, ${doc.sound.silenceS} s silence; speech level ${doc.sound.speechDb} dBFS, gate ${doc.sound.gateDb} dBFS)`);
    for (const t of doc.gaps.tight) console.log(`gap: ${fenceLine(t.note, 'transcript')} (at ${t.at} s)`);
    const g = doc.gaps;
    console.log(`kept breath after a cut: ${g.breath.afterLongPause} s after a pause of 2 s or more, ${g.breath.afterSentence} s after a sentence end, ${g.breath.otherwise} s otherwise`);
    console.log(`pads (cut now / reference): head ${g.pads.head.current} / ${g.pads.head.reference} s, tail ${g.pads.tail.current} / ${g.pads.tail.reference} s`);
    console.log(`wrote ${file}; copy it to cuts.approved.json, mark each cut approved true or false, then mm footage cut --cuts`);
    return 0;
  } catch (e) { console.error(isArgsError(e) ? `${e.message}\n${usageText('footage review')}` : e.message); return e.exitCode ?? 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
