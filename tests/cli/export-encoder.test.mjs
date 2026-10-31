// `mm export --encoder auto|software|videotoolbox`: the choice is made from ffmpeg's encoder list, falls back
// to software, and is never hardware for --prove; the arguments differ only in the video encoder; and, where
// this ffmpeg has VideoToolbox, a real export through it reads back clean.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';
import { exportPiece } from '../../scripts/export.mjs';
import { ENCODERS, HW_BITS_PER_PIXEL, chooseEncoder, encodeArgs, hasVideoToolbox } from '../../scripts/lib/ffmpeg.mjs';
import { UsageError } from '../../scripts/lib/cli.mjs';

const WITH = ' V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)\n V....D h264_videotoolbox    VideoToolbox H.264 Encoder (codec h264)\n';
const WITHOUT = ' V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)\n V....D h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)\n';
// a copy of the kit-smoke fixtures, so this file and the others that export the film never meet at one export lock
const COPY = join(ROOT, 'fixtures', `.tmp-export-encoder-${process.pid}`);
const PIECE = join(COPY, 'film');
before(() => cpSync(join(ROOT, 'fixtures', 'kit-smoke'), COPY, { recursive: true, filter: (p) => !p.includes('/out') }));
after(() => rmSync(COPY, { recursive: true, force: true }));

test('the encoders are named, and VideoToolbox is read from the encoder list', () => {
  assert.deepEqual(ENCODERS, ['auto', 'software', 'videotoolbox']);
  assert.equal(hasVideoToolbox(WITH), true);
  assert.equal(hasVideoToolbox(WITHOUT), false);
  assert.equal(hasVideoToolbox(''), false);
  assert.equal(hasVideoToolbox(' A....D aac   AAC\n V....D hevc_videotoolbox  VideoToolbox H.265 Encoder\n'), false, 'only the H.264 encoder counts');
});

test('software is the default and is never changed; auto and videotoolbox use the hardware when it is listed, and say why when they cannot', () => {
  assert.deepEqual(chooseEncoder(undefined, { list: WITH }), { requested: 'software', used: 'software', reason: null });
  assert.deepEqual(chooseEncoder('software', { list: WITH }), { requested: 'software', used: 'software', reason: null });
  for (const asked of ['auto', 'videotoolbox']) {
    assert.deepEqual(chooseEncoder(asked, { list: WITH }), { requested: asked, used: 'videotoolbox', reason: null });
    const none = chooseEncoder(asked, { list: WITHOUT });
    assert.equal(none.used, 'software');
    assert.match(none.reason, /lists no h264_videotoolbox encoder/);
  }
});

test('--prove is always software: the proof stays bit-exact', () => {
  for (const asked of ['auto', 'videotoolbox']) {
    const r = chooseEncoder(asked, { list: WITH, prove: true });
    assert.equal(r.used, 'software');
    assert.match(r.reason, /--prove renders in software/);
  }
});

test('a name that is not an encoder is a usage error', () => {
  assert.throws(() => chooseEncoder('nvenc', { list: WITH }), (e) => e instanceof UsageError && /--encoder takes auto, software, videotoolbox, not "nvenc"/.test(e.message));
});

test('the arguments differ only in the video encoder: x264 at CRF 16, or VideoToolbox at a bitrate from the picture size', () => {
  const soft = encodeArgs({ out: 'o.mp4', fps: 30 });
  assert.ok(soft.includes('libx264') && soft.includes('-crf') && soft.includes('slow') && !soft.includes('h264_videotoolbox'));
  const hard = encodeArgs({ out: 'o.mp4', fps: 30, encoder: 'videotoolbox', width: 1080, height: 1920 });
  assert.ok(hard.includes('h264_videotoolbox') && !hard.includes('libx264') && !hard.includes('-crf') && !hard.includes('-preset'));
  assert.equal(hard[hard.indexOf('-b:v') + 1], String(Math.round(1080 * 1920 * 30 * HW_BITS_PER_PIXEL)));
  // everything else, the colour recipe, the placeholder track and the faststart flag, is the same
  const rest = (a) => a.filter((x) => !['libx264', 'h264_videotoolbox'].includes(x));
  for (const flag of ['-colorspace', '-movflags', '+faststart', 'handler_name=silent', '-max_interleave_delta']) { assert.ok(soft.includes(flag) && hard.includes(flag), flag); }
  assert.ok(rest(soft).length > 20 && rest(hard).length > 20);
});

test('--prove with --encoder auto exports in software and says so in export.json', async () => {
  const { manifest } = await exportPiece(PIECE, { fps: 10, formats: ['16x9'], force: true, prove: true, encoder: 'auto' });
  assert.equal(manifest.encoder.used, 'software');
  assert.match(manifest.encoder.note, /--prove renders in software/);
  assert.equal(manifest.files[0].encoder, 'software');
  assert.equal(manifest.proved, true);
});

test('where ffmpeg has VideoToolbox, an export through it is an H.264 file that reads back clean', { skip: !hasVideoToolbox() && 'this ffmpeg has no h264_videotoolbox encoder' }, async () => {
  const { manifest, code } = await exportPiece(PIECE, { fps: 10, formats: ['16x9'], force: true, encoder: 'videotoolbox' });
  assert.equal(code, 0);
  assert.deepEqual({ requested: manifest.encoder.requested, used: manifest.encoder.used }, { requested: 'videotoolbox', used: 'videotoolbox' });
  assert.equal(manifest.files[0].encoder, 'videotoolbox');
  assert.equal(manifest.qa.ok, true, JSON.stringify(manifest.qa));
  const qa = JSON.parse(readFileSync(join(PIECE, 'out', 'export-qa.json'), 'utf8'));
  assert.equal(qa.files[0].checks.find((c) => c.id === 'QA-STREAM').evidence.codec, 'h264');
});
