// What each provider is asked: Kie.ai (task API), ElevenLabs (voice, transcribe, sfx, music) and the
// Higgsfield CLI (a fake binary). fetch and the binary are injected; nothing reaches a real service.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { wordsFrom } from '../../scripts/lib/footage.mjs';
import { brandHash } from '../../scripts/lib/brand-prompt.mjs';
import { MP3, MP4, PNG, KEYS, STYLE, at, body, bytes, fakeHiggsfield, json, makePiece, readJson, router, runGen } from './_harness.mjs';

const upload = [at('file-stream-upload'), () => json({ success: true, code: 200, data: { downloadUrl: 'https://tempfile.redpandaai.co/x/ref.png' } })];
const kieTask = (urlJson, states = ['waiting', 'generating', 'success']) => {
  let i = 0;
  return [
    [at('/api/v1/jobs/createTask', 'POST'), () => json({ code: 200, msg: 'success', data: { taskId: 'task_1' } })],
    [at('/api/v1/jobs/recordInfo'), () => { const state = states[Math.min(i++, states.length - 1)]; return json({ code: 200, data: { taskId: 'task_1', state, resultJson: state === 'success' ? JSON.stringify(urlJson) : '', failMsg: state === 'fail' ? 'content refused' : '', creditsConsumed: 4 } }); }],
  ];
};

