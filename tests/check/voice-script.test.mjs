// W-VOICE-SCRIPT (SPEC §7, provisional): a generated voice says the script it was sent. The rule reads the piece's
// assets/gen records and the words file of the transcript beside a voice, so it runs here on a constructed ctx;
// one case runs the whole gate on fixtures/negatives/W-VOICE-SCRIPT.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import rule_, { WER_MAX } from '../../scripts/check/W-VOICE-SCRIPT.mjs';
import { IDS } from '../../scripts/check.mjs';
import { gate, row, warnsOnly } from './_harness.mjs';

const run = gate();
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const wordsOf = (text) => text.split(' ').map((t, i) => ({ text: t, start: i * 0.4, end: i * 0.4 + 0.3 }));
/** A piece folder with generated voices: [{ name, text, heard? }]; `heard` is the transcript's words as text. */
function piece(voices) {
  const dir = mkdtempSync(join(tmpdir(), 'voice-script-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'assets/gen'), { recursive: true });
  const put = (f, v) => writeFileSync(join(dir, 'assets/gen', f), JSON.stringify(v));
  for (const { name, text, heard } of voices) {
    put(`${name}.gen.json`, { kind: 'voice', name, file: `assets/gen/${name}.mp3`, request: { text } });
    if (heard === undefined) continue;
    put(`${name}-heard.words.json`, wordsOf(heard));
    put(`${name}-heard.gen.json`, { kind: 'transcribe', name: `${name}-heard`, file: `assets/gen/${name}-heard.words.json`, words: `assets/gen/${name}-heard.words.json`, request: { audio: `assets/gen/${name}.mp3` } });
  }
  return dir;
}
const check = (voices, style = {}) => rule_({ dir: piece(voices), style, story: { kind: 'film', scenes: [] } });

test('W-VOICE-SCRIPT is one of the gate\'s ids, a warning, with a rate of 0.1', () => {
  assert.ok(IDS.includes('W-VOICE-SCRIPT'));
  assert.equal(WER_MAX, 0.1);
});

test('a voice that says its script passes, and the rate is in the evidence', async () => {
  const r = await check([{ name: 'vo', text: 'We shipped 3 builds in two days.', heard: 'we shipped three builds in 2 days' }]);
  assert.equal(r.status, 'PASS');
  assert.deepEqual(r.evidence.voices, [{ file: 'assets/gen/vo.mp3', words: 7, wer: 0 }]);
});

test('a pronunciation marker and a cue marker are read as sent: the spoken form is the script', async () => {
  const r = await check([{ name: 'vo', text: 'Call the [API](ay pee eye) <<go>>now.', heard: 'call the ay pee eye now' }]);
  assert.equal(r.status, 'PASS', JSON.stringify(r.evidence));
});

test('the rate is warned above 0.1 and not at it', async () => {
  assert.equal((await check([{ name: 'vo', text: 'alpha bravo charlie delta echo foxtrot golf hotel india juliet', heard: 'alpha bravo charlie delta echo foxtrot golf hotel india kilo' }])).status, 'PASS', '1 of 10 words is 0.1: at the threshold');
  const r = await check([{ name: 'vo', text: 'alpha bravo charlie delta echo foxtrot golf hotel india juliet', heard: 'alpha bravo charlie delta echo foxtrot golf hotel lima kilo' }]);
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.measured, 0.2);
  assert.match(r.evidence.reason, /assets\/gen\/vo\.mp3 does not say its script: 20 % of its 10 words differ; said "lima" for "india", "kilo" for "juliet"/);
});

test('a changed figure warns even when the rate is low, a missing or extra word is named', async () => {
  const long = 'the new plan ships 3 builds in a day and every build is signed before the team sees it on the board';
  const r = await check([{ name: 'vo', text: long, heard: long.replace('3 builds', 'five builds') }]);
  assert.equal(r.status, 'WARN');
  assert.ok(r.evidence.all[0].wer < WER_MAX);
  assert.deepEqual(r.evidence.all[0].numbers, [{ meant: 'three', said: 'five' }]);
  assert.match(r.evidence.reason, /a figure changed: "three" → "five"/);
  const m = await check([{ name: 'vo', text: 'press the big green button now please', heard: 'press the big button now please sir' }]);
  assert.deepEqual([m.evidence.all[0].missing, m.evidence.all[0].extra], [['green'], ['sir']]);
});

test('no generated voice is SKIP with the reason; no transcript beside the voice is SKIP naming the command', async () => {
  const none = await check([]);
  assert.equal(none.status, 'SKIP');
  assert.match(none.evidence.reason, /no generated voice/);
  const unheard = await check([{ name: 'vo', text: 'hello there' }]);
  assert.equal(unheard.status, 'SKIP');
  assert.match(unheard.evidence.reason, /no transcript beside assets\/gen\/vo\.mp3.*mm gen transcribe/);
});

test('a voice heard back next to one that is not is SKIP with partial, never PASS; a warning still wins', async () => {
  const v = [{ name: 'a', text: 'hello there', heard: 'hello there' }, { name: 'b', text: 'second voice' }];
  const r = await check(v);
  assert.equal(r.status, 'SKIP');
  assert.equal(r.evidence.partial, true);
  assert.match(r.evidence.reason, /not heard back: assets\/gen\/b\.mp3/);
  const w = await check([...v.slice(1), { name: 'c', text: 'hello there friend', heard: 'goodbye now' }]);
  assert.equal(w.status, 'WARN');
});

test('the gate on fixtures/negatives/W-VOICE-SCRIPT warns W-VOICE-SCRIPT alone, naming five for three', async () => {
  const r = warnsOnly(await run('W-VOICE-SCRIPT'), 'W-VOICE-SCRIPT');
  assert.match(r.evidence.reason, /"five" for "three"/);
  assert.equal(row(await run('W-SAY'), 'W-VOICE-SCRIPT').status, 'SKIP');
});
