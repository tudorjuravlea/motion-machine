// count.js format: compact writes a scaled unit (14K, 1.2M, 3B) after the prefix, so "$1.2M" counts
// $0, $0.3M ... and the suffix stays the caller's. Pure, so a frame never depends on the last one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, compactParts } from '../../runtime/kit/count.js';

test('compact scales to K, M, B and T and keeps the caller\'s decimals', () => {
  const f = (v, o = {}) => formatNumber(v, { compact: true, ...o });
  assert.equal(f(14000), '14K');
  assert.equal(f(1_200_000, { fix: 1 }), '1.2M');
  assert.equal(f(1_200_000), '1M');
  assert.equal(f(3_400_000_000, { fix: 1 }), '3.4B');
  assert.equal(f(2e12), '2T');
  assert.equal(f(812), '812');
  assert.equal(f(0), '0');
  assert.equal(f(-14000), '-14K');
  assert.equal(f(1_200_000, { fix: 1, prefix: '$' }), '$1.2M');
  assert.equal(f(14000, { suffix: ' users' }), '14K users');
});

test('compact never writes 1000K: a rounded-up value moves to the next unit', () => {
  assert.equal(formatNumber(999_960, { compact: true, fix: 1 }), '1.0M');
  assert.equal(formatNumber(999_500, { compact: true }), '1M');
  assert.equal(formatNumber(999.6, { compact: true }), '1K');
  assert.equal(formatNumber(999.4, { compact: true }), '999');
});

test('compact off is the plain number, as before', () => {
  assert.equal(formatNumber(14000, { fix: 0 }), '14000');
  assert.equal(formatNumber(14000, { compact: false }), '14000');
});

test('compactParts gives the scaled number and its unit letter', () => {
  assert.deepEqual(compactParts(1_200_000, 1), { value: 1.2, unit: 'M' });
  assert.deepEqual(compactParts(12, 0), { value: 12, unit: '' });
});
