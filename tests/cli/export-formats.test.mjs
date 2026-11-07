// What a finished file carries and what formats it comes in (scripts/export.mjs, SPEC §8):
//   - the file's tags are the story's, never the clock's: a title, a description (piece, Motion Machine version,
//     the provenance of generated media) and, when the story has a `date`, that date as the creation time; two
//     exports of one piece are byte-identical;
//   - 29.97 is written as 30000/1001;
//   - `--alpha` renders a transparent canvas into VP9 WebM with alpha, `--alpha-mov` also into ProRes 4444, and
//     the read-back reads the alpha channel back (QA-ALPHA): a corner the page left clear, a pixel it drew solid.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, launchBrowser } from '../../scripts/lib/browser.mjs';
import { exportPiece, handoutHtml } from '../../scripts/export.mjs';
import { exportMeta, provenanceOf } from '../../scripts/lib/export-meta.mjs';
import { ALPHA_CLEAR_MAX, ALPHA_SOLID_MIN, frameAt, verifyAlphaFile } from '../../scripts/lib/export-qa.mjs';
import { mm } from './cli-helpers.mjs';

const DAY = new Date(Date.UTC(2024, 0, 2)).toISOString().slice(0, 10);   // a fixed day built, not written (the repository keeps no dated notes); not the epoch, which an MP4 cannot carry

const COPY = join(ROOT, 'fixtures', `.tmp-export-formats-${process.pid}`);
const PIECE = join(COPY, 'film');
const FPS = 10;
let tmp, browser;
const probeTags = (file, entries = 'format_tags') => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', entries, '-of', 'json', file], { encoding: 'utf8' });
  return JSON.parse(r.stdout);
};
const sha = (file) => spawnSync('shasum', ['-a', '256', file], { encoding: 'utf8' }).stdout.split(' ')[0];
const ff = (...args) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const setStory = (patch) => {
  const f = join(PIECE, 'story.json');
  const story = { ...JSON.parse(readFileSync(f, 'utf8')), ...patch };
  for (const [k, v] of Object.entries(patch)) if (v === undefined) delete story[k];
  writeFileSync(f, `${JSON.stringify(story, null, 2)}\n`);
};

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'mm-formats-'));
  cpSync(join(ROOT, 'fixtures', 'kit-smoke'), COPY, { recursive: true, filter: (p) => !p.includes('/out') });
  browser = await launchBrowser();
});
after(async () => { await browser?.close(); rmSync(tmp, { recursive: true, force: true }); rmSync(COPY, { recursive: true, force: true }); });

// ---- metadata ----

test('provenanceOf lists the generated media a piece holds, sorted, by provider, model and kind', () => {
  const dir = join(tmp, 'prov');
  mkdirSync(join(dir, 'assets', 'gen'), { recursive: true });
  writeFileSync(join(dir, 'assets', 'gen', 'b.gen.json'), JSON.stringify({ kind: 'voice', provider: 'elevenlabs', model: 'eleven_multilingual_v2', created: '2026-01-01T00:00:00Z' }));
  writeFileSync(join(dir, 'assets', 'gen', 'a.gen.json'), JSON.stringify({ kind: 'image', provider: 'higgsfield', model: 'soul', created: '2026-02-02T00:00:00Z' }));
  writeFileSync(join(dir, 'assets', 'gen', 'c.gen.json'), JSON.stringify({ kind: 'voice', provider: 'elevenlabs', model: 'eleven_multilingual_v2' }));
  writeFileSync(join(dir, 'assets', 'gen', 'broken.gen.json'), '{');
  assert.equal(provenanceOf(dir), 'elevenlabs/eleven_multilingual_v2 (voice); higgsfield/soul (image)');
  assert.equal(provenanceOf(join(tmp, 'nothing')), '');
});

