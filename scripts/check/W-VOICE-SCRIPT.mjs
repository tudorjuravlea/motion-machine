// W-VOICE-SCRIPT (SPEC §7; provisional): a generated voice says what it was sent. Each voice the piece made (`mm gen voice`
// leaves assets/gen/<name>.gen.json with the text it was sent) that has a transcript of its audio beside it (the record of
// an `mm gen transcribe --audio assets/gen/<name>.mp3`, whose words file is assets/gen/<heard>.words.json) is compared with
// that text: scripts/lib/voice-script.mjs reads both without case or punctuation, a figure in digits as its word (0-20 and
// the round tens), and aligns them word by word. A word error rate above 0.1, or any figure said as another figure or word,
// warns. No generated voice, or no transcript beside one, is SKIP with the reason; a piece where some voices have a
// transcript and some do not is `partial: true`, never PASS for the voice nobody heard back.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { rule } from '../lib/rule.mjs';
import { readWordsFile } from '../lib/footage-words.mjs';
import { parseSay } from '../lib/say.mjs';
import { compareScript } from '../lib/voice-script.mjs';

/** A word error rate above this warns. */
export const WER_MAX = 0.1;

const json = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
const norm = (p) => String(p ?? '').replace(/^\.\//, '');

/** The pieces' generated voices and the transcripts of their audio: [{ file, text, transcript }] (transcript: the words file or null). */
export function voicesOf(dir) {
  const gen = join(dir, 'assets/gen');
  if (!existsSync(gen)) return [];
  const records = readdirSync(gen).filter((f) => f.endsWith('.gen.json')).sort().map((f) => json(join(gen, f))).filter(Boolean);
  const heardOf = (file) => records.find((r) => r.kind === 'transcribe' && norm(r.request?.audio) === norm(file) && r.words && existsSync(join(dir, r.words)));
  return records.filter((r) => r.kind === 'voice' && typeof r.request?.text === 'string' && r.file)
    .map((r) => ({ file: r.file, text: r.request.text, transcript: heardOf(r.file)?.words ?? null }));
}

export default async function (ctx) {
  const voices = voicesOf(ctx.dir);
  if (!voices.length) return rule('W-VOICE-SCRIPT', 'SKIP', { reason: 'the piece has no generated voice (no assets/gen/*.gen.json of kind voice)' });
  const heard = voices.filter((v) => v.transcript);
  if (!heard.length) return rule('W-VOICE-SCRIPT', 'SKIP', { reason: `no transcript beside ${voices.map((v) => v.file).join(', ')}: mm gen transcribe --audio <voice> (a paid call) writes the words the voice says, and this rule compares them with its script` });
  const lexicon = ctx.style?.voice?.lexicon ?? {};
  const found = [], measured = [], unread = [];
  for (const v of heard) {
    let words;
    try { words = readWordsFile(join(ctx.dir, v.transcript), { flag: v.transcript }).words; } catch (e) { unread.push(`${v.file}: ${e.message}`); continue; }
    const c = compareScript(parseSay(v.text, { lexicon }).spoken, words);
    measured.push({ file: v.file, words: c.words, wer: Math.round(c.wer * 1000) / 1000 });
    const bits = [`${Math.round(c.wer * 100)} % of its ${c.words} words differ`];
    if (c.changed.length) bits.push(`said ${c.changed.slice(0, 4).map((x) => `"${x.said}" for "${x.meant}"`).join(', ')}`);
    if (c.missing.length) bits.push(`missing ${c.missing.slice(0, 4).map((w) => `"${w}"`).join(', ')}`);
    if (c.extra.length) bits.push(`extra ${c.extra.slice(0, 4).map((w) => `"${w}"`).join(', ')}`);
    if (c.wer > WER_MAX || c.numbers.length) {
      found.push({ file: v.file, wer: measured.at(-1).wer, missing: c.missing, extra: c.extra, changed: c.changed, numbers: c.numbers,
        reason: `${v.file} does not say its script: ${bits.join('; ')}${c.numbers.length ? ` (a figure changed: ${c.numbers.map((x) => `"${x.meant}" → "${x.said}"`).join(', ')})` : ''}; generate it again` });
    }
  }
  if (found.length) {
    return rule('W-VOICE-SCRIPT', 'WARN', { selector: `[src="${found[0].file}"]`, measured: found[0].wer, threshold: `a word error rate of at most ${WER_MAX} and no figure changed`, reason: found.length > 1 ? `${found[0].reason} (+${found.length - 1} more)` : found[0].reason, all: found });
  }
  if (!measured.length) return rule('W-VOICE-SCRIPT', 'SKIP', { reason: `no transcript could be read: ${unread.join('; ')}` });
  if (unread.length || heard.length < voices.length) {
    const without = [...voices.filter((v) => !v.transcript).map((v) => v.file), ...unread];
    return rule('W-VOICE-SCRIPT', 'SKIP', { partial: true, voices: measured, reason: `partial: ${measured.length} voice${measured.length === 1 ? '' : 's'} say${measured.length === 1 ? 's' : ''} the script; not heard back: ${without.join(', ')}` });
  }
  return rule('W-VOICE-SCRIPT', 'PASS', { voices: measured });
}
