// Sounds found on Openverse (SPEC §9): the licence rules, the record a fetched sound carries, the credits it asks
// for, and the three things W-SAMPLE-LICENSE adds for an Openverse record: a licence outside what the piece
// offers, a file that is no longer the bytes the record hashed, and one recording under two licences. All from
// fixtures written by hand; no request is made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_LICENCES, classify, offered, recordClass, verdict } from '../../scripts/lib/sound-licence.mjs';
import { recordFrom, searchUrl } from '../../scripts/lib/openverse.mjs';
import wSample from '../../scripts/check/W-SAMPLE-LICENSE.mjs';
import { main as credits } from '../../scripts/credits.mjs';
import { auditAssets, creditsFor } from '../../scripts/lib/licence.mjs';
import { validators } from '../../scripts/lib/validate.mjs';
import { ID, ids, item } from '../../fixtures/sound/openverse.mjs';

const BYTES = Buffer.from('RIFF....WAVEfmt this stands for a sound');
const sha1 = (b) => createHash('sha1').update(b).digest('hex');
const DAY = new Date(0).toISOString().slice(0, 10);

test('classify: CC0, public domain and CC BY 2.0 to 4.0 are free; NC, ND, SA, Sampling+ and CC BY 1.0 are known but not free; nothing else is known', () => {
  for (const [license, license_version] of [['cc0', '1.0'], ['pdm', '1.0'], ['by', '2.0'], ['by', '2.5'], ['by', '3.0'], ['by', '4.0'], ['CC0', '1.0'], [' by ', '4.0']]) {
    const c = classify({ license, license_version });
    assert.equal(c.free, true, `${license} ${license_version}`);
    assert.equal(c.known, true);
  }
  for (const [license, license_version] of [['by-nc', '4.0'], ['by-nd', '4.0'], ['by-sa', '3.0'], ['by-nc-sa', '4.0'], ['by-nc-nd', '2.0'], ['sampling+', '1.0'], ['nc-sampling+', '1.0'], ['by', '1.0'], ['by', null]]) {
    const c = classify({ license, license_version });
    assert.equal(c.known, true, license);
    assert.equal(c.free, false, `${license} ${license_version}`);
    assert.ok(c.reason.length > 10, c.reason);
  }
  for (const bad of [{}, { license: null }, { license: '' }, { license: 'custom' }, { license: 'gpl', license_version: '3' }, { license: 'by-nc-sa-plus' }]) {
    const c = classify(bad);
    assert.equal(c.known, false, JSON.stringify(bad));
    assert.equal(c.free, false);
  }
  assert.match(classify({ license: 'by-nc', license_version: '4.0' }).reason, /NonCommercial/);
  assert.match(classify({ license: 'by-nd', license_version: '4.0' }).reason, /NoDerivatives/);
  assert.match(classify({ license: 'by-sa', license_version: '4.0' }).reason, /ShareAlike/);
  assert.match(classify({ license: 'sampling+', license_version: '1.0' }).reason, /Sampling/);
  assert.match(classify({}).reason, /no licen[cs]e/i);
});

test('offered: the default is cc0, pdm and by; the style narrows it; the story widens it; the story\'s names are the only way past a refusal', () => {
  assert.deepEqual(DEFAULT_LICENCES, ['cc0', 'pdm', 'by']);
  assert.deepEqual([...offered({}, {}).codes], ['cc0', 'pdm', 'by']);
  assert.deepEqual([...offered({ sound: { licences: ['cc0'] } }, {}).codes], ['cc0']);
  assert.deepEqual([...offered({ sound: { licences: ['cc0'] } }, { audio: { acceptLicences: ['by-sa'] } }).codes], ['cc0', 'by-sa']);

  const plain = offered({}, {});
  assert.equal(verdict({ license: 'cc0', license_version: '1.0' }, plain).ok, true);
  assert.equal(verdict({ license: 'by', license_version: '4.0' }, plain).ok, true);
  assert.equal(verdict({ license: 'by-sa', license_version: '4.0' }, plain).ok, false);
  assert.equal(verdict({ license: 'by-sa', license_version: '4.0' }, offered({}, { audio: { acceptLicences: ['by-sa'] } })).ok, true);
  assert.equal(verdict({ license: 'by-sa', license_version: '4.0' }, offered({}, { audio: { acceptLicences: ['by-sa'] } })).accepted, true);
  const narrow = verdict({ license: 'by', license_version: '4.0' }, offered({ sound: { licences: ['cc0', 'pdm'] } }, {}));
  assert.equal(narrow.ok, false);
  assert.match(narrow.reason, /sound\.licences/);
  assert.equal(verdict({}, offered({}, { audio: { acceptLicences: ['by-sa', 'by-nc'] } })).ok, false, 'no licence field: never accepted');
  assert.equal(verdict({ license: 'custom' }, offered({}, { audio: { acceptLicences: ['custom'] } })).ok, false, 'an unknown licence cannot be accepted by name');
});

