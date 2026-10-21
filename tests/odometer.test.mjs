// data/odometer: each column is a one-line window over a strip of digits. Digits wholly outside the
// window are hidden, so the gate's text walk (G-EDGE, G-OVERLAP, W-CONTRAST) sees only what the
// viewer sees. Found by the catalogue films: at rest the clipped strip reached past the safe margin
// and into the line beneath it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import odometer from '../patterns/data/odometer/pattern.js';

// The few DOM calls the pattern makes, enough to read back what it drew.
function fakeDoc() {
  const doc = {
    createElement(tag) {
      const n = { tag, className: '', textContent: '', children: [], style: {}, attrs: {}, dataset: {}, ownerDocument: doc,
        classList: { add(c) { n.className = `${n.className} ${c}`.trim(); } },
        append(...c) { n.children.push(...c); }, replaceChildren() { n.children = []; }, setAttribute(k, v) { n.attrs[k] = v; } };
      return n;
    },
  };
  return doc;
}

const shownDigits = (el) => el.children.filter((c) => c.className === 'mm-odometer__col')
  .map((col) => col.children[0].children.filter((d) => d.style.visibility !== 'hidden').map((d) => d.textContent));

test('odometer: at rest each column shows only the digit in its window', () => {
  const el = fakeDoc().createElement('div');
  el.dataset.value = '4280';
  odometer.at(el, 1, { params: {} });
  assert.deepEqual(shownDigits(el), [['4'], ['2'], ['8'], ['0']]);
});

test('odometer: mid-roll a column shows the two digits its window straddles', () => {
  const el = fakeDoc().createElement('div');
  el.dataset.value = '5';
  odometer.at(el, 0.5, { params: {} });   // 2.5: half of 2, half of 3
  assert.deepEqual(shownDigits(el), [['2', '3']]);
});
