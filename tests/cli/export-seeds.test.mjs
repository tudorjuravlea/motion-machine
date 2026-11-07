// Every row of the file check is run against a file known to trip it. A finished film with sound is the control; each
// seed plants one defect in a copy of it, and the row that owns that defect must say so. A seed no row catches fails here.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportPiece } from '../../scripts/export.mjs';
import { buildSound } from '../../scripts/sound.mjs';
import { verifyFile } from '../../scripts/lib/export-qa.mjs';
import { ensurePiece, variant, PATTERNS } from '../../fixtures/sound/setup.mjs';

const FPS = 10;
const NAME = 'kit-smoke-cues-16x9.mp4';
let dir, mp4, tmp, cueAt, seconds;
const ff = (...args) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const AAC = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-metadata:s:a:0', 'handler_name=SoundHandler'];
const V = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
const seedFile = (name) => { const d = join(tmp, name); mkdirSync(d, { recursive: true }); return join(d, NAME); };
const sound = (name, af, ...more) => { const o = seedFile(name); ff('-i', mp4, '-c:v', 'copy', ...(af ? ['-af', af] : []), ...AAC, ...more, o); return o; };
const picture = (name, vf) => { const o = seedFile(name); ff('-i', mp4, '-vf', vf, ...V, '-c:a', 'copy', o); return o; };
const read = (f) => verifyFile(f, { dir, phase: 'final', fps: FPS, sheetBase: join(tmp, 'sheet') });
const row = (r, id) => r.checks.find((c) => c.id === id);
const tripped = (r) => r.checks.filter((c) => c.status === 'FAIL').map((c) => c.id);

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'mm-seeds-'));
  await ensurePiece();
  dir = await variant('qa-seeds', { track: null, beats: null });
  const { manifest, code } = await exportPiece(dir, { fps: FPS, formats: ['16x9'], force: true });
  assert.equal(code, 0);
  mp4 = manifest.files[0].file;
  await buildSound(dir, { patterns: PATTERNS });
  const cues = JSON.parse(readFileSync(join(dir, 'out', 'cues.json'), 'utf8')).cues.filter((c) => c.name !== 'bed');
  cueAt = cues[0].at;
  seconds = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], { encoding: 'utf8' }).stdout);
}, { timeout: 600_000 });

test('the control passes, and a plain re-encode of its sound or its picture passes too', async () => {
  for (const f of [mp4, sound('again-sound'), picture('again-picture', 'null')]) {
    const r = await read(f);
    assert.deepEqual(r.checks.filter((c) => c.status === 'FAIL' || c.evidence.unread).map((c) => [c.id, c.evidence.reason]), [], f);
    assert.equal(r.ok, true, JSON.stringify(r.unread));
  }
});

for (const [name, make, id] of [
  ['sound 300 ms late', () => sound('late', `adelay=300:all=1,atrim=0:${seconds}`), 'QA-SYNC'],
  ['sound 100 ms early', () => sound('early', `atrim=start=0.1,asetpts=PTS-STARTPTS,apad=whole_dur=${seconds}`), 'QA-SYNC'],
  ['another sound on the track', () => { const o = seedFile('wrong'); ff('-i', mp4, '-f', 'lavfi', '-t', String(seconds), '-i', 'anoisesrc=c=pink:a=0.2:r=48000:s=7', '-map', '0:v', '-map', '1:a', '-c:v', 'copy', ...AAC, '-ac', '2', o); return o; }, 'QA-SYNC'],
  ['a dropout inside a cue', () => sound('dropout', `volume=enable='between(t,${cueAt},${cueAt + 0.2})':volume=0`), 'QA-SYNC'],
  ['channels in antiphase', () => sound('antiphase', 'pan=stereo|c0=c0|c1=-1*c0'), 'QA-MONO'],
  ['sound still playing on the last frame', () => { const o = seedFile('abrupt'); ff('-i', mp4, '-f', 'lavfi', '-i', `sine=f=440:r=48000:d=${seconds}`, '-filter_complex', `[1:a]volume=0.3,aformat=channel_layouts=stereo[s];[0:a][s]amix=inputs=2:normalize=0:duration=first[m]`, '-map', '0:v', '-map', '[m]', '-c:v', 'copy', ...AAC, o); return o; }, 'QA-END'],
  ['seven white frames in a second', () => picture('burst', `drawbox=enable='gte(n,2)*lte(n,9)*not(mod(n,2))':x=0:y=0:w=iw:h=ih:color=white:t=fill`), 'QA-FLASH'],
  ['a grey box over the picture for a second', () => picture('box', `drawbox=enable='between(n,${FPS * 2},${FPS * 3 + 1})':x=iw/8:y=ih/8:w=iw*3/4:h=ih*3/4:color=gray:t=fill`), 'QA-DECODE'],
]) {
  test(`seed: ${name} fails ${id}`, async () => {
    const r = await read(make());
    assert.ok(tripped(r).includes(id), `${id} did not trip: ${JSON.stringify(r.checks.map((c) => [c.id, c.status]))}`);
    assert.equal(r.ok, false);
  });
}

for (const [name, make, id] of [
  ['one white frame', () => picture('flash-one', `drawbox=enable='eq(n,20)':x=0:y=0:w=iw:h=ih:color=white:t=fill`), 'QA-FLASH'],
  ['black for two frames', () => picture('flash-two', `drawbox=enable='between(n,20,21)':x=0:y=0:w=iw:h=ih:color=black:t=fill`), 'QA-FLASH'],
]) {
  test(`seed: ${name} warns ${id}`, async () => {
    const r = await read(make());
    assert.equal(row(r, id).status, 'WARN', JSON.stringify(row(r, id)));
  });
}

test('a file with the colour tags stripped fails QA-COLOUR', async () => {
  const o = seedFile('untagged');
  ff('-i', mp4, '-vf', 'setparams=colorspace=unknown:color_primaries=unknown:color_trc=unknown', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'copy', o);
  assert.ok(tripped(await read(o)).includes('QA-COLOUR'));
});