test('recordClass reads a record\'s licence back into the same classification', () => {
  const cases = [
    [{ licence: 'CC0-1.0', licenceVersion: '1.0' }, 'cc0', true], [{ licence: 'public domain', licenceVersion: '1.0' }, 'pdm', true],
    [{ licence: 'CC-BY-4.0', licenceVersion: '4.0' }, 'by', true], [{ licence: 'CC-BY-3.0' }, 'by', true],
    [{ licence: 'CC-BY-SA-4.0', licenceVersion: '4.0' }, 'by-sa', false], [{ licence: 'CC-BY-NC-ND-2.0', licenceVersion: '2.0' }, 'by-nc-nd', false],
    [{ licence: 'CC-BY-1.0', licenceVersion: '1.0' }, 'by', false], [{ licence: 'custom terms' }, null, false], [{}, null, false],
  ];
  for (const [rec, code, free] of cases) {
    const c = recordClass(rec);
    assert.equal(c.code ?? null, code, JSON.stringify(rec));
    assert.equal(c.free, free, JSON.stringify(rec));
  }
});

test('searchUrl: the query a search makes', () => {
  const u = new URL(searchUrl({ q: 'door slam', licences: ['cc0', 'by'], category: 'sound_effect', length: ['shortest', 'short'], pageSize: 7, page: 3, extension: ['wav'] }));
  assert.equal(u.origin + u.pathname, 'https://api.openverse.org/v1/audio/');
  assert.deepEqual(Object.fromEntries(u.searchParams), { q: 'door slam', license: 'cc0,by', category: 'sound_effect', length: 'shortest,short', page_size: '7', page: '3', extension: 'wav', filter_dead: 'true', mature: 'false' });
});

test('recordFrom: every field of the detail the record promises, in the sample schema\'s shape', () => {
  const detail = item({ license: 'by', license_version: '4.0' });
  const rec = recordFrom(detail, { sha1: sha1(BYTES), retrieved: DAY });
  assert.deepEqual(Object.keys(rec).slice(0, 3), ['source', 'licence', 'author'], 'the three required fields lead');
  assert.equal(rec.source, 'openverse');
  assert.equal(rec.openverseId, ID);
  assert.equal(rec.licence, 'CC-BY-4.0');
  assert.equal(rec.licenceVersion, '4.0');
  assert.equal(rec.licenceUrl, detail.license_url);
  assert.equal(rec.creator, detail.creator);
  assert.equal(rec.author, detail.creator);
  assert.equal(rec.creatorUrl, detail.creator_url);
  assert.equal(rec.landingUrl, detail.foreign_landing_url);
  assert.equal(rec.attribution, detail.attribution);
  assert.equal(rec.retrieved, DAY);
  assert.equal(rec.sha1, sha1(BYTES));
  assert.equal(rec.title, 'Door slam');
  const v = validators();
  assert.ok(v.soundSample(rec), JSON.stringify(v.soundSample.errors));
  const anon = recordFrom(item({ creator: null, creator_url: null }), { sha1: sha1(BYTES), retrieved: DAY });
  assert.equal(anon.author, 'unknown', 'the schema needs an author');
  assert.ok(v.soundSample(anon), JSON.stringify(v.soundSample.errors));
});

