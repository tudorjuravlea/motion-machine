// The rules of `mm gen` that do not depend on a provider: the plan (exit 3, nothing sent), keys,
// brand on and off, the record, --again, import, credit, unsupported kinds, and the router.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brandHash } from '../../scripts/lib/brand-prompt.mjs';
import { guarded } from '../../scripts/lib/gen/common.mjs';
import { MP3, MP4, PNG, KEYS, STYLE, at, body, bytes, fakeHiggsfield, json, makePiece, readJson, router, runGen } from './_harness.mjs';

const MM = join(import.meta.dirname, '..', '..', 'scripts', 'mm.mjs');
const upload = [at('file-stream-upload'), () => json({ code: 200, data: { downloadUrl: 'https://tempfile.redpandaai.co/x/ref.png' } })];
const kie = (url) => [upload,
  [at('createTask'), () => json({ code: 200, data: { taskId: 't1' } })],
  [at('recordInfo'), () => json({ code: 200, data: { state: 'success', resultJson: JSON.stringify({ resultUrls: [url] }) } })],
  [at('cdn.example'), () => bytes(PNG)]];

test('without --yes every paid kind prints a plan, exits 3 and sends nothing', async () => {
  const piece = makePiece();
  writeFileSync(join(piece, 'take.mp3'), MP3);
  const cases = [
    ['image', '--provider', 'kie', '--prompt', 'x'], ['video', '--provider', 'kie', '--prompt', 'x'], ['music', '--provider', 'kie', '--prompt', 'x'],
    ['music', '--prompt', 'x'], ['sfx', '--prompt', 'x'], ['voice', '--text', 'Hello.'], ['transcribe', '--audio', join(piece, 'take.mp3')],
  ];
  for (const c of cases) {
    const r = await runGen([c[0], '--piece', piece, '--name', 'a', ...c.slice(1)], { env: KEYS });
    assert.equal(r.code, 3, `${c.join(' ')}: ${r.err}`);
    assert.equal(r.calls.length, 0, `${c.join(' ')} made a network call`);
    assert.match(r.out, /plan \(nothing has been sent\)/);
    assert.match(r.out, /with their yes, run the same command again with --yes/);
    assert.ok(!existsSync(join(piece, 'assets')), 'no asset folder');
  }
});

test('the plan shows provider, model, the prompt as sent, each file that would leave with size and sha256, and says when it cannot quote', async () => {
  const piece = makePiece();
  const r = await runGen(['image', '--piece', piece, '--name', 'hero', '--provider', 'kie', '--prompt', 'a plant', '--ref', join(piece, 'refs/a.png')], { env: KEYS });
  assert.equal(r.code, 3);
  assert.match(r.out, /provider\s+kie, model seedream\/4\.5-edit/);
  assert.match(r.out, /prompt\s+as it will be sent:\n<<<MATERIAL source="prompt as sent"[^\n]*\n\| a plant\. soft studio photography/);
  assert.match(r.out, /<<<MATERIAL:file name "refs\/a\.png" MATERIAL>>>\s+\d+ bytes\s+sha256 [0-9a-f]{64}/);
  assert.ok(r.out.includes(createHash('sha256').update(PNG).digest('hex')));
  assert.match(r.out, /cost\s+not quoted/);
  assert.match(r.out, /brand\s+on \(hash [0-9a-f]{8}\)/);
  assert.match(r.out, /key\s+KIE_API_KEY …3456 \(environment\)/);
});

test('--plan prints the same plan and exits 0, even with --yes; --json prints it as JSON', async () => {
  const piece = makePiece();
  let r = await runGen(['sfx', '--piece', piece, '--name', 'a', '--prompt', 'x', '--plan', '--yes'], { env: KEYS });
  assert.equal(r.code, 0);
  assert.equal(r.calls.length, 0);
  assert.match(r.out, /plan only/);
  r = await runGen(['sfx', '--piece', piece, '--name', 'a', '--prompt', 'x', '--json'], { env: KEYS });
  assert.equal(r.code, 3);
  const p = JSON.parse(r.out).plan;
  assert.equal(p.provider, 'elevenlabs');
  assert.equal(p.model, 'eleven_text_to_sound_v2');
  assert.equal(p.cost, 'not quoted');
});

