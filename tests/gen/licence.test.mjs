// The asset licence ledger (SPEC §8): assets/<name>.licence.json beside what MM did not draw. Pure reading and
// writing of records, the allowlist, which story references are media, and the credits a record asks for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allowedLicence, assetsIn, auditAssets, capturedRecord, creditsFor, generatedRecord, recordPaths, writeLicence } from '../../scripts/lib/licence.mjs';

const DAY = new Date(0).toISOString().slice(0, 10);   // any fixed day: a record's retrieval date

const piece = () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-licence-'));
  mkdirSync(join(dir, 'assets', 'gen'), { recursive: true });
  mkdirSync(join(dir, 'assets', 'rec'), { recursive: true });
  return dir;
};
const touch = (dir, rel) => { mkdirSync(join(dir, rel, '..'), { recursive: true }); writeFileSync(join(dir, rel), 'x'); };
const put = (dir, rel, record) => writeFileSync(join(dir, rel), JSON.stringify(record));

test('the allowlist: own, generated, CC0, CC-BY-<version>, public domain; anything else is outside it', () => {
  for (const ok of ['own', 'generated', 'CC0', 'CC0-1.0', 'cc0-1.0', 'public domain', 'Public-Domain', 'CC-BY-4.0', 'CC-BY-3.0', 'cc-by-2.5']) assert.equal(allowedLicence(ok), true, ok);
  for (const no of ['CC-BY-SA-4.0', 'CC-BY-NC-4.0', 'CC-BY-ND-4.0', 'third-party, ask', 'unknown', 'MIT', 'all rights reserved', '', undefined, 4]) assert.equal(allowedLicence(no), false, String(no));
});

test('which story strings are assets MM did not draw: media files and frame-sequence folders, not data', () => {
  const story = { scenes: [{ beats: [
    { asset: 'assets/photo.png' }, { asset: 'assets/rec/' }, { src: 'assets/gen/vo.mp3' }, { words: 'assets/gen/vo.words.json' }, { beats: 'assets/beats.json' },
    { logo: 'assets/mark.svg' }, { x: 'https://example.com/assets/a.png' }, { x: 'assets/notes.md' }, { x: 'assets/site/' },
  ] }], audio: { track: 'assets/audio/track.wav' } };
  assert.deepEqual(assetsIn(story), ['assets/audio/track.wav', 'assets/gen/vo.mp3', 'assets/mark.svg', 'assets/photo.png', 'assets/rec/', 'assets/site/']);
});

test('a reference finds its record beside it, then by the folder it lives in', () => {
  assert.deepEqual(recordPaths('assets/photo.png'), ['assets/photo.licence.json']);
  assert.deepEqual(recordPaths('assets/rec/'), ['assets/rec.licence.json', 'assets/gen/rec.licence.json']);
  assert.deepEqual(recordPaths('assets/gen/hero.png'), ['assets/gen/hero.licence.json']);
  assert.deepEqual(recordPaths('assets/audio/track.wav'), ['assets/audio/track.licence.json', 'assets/audio.licence.json']);
  assert.deepEqual(recordPaths('assets/site/page-1.jpg'), ['assets/site/page-1.licence.json', 'assets/site.licence.json']);
});

test('auditAssets: an asset with no record, an unreadable record, a licence outside the allowlist, each named; own and generated pass', () => {
  const dir = piece();
  for (const f of ['assets/a.png', 'assets/b.png', 'assets/c.png', 'assets/d.png', 'assets/gen/e.png']) touch(dir, f);
  put(dir, 'assets/a.licence.json', { source: 'own', licence: 'own' });
  writeFileSync(join(dir, 'assets/b.licence.json'), '{ not json');
  put(dir, 'assets/c.licence.json', { source: 'https://x.example/c', licence: 'CC-BY-NC-4.0' });
  put(dir, 'assets/gen/e.licence.json', generatedRecord({ provider: 'kie', model: 'seedream/4.5-edit' }));
  const story = { scenes: [{ x: ['assets/a.png', 'assets/b.png', 'assets/c.png', 'assets/d.png', 'assets/gen/e.png', 'assets/missing.png'] }] };
  const found = auditAssets({ dir, story });
  assert.deepEqual(found.map((f) => [f.asset, f.problem]), [['assets/b.png', 'unreadable'], ['assets/c.png', 'licence'], ['assets/d.png', 'missing']]);
  assert.match(found[1].detail, /CC-BY-NC-4\.0/);
});