/** A piece with a mapped sample whose record is `record`; extras are more records beside it. */
function piece({ record, bytes = BYTES, extras = {}, story = {}, style = {}, mapped = 'assets/sounds/door.wav' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mm-openverse-'));
  mkdirSync(join(dir, 'assets', 'sounds'), { recursive: true });
  writeFileSync(join(dir, 'assets', 'sounds', 'door.wav'), bytes);
  if (record) writeFileSync(join(dir, 'assets', 'sounds', 'door.json'), JSON.stringify(record));
  for (const [name, r] of Object.entries(extras)) writeFileSync(join(dir, 'assets', 'sounds', `${name}.json`), JSON.stringify(r));
  const s = { audio: { samples: { tick: mapped } }, scenes: [], ...story, ...(story.audio ? { audio: { samples: { tick: mapped }, ...story.audio } } : {}) };
  writeFileSync(join(dir, 'story.json'), JSON.stringify(s));
  return { dir, ctx: { dir, story: s, style } };
}
const recordOf = (over = {}, detail = {}) => ({ ...recordFrom(item({ license: 'by', license_version: '4.0', ...detail }), { sha1: sha1(BYTES), retrieved: DAY }), ...over });

test('W-SAMPLE-LICENSE: an Openverse record in the allowed set, with its bytes, passes', async () => {
  for (const detail of [{ license: 'cc0' }, { license: 'pdm' }, { license: 'by', license_version: '3.0' }]) {
    const r = await wSample(piece({ record: recordOf({}, detail) }).ctx);
    assert.equal(r.status, 'PASS', JSON.stringify(detail) + JSON.stringify(r.evidence));
  }
});

test('W-SAMPLE-LICENSE: an Openverse record whose licence is outside the allowed set warns, unless the story accepts it', async () => {
  const nc = recordOf({}, { license: 'by-nc', license_version: '4.0' });
  const w = await wSample(piece({ record: nc }).ctx);
  assert.equal(w.status, 'WARN');
  assert.match(w.evidence.reason, /door\.wav.*CC-BY-NC-4\.0.*NonCommercial/);
  assert.equal(w.evidence.selector, 'tick');
  const ok = await wSample(piece({ record: nc, story: { audio: { acceptLicences: ['by-nc'] } } }).ctx);
  assert.equal(ok.status, 'PASS', 'named by the story');
  const other = await wSample(piece({ record: nc, story: { audio: { acceptLicences: ['by-sa'] } } }).ctx);
  assert.equal(other.status, 'WARN', 'a different name does not cover it');
  const narrowed = await wSample(piece({ record: recordOf(), style: { sound: { licences: ['cc0', 'pdm'] } } }).ctx);
  assert.equal(narrowed.status, 'WARN', 'CC BY outside the style\'s sound.licences');
  assert.match(narrowed.evidence.reason, /sound\.licences/);
  const none = await wSample(piece({ record: recordOf({ licence: 'custom terms', licenceVersion: undefined }) }).ctx);
  assert.equal(none.status, 'WARN', 'a licence this does not recognise');
});

test('W-SAMPLE-LICENSE: an Openverse record whose sha1 no longer matches the file warns', async () => {
  const same = await wSample(piece({ record: recordOf() }).ctx);
  assert.equal(same.status, 'PASS');
  const changed = await wSample(piece({ record: recordOf(), bytes: Buffer.concat([BYTES, Buffer.from('edited')]) }).ctx);
  assert.equal(changed.status, 'WARN');
  assert.match(changed.evidence.reason, /door\.wav.*sha1/);
});

test('W-SAMPLE-LICENSE: one recording under two licences across records warns, even when the other record is not mapped', async () => {
  const other = recordOf({ licence: 'CC-BY-NC-4.0', licenceVersion: '4.0' });
  const w = await wSample(piece({ record: recordOf(), extras: { 'door-copy': other } }).ctx);
  assert.equal(w.status, 'WARN');
  assert.match(w.evidence.reason, new RegExp(`${ID}.*two licences|two licences.*${ID}`));
  const same = await wSample(piece({ record: recordOf(), extras: { 'door-copy': recordOf() } }).ctx);
  assert.equal(same.status, 'PASS', 'the same licence twice is one licence');
  const different = await wSample(piece({ record: recordOf(), extras: { 'other-sound': recordOf({ openverseId: ids[1], licence: 'CC0-1.0', licenceVersion: '1.0' }) } }).ctx);
  assert.equal(different.status, 'PASS', 'two recordings may differ');
});

test('W-SAMPLE-LICENSE: a record that is not from Openverse is judged as before, and nothing mapped is still SKIP', async () => {
  const own = await wSample(piece({ record: { source: 'own recording', licence: 'own recording', author: 'me' } }).ctx);
  assert.equal(own.status, 'PASS');
  const none = await wSample({ dir: mkdtempSync(join(tmpdir(), 'mm-openverse-none-')), story: {}, style: {} });
  assert.equal(none.status, 'SKIP');
});

test('mm credits prints the attribution line of each Openverse sound, CC0 too, fenced as material', async () => {
  const { dir } = piece({ record: recordOf() });
  const out = [], err = [];
  const code = await credits([dir], { out: (s) => out.push(s), err: (s) => err.push(s) });
  assert.equal(code, 0, err.join('\n'));
  const text = out.join('\n');
  assert.match(text, /assets\/sounds\/door\.wav/);
  assert.ok(text.includes('Door slam') && text.includes('a recordist') && text.includes('CC BY 4.0'), text);
  assert.match(text, /<<<MATERIAL:credit/);
  assert.equal(err.length, 0, 'the sound\'s record is found: it is not reported as unrecorded');

  const cc0 = piece({ record: recordOf({}, { license: 'cc0' }) });
  const o2 = [];
  await credits([cc0.dir], { out: (s) => o2.push(s), err: () => {} });
  assert.match(o2.join('\n'), /CC0/);

  const json = [];
  await credits([dir, '--json'], { out: (s) => json.push(s), err: () => {} });
  const parsed = JSON.parse(json.join(''));
  assert.equal(parsed.credits.length, 1);
  assert.equal(parsed.credits[0].text, recordOf().attribution);
  assert.deepEqual(parsed.unrecorded, []);
});

test('creditsFor reads the sounds a style maps too', () => {
  const { dir } = piece({ record: recordOf() });
  const got = creditsFor({ dir, story: { scenes: [] }, style: { sound: { samples: { tick: 'assets/sounds/door.wav' } } } });
  assert.equal(got.length, 1);
  assert.equal(got[0].text, recordOf().attribution);
});

test('the asset ledger reads a sound\'s record (x.json beside x.wav): a licence it allows is not reported missing; the story\'s acceptLicences covers the rest', () => {
  const { dir, ctx } = piece({ record: recordOf() });
  assert.deepEqual(auditAssets({ dir, story: ctx.story }), []);
  const nc = piece({ record: recordOf({}, { license: 'by-nc', license_version: '4.0' }) });
  const found = auditAssets({ dir: nc.dir, story: nc.ctx.story });
  assert.equal(found.length, 1);
  assert.equal(found[0].problem, 'licence');
  const accepted = piece({ record: recordOf({}, { license: 'by-nc', license_version: '4.0' }), story: { audio: { acceptLicences: ['by-nc'] } } });
  assert.deepEqual(auditAssets({ dir: accepted.dir, story: accepted.ctx.story }), []);
});

test('the contracts: audio.acceptLicences in a story, sound.licences in a style and a brand, and the extra fields of a sample record', async () => {
  const v = validators();
  const { readFileSync } = await import('node:fs');
  const story = JSON.parse(readFileSync(new URL('../../fixtures/kit-smoke/film/story.json', import.meta.url), 'utf8'));
  assert.ok(v.story(story), JSON.stringify(v.story.errors));
  story.audio.acceptLicences = ['by-sa', 'by-nc'];
  assert.ok(v.story(story), JSON.stringify(v.story.errors));
  story.audio.acceptLicences = ['gpl'];
  assert.equal(v.story(story), false);
  story.audio.acceptLicences = ['by-sa', 'by-sa'];
  assert.equal(v.story(story), false, 'each once');

  const motion = JSON.parse(readFileSync(new URL('../../styles/motion/calm.json', import.meta.url), 'utf8'));
  assert.ok(v.motion(motion), JSON.stringify(v.motion.errors));
  motion.sound.licences = ['cc0', 'pdm'];
  assert.ok(v.motion(motion), JSON.stringify(v.motion.errors));
  motion.sound.licences = ['by-nc'];
  assert.equal(v.motion(motion), false, 'a style can only narrow to the free licences');
  motion.sound.licences = [];
  assert.equal(v.motion(motion), false, 'a style that offers nothing offers nothing to find');

  const brand = JSON.parse(readFileSync(new URL('../../styles/brands/paper.json', import.meta.url), 'utf8'));
  brand.sound = { ...(brand.sound ?? {}), licences: ['cc0'] };
  assert.ok(v.brand(brand), JSON.stringify(v.brand.errors));
  brand.sound.licences = ['by-sa'];
  assert.equal(v.brand(brand), false);

  const rec = recordFrom(item(), { sha1: sha1(BYTES), retrieved: DAY });
  rec.sha1 = 'nothex';
  assert.equal(v.soundSample(rec), false, 'a sha1 is 40 hex characters');
  rec.sha1 = sha1(BYTES); rec.openverseId = 'not-a-uuid';
  assert.equal(v.soundSample(rec), false);
});

test('compose carries a brand\'s sound.licences into the style', async () => {
  const { compose } = await import('../../scripts/compose.mjs');
  const { readFileSync, writeFileSync: write, mkdtempSync: mk } = await import('node:fs');
  const brand = JSON.parse(readFileSync(new URL('../../styles/brands/paper.json', import.meta.url), 'utf8'));
  brand.sound = { ...(brand.sound ?? {}), licences: ['cc0', 'pdm'] };
  const dir = mk(join(tmpdir(), 'mm-compose-licences-'));
  const file = join(dir, 'brand.json');
  write(file, JSON.stringify(brand));
  const style = compose({ brand: file, motion: 'calm', from: { brand: 'styles/brands/paper.json', motion: 'styles/motion/calm.json' } });
  assert.deepEqual(style.sound.licences, ['cc0', 'pdm']);
  assert.equal(style.sound.palette, JSON.parse(readFileSync(new URL('../../styles/motion/calm.json', import.meta.url), 'utf8')).sound.palette, 'the motion half\'s sound is kept');
});