test('keys are never printed: not in a plan, not in a provider\'s error that echoes them', async () => {
  const piece = makePiece();
  let r = await runGen(['music', '--piece', piece, '--name', 'a', '--prompt', 'x'], { env: KEYS });
  assert.ok(!(r.out + r.err).includes(KEYS.ELEVENLABS_API_KEY));
  assert.match(r.out, /ELEVENLABS_API_KEY …4321/);
  const fetch = router([[at('/v1/music'), () => json({ detail: { message: `invalid key ${KEYS.ELEVENLABS_API_KEY}` } }, 401)]]);
  r = await runGen(['music', '--piece', piece, '--name', 'a', '--prompt', 'x', '--yes'], { fetch, env: KEYS });
  assert.equal(r.code, 1);
  assert.match(r.err, /401/);
  assert.ok(!(r.out + r.err).includes(KEYS.ELEVENLABS_API_KEY), r.err);
  assert.match(r.err, /…4321/);
});

test('a missing key exits 2 before anything is sent, naming the variable and the keys file; the keys file is read, never written', async () => {
  const piece = makePiece();
  const home = mkdtempSync(join(tmpdir(), 'mm-gen-home-'));
  let r = await runGen(['music', '--piece', piece, '--name', 'a', '--prompt', 'x', '--yes'], { home, env: { HOME: home } });
  assert.equal(r.code, 2);
  assert.match(r.err, /ELEVENLABS_API_KEY/);
  assert.match(r.err, /keys\.env/);
  assert.equal(r.calls.length, 0);
  assert.ok(!existsSync(join(home, '.config')), 'mm created nothing');
  mkdirSync(join(home, '.config', 'motion-machine'), { recursive: true });
  writeFileSync(join(home, '.config', 'motion-machine', 'keys.env'), 'ELEVENLABS_API_KEY=file-key-9999\n');
  r = await runGen(['music', '--piece', piece, '--name', 'a', '--prompt', 'x'], { home, env: { HOME: home } });
  assert.equal(r.code, 3);
  assert.match(r.out, /…9999 \(\$HOME\/\.config\/motion-machine\/keys\.env\)/);
});

test('a kind a provider cannot make exits 2 naming the providers that can', async () => {
  const piece = makePiece();
  let r = await runGen(['replace', '--piece', piece, '--name', 'a', '--provider', 'kie', '--prompt', 'x', '--video', join(piece, 'refs/a.png'), '--character', join(piece, 'refs/a.png')], { env: KEYS });
  assert.equal(r.code, 2);
  assert.match(r.err, /kie cannot make replace; the providers that can: higgsfield/);
  r = await runGen(['transcribe', '--piece', piece, '--name', 'a', '--provider', 'kie', '--audio', join(piece, 'refs/a.png')], { env: KEYS });
  assert.match(r.err, /the providers that can: elevenlabs/);
  r = await runGen(['sfx', '--piece', piece, '--name', 'a', '--provider', 'kie', '--prompt', 'x'], { env: KEYS });
  assert.match(r.err, /elevenlabs, higgsfield/);
});

test('voice with neither a brand voice nor --voice exits 2 asking for one', async () => {
  const { voice, ...bare } = STYLE;
  const piece = makePiece(bare);
  const r = await runGen(['voice', '--piece', piece, '--name', 'a', '--text', 'Hi.'], { env: KEYS });
  assert.equal(r.code, 2);
  assert.match(r.err, /--voice/);
  assert.match(r.err, /brand voice/);
});

test('usage mistakes exit 2: no piece, a bad name, no prompt, no kind, a bad --brand', async () => {
  const piece = makePiece();
  for (const [argv, re] of [
    [['image', '--name', 'a', '--prompt', 'x'], /--piece/], [['image', '--piece', piece, '--name', 'Bad Name', '--prompt', 'x'], /--name must be/],
    [['image', '--piece', piece, '--name', 'a'], /needs --prompt/], [['nonsense', '--piece', piece], /takes one kind/], [['image', '--piece', piece, '--name', 'a', '--prompt', 'x', '--brand', 'maybe'], /on or off/],
    [['image', '--piece', join(piece, 'nope'), '--name', 'a', '--prompt', 'x'], /no such piece/],
  ]) {
    const r = await runGen(argv, { env: KEYS });
    assert.equal(r.code, 2, argv.join(' '));
    assert.match(r.err, re);
  }
});