test('exportMeta: title, a description with the piece, the version and the provenance, and a creation time only when the story dates itself', () => {
  const dir = join(tmp, 'meta');
  mkdirSync(dir, { recursive: true });
  const m = exportMeta(dir, { id: 'my-piece', title: 'My piece' });
  assert.equal(m.title, 'My piece');
  assert.match(m.description, /^Motion Machine \d+\.\d+\.\d+; piece my-piece$/);
  assert.equal(m.createdAt, undefined);
  assert.equal(exportMeta(dir, { id: 'p', title: 't', date: DAY }).createdAt, `${DAY}T00:00:00Z`);
});

test('two exports of one piece are byte-identical, and the file carries the story\'s tags', async () => {
  setStory({ date: DAY });
  const a = (await exportPiece(PIECE, { fps: FPS, formats: ['16x9'], force: true, workers: 1 })).manifest.files[0].file;
  const first = sha(a);
  const tags = probeTags(a).format.tags;
  assert.equal(tags.title, 'kit-smoke film: two scenes joined by a hard cut');
  assert.match(tags.description, /^Motion Machine \d+\.\d+\.\d+; piece kit-smoke-film/);
  assert.match(tags.creation_time, new RegExp(`^${DAY}T00:00:00`));
  assert.equal(tags.comment, 'UNCHECKED', 'the gate stamp keeps the comment tag');
  const b = (await exportPiece(PIECE, { fps: FPS, formats: ['16x9'], force: true, workers: 2 })).manifest.files[0].file;
  assert.equal(sha(b), first, 'the same piece, the same bytes, whatever the clock and the workers');
});

test('a story with no date leaves the creation time out, not at now', async () => {
  setStory({ date: undefined });
  const f = (await exportPiece(PIECE, { fps: FPS, formats: ['16x9'], force: true })).manifest.files[0].file;
  const tags = probeTags(f).format.tags;
  assert.equal(tags.creation_time, undefined);
  assert.ok(tags.title);
});

// ---- exact rates ----

test('--fps 29.97 is written as 30000/1001 and the read-back says so', async () => {
  setStory({ date: undefined });
  const { manifest } = await exportPiece(PIECE, { fps: 29.97, formats: ['16x9'], force: true });
  const f = manifest.files[0].file;
  const v = probeTags(f, 'stream=r_frame_rate,avg_frame_rate').streams[0];
  assert.equal(v.r_frame_rate, '30000/1001');
  assert.equal(manifest.fps, 30000 / 1001);
  assert.equal(manifest.qa.ok, true, JSON.stringify(manifest.qa));
  const qa = JSON.parse(readFileSync(join(PIECE, 'out', 'export-qa.json'), 'utf8')).files[0].checks.find((c) => c.id === 'QA-FPS');
  assert.equal(qa.status, 'PASS');
  assert.equal(qa.evidence.name, '29.97');
});

// ---- transparent exports ----

let alpha;
test('--alpha writes a VP9 WebM with alpha, and --alpha-mov a ProRes 4444 .mov; no MP4, and the read-back reads the alpha', async () => {
  setStory({ date: DAY });
  const run = await exportPiece(PIECE, { fps: FPS, formats: ['16x9'], force: true, alpha: true, alphaMov: true });
  alpha = run.manifest.files;
  const names = alpha.map((f) => f.file.split('/').pop()).sort();
  assert.deepEqual(names, ['kit-smoke-film-16x9.mov', 'kit-smoke-film-16x9.webm']);
  assert.ok(!existsSync(join(PIECE, 'out', 'kit-smoke-film-16x9.mp4')) || alpha.every((f) => !f.file.endsWith('.mp4')), 'no MP4 is listed for an alpha export');
  const webm = alpha.find((f) => f.file.endsWith('.webm')).file, mov = alpha.find((f) => f.file.endsWith('.mov')).file;
  const w = probeTags(webm, 'stream=codec_name,pix_fmt:stream_tags=alpha_mode').streams[0];
  assert.equal(w.codec_name, 'vp9');
  assert.equal(w.pix_fmt, 'yuv420p', 'ffprobe\'s native decoder shows the colour plane; the alpha rides beside it');
  assert.equal(w.tags?.alpha_mode ?? w.tags?.ALPHA_MODE, '1');
  const m = probeTags(mov, 'stream=codec_name,profile,pix_fmt').streams[0];
  assert.equal(m.codec_name, 'prores');
  assert.equal(m.profile, '4444');
  assert.match(m.pix_fmt, /^yuva444p/);
  assert.equal(run.manifest.qa.ok, true, JSON.stringify(run.manifest.qa));
  const report = JSON.parse(readFileSync(join(PIECE, 'out', 'export-qa.json'), 'utf8'));
  for (const f of report.files) {
    const row = f.checks.find((c) => c.id === 'QA-ALPHA');
    assert.equal(row?.status, 'PASS', `${f.file}: ${JSON.stringify(row)}`);
    assert.ok(row.evidence.corner.file <= ALPHA_CLEAR_MAX && row.evidence.solid.file >= ALPHA_SOLID_MIN);
  }
});