test('kie image: createTask with the steered prompt, polled to success, the result streamed to assets/gen and recorded', async () => {
  const piece = makePiece();
  const fetch = router([upload, ...kieTask({ resultUrls: ['https://cdn.example/r/img.png'] }), [at('cdn.example'), () => bytes(PNG)]]);
  const r = await runGen(['image', '--piece', piece, '--name', 'hero', '--provider', 'kie', '--prompt', 'a hand holding a small plant', '--yes'], { fetch, env: KEYS });
  assert.equal(r.code, 0, r.err);
  const create = r.calls.find((c) => c.url.endsWith('/api/v1/jobs/createTask'));
  assert.equal(create.headers.authorization, `Bearer ${KEYS.KIE_API_KEY}`);
  const b = body(create);
  assert.equal(b.model, 'seedream/4.5-edit', 'the brand reference picture makes it an edit with image_urls');
  assert.match(b.input.prompt, /^a hand holding a small plant\./);
  assert.match(b.input.prompt, /deep green #2F6F5E as the accent/);
  assert.match(b.input.prompt, /Avoid: stock-photo smiles, neon, no text, no logos, no watermarks\./, 'seedream has no negative prompt: it rides in the prompt');
  assert.equal(b.input.aspect_ratio, '16:9');
  assert.equal(r.calls.filter((c) => c.url.includes('recordInfo')).length, 3);
  assert.ok(r.calls.every((c) => /^https:\/\/(api\.kie\.ai|kieai\.redpandaai\.co|cdn\.example)\//.test(c.url)));
  assert.deepEqual(readFileSync(join(piece, 'assets/gen/hero.png')), PNG);
  assert.deepEqual(readdirSync(join(piece, 'assets/gen')).sort(), ['hero.gen.json', 'hero.licence.json', 'hero.png'], 'no .partial left behind');
  const sc = readJson(join(piece, 'assets/gen/hero.gen.json'));
  assert.equal(sc.provider, 'kie');
  assert.equal(sc.job, 'task_1');
  assert.deepEqual(sc.cost, { credits: 4 });
  assert.equal(sc.brandHash, brandHash('image', STYLE));
});

test('kie image with a reference picture: the file is uploaded to the upload host first, and its URL goes in image_urls', async () => {
  const piece = makePiece();
  const fetch = router([
    [at('kieai.redpandaai.co/api/file-stream-upload', 'POST'), () => json({ success: true, code: 200, data: { downloadUrl: 'https://tempfile.redpandaai.co/x/ref.png' } })],
    ...kieTask({ resultUrls: ['https://cdn.example/r/img.png'] }), [at('cdn.example'), () => bytes(PNG)]]);
  const r = await runGen(['image', '--piece', piece, '--name', 'edit', '--provider', 'kie', '--prompt', 'same, in daylight', '--brand', 'off', '--ref', join(piece, 'refs/a.png'), '--yes'], { fetch, env: KEYS });
  assert.equal(r.code, 0, r.err);
  const up = r.calls.find((c) => c.url.includes('file-stream-upload'));
  assert.equal(up.headers.authorization, `Bearer ${KEYS.KIE_API_KEY}`);
  assert.ok(up.body instanceof FormData);
  assert.equal(up.body.get('file').name, 'a.png');
  const b = body(r.calls.find((c) => c.url.endsWith('createTask')));
  assert.equal(b.model, 'seedream/4.5-edit');
  assert.deepEqual(b.input.image_urls, ['https://tempfile.redpandaai.co/x/ref.png']);
  assert.equal(b.input.prompt, 'same, in daylight', '--brand off sends the prompt untouched');
});

test('kie video from a first frame: the image-to-video model, duration as text, the clip prepared for media', async () => {
  const piece = makePiece();
  const preps = [];
  const fetch = router([
    [at('file-stream-upload'), () => json({ code: 200, data: { downloadUrl: 'https://tempfile.redpandaai.co/x/first.png' } })],
    ...kieTask({ resultUrls: ['https://cdn.example/r/clip.mp4'] }), [at('cdn.example'), () => bytes(MP4)]]);
  const r = await runGen(['video', '--piece', piece, '--name', 'push', '--provider', 'kie', '--prompt', 'slow push in', '--image', join(piece, 'refs/a.png'), '--duration', '6', '--yes'], { fetch, env: KEYS, prep: async (a) => { preps.push(a); } });
  assert.equal(r.code, 0, r.err);
  const b = body(r.calls.find((c) => c.url.endsWith('createTask')));
  assert.equal(b.model, 'kling/v3-turbo-image-to-video');
  assert.equal(b.input.duration, '6');
  assert.deepEqual(b.input.image_urls, ['https://tempfile.redpandaai.co/x/first.png']);
  assert.ok(existsSync(join(piece, 'assets/gen/push.mp4')));
  assert.equal(preps.length, 1);
  assert.equal(preps[0].name, 'push');
  assert.equal(preps[0].file, join(piece, 'assets/gen/push.mp4'));
  assert.equal(readJson(join(piece, 'assets/gen/push.gen.json')).prepared, 'assets/push/');
});

test('kie video with --raw is not prepared', async () => {
  const piece = makePiece();
  const fetch = router([...kieTask({ resultUrls: ['https://cdn.example/r/clip.mp4'] }), [at('cdn.example'), () => bytes(MP4)]]);
  const r = await runGen(['video', '--piece', piece, '--name', 'raw', '--provider', 'kie', '--prompt', 'x', '--raw', '--yes'], { fetch, env: KEYS, prep: async () => { throw new Error('prep must not run'); } });
  assert.equal(r.code, 0, r.err);
  assert.equal(readJson(join(piece, 'assets/gen/raw.gen.json')).prepared, null);
});

test('kie music: Suno through createTask, instrumental, the brand\'s style words and what to avoid', async () => {
  const piece = makePiece();
  const fetch = router([...kieTask({ resultUrls: ['https://cdn.example/r/cover.jpg', 'https://cdn.example/r/track.mp3'] }), [at('track.mp3'), () => bytes(MP3)]]);
  const r = await runGen(['music', '--piece', piece, '--name', 'bed', '--provider', 'kie', '--prompt', 'a bed for a product film', '--duration', '45', '--yes'], { fetch, env: KEYS });
  assert.equal(r.code, 0, r.err);
  const b = body(r.calls.find((c) => c.url.endsWith('createTask')));
  assert.equal(b.model, 'ai-music-api/generate');
  assert.equal(b.input.custom_mode, true);
  assert.equal(b.input.instrumental, true);
  assert.equal(b.input.title, 'bed');
  assert.match(b.input.style, /a bed for a product film/);
  assert.match(b.input.style, /warm minimal piano, light percussion/);
  assert.match(b.input.style, /about 96 bpm/);
  assert.equal(b.input.negative_tags, 'vocals, big drops');
  assert.equal(b.input.duration, 45);
  assert.ok(existsSync(join(piece, 'assets/gen/bed.mp3')), 'the audio URL is picked over the cover picture');
});

test('kie: a failed task exits 1 with the provider\'s reason and leaves no asset', async () => {
  const piece = makePiece();
  const fetch = router([upload, ...kieTask({}, ['waiting', 'fail'])]);
  const r = await runGen(['image', '--piece', piece, '--name', 'bad', '--provider', 'kie', '--prompt', 'x', '--yes'], { fetch, env: KEYS });
  assert.equal(r.code, 1);
  assert.match(r.err, /content refused/);
  assert.ok(!existsSync(join(piece, 'assets/gen/bad.gen.json')));
});

test('a result that cannot be downloaded exits 1 and leaves no partial file; a non-https result is refused', async () => {
  const piece = makePiece();
  let r = await runGen(['image', '--piece', piece, '--name', 'gone', '--provider', 'kie', '--prompt', 'x', '--yes'], { fetch: router([upload, ...kieTask({ resultUrls: ['https://cdn.example/r/img.png'] }), [at('cdn.example'), () => bytes('nope', 404)]]), env: KEYS });
  assert.equal(r.code, 1);
  assert.match(r.err, /HTTP 404/);
  assert.deepEqual(existsSync(join(piece, 'assets/gen')) ? readdirSync(join(piece, 'assets/gen')) : [], []);
  r = await runGen(['image', '--piece', piece, '--name', 'plain', '--provider', 'kie', '--prompt', 'x', '--yes'], { fetch: router([upload, ...kieTask({ resultUrls: ['http://cdn.example/r/img.png'] })]), env: KEYS });
  assert.equal(r.code, 1);
  assert.match(r.err, /no URL|https/);
});

test('elevenlabs voice: text-to-speech with timestamps, the brand voice\'s delivery, words in the footage format', async () => {
  const piece = makePiece();
  const text = 'Hi there, you.';
  const chars = [...text];
  const fetch = router([[at('/v1/text-to-speech/voice123/with-timestamps', 'POST'), () => json({ audio_base64: MP3.toString('base64'), alignment: { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.1), character_end_times_seconds: chars.map((_, i) => i * 0.1 + 0.08) } }, 200, { 'request-id': 'req_7' })]]);
  const r = await runGen(['voice', '--piece', piece, '--name', 'vo', '--text', text, '--yes'], { fetch, env: KEYS });
  assert.equal(r.code, 0, r.err);
  const call = r.calls[0];
  assert.equal(call.headers['xi-api-key'], KEYS.ELEVENLABS_API_KEY);
  assert.match(call.url, /output_format=mp3_44100_128$/);
  assert.deepEqual(body(call), { text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.1, speed: 1 } });
  assert.deepEqual(readFileSync(join(piece, 'assets/gen/vo.mp3')), MP3);
  const words = readJson(join(piece, 'assets/gen/vo.words.json'));
  assert.deepEqual(words.map((w) => w.text), ['Hi', 'there,', 'you.']);
  assert.deepEqual(wordsFrom(words), words, 'mm footage cut --words reads the file as written');
  assert.equal(readJson(join(piece, 'assets/gen/vo.gen.json')).job, 'req_7');
});

test('elevenlabs voice: --voice overrides the id; --script reads a file; the spoken text is never steered', async () => {
  const piece = makePiece();
  writeFileSync(join(piece, 'script.txt'), 'Line one.\nLine two.\n');
  const fetch = router([[at('/v1/text-to-speech/', 'POST'), () => json({ audio_base64: MP3.toString('base64'), alignment: null })]]);
  const r = await runGen(['voice', '--piece', piece, '--name', 'vo2', '--script', join(piece, 'script.txt'), '--voice', 'other9', '--yes'], { fetch, env: KEYS });
  assert.equal(r.code, 0, r.err);
  assert.match(r.calls[0].url, /text-to-speech\/other9\/with-timestamps/);
  assert.equal(body(r.calls[0]).text, 'Line one.\nLine two.');
});

test('elevenlabs transcribe: the audio goes as multipart to Scribe; words land as <name>.words.json', async () => {
  const piece = makePiece();
  writeFileSync(join(piece, 'take.mp3'), MP3);
  const fetch = router([[at('/v1/speech-to-text', 'POST'), () => json({ language_code: 'en', transcription_id: 'tr_1', words: [{ text: 'Hello', type: 'word', start: 0.2, end: 0.6 }, { text: ' ', type: 'spacing', start: 0.6, end: 0.7 }, { text: 'world', type: 'word', start: 0.7, end: 1.1 }] })]]);
  const r = await runGen(['transcribe', '--piece', piece, '--name', 'take', '--audio', join(piece, 'take.mp3'), '--language', 'en', '--yes'], { fetch, env: KEYS });
  assert.equal(r.code, 0, r.err);
  const form = r.calls[0].body;
  assert.equal(form.get('model_id'), 'scribe_v2');
  assert.equal(form.get('timestamps_granularity'), 'word');
  assert.equal(form.get('language_code'), 'en');
  assert.equal(form.get('file').name, 'take.mp3');
  assert.deepEqual(readJson(join(piece, 'assets/gen/take.words.json')), [{ text: 'Hello', start: 0.2, end: 0.6 }, { text: 'world', start: 0.7, end: 1.1 }]);
  const sc = readJson(join(piece, 'assets/gen/take.gen.json'));
  assert.equal(sc.brand, 'n/a');
  assert.equal(sc.brandHash, null);
  assert.equal(sc.inputs[0].role, 'audio');
});

test('elevenlabs sfx and music: the request bodies', async () => {
  const piece = makePiece();
  const fetch = router([[at('/v1/sound-generation', 'POST'), () => bytes(MP3)], [at('/v1/music', 'POST'), () => bytes(MP3)]]);
  let r = await runGen(['sfx', '--piece', piece, '--name', 'click', '--prompt', 'a small click', '--duration', '1.5', '--yes'], { fetch, env: KEYS });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(body(r.calls[0]), { text: 'a small click. soft, rounded interface sounds, gentle and clean.', model_id: 'eleven_text_to_sound_v2', duration_seconds: 1.5 });
  r = await runGen(['music', '--piece', piece, '--name', 'bed', '--prompt', 'a bed', '--duration', '30', '--yes'], { fetch, env: KEYS });
  assert.equal(r.code, 0, r.err);
  const b = body(r.calls[0]);
  assert.equal(b.model_id, 'music_v1');
  assert.equal(b.force_instrumental, true);
  assert.equal(b.music_length_ms, 30000);
  assert.match(b.prompt, /warm minimal piano/);
  assert.match(b.prompt, /Avoid: vocals, big drops\./);
  assert.ok(existsSync(join(piece, 'assets/gen/click.mp3')) && existsSync(join(piece, 'assets/gen/bed.mp3')));
});

test('higgsfield image: cost is quoted without uploading anything; create waits and prints JSON; the result URL is downloaded', async () => {
  const piece = makePiece();
  const hf = fakeHiggsfield();
  const env = { MM_HIGGSFIELD: hf.bin };
  const fetch = router([[at('cdn.example/hf/out.png'), () => bytes(PNG)]]);
  const args = ['image', '--piece', piece, '--name', 'hero', '--prompt', 'a hand holding a small plant', '--ref', join(piece, 'refs/a.png')];
  let r = await runGen(args, { fetch, env });
  assert.equal(r.code, 3, r.err);
  assert.match(r.out, /cost\s+Estimated cost: 3\.5 credits/);
  assert.equal(r.calls.length, 0);
  assert.ok(hf.calls().some((c) => c[0] === 'generate' && c[1] === 'cost'));
  assert.ok(!hf.calls().some((c) => c[1] === 'create'), 'nothing was created');
  const cost = hf.calls().find((c) => c[1] === 'cost');
  assert.ok(!cost.includes('--image'), 'a quote uploads nothing');
  r = await runGen([...args, '--yes'], { fetch, env });
  assert.equal(r.code, 0, r.err);
  const create = hf.calls().find((c) => c[1] === 'create');
  assert.deepEqual(create.slice(0, 3), ['generate', 'create', 'gpt_image_2_5']);
  assert.equal(create[create.indexOf('--aspect_ratio') + 1], '16:9');
  assert.ok(create.filter((x) => x === '--image').length === 2 || create.includes(join(piece, 'refs/a.png')), 'the reference goes by path; the CLI uploads it');
  assert.ok(create.includes('--wait') && create.includes('--json'));
  assert.match(create[create.indexOf('--prompt') + 1], /soft studio photography/);
  assert.deepEqual(readFileSync(join(piece, 'assets/gen/hero.png')), PNG);
  const sc = readJson(join(piece, 'assets/gen/hero.gen.json'));
  assert.equal(sc.job, 'job_42');
  assert.deepEqual(sc.cost, { credits: 3.5 });
});

test('higgsfield defaults: video seedance_2_5 (omni_reference from a first frame), music sonilo_music, sfx mirelo_text_to_audio', async () => {
  const piece = makePiece();
  const hf = fakeHiggsfield();
  const fetch = router([[at('cdn.example/hf/out.png'), () => bytes(MP4)]]);
  const env = { MM_HIGGSFIELD: hf.bin, FAKE_HF_URL: 'https://cdn.example/hf/out.png' };
  await runGen(['video', '--piece', piece, '--name', 'v', '--prompt', 'x', '--image', join(piece, 'refs/a.png'), '--duration', '8', '--raw', '--yes'], { fetch, env });
  const v = hf.calls().find((c) => c[1] === 'create' && c[2] === 'seedance_2_5');
  assert.ok(v, 'seedance_2_5');
  assert.equal(v[v.indexOf('--mode') + 1], 'omni_reference');
  assert.equal(v[v.indexOf('--start-image') + 1], join(piece, 'refs/a.png'));
  assert.equal(v[v.indexOf('--duration') + 1], '8');
  const fetchAudio = router([[at('cdn.example/hf/out.png'), () => bytes(MP3)]]);
  await runGen(['music', '--piece', piece, '--name', 'm', '--provider', 'higgsfield', '--prompt', 'x', '--yes'], { fetch: fetchAudio, env });
  await runGen(['sfx', '--piece', piece, '--name', 's', '--provider', 'higgsfield', '--prompt', 'x', '--yes'], { fetch: fetchAudio, env });
  assert.ok(hf.calls().some((c) => c[2] === 'sonilo_music' && c.includes('--duration')));
  assert.ok(hf.calls().some((c) => c[2] === 'mirelo_text_to_audio' && c.includes('--duration')));
});

test('higgsfield replace: the model is found from `model list`; none or several exit 2 with the candidates', async () => {
  const piece = makePiece();
  writeFileSync(join(piece, 'clip.mp4'), MP4);
  const base = ['replace', '--piece', piece, '--name', 'swap', '--prompt', 'same moves', '--video', join(piece, 'clip.mp4'), '--character', join(piece, 'refs/a.png')];
  const fetch = router([[at('cdn.example/hf/out.png'), () => bytes(MP4)]]);
  const one = fakeHiggsfield();
  let r = await runGen([...base, '--raw', '--yes'], { fetch, env: { MM_HIGGSFIELD: one.bin, FAKE_HF_URL: 'https://cdn.example/hf/out.png', FAKE_HF_MODELS: JSON.stringify([{ id: 'img_a', name: 'Image A', category: 'image' }, { id: 'char_swap_x', name: 'Character Swap', category: 'video' }]) } });
  assert.equal(r.code, 0, r.err);
  const create = one.calls().find((c) => c[1] === 'create');
  assert.equal(create[2], 'char_swap_x');
  assert.equal(create[create.indexOf('--video') + 1], join(piece, 'clip.mp4'));
  const none = fakeHiggsfield();
  r = await runGen([...base, '--yes'], { fetch, env: { MM_HIGGSFIELD: none.bin, FAKE_HF_MODELS: JSON.stringify([{ id: 'img_a', name: 'Image A' }]) } });
  assert.equal(r.code, 2);
  assert.match(r.err, /--model/);
  assert.ok(!none.calls().some((c) => c[1] === 'create'));
  const two = fakeHiggsfield();
  r = await runGen([...base, '--yes'], { fetch, env: { MM_HIGGSFIELD: two.bin, FAKE_HF_MODELS: JSON.stringify([{ id: 'swap_a', name: 'Swap A' }, { id: 'replace_b', name: 'Replace B' }]) } });
  assert.equal(r.code, 2);
  assert.match(r.err, /swap_a/);
  assert.match(r.err, /replace_b/);
  r = await runGen([...base, '--model', 'swap_a', '--raw', '--yes'], { fetch, env: { MM_HIGGSFIELD: two.bin, FAKE_HF_URL: 'https://cdn.example/hf/out.png' } });
  assert.equal(r.code, 0, r.err);
  assert.equal(two.calls().filter((c) => c[1] === 'create').at(-1)[2], 'swap_a', '--model skips discovery');
});

test('higgsfield: logged out exits 2 with the login command; a missing binary exits 2 and installs nothing', async () => {
  const piece = makePiece();
  const hf = fakeHiggsfield();
  const args = ['image', '--piece', piece, '--name', 'x', '--prompt', 'x', '--yes'];
  let r = await runGen(args, { env: { MM_HIGGSFIELD: hf.bin, FAKE_HF_LOGGED_OUT: '1' } });
  assert.equal(r.code, 2);
  assert.match(r.err, /higgsfield auth login/);
  assert.ok(!hf.calls().some((c) => c[0] === 'auth' || c[0] === 'workspace'), 'mm never logs in or sets a workspace');
  r = await runGen(args, { env: { MM_HIGGSFIELD: '/no/such/higgsfield' } });
  assert.equal(r.code, 2);
  assert.match(r.err, /not installed/);
  assert.match(r.err, /mm does not install it/);
});

test('higgsfield voice goes through seed_audio when the brand\'s voice names higgsfield', async () => {
  const piece = makePiece({ ...STYLE, voice: { provider: 'higgsfield', id: 'warm-narrator', language: 'en' } });
  const hf = fakeHiggsfield();
  const fetch = router([[at('cdn.example/hf/out.png'), () => bytes(MP3)]]);
  const r = await runGen(['voice', '--piece', piece, '--name', 'vo', '--text', 'Hello.', '--yes'], { fetch, env: { MM_HIGGSFIELD: hf.bin, FAKE_HF_URL: 'https://cdn.example/hf/out.png' } });
  assert.equal(r.code, 0, r.err);
  const c = hf.calls().find((x) => x[1] === 'create');
  assert.equal(c[2], 'seed_audio');
  assert.match(c[c.indexOf('--prompt') + 1], /Hello\./);
  assert.ok(!existsSync(join(piece, 'assets/gen/vo.words.json')), 'no word times from this provider');
  assert.match(r.out, /mm gen transcribe/);
});
