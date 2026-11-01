// `mm gen voice` reads the narration before it asks to spend anything (SPEC §8): [display](spoken) markers are sent as
// their spoken form, <<slot>> cue markers are taken out, the brand's voice.lexicon respells names, and a word a voice may
// get wrong that nothing marks is shown in the plan and stops the send until it is fixed or --say-ok says it is meant.
// The words the voice returns are turned back into the words shown, so a beat's anchor finds them. Fixtures only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { KEYS, MP3, STYLE, json, makePiece, router, at, runGen } from './_harness.mjs';

const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
/** An ElevenLabs answer: audio and a per-character alignment of `text`, one second a word. */
function speech(sent) {
  const chars = [...sent], starts = [], ends = [];
  let w = -1, prev = ' ';
  for (const c of chars) { if (/\S/.test(c) && /\s/.test(prev)) w++; starts.push(Math.max(w, 0)); ends.push(Math.max(w, 0) + 0.9); prev = c; }
  return json({ audio_base64: MP3.toString('base64'), alignment: { characters: chars, character_start_times_seconds: starts, character_end_times_seconds: ends } }, 200, { 'request-id': 'req1' });
}
const sentBody = (r) => JSON.parse(r.calls.find((c) => c.method === 'POST' && c.url.includes('text-to-speech')).body);
const voice = (extra = [], style = STYLE) => {
  const piece = makePiece(style);
  const fetch = router([[at('text-to-speech', 'POST'), (url, init) => speech(JSON.parse(init.body).text)]]);
  return { piece, run: (args, env = KEYS) => runGen(['voice', '--piece', piece, '--name', 'vo', ...extra, ...args], { fetch, env }) };
};

test('a pronunciation marker is sent as its spoken form; the record keeps what was typed and what was sent; the words come back as shown', async () => {
  const { piece, run } = voice();
  const r = await run(['--text', 'Open the [API](ay pee eye) now.', '--yes']);
  assert.equal(r.code, 0, r.err);
  assert.equal(sentBody(r).text, 'Open the ay pee eye now.');
  const rec = read(join(piece, 'assets/gen/vo.gen.json'));
  assert.equal(rec.prompt.typed, 'Open the [API](ay pee eye) now.');
  assert.equal(rec.prompt.sent, 'Open the ay pee eye now.');
  assert.equal(rec.request.text, 'Open the [API](ay pee eye) now.', 'a replay says it again with its markers');
  const words = read(join(piece, 'assets/gen/vo.words.json'));
  assert.deepEqual(words.map((w) => w.text), ['Open', 'the', 'API', 'now.'], 'the words as shown, so an anchor "API" finds them');
  assert.deepEqual([words[2].start, words[2].end], [2, 4.9], 'the span of the three spoken words');
});

test('cue markers take no room in what is sent', async () => {
  const { run } = voice();
  const r = await run(['--text', 'We start <<hero>>here and <<proof>>go on.', '--yes']);
  assert.equal(r.code, 0, r.err);
  assert.equal(sentBody(r).text, 'We start here and go on.');
});

test('the brand\'s lexicon respells a name for the voice and leaves the shown text; changing it changes the request', async () => {
  const style = { ...STYLE, voice: { ...STYLE.voice, lexicon: { Zalo: 'ZAH-lo' } } };
  const { piece, run } = voice([], style);
  const r = await run(['--text', 'Meet Zalo today.', '--yes']);
  assert.equal(r.code, 0, r.err);
  assert.equal(sentBody(r).text, 'Meet ZAH-lo today.');
  assert.deepEqual(read(join(piece, 'assets/gen/vo.words.json')).map((w) => w.text), ['Meet', 'Zalo', 'today.']);
  writeFileSync(join(piece, 'style.json'), JSON.stringify({ ...style, voice: { ...style.voice, lexicon: { Zalo: 'ZAH-loh' } } }));
  const again = await run(['--text', 'Meet Zalo today.', '--yes']);
  assert.equal(again.code, 0);
  assert.equal(again.calls.length, 1, 'a different respelling is a different request: it is sent again');
  assert.equal(sentBody(again).text, 'Meet ZAH-loh today.');
});

test('the plan shows the words a voice may get wrong; --plan alone exits 0', async () => {
  const { run } = voice();
  const r = await run(['--text', 'Use the SDK and README.md.', '--plan']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /say-lint\s+2 words/);
  assert.match(r.out, /"SDK".*acronym/);
  assert.match(r.out, /"README\.md".*file name/);
  assert.equal(r.calls.length, 0);
});

test('without --say-ok, unmarked risky words stop the send (exit 2, nothing sent, nothing written); with it, the voice is made', async () => {
  const { piece, run } = voice();
  const stopped = await run(['--text', 'Use the SDK.', '--yes']);
  assert.equal(stopped.code, 2);
  assert.match(stopped.err, /1 word a voice may get wrong/);
  assert.match(stopped.err, /\[word\]\(how it is said\)|voice\.lexicon/);
  assert.match(stopped.err, /--say-ok/);
  assert.equal(stopped.calls.length, 0, 'nothing was sent');
  assert.ok(!existsSync(join(piece, 'assets/gen/vo.gen.json')));
  const ok = await run(['--text', 'Use the SDK.', '--yes', '--say-ok']);
  assert.equal(ok.code, 0, ok.err);
  assert.equal(sentBody(ok).text, 'Use the SDK.');
  const marked = voice();
  const fine = await marked.run(['--text', 'Use the [SDK](ess dee kay).', '--yes']);
  assert.equal(fine.code, 0, fine.err);
});

test('--scene reads a scene\'s say from the story, markers and all', async () => {
  const { piece, run } = voice();
  writeFileSync(join(piece, 'story.json'), JSON.stringify({ scenes: [{ id: 'open', say: 'Hello <<hero>>there, [CSS](see ess ess) fans.', beats: [{ slot: 'hero' }] }, { id: 'end', say: 'Bye.', beats: [] }] }));
  const r = await run(['--scene', 'open', '--yes']);
  assert.equal(r.code, 0, r.err);
  assert.equal(sentBody(r).text, 'Hello there, see ess ess fans.');
  const none = await run(['--scene', 'nope', '--yes']);
  assert.equal(none.code, 2);
  assert.match(none.err, /no scene "nope"/);
  const both = await run(['--scene', 'open', '--text', 'x', '--yes']);
  assert.equal(both.code, 2);
});

test('--scene is for voice only', async () => {
  const piece = makePiece();
  const r = await runGen(['music', '--piece', piece, '--name', 'm', '--prompt', 'x', '--scene', 'open', '--yes'], { env: KEYS });
  assert.equal(r.code, 2);
  assert.match(r.err, /--scene.*voice/);
});