test('the alpha channel is really in the file: a corner decodes clear and a drawn pixel decodes solid', () => {
  const webm = alpha.find((f) => f.file.endsWith('.webm'));
  const last = webm.frames - 1;
  const d = frameAt(webm.file, last, webm.width, webm.height, { decoder: 'libvpx-vp9' });
  assert.ok(d, 'the frame decodes');
  assert.ok(d.data[3] <= ALPHA_CLEAR_MAX, `corner alpha ${d.data[3]}`);
  let solid = 0;
  for (let i = 3; i < d.data.length; i += 4) if (d.data[i] >= ALPHA_SOLID_MIN) solid++;
  assert.ok(solid > 500, `${solid} solid samples`);
});

test('two alpha exports of one piece are byte-identical', async () => {
  const again = (await exportPiece(PIECE, { fps: FPS, formats: ['16x9'], force: true, alpha: true, alphaMov: true })).manifest.files;
  for (const f of alpha) assert.equal(sha(again.find((g) => g.file === f.file).file), sha(f.file), f.file);
});

test('QA-ALPHA fails a WebM that has lost its alpha, and a canvas that stayed opaque', async () => {
  const flat = join(tmp, 'flat');
  mkdirSync(flat, { recursive: true });
  const file = join(flat, 'kit-smoke-film-16x9.webm');
  ff('-f', 'lavfi', '-i', 'color=c=white:s=1920x1080:r=10', '-t', '6', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-b:v', '0', '-crf', '40', file);
  const r = await verifyAlphaFile(file, { dir: PIECE, fps: FPS, phase: 'export', browser });
  const row = r.checks.find((c) => c.id === 'QA-ALPHA');
  assert.equal(row.status, 'FAIL', JSON.stringify(row));
  assert.match(row.evidence.reason, /alpha/);
});

test('--alpha refuses a deck, --gif and a hardware encoder in one line, before anything is drawn', async () => {
  await assert.rejects(() => exportPiece(PIECE, { fps: FPS, formats: ['16x9'], force: true, alpha: true, gif: true }), /--alpha.*--gif/);
  await assert.rejects(() => exportPiece(PIECE, { fps: FPS, formats: ['16x9'], force: true, alpha: true, encoder: 'videotoolbox' }), /--alpha.*software/);
  await assert.rejects(() => exportPiece(join(COPY, 'deck'), { fps: FPS, force: true, alpha: true }), /--alpha is for films/);
});

test('the CLI takes --alpha and --alpha-mov, and its help lists them', () => {
  const help = mm(['export', '--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--alpha\b/);
  assert.match(help.stdout, /--alpha-mov/);
});

test('the handout prints the voice-over as shown: pronunciation markers resolved to their display, cue markers gone', () => {
  const story = { title: 'T', scenes: [{ id: 'a', say: 'Use the [API](ay pee eye) <<hero>>now.', presses: 1 }] };
  const html = handoutHtml({ story, style: {}, dir: PIECE, pngs: [Buffer.from('x'), Buffer.from('y')], rests: [0, 1], sceneOf: () => story.scenes[0], viewport: { width: 1920, height: 1080 } });
  assert.match(html, /<div class="say">Use the API now\.<\/div>/);
  assert.ok(!html.includes('ay pee eye') && !html.includes('<<'));
});
