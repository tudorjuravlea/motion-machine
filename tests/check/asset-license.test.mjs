// W-ASSET-LICENSE (SPEC §7, §8): a used asset MM did not draw has a licence record on the allowlist, or the
// story accepts it. Built by the test: a copy of the base film with one imported picture. A warning never blocks.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NEG, gate, row, warnsOnly } from './_harness.mjs';

const DAY = new Date(0).toISOString().slice(0, 10);   // any fixed day: a record's retrieval date

const run = gate();
const dir = join(NEG, '_base', `.tmp-assetlicence-${process.pid}`);
const storyFile = join(dir, 'story.json');
const licence = join(dir, 'assets', 'photo.licence.json');
const setStory = (patch) => writeFileSync(storyFile, JSON.stringify({ ...JSON.parse(readFileSync(join(NEG, '_base', 'film', 'story.json'), 'utf8')), ...patch }, null, 2));
let base;

before(() => {
  cpSync(join(NEG, '_base', 'film'), dir, { recursive: true, filter: (s) => !s.endsWith('/out') });
  base = JSON.parse(readFileSync(storyFile, 'utf8'));
  base.scenes[0].beats[0].asset = 'assets/photo.png';
  writeFileSync(storyFile, JSON.stringify(base, null, 2));
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'assets', 'photo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
});
after(() => rmSync(dir, { recursive: true, force: true }));
const gateRow = async () => row(await run(dir, { only: ['W-ASSET-LICENSE'] }), 'W-ASSET-LICENSE');

test('a used picture with no record warns, naming it and the file to write', async () => {
  rmSync(licence, { force: true });
  const r = await gateRow();
  assert.equal(r.status, 'WARN');
  assert.deepEqual(r.evidence.measured, ['assets/photo.png']);
  assert.match(r.evidence.reason, /assets\/photo\.png: no record: write assets\/photo\.licence\.json/);
});

test('a record on the allowlist passes', async () => {
  writeFileSync(licence, JSON.stringify({ source: 'https://commons.example/p', licence: 'CC-BY-4.0', author: 'A', retrieved: DAY }));
  assert.equal((await gateRow()).status, 'PASS');
});

test('a licence outside the allowlist warns; the story\'s licences.accepted silences it, by asset or by licence', async () => {
  writeFileSync(licence, JSON.stringify({ source: 'https://shop.example/p', licence: 'third-party, ask' }));
  const r = await gateRow();
  assert.equal(r.status, 'WARN');
  assert.match(r.evidence.reason, /third-party, ask/);
  writeFileSync(storyFile, JSON.stringify({ ...base, licences: { accepted: ['assets/photo.png'] } }, null, 2));
  assert.equal((await gateRow()).status, 'PASS');
  writeFileSync(storyFile, JSON.stringify({ ...base, licences: { accepted: ['Third-Party, Ask'] } }, null, 2));
  assert.equal((await gateRow()).status, 'PASS');
  writeFileSync(storyFile, JSON.stringify(base, null, 2));
});

test('in a whole gate run it is the only finding, and a warning never blocks (exit 0)', async () => {
  writeFileSync(licence, JSON.stringify({ source: 'https://shop.example/p', licence: 'third-party, ask' }));
  warnsOnly(await run(dir), 'W-ASSET-LICENSE');
});

test('a piece that uses no media asset passes', async () => {
  const res = await run(join(NEG, '_base', 'film'), { only: ['W-ASSET-LICENSE'] });
  assert.equal(row(res, 'W-ASSET-LICENSE').status, 'PASS');
});
