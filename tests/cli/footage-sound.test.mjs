// `mm footage review --audio` on recordings made here from the synthetic sound of evals/footage-cuts/synth.mjs
// (a voiced tone where the words are, planted noise, planted voice with no word, room tone): the report
// classes the clip, a long pause is proposed only where the sound is not speech, a clip with no speech in it
// proposes nothing, and a file with no audio stream falls back to the words alone with a warning.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, mm, readJson } from './cli-helpers.mjs';
import { wav16 } from '../../scripts/lib/footage.mjs';
import { synthesize, RATE } from '../../evals/footage-cuts/synth.mjs';

const TMP = join(ROOT, `.tmp-footage-sound-${process.pid}`);
const W = (...rows) => rows.map(([text, start, dur = 0.3]) => ({ text, start, end: Math.round((start + dur) * 1000) / 1000 }));
const write = (file, json) => { writeFileSync(file, JSON.stringify(json)); return file; };

/** A 160x90 recording of `duration` s whose sound is `samples` (none: no audio stream). */
function video(name, duration, samples) {
  const out = join(TMP, `${name}.mp4`);
  const wav = join(TMP, `${name}.wav`);
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=160x90:rate=30:duration=${duration}`];
  if (samples) { writeFileSync(wav, wav16(samples, RATE)); args.push('-i', wav, '-c:a', 'aac', '-shortest'); }
  assert.equal(spawnSync('ffmpeg', [...args, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', out]).status, 0);
  return out;
}

const WORDS = W(['alpha', 1.0, 1.5], ['beta', 3.0, 1.5], ['gamma', 9.0, 1.5]);
const SPEC = { duration: 12, words: WORDS, sound: { extra: [{ kind: 'noise', from: 5.0, to: 6.0 }, { kind: 'voice', from: 7.0, to: 8.0 }] } };

before(() => { rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); });
after(() => rmSync(TMP, { recursive: true, force: true }));

test('review --audio: a speech clip; the long pause is cut around the noise but not into the voice with no word', () => {
  const words = write(join(TMP, 'words.json'), { words: WORDS });
  const out = join(TMP, 'o1');
  const r = mm(['footage', 'review', words, '--audio', video('talk', 12, synthesize(SPEC)), '--out', out]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /sound: speech \(.* s speech, .* s noise, .* s silence/);
  const doc = readJson(join(out, 'cuts.proposed.json'));
  assert.equal(doc.sound.class, 'speech');
  assert.equal(doc.source.audio, 'talk.mp4');
  const pauses = doc.cuts.filter((c) => c.kind === 'long-pause');
  assert.ok(pauses.length >= 2, JSON.stringify(pauses));
  assert.ok(pauses.every((c) => c.sound), 'each says what the sound there is');
  assert.deepEqual(pauses.filter((c) => c.start < 7.9 && c.end > 7.1), [], 'nothing is cut into the untranscribed voice');
  assert.ok(pauses.some((c) => c.sound === 'silence and noise' && c.start < 5 && c.end > 6));
  assert.equal(r.stderr, '');
});

test('review --audio: a silent recording and a noise-only one propose nothing and warn; the exit stays 0', () => {
  const words = write(join(TMP, 'w2.json'), { words: W(['so', 0.5], ['so', 0.9], ['so', 1.3], ['plan', 4.0]) });
  for (const [name, spec, cls] of [['silent', { duration: 6, words: [] }, 'silent'], ['noisy', { duration: 6, words: [], sound: { extra: [{ kind: 'noise', from: 0.2, to: 5.5 }] } }, 'noise']]) {
    const out = join(TMP, `o-${name}`);
    const r = mm(['footage', 'review', words, '--audio', video(name, 6, synthesize(spec)), '--out', out]);
    assert.equal(r.status, 0, r.out);
    const doc = readJson(join(out, 'cuts.proposed.json'));
    assert.equal(doc.sound.class, cls);
    assert.deepEqual(doc.cuts, []);
    assert.match(r.stderr, /warning: .*no speech sound/);
    assert.ok(doc.warnings.some((w) => /no speech sound/.test(w)));
  }
});

test('review --audio: a file with no audio stream is classed no-audio; the pauses are the words\' alone, with a warning', () => {
  const words = write(join(TMP, 'w3.json'), { words: W(['one', 0.5, 0.5], ['two', 3.0, 0.5]) });
  const out = join(TMP, 'o-none');
  const r = mm(['footage', 'review', words, '--audio', video('mute', 4, null), '--out', out]);
  assert.equal(r.status, 0, r.out);
  const doc = readJson(join(out, 'cuts.proposed.json'));
  assert.equal(doc.sound.class, 'no-audio');
  assert.equal(doc.cuts.filter((c) => c.kind === 'long-pause').length, 1);
  assert.match(r.stderr, /warning: .*no audio stream/);
});

test('review --audio: a missing file exits 2 and writes nothing; without --audio nothing changes', () => {
  const words = write(join(TMP, 'w4.json'), { words: WORDS });
  const out = join(TMP, 'o-miss');
  let r = mm(['footage', 'review', words, '--audio', join(TMP, 'nope.mp4'), '--out', out]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.stderr, /--audio: no such file/);
  assert.ok(!existsSync(join(out, 'cuts.proposed.json')));
  r = mm(['footage', 'review', words, '--out', join(TMP, 'o-plain')]);
  assert.equal(r.status, 0, r.out);
  assert.ok(!('sound' in readJson(join(TMP, 'o-plain/cuts.proposed.json'))));
});
