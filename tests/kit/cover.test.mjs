// transitions/cover without a browser: the incoming scene slides in from one side over the outgoing
// one, which holds perfectly still (its transform, opacity, visibility and clip are never written;
// only a scrim of the ink role darkens it); the incoming scene stays opaque (no opacity written) so
// no frame shows two scenes blended; at p = 1 nothing is left on either section.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import cover from '../../patterns/transitions/cover/pattern.js';

function section() {
  const style = {};
  const api = {
    removeProperty(k) { delete style[k]; },
    setProperty(k, v) { style[k] = String(v); },
    getPropertyValue(k) { return style[k] ?? ''; },
  };
  return {
    raw: style,
    style: new Proxy(style, { get: (o, k) => (k in api ? api[k] : o[k]), set: (o, k, v) => { o[k] = v; return true; } }),
    getAttribute: () => null, removeAttribute() {},
  };
}
function cut(p, params = {}) {
  const from = section(), to = section();
  cover.at(to, p, { from, to, params });
  return { from, to };
}
const STILL = ['transform', 'translate', 'scale', 'opacity', 'visibility', 'clipPath', 'clip-path', 'filter'];

test('the outgoing scene never moves, fades or clips on any frame of the cut', () => {
  const seen = new Set();
  for (let i = 0; i <= 60; i++) {
    const { from } = cut(i / 60);
    for (const k of STILL) assert.equal(from.raw[k], undefined, `p = ${i / 60}: ${k} written on the outgoing scene`);
    seen.add(JSON.stringify(Object.keys(from.raw).filter((k) => !k.startsWith('--mm-tx-'))));
  }
  assert.deepEqual([...seen], ['[]'], 'only --mm-tx-* properties are written on the outgoing scene');
});

test('the incoming scene slides from fully off-frame to rest, from the side it names', () => {
  assert.equal(cut(0).to.style.transform, 'translate(0%, 100%)', 'bottom by default, fully below the frame at p = 0');
  assert.equal(cut(0.5).to.style.transform, 'translate(0%, 50%)');
  assert.equal(cut(0.25, { side: 'top' }).to.style.transform, 'translate(0%, -75%)');
  assert.equal(cut(0.25, { side: 'right' }).to.style.transform, 'translate(75%, 0%)');
  assert.equal(cut(0.25, { side: 'left' }).to.style.transform, 'translate(-75%, 0%)');
});

test('the incoming scene is opaque on every frame: no opacity, filter or visibility is written on it', () => {
  for (let i = 0; i <= 20; i++) {
    const { to } = cut(i / 20);
    for (const k of ['opacity', 'visibility', 'filter']) assert.equal(to.raw[k], undefined, `p = ${i / 20}: ${k}`);
  }
});

test('the scrim deepens with the cut, is bounded, and can be turned off', () => {
  assert.equal(cut(0.5).from.style.getPropertyValue('--mm-tx-cover-dim'), '0.1', 'default dim 0.2, half way');
  assert.equal(cut(1 - 1e-9, { dim: 2 }).from.style.getPropertyValue('--mm-tx-cover-dim'), '0.6', 'capped at 0.6');
  assert.equal(cut(0.5, { dim: 0 }).from.style.getPropertyValue('--mm-tx-cover-dim'), '', 'no scrim at dim 0');
});

test('at p = 1 nothing is left on either section', () => {
  const { from, to } = cut(1);
  assert.deepEqual(from.raw, {});
  assert.deepEqual(to.raw, {});
});

test('the scrim is the darkest palette role of the brand, so the outgoing scene sinks on light and dark brands alike', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = new URL('../../styles/brands/', import.meta.url);
  const lum = (hex) => { const n = parseInt(hex.slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); };
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const color = JSON.parse(readFileSync(new URL(f, dir), 'utf8')).color;
    const from = section(), to = section();
    cover.at(to, 0.5, { from, to, params: {}, style: { color } });
    const m = /^var\(--mm-color-(\w+)\)$/.exec(from.style.getPropertyValue('--mm-tx-cover-shade'));
    assert.ok(m, `${f}: the shade is a palette role (${from.style.getPropertyValue('--mm-tx-cover-shade')})`);
    const darkest = Math.min(...Object.values(color).map(lum));
    assert.equal(lum(color[m[1]]), darkest, `${f}: ${m[1]} is the darkest role`);
  }
  assert.equal(cut(0.5).from.style.getPropertyValue('--mm-tx-cover-shade'), 'var(--mm-color-ink)', 'ink without a palette to read');
});
