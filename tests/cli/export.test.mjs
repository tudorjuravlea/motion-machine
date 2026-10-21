// Film export. Three MP4s at the SPEC §12 sizes with explicit bt709 / tv / yuv420p
// tags, a poster and a loop check; `--prove` passes on the fixture and fails when Math.random is
// injected; export refuses while the gate is red or unrun unless --force, which stamps UNCHECKED.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MM, mm, probeVideo, readJson, stampChecked, workCopy } from './cli-helpers.mjs';
import { shareCopy } from '../../scripts/export.mjs';

const SIZES = { '16x9': [1920, 1080], '9x16': [1080, 1920], '1x1': [1080, 1080] };
let w;
before(() => { w = workCopy('export'); });
after(() => w.cleanup());

test('three MP4s with §12 dimensions and explicit bt709 / tv / yuv420p tags; --prove passes', () => {
  stampChecked(w.film);
  const r = mm(['export', w.film, '--fps', '10', '--prove']);
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /prove ok \(16x9\)/);
  const manifest = readJson(join(w.film, 'out', 'export.json'));
  assert.equal(manifest.proved, true);
  assert.deepEqual(manifest.share, { file: 'out/share-copy.txt', source: 'composed' });
  assert.equal(readFileSync(join(w.film, 'out', 'share-copy.txt'), 'utf8'), 'Only time moves things. Same t, same pixels.\ngithub.com/tudorjuravlea/motion-machine\n');
  assert.equal(manifest.files.length, 3);
  for (const [format, [width, height]] of Object.entries(SIZES)) {
    const file = join(w.film, 'out', `kit-smoke-film-${format}.mp4`);
    assert.ok(existsSync(file), `${file} exists`);
    const v = probeVideo(file);
    assert.deepEqual([v.width, v.height], [width, height], format);
    assert.equal(width % 2 + height % 2, 0);
    assert.equal(v.pix_fmt, 'yuv420p');
    assert.equal(v.color_space, 'bt709');
    assert.equal(v.color_range, 'tv');
    assert.equal(v.color_primaries, 'bt709');
    assert.equal(v.color_transfer, 'bt709');
    assert.equal(Number(v.nb_read_frames), 60, `${format}: 6 s at 10 fps`);
    assert.equal(v.comment, null, 'a checked export carries no UNCHECKED stamp');
  }
  assert.ok(existsSync(join(w.film, 'out', 'poster.png')));
  assert.ok(existsSync(join(w.film, 'out', 'loop_check.mp4')));
  assert.ok(manifest.loop.ssim > 0 && manifest.loop.ssim <= 1, `loop SSIM ${manifest.loop.ssim}`);
});

test('--sub N keeps one frame per group: the picture length does not change', () => {
  const r = mm(['export', w.film, '--fps', '10', '--sub', '3', '--formats', '1x1']);
  assert.equal(r.status, 0, r.out);
  const v = probeVideo(join(w.film, 'out', 'kit-smoke-film-1x1.mp4'));
  assert.equal(Number(v.nb_read_frames), 60);
  assert.equal(readJson(join(w.film, 'out', 'export.json')).sub, 3);
});

test('export refuses without a passing check, and --force stamps UNCHECKED', () => {
  const unchecked = workCopy('export-gate');
  try {
    let r = mm(['export', unchecked.film, '--fps', '5', '--formats', '16x9']);
    assert.equal(r.status, 1, r.out);
    assert.match(r.stderr, /out\/check\.json is missing/);
    assert.ok(!existsSync(join(unchecked.film, 'out', 'kit-smoke-film-16x9.mp4')), 'nothing was rendered');

    stampChecked(unchecked.film, 'FAIL');
    r = mm(['export', unchecked.film, '--fps', '5', '--formats', '16x9']);
    assert.equal(r.status, 1, r.out);
    assert.match(r.stderr, /mm check failed: G-TEST/);

    r = mm(['export', unchecked.film, '--fps', '5', '--formats', '16x9', '--force']);
    assert.equal(r.status, 0, r.out);
    const v = probeVideo(join(unchecked.film, 'out', 'kit-smoke-film-16x9.mp4'));
    assert.equal(v.comment, 'UNCHECKED');
    assert.equal(readJson(join(unchecked.film, 'out', 'export.json')).forced, true);
  } finally { unchecked.cleanup(); }
});

test('--prove fails when Math.random is injected into a pattern of a copy of the fixture', () => {
  const bad = workCopy('export-random');
  try {
    const file = join(bad.patterns, 'entrances', 'rise', 'pattern.js');
    const src = readFileSync(file, 'utf8');
    const injected = src.replace('((1 - p) * d).toFixed(3)', '((1 - p) * d + Math.random() * 40).toFixed(3)');
    assert.notEqual(injected, src, 'the injection point exists');
    writeFileSync(file, injected);
    stampChecked(bad.film);
    const r = mm(['export', bad.film, '--fps', '10', '--formats', '16x9', '--prove']);
    assert.equal(r.status, 1, r.out);
    assert.match(r.stdout, /prove FAILED \(16x9\): \d+ of 60 frames differ/);
    assert.equal(readJson(join(bad.film, 'out', 'export.json')).proved, false);
  } finally { bad.cleanup(); }
});