test('licences.accepted lists an asset or a licence the person accepted for this piece', () => {
  const dir = piece();
  for (const f of ['assets/c.png', 'assets/d.png', 'assets/f.png']) touch(dir, f);
  put(dir, 'assets/c.licence.json', { source: 'https://x.example/c', licence: 'CC-BY-SA-4.0' });
  put(dir, 'assets/f.licence.json', { source: 'https://x.example/f', licence: 'third-party, ask' });
  const story = { scenes: [['assets/c.png', 'assets/d.png', 'assets/f.png']], licences: { accepted: ['assets/d.png', 'cc-by-sa-4.0'] } };
  assert.deepEqual(auditAssets({ dir, story }).map((f) => f.asset), ['assets/f.png']);
});

test('one record covers a frame-sequence folder and every file in it; it is reported once', () => {
  const dir = piece();
  touch(dir, 'assets/rec/f-0001.jpg');
  const story = { scenes: [['assets/rec/', 'assets/rec/f-0001.jpg']] };
  assert.equal(auditAssets({ dir, story }).length, 2, 'no record: the folder and the file in it are both named');
  put(dir, 'assets/rec.licence.json', { source: 'own', licence: 'own' });
  assert.deepEqual(auditAssets({ dir, story }), []);
});

test('writeLicence writes the fields in order and the generated and captured records say what they are', () => {
  const dir = piece();
  const g = generatedRecord({ provider: 'higgsfield', model: 'seedance_2_5', retrieved: DAY });
  assert.equal(g.licence, 'generated');
  assert.equal(g.provider, 'higgsfield');
  assert.equal(g.model, 'seedance_2_5');
  assert.equal(g.providerPage, 'https://higgsfield.ai');
  assert.equal(g.retrieved, DAY);
  const c = capturedRecord({ url: 'https://shop.example/p?token=SECRET#frag', retrieved: DAY });
  assert.equal(c.licence, 'third-party, ask');
  assert.equal(c.source, 'https://shop.example/p', 'no query or fragment in the record');
  writeLicence(dir, 'assets/site.licence.json', c);
  const back = JSON.parse(readFileSync(join(dir, 'assets/site.licence.json'), 'utf8'));
  assert.deepEqual(Object.keys(back).slice(0, 3), ['source', 'licence', 'licenceUrl']);
  assert.ok(!readFileSync(join(dir, 'assets/site.licence.json'), 'utf8').includes('SECRET'));
  assert.equal(allowedLicence(c.licence), false, 'a captured page needs a person to say yes');
});

test('creditsFor: CC-BY assets and any record that carries a credit, once each, from the ledger', () => {
  const dir = piece();
  for (const f of ['assets/a.png', 'assets/b.png', 'assets/c.png', 'assets/d.png']) touch(dir, f);
  put(dir, 'assets/a.licence.json', { source: 'https://commons.example/a', licence: 'CC-BY-4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', author: 'Ana Pop', credit: 'Photo: Ana Pop, CC BY 4.0' });
  put(dir, 'assets/b.licence.json', { source: 'https://commons.example/b', licence: 'CC-BY-3.0', author: 'Bo Li' });
  put(dir, 'assets/c.licence.json', { source: 'own', licence: 'own' });
  put(dir, 'assets/d.licence.json', { source: 'https://x.example/d', licence: 'CC0-1.0', credit: 'Thanks to the archive' });
  const story = { scenes: [['assets/a.png', 'assets/b.png', 'assets/c.png', 'assets/d.png', 'assets/a.png']] };
  assert.deepEqual(creditsFor({ dir, story }).map((c) => [c.asset, c.text]), [
    ['assets/a.png', 'Photo: Ana Pop, CC BY 4.0'],
    ['assets/b.png', 'Bo Li, CC-BY-3.0, https://commons.example/b'],
    ['assets/d.png', 'Thanks to the archive'],
  ]);
});