test('the record: provider, model, kind, prompt as typed and as sent, negative, inputs with sha256, parameters, job, created, brandHash', async () => {
  const piece = makePiece();
  const r = await runGen(['image', '--piece', piece, '--name', 'hero', '--provider', 'kie', '--prompt', 'a plant', '--yes'], { fetch: router(kie('https://cdn.example/r/a.png')), env: KEYS });
  assert.equal(r.code, 0, r.err);
  const sc = readJson(join(piece, 'assets/gen/hero.gen.json'));
  assert.equal(sc.kind, 'image');
  assert.equal(sc.model, 'seedream/4.5-edit');
  assert.equal(sc.prompt.typed, 'a plant');
  assert.match(sc.prompt.sent, /^a plant\. soft studio photography/);
  assert.match(sc.negative, /no watermarks/);
  assert.deepEqual(sc.inputs, [{ name: 'a.png', role: 'ref', path: 'refs/a.png', sha256: createHash('sha256').update(PNG).digest('hex') }]);
  assert.equal(sc.parameters.aspect_ratio, '16:9');
  assert.equal(sc.job, 't1');
  assert.match(sc.created, /^\d{4}-\d\d-\d\dT/);
  assert.equal(sc.brand, 'on');
  assert.equal(sc.brandHash, brandHash('image', STYLE));
  assert.equal(sc.file, 'assets/gen/hero.png');
  assert.ok(!JSON.stringify(sc).includes(KEYS.KIE_API_KEY));
  assert.ok(!JSON.stringify(sc).includes(piece), 'no absolute path in the record');
});

test('--brand off sends the prompt untouched and the record says so', async () => {
  const piece = makePiece();
  const r = await runGen(['image', '--piece', piece, '--name', 'raw', '--provider', 'kie', '--prompt', 'a plant', '--brand', 'off', '--yes'], { fetch: router([[at('createTask'), () => json({ code: 200, data: { taskId: 't1' } })], [at('recordInfo'), () => json({ code: 200, data: { state: 'success', resultJson: '{"resultUrls":["https://cdn.example/r/a.png"]}' } })], [at('cdn.example'), () => bytes(PNG)]]), env: KEYS });
  assert.equal(r.code, 0, r.err);
  const sc = readJson(join(piece, 'assets/gen/raw.gen.json'));
  assert.equal(sc.brand, 'off');
  assert.equal(sc.brandHash, null);
  assert.equal(sc.prompt.sent, 'a plant');
  assert.equal(sc.negative, null);
});

test('--again generates a recorded asset again with the current brand: same prompt as typed, same inputs, a new hash', async () => {
  const piece = makePiece();
  const fetch = router(kie('https://cdn.example/r/a.png'));
  let r = await runGen(['image', '--piece', piece, '--name', 'hero', '--provider', 'kie', '--prompt', 'a plant', '--aspect', '1:1', '--yes'], { fetch, env: KEYS });
  assert.equal(r.code, 0, r.err);
  const first = readJson(join(piece, 'assets/gen/hero.gen.json'));
  writeFileSync(join(piece, 'style.json'), JSON.stringify({ ...STYLE, imagery: { ...STYLE.imagery, mood: 'tense and electric' } }));
  r = await runGen(['image', '--piece', piece, '--again', 'hero'], { fetch, env: KEYS });
  assert.equal(r.code, 3, 'a replay is planned first');
  r = await runGen(['image', '--piece', piece, '--again', 'hero', '--yes'], { fetch, env: KEYS });
  assert.equal(r.code, 0, r.err);
  const second = readJson(join(piece, 'assets/gen/hero.gen.json'));
  assert.equal(second.prompt.typed, 'a plant');
  assert.match(second.prompt.sent, /tense and electric/);
  assert.doesNotMatch(first.prompt.sent, /tense and electric/);
  assert.notEqual(second.brandHash, first.brandHash);
  assert.equal(second.brandHash, brandHash('image', JSON.parse(readFileSync(join(piece, 'style.json'), 'utf8'))));
  assert.deepEqual(second.inputs, first.inputs);
  assert.equal(second.parameters.aspect_ratio, '1:1');
  assert.equal(second.provider, 'kie');
  const sentBody = body(r.calls.find((c) => c.url.endsWith('createTask')));
  assert.equal(sentBody.input.aspect_ratio, '1:1');
});

