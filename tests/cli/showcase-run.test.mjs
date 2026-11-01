// mm showcase end to end: a short portrait recording becomes a phone film that passes the gate, with the
// hero page beside it; a second run writes the piece again (here as a contact sheet); a folder it did not
// write is refused.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, mm } from './cli-helpers.mjs';

const work = join(ROOT, `.tmp-cli-showcase-run-${process.pid}`);
const clip = join(work, 'app.mp4'), piece = join(work, 'film');
const TIMEOUT = 900_000;

before(() => {
  rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x223344:s=390x844:d=3,drawbox=x=40:y=120:w=120:h=120:color=white:t=fill:enable=between(t\\,1\\,2)', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip]);
  assert.equal(r.status, 0, String(r.stderr));
});
after(() => rmSync(work, { recursive: true, force: true }));

test('a recording becomes a checked phone film and a hero page, in one command', { timeout: TIMEOUT }, () => {
  const r = mm(['showcase', clip, '--duration', '2', '--fps', '10', '--html', '--piece', piece], { timeout: TIMEOUT });
  assert.equal(r.status, 0, r.out);
  const story = JSON.parse(readFileSync(join(piece, 'story.json'), 'utf8'));
  assert.equal(story.generator, 'scripts/showcase.mjs');
  assert.equal(story.scenes[0].beats[0].screen, undefined, 'no zooms unless --zoom');
  const mp4 = join(piece, 'out', `${story.id}-9x16.mp4`);
  const p = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', mp4], { encoding: 'utf8' }).stdout);
  assert.deepEqual([p.streams[0].width, p.streams[0].height], [1080, 1920]);
  assert.ok(Math.abs(Number(p.format.duration) - 2) < 0.15, p.format.duration);
  assert.match(r.stdout, new RegExp(`wrote ${mp4.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`));
  const page = readFileSync(join(piece, 'out', 'hero.html'), 'utf8');
  assert.ok(page.includes('data:video/mp4;base64,'));
  assert.ok(existsSync(join(piece, 'assets', 'rec.licence.json')));
});

test('a second run writes the piece again; --stills makes a contact sheet instead of the film', { timeout: TIMEOUT }, () => {
  const r = mm(['showcase', clip, '--duration', '2', '--stills', '3', '--look', 'still', '--piece', piece], { timeout: TIMEOUT });
  assert.equal(r.status, 0, r.out);
  assert.ok(existsSync(join(piece, 'out', 'stills.jpg')));
  assert.ok(!existsSync(join(piece, 'out', 'hero.html')), 'the earlier output went with the piece');
  assert.equal(JSON.parse(readFileSync(join(piece, 'story.json'), 'utf8')).scenes[0].beats[0].params.move, 'still');
});

test('a folder mm showcase did not write is left alone', () => {
  const other = join(work, 'mine');
  mkdirSync(other, { recursive: true });
  writeFileSync(join(other, 'story.json'), '{"id":"mine"}');
  const r = mm(['showcase', clip, '--piece', other]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.stderr, /not written by mm showcase/);
  assert.ok(existsSync(join(other, 'story.json')));
});
