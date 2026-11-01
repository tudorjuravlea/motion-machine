// Everything in the path, morph and shared-element patterns can be made more on brand: each card names its
// brand knobs, every one is a real param with a default, and a brand's `style.patterns` default reaches the
// pattern below the beat's own value.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { paramsOf } from '../../runtime/kit/params.js';
import morph from '../../patterns/moves/morph/pattern.js';
import along from '../../patterns/moves/along-path/pattern.js';
import shared from '../../patterns/transitions/shared-element/pattern.js';

const ROOT = new URL('../../', import.meta.url);
const knobsOf = (id) => {
  const card = readFileSync(new URL(`patterns/${id}/PATTERN.md`, ROOT), 'utf8');
  const line = card.split('\n').find((l) => l.startsWith('Brand knobs:'));
  assert.ok(line, `${id}: the card has a Brand knobs line`);
  return line.slice('Brand knobs:'.length).split(',').map((s) => s.trim().replace(/\.$/, '')).filter(Boolean);
};

for (const [id, mod, pick] of [['moves/morph', morph, ['mode', 'path']], ['moves/along-path', along, ['trail', 'comet']], ['transitions/shared-element', shared, ['fit', 'box']]]) {
  test(`${id}: every brand knob is a param, a brand's default reaches it and the beat's value wins`, () => {
    for (const k of knobsOf(id)) assert.ok(k in mod.params, `${k} is a param of ${id}`);
    for (const [k, v] of Object.entries(mod.params)) assert.ok('default' in v && 'meaning' in v && 'type' in v, `${id}.${k} is described`);
    const style = { patterns: { [id]: { [pick[0]]: pick[1] } } };
    assert.equal(paramsOf(mod, {}, style)[pick[0]], pick[1], 'the brand sets it once');
    assert.notEqual(paramsOf(mod, {}, {})[pick[0]], pick[1], 'and the pattern default is something else');
    assert.equal(paramsOf(mod, { [pick[0]]: 'x' }, style)[pick[0]], 'x', 'a beat still wins');
  });
}