test('--again brings an asset made with --brand off onto the brand; it needs --yes like any run; a wrong kind or name exits 2', async () => {
  const piece = makePiece();
  const fetch = router(kie('https://cdn.example/r/a.png'));
  await runGen(['image', '--piece', piece, '--name', 'raw', '--provider', 'kie', '--prompt', 'a plant', '--brand', 'off', '--yes'], { fetch, env: KEYS });
  let r = await runGen(['image', '--piece', piece, '--again', 'raw'], { fetch, env: KEYS });
  assert.equal(r.code, 3);
  assert.match(r.out, /brand\s+on/);
  r = await runGen(['image', '--piece', piece, '--again', 'raw', '--yes'], { fetch, env: KEYS });
  assert.equal(readJson(join(piece, 'assets/gen/raw.gen.json')).brand, 'on');
  r = await runGen(['music', '--piece', piece, '--again', 'raw'], { env: KEYS });
  assert.equal(r.code, 2);
  assert.match(r.err, /made by mm gen image/);
  r = await runGen(['image', '--piece', piece, '--again', 'missing'], { env: KEYS });
  assert.equal(r.code, 2);
});

test('--again on a voice replays the text and the --voice override', async () => {
  const piece = makePiece();
  const fetch = router([[at('/v1/text-to-speech/'), () => json({ audio_base64: MP3.toString('base64'), alignment: null })]]);
  await runGen(['voice', '--piece', piece, '--name', 'vo', '--text', 'Hello there.', '--voice', 'other9', '--yes'], { fetch, env: KEYS });
  await runGen(['voice', '--piece', piece, '--again', 'vo', '--fresh'], { fetch, env: KEYS });
  const r = await runGen(['voice', '--piece', piece, '--again', 'vo', '--fresh', '--yes'], { fetch, env: KEYS });
  assert.equal(r.code, 0, r.err);
  assert.match(r.calls[0].url, /text-to-speech\/other9\//);
  assert.equal(body(r.calls[0]).text, 'Hello there.');
});

test('import copies a file made elsewhere with the same record, needs no --yes and sends nothing; a video is prepared unless --raw', async () => {
  const piece = makePiece();
  writeFileSync(join(piece, 'katana.mp4'), MP4);
  const preps = [];
  const r = await runGen(['import', '--piece', piece, '--name', 'edit', '--provider', 'higgsfield', '--model', 'katana', '--file', join(piece, 'katana.mp4'), '--prompt', 'brief', '--job', 'j9'], { prep: async (a) => { preps.push(a); } });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.calls.length, 0);
  assert.deepEqual(readFileSync(join(piece, 'assets/gen/edit.mp4')), MP4);
  assert.equal(preps.length, 1);
  const sc = readJson(join(piece, 'assets/gen/edit.gen.json'));
  assert.equal(sc.kind, 'import');
  assert.equal(sc.provider, 'higgsfield');
  assert.equal(sc.model, 'katana');
  assert.equal(sc.job, 'j9');
  assert.equal(sc.brand, 'n/a');
  assert.equal(sc.inputs[0].sha256, createHash('sha256').update(MP4).digest('hex'));
  assert.equal(sc.prepared, 'assets/edit/');
  const raw = await runGen(['import', '--piece', piece, '--name', 'edit2', '--file', join(piece, 'katana.mp4'), '--raw'], { prep: async () => { throw new Error('no prep'); } });
  assert.equal(raw.code, 0, raw.err);
});

