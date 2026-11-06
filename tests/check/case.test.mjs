// W-CASE (SPEC §7): text-transform: uppercase on text holding a character that changes length or meaning when uppercased
// (the micro sign, the sharp s, ligatures, dotless i, long s). Read from the computed style at the rests.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gate, row } from './_harness.mjs';
import { variant, cleanup, scene } from './_variant.mjs';
import { changesOnUpper, MEANING_CHANGERS } from '../../scripts/check/W-CASE.mjs';

const run = gate();
after(cleanup);
const only = { only: ['W-CASE'] };
const check = async (dir) => row(await run(dir, only), 'W-CASE');
/** The first scene's headline reads `text`; `upper` sets it in capitals by CSS. */
const set = (text, upper = true) => variant('_base/film', (v) => {
  scene(v.story, 'open').beats[0].text = text;
  if (upper) writeFileSync(join(v.dir, 'piece.css'), `${readFileSync(join(v.dir, 'piece.css'), 'utf8')}\n[data-slot="headline"] { text-transform: uppercase; }\n`);
});

test('changesOnUpper names the characters whose uppercase differs in length or meaning', () => {
  assert.deepEqual(changesOnUpper('Straße'), [{ char: 'ß', upper: 'SS', why: 'length' }]);
  assert.deepEqual(changesOnUpper('5 \u00b5m'), [{ char: '\u00b5', upper: '\u039c', why: 'meaning' }]);
  assert.deepEqual(changesOnUpper('ﬁnal'), [{ char: 'ﬁ', upper: 'FI', why: 'length' }]);
  assert.deepEqual(changesOnUpper('ıſ').map((c) => c.char), ['ı', 'ſ']);
  assert.deepEqual(changesOnUpper('Café Ünï'), []);
  assert.ok(MEANING_CHANGERS.includes('\u00b5'));
});

test('capitals set by CSS over a sharp s or a micro sign warn, naming the characters', async () => {
  const r = await check(set('Straße 5 \u00b5m'));
  assert.equal(r.status, 'WARN');
  assert.deepEqual(r.evidence.characters, ['ß', '\u00b5']);
  assert.equal(r.evidence.selector, '[data-scene="open"] [data-slot="headline"]');
  assert.match(r.evidence.reason, /uppercase.*ß/);
});

test('uppercase text with no such character passes, and the pass says how many text elements it read', async () => {
  const r = await check(set('Café ready'));
  assert.equal(r.status, 'PASS');
  assert.ok(r.evidence.uppercased >= 1);
  assert.ok(r.evidence.texts >= r.evidence.uppercased);
});

test('the same text in lower case is not read: no text is uppercased, SKIP with a reason', async () => {
  const r = await check(set('Straße 5 \u00b5m', false));
  assert.equal(r.status, 'SKIP');
  assert.match(r.evidence.reason, /no text is set in capitals by CSS/);
});