test('--sub defaults to 1 and does not call the gate\'s W-SUB hook; above 1 it does and records the warning', async () => {
  const { exportPiece } = await import('../../scripts/export.mjs');
  stampChecked(w.film);
  const calls = [];
  const subHook = (story, sub) => { calls.push([story.id, sub]); return { id: 'W-SUB', status: 'WARN', evidence: { measured: sub, reason: 'text travels more than 4 px per frame' } }; };
  const common = { fps: 5, formats: ['1x1'], subHook };

  const one = await exportPiece(w.film, common);
  assert.equal(one.manifest.sub, 1, 'the default is 1');
  assert.deepEqual(calls, [], 'no hook call at --sub 1');
  assert.equal(one.manifest.warnings, undefined);

  const three = await exportPiece(w.film, { ...common, sub: 3 });
  assert.deepEqual(calls, [['kit-smoke-film', 3]]);
  assert.deepEqual(three.manifest.warnings, ['W-SUB: text travels more than 4 px per frame']);
  assert.equal(three.manifest.rules[0].status, 'WARN');
  assert.equal(readJson(join(w.film, 'out', 'export.json')).warnings.length, 1, 'the warning is in out/export.json');
  assert.equal(three.code, 0, 'a warning does not fail the export');

  const bad = mm(['export', w.film, '--sub', '0']);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--sub a whole number of at least 1/);
});

// ---- a silent track and GIF export ----
import { spawnSync as spawnProbe } from 'node:child_process';
const streamsOf = (file) => JSON.parse(spawnProbe('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }).stdout);

test('a film with no mix still carries one silent AAC track, which G-LOUD does not take for sound', async () => {
  const r = mm(['export', w.film, '--fps', '10', '--formats', '16x9', '--force']);
  assert.equal(r.status, 0, r.out);
  const mp4 = join(w.film, 'out', 'kit-smoke-film-16x9.mp4');
  const a = streamsOf(existsSync(mp4) ? mp4 : join(w.film, 'out', readJson(join(w.film, 'out', 'export.json')).files?.[0] ?? '')).streams.filter((s) => s.codec_type === 'audio');
  assert.equal(a.length, 1); assert.equal(a[0].codec_name, 'aac'); assert.equal(a[0].tags?.handler_name, 'silent');
  const { hasAudio } = await import('../../scripts/sound.mjs');
  assert.equal(await hasAudio(mp4), false);
});

test('--gif writes a looping GIF at 540 px wide beside the MP4', () => {
  const r = mm(['export', w.film, '--fps', '10', '--formats', '16x9', '--gif', '--force']);
  assert.equal(r.status, 0, r.out);
  const gif = join(w.film, 'out', 'kit-smoke-film-16x9.gif');
  assert.ok(existsSync(gif), r.out);
  const p = streamsOf(gif);
  assert.equal(p.streams[0].codec_name, 'gif'); assert.equal(p.streams[0].width, 540);
  assert.ok(readFileSync(gif).includes(Buffer.from('NETSCAPE2.0')), 'the GIF does not loop');
  assert.ok(readJson(join(w.film, 'out', 'export.json')).gifs?.length === 1);
});

// brag (MIT, restated): every export carries one caption, postable as is. The story's `share` wins;
// otherwise the hook, the last scene's headline and the call to action's link, all copy the story
// already holds. Launch clichés are reported, never rewritten.
const film = (scenes, extra = {}) => ({ id: 'x', kind: 'film', scenes: scenes.map((beats, i) => ({ id: `s${i}`, beats: beats.map((text, k) => ({ at: k, slot: k ? 'sub' : 'headline', text })) })), ...extra });

test('shareCopy: the story\'s share is used as written', () => {
  assert.deepEqual(shareCopy(film([['Hook.']], { share: '  Quillmere plans your week in one tap.  ' })), { text: 'Quillmere plans your week in one tap.', source: 'story', banned: [] });
});

test('shareCopy: composed from the hook, the closing headline and the link, each line a sentence, nothing twice', () => {
  const s = film([['Plans in one tap', 'a sub line'], [null, 'Middle.'], ['Plans in one tap']], { cta: { text: 'Get it', url: 'quillmere.example' } });
  assert.deepEqual(shareCopy(s), { text: 'Plans in one tap.\nquillmere.example', source: 'composed', banned: [] });
  assert.equal(shareCopy(film([['One.'], ['Two!']], { cta: { text: 'Try it now', url: '' } })).text, 'One. Two!\nTry it now.');
});

test('shareCopy: launch clichés are named', () => {
  assert.deepEqual(shareCopy(film([['x']], { share: 'Excited to share how we streamline your workflow!' })).banned, ['excited to share', 'streamline your workflow']);
});