test('import --url downloads over https only, and the record keeps the URL without its query', async () => {
  const piece = makePiece();
  const fetch = router([[at('result.example'), () => bytes(PNG)]]);
  let r = await runGen(['import', '--piece', piece, '--name', 'web', '--provider', 'kie', '--url', 'https://result.example/out/pic.png?token=SECRET'], { fetch });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(readFileSync(join(piece, 'assets/gen/web.png')), PNG);
  const sc = readJson(join(piece, 'assets/gen/web.gen.json'));
  assert.equal(sc.inputs[0].url, 'https://result.example/out/pic.png');
  assert.ok(!JSON.stringify(sc).includes('SECRET'));
  r = await runGen(['import', '--piece', piece, '--name', 'web2', '--url', 'http://result.example/pic.png'], { fetch });
  assert.equal(r.code, 2);
  assert.match(r.err, /https/);
  r = await runGen(['import', '--piece', piece, '--name', 'web3'], { fetch });
  assert.equal(r.code, 2);
});

test('credit needs no piece and no --yes: it prints each provider\'s balance', async () => {
  const hf = fakeHiggsfield();
  const fetch = router([[at('/api/v1/chat/credit'), () => json({ code: 200, msg: 'success', data: 100.5 })], [at('/v1/user/subscription'), () => json({ tier: 'creator', character_count: 1200, character_limit: 100000 })]]);
  let r = await runGen(['credit'], { fetch, env: { ...KEYS, MM_HIGGSFIELD: hf.bin } });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /kie: 100\.5 credits/);
  assert.match(r.out, /elevenlabs: 1200 of 100000 characters used \(creator\)/);
  assert.match(r.out, /higgsfield: Logged in\. Credits: 120/);
  assert.equal(r.calls.find((c) => c.url.includes('chat/credit')).headers.authorization, `Bearer ${KEYS.KIE_API_KEY}`);
  assert.ok(!(r.out + r.err).includes(KEYS.KIE_API_KEY));
  r = await runGen(['credit', '--provider', 'kie', '--json'], { fetch, env: KEYS });
  assert.deepEqual(JSON.parse(r.out), { credit: { kie: '100.5 credits' } });
  r = await runGen(['credit', '--provider', 'kie'], { env: {} });
  assert.equal(r.code, 2);
  assert.match(r.err, /KIE_API_KEY/);
});

test('API calls go only to a provider\'s documented hosts', async () => {
  const f = guarded(async () => new Response('ok'), ['api.kie.ai']);
  assert.equal(await (await f('https://api.kie.ai/x')).text(), 'ok');
  await assert.rejects(async () => f('https://evil.example/x'), /refusing to call evil\.example/);
});

test('the router: mm gen --help prints the usage, an unknown flag exits 2, and a run with no key sends nothing', () => {
  const home = mkdtempSync(join(tmpdir(), 'mm-gen-home-'));
  const run = (args) => spawnSync(process.execPath, [MM, 'gen', ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home } });
  let r = run(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^usage: mm gen <kind>/);
  r = run(['image', '--no-such-flag']);
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.stderr, /\n\s+at /);
  const piece = makePiece();
  r = run(['image', '--piece', piece, '--name', 'a', '--provider', 'kie', '--prompt', 'x', '--yes']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /KIE_API_KEY/);
});

test('imagery.tone duotone grades the landed picture toward the palette and the record says how', { skip: spawnSync('ffmpeg', ['-version']).status !== 0 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-gen-tone-'));
  const src = join(dir, 'src.png');
  assert.equal(spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=s=64x64:d=1', '-frames:v', '1', src]).status, 0);
  const real = readFileSync(src);
  const piece = makePiece({ ...STYLE, imagery: { ...STYLE.imagery, tone: 'duotone', references: [] } });
  const fetch = router([[at('createTask'), () => json({ code: 200, data: { taskId: 't1' } })], [at('recordInfo'), () => json({ code: 200, data: { state: 'success', resultJson: '{"resultUrls":["https://cdn.example/r/a.png"]}' } })], [at('cdn.example'), () => bytes(real)]]);
  const r = await runGen(['image', '--piece', piece, '--name', 'toned', '--provider', 'kie', '--prompt', 'x', '--yes'], { fetch, env: KEYS });
  assert.equal(r.code, 0, r.err);
  const out = readFileSync(join(piece, 'assets/gen/toned.png'));
  assert.equal(out.subarray(1, 4).toString(), 'PNG');
  assert.ok(!out.equals(real), 'graded');
  assert.deepEqual(readJson(join(piece, 'assets/gen/toned.gen.json')).post, { tone: 'duotone', from: '#23262B', to: '#FAFAF7' });
});
