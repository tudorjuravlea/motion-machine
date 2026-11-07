// transitions/flood without a browser: a disc of one palette role grows from a slot of the outgoing
// scene past every frame corner, holds the frame covered, then shrinks into a slot of the incoming
// scene, its centre travelling from one slot to the other. The two scenes never share a frame:
// before the middle of the cut only the outgoing scene is drawn, from the middle only the incoming
// one, and the swap happens under full cover. The cut lasts 1.3 s under every motion style (scaled by
// `speed`): a 0.5 s grow on an ease-in-out, a short full cover, then the shrink on a strong ease-out;
// no phase goes under its floor at any speed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import flood, { phasesOf, discAt, durOf } from '../../patterns/transitions/flood/pattern.js';

const ROOT = new URL('../..', import.meta.url).pathname;
const W = 1920, H = 1080;
function section(slots = {}, scale = 0.5) {
  const style = {};
  const api = {
    removeProperty(k) { delete style[k]; },
    setProperty(k, v) { style[k] = String(v); },
    getPropertyValue(k) { return style[k] ?? ''; },
  };
  const box = (x, y, w, h) => ({ left: x * scale, top: y * scale, width: w * scale, height: h * scale });
  return {
    raw: style,
    style: new Proxy(style, { get: (o, k) => (k in api ? api[k] : o[k]), set: (o, k, v) => { o[k] = v; return true; } }),
    offsetWidth: W, offsetHeight: H,
    getAttribute: () => null, removeAttribute() {},
    getBoundingClientRect: () => box(0, 0, W, H),
    querySelector(sel) {
      const m = /^\[data-slot="([^"]+)"\]$/.exec(sel);
      const s = m && slots[m[1]];
      return s ? { getBoundingClientRect: () => box(...s) } : null;
    },
  };
}
// The cut at linear time l (0..1) of the flood's own 1.3 s; the eased p is irrelevant to the phases.
const D = 1.3;
const HOLD = flood.params.hold.default;
function cut(l, params = { from: 'chip', to: 'logo' }) {
  const from = section({ chip: [1500, 80, 240, 120] });   // centre (1620, 140), near the top-right corner
  const to = section({ logo: [160, 820, 200, 200] });     // centre (260, 920), near the bottom-left corner
  flood.at(to, l, { from, to, params, u: l * D, d: D });
  return { from, to };
}
const disc = (el) => {
  const g = (k) => parseFloat(el.style.getPropertyValue(`--mm-tx-flood-${k}`));
  return Number.isFinite(g('r')) ? { x: g('x'), y: g('y'), r: g('r'), color: el.style.getPropertyValue('--mm-tx-flood-color') } : null;
};
const hidden = (el) => el.style.opacity === '0' && el.style.visibility === 'hidden';
const farthest = (x, y) => Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([a, b]) => Math.hypot(a - x, b - y)));

test('before the middle only the outgoing scene is drawn, with the flood on it; from the middle only the incoming one', () => {
  for (let i = 1; i < 60; i++) {
    const l = i / 60;
    const { from, to } = cut(l);
    if (l < 0.5) {
      assert.ok(hidden(to), `l = ${l}: the incoming scene is hidden`);
      assert.ok(!hidden(from) && disc(from) && !disc(to), `l = ${l}: the flood is drawn on the outgoing scene`);
    } else {
      assert.ok(hidden(from), `l = ${l}: the outgoing scene is hidden`);
      assert.ok(!hidden(to) && disc(to) && !disc(from), `l = ${l}: the flood is drawn on the incoming scene`);
    }
  }
});

test('the swap happens under full cover: the disc reaches past all four corners around the middle', () => {
  const ph = phasesOf(D, HOLD);
  assert.ok(ph.a < 0.5 && ph.a + ph.h > 0.5, `the cover spans the middle: ${JSON.stringify(ph)}`);
  for (const l of [ph.a + 1e-6, 0.5 - 1e-6, 0.5, ph.a + ph.h]) {
    const { from, to } = cut(l);
    const d = disc(l < 0.5 ? from : to);
    assert.ok(d.r >= farthest(d.x, d.y) * 1.04, `l = ${l}: r ${d.r} covers the farthest corner ${farthest(d.x, d.y)}, overscaled`);
  }
});

test('the flood grows from the outgoing slot and shrinks into the incoming slot', () => {
  const start = disc(cut(0.01).from);
  assert.ok(Math.abs(start.x - 1620) <= 2 && Math.abs(start.y - 140) <= 2, `starts on the chip (${start.x}, ${start.y})`);
  assert.ok(start.r < 0.05 * farthest(1620, 140), 'and starts small');
  const end = disc(cut(0.999).to);
  assert.ok(Math.abs(end.x - 260) <= 2 && Math.abs(end.y - 920) <= 2, `ends on the logo (${end.x}, ${end.y})`);
  assert.ok(end.r < 0.01 * farthest(260, 920), 'and ends as a point');
  const half = disc(cut(0.9).to);
  assert.ok(half.x < 1620 && half.x > 260, 'the centre travels between the two slots while it shrinks');
});

test('without slots the flood grows from and shrinks into the frame centre', () => {
  const a = disc(cut(0.1, {}).from), b = disc(cut(0.9, {}).to);
  for (const d of [a, b]) assert.deepEqual([d.x, d.y], [W / 2, H / 2]);
});

test('the flood colour is a palette role, accent by default; an unknown role falls back to accent', () => {
  assert.equal(disc(cut(0.3).from).color, 'var(--mm-color-accent)');
  assert.equal(disc(cut(0.3, { color: 'ink' }).from).color, 'var(--mm-color-ink)');
  assert.equal(disc(cut(0.3, { color: 'surface' }).from).color, 'var(--mm-color-surface)');
  assert.equal(disc(cut(0.3, { color: 'red' }).from).color, 'var(--mm-color-accent)');
});

test('at p = 1 nothing is left on either section', () => {
  const from = section(), to = section();
  flood.at(to, 1, { from, to, params: {}, u: 0.8, d: 0.8 });
  assert.deepEqual(from.raw, {}); assert.deepEqual(to.raw, {});
});

// The seconds the disc takes to reach full cover in a cut of d seconds, read off the drawing.
function growSeconds(d, params = {}) {
  const N = 4000;
  for (let i = 1; i <= N; i++) {
    const l = (0.6 * i) / N;
    const from = section(), to = section();
    flood.at(to, l, { from, to, params, u: l * d, d });
    if ((disc(from) ?? disc(to)).r >= farthest(W / 2, H / 2) * 1.05 - 1e-2) return l * d;
  }
  return Infinity;
}

test('the flood lasts 1.3 s under every shipped motion style, and its grow about half a second', () => {
  assert.equal(flood.dur, 1.3);
  assert.equal(durOf({}), 1.3);
  for (const f of readdirSync(join(ROOT, 'styles/motion')).filter((x) => x.endsWith('.json'))) {
    JSON.parse(readFileSync(join(ROOT, 'styles/motion', f), 'utf8'));   // the cut does not read the style's roles
    const grow = growSeconds(flood.dur);
    assert.ok(grow >= 0.45 && grow <= 0.55, `${f}: grow ${grow.toFixed(3)} s`);
  }
  const ph = phasesOf(D, HOLD);
  const s = (x) => x * D;
  assert.ok(s(ph.h) >= 0.12 && s(ph.h) <= 0.2, `the cover ${s(ph.h).toFixed(3)} s`);
  assert.ok(s(ph.s) >= 0.6 && s(ph.s) <= 0.7, `the shrink to a point ${s(ph.s).toFixed(3)} s`);
});

test('speed scales the whole flood, 0.5 to 2, and no phase goes under its floor', () => {
  assert.equal(durOf({ speed: 0.5 }), 2.6);
  assert.ok(Math.abs(durOf({ speed: 1.3 / 1 }) - 1) < 1e-9);
  assert.equal(durOf({ speed: 9 }), durOf({ speed: 2 }), 'speed is clamped to 2');
  assert.equal(durOf({ speed: 0.1 }), 2.6, 'and to 0.5');
  for (const speed of [0.5, 0.8, 1, 1.5, 2]) {
    const d = durOf({ speed });
    for (const land of [false, true]) {
      const ph = phasesOf(d, HOLD, land);
      assert.ok(ph.a * d >= 0.24 - 1e-9, `speed ${speed}${land ? ' landing' : ''}: grow ${ph.a * d}`);
      assert.ok((land ? ph.s : ph.s) * d >= 0.35 - 1e-9, `speed ${speed}: shrink ${ph.s * d}`);
      if (land) assert.ok(ph.b * d >= 0.08 - 1e-9, `speed ${speed}: hand-over ${ph.b * d}`);
      assert.ok(Math.abs(ph.a + ph.h + ph.s + ph.b - 1) < 1e-9, 'the phases fill the cut');
      assert.ok(ph.swap >= ph.a - 1e-9 && ph.swap <= ph.a + ph.h + 1e-9, `speed ${speed}: swap under cover`);
    }
    if (speed <= 1.5) assert.ok(Math.abs(growSeconds(d) - (0.5 / speed)) < 0.03, `speed ${speed}: grow ${growSeconds(d)} vs ${0.5 / speed}`);
  }
});

test('a from or to that names no slot of its scene is a kit warning, once, and the flood falls back to the centre', () => {
  const warnings = [];
  const doc = { defaultView: { mm: { warnings } } };
  const from = Object.assign(section({ chip: [1500, 80, 240, 120] }), { ownerDocument: doc, getAttribute: (k) => (k === 'data-scene' ? 'a' : null) });
  const to = Object.assign(section({ logo: [160, 820, 200, 200] }), { ownerDocument: doc, getAttribute: (k) => (k === 'data-scene' ? 'b' : null) });
  for (const l of [0.2, 0.3, 0.7]) flood.at(to, l, { from, to, params: { from: 'chp', to: 'logo' }, u: l * 0.8, d: 0.8 });
  assert.equal(warnings.length, 1, JSON.stringify(warnings));
  assert.match(warnings[0], /^transitions\/flood: .*"chp".*scene a/);
  flood.at(to, 0.7, { from, to, params: { from: 'chip', to: 'lgo' }, u: 0.56, d: 0.8 });
  assert.equal(warnings.length, 2);
  assert.match(warnings[1], /"lgo".*scene b/);
  flood.at(to, 0.7, { from, to, params: { from: 'chip', to: 'logo' }, u: 0.56, d: 0.8 });
  flood.at(to, 0.7, { from, to, params: {}, u: 0.56, d: 0.8 });
  assert.equal(warnings.length, 2, 'real slots and empty names give no warning');
});

// ---- landing on a round mark of the incoming scene (land: dot | circle) ----
// The pure core: the disc at linear time l of a cut of d seconds that lands on `target` ({ x, y, r,
// ry }), growing from c0 over a frame W x H. The disc keeps the flood's role all the way; over the
// hand-over (the last 0.1 s at speed 1) it fades off the mark it covers, so the real mark shows.
const TARGET = { x: 700.4, y: 512.6, r: 11.3, ry: 9.6 };
const ACCENT = 'var(--mm-color-accent)';
const land = (l, d = D, hold = HOLD) => discAt(l, { d, hold, land: true, c0: [1620, 140], c1: [TARGET.x, TARGET.y], target: TARGET, W, H, over: 1.05, flood: ACCENT });
const SPEEDS = [0.5, 1, 1.5, 2].map((speed) => [`speed ${speed}`, durOf({ speed })]);
const FADE = /^color-mix\(in srgb, var\(--mm-color-accent\) ([\d.]+)%, transparent\)$/;

test('landing at speed 1: grow 0.5 s, cover about 0.15 s, collapse about 0.55 s, hand-over 0.1 s; the collapse never under 0.35 s', () => {
  const ph = phasesOf(D, HOLD, true), s = (x) => x * D;
  assert.ok(Math.abs(s(ph.a) - 0.5) < 0.03, `grow ${s(ph.a)}`);
  assert.ok(s(ph.h) >= 0.12 && s(ph.h) <= 0.2, `cover ${s(ph.h)}`);
  assert.ok(Math.abs(s(ph.s) - 0.55) < 0.03, `collapse ${s(ph.s)}`);
  assert.ok(Math.abs(s(ph.b) - 0.1) < 0.01, `hand-over ${s(ph.b)}`);
  for (const [n, d] of SPEEDS) assert.ok(phasesOf(d, HOLD, true).s * d >= 0.35 - 1e-9, `${n}: collapse ${phasesOf(d, HOLD, true).s * d}`);
});

test('landing: a strong ease-out settles the disc onto exactly the target, where it stays until the cut ends', () => {
  for (const [n, d] of SPEEDS) {
    const ph = phasesOf(d, HOLD, true);
    const on = ph.a + ph.h + ph.s;
    for (const l of [on, on + ph.b * 0.5, 1 - 1e-9]) {
      const c = land(l, d);
      assert.ok(Math.abs(c.x - TARGET.x) < 1e-6 && Math.abs(c.y - TARGET.y) < 1e-6 && Math.abs(c.r - TARGET.r) < 1e-6 && Math.abs(c.ry - TARGET.ry) < 1e-6, `${n}, l ${l}: ${JSON.stringify(c)}`);
    }
    // ease-out: half the collapse's time covers most of the travel, the rest is a slow settle
    const start = land(ph.a + ph.h, d), half = land(ph.a + ph.h + ph.s / 2, d), late = land(ph.a + ph.h + ph.s * 0.9, d);
    const done = (c) => (start.r - c.r) / (start.r - TARGET.r);
    assert.ok(done(half) > 0.85, `${n}: ${done(half).toFixed(3)} of the way at half time`);
    assert.ok(done(late) < 1 && late.r - TARGET.r < 2, `${n}: still settling near the end (${(late.r - TARGET.r).toFixed(2)} px off)`);
    assert.ok(half.ry > TARGET.ry && half.ry < half.r, `${n}: an ellipse shrinking toward the dot's`);
  }
});

test('landing: no muddy colour: the disc is the flood\'s own role throughout, fading off the mark only over the hand-over', () => {
  for (const [n, d] of SPEEDS) {
    const ph = phasesOf(d, HOLD, true);
    let last = 100;
    for (let i = 0; i < 2000; i++) {
      const l = i / 2000, c = land(l, d).color;
      if (l < 1 - ph.b - 1e-9) { assert.equal(c, ACCENT, `${n}: l ${l}: ${c}`); continue; }
      const m = c === ACCENT ? ['', '100'] : FADE.exec(c);
      assert.ok(m, `${n}: l ${l}: ${c}`);
      assert.ok(Number(m[1]) <= last + 1e-9, `${n}: the fade only goes down`);
      last = Number(m[1]);
    }
    // the hand-over is the last 0.1 s at speed 1 (never over 0.12 s), scaled with the speed down to its 0.08 s floor
    assert.ok(ph.b * d <= Math.max(0.08, 0.12 * (d / D)) + 1e-9, `${n}: the hand-over is the last ${(ph.b * d).toFixed(3)} s`);
    assert.ok(last < 1, `${n}: nearly gone by the end (${last} %)`);
  }
});

test('landing keeps the swap under full cover, at the middle of the cut', () => {
  for (const [n, d] of SPEEDS) {
    const ph = phasesOf(d, HOLD, true);
    assert.ok(ph.swap >= ph.a - 1e-9 && ph.swap <= ph.a + ph.h + 1e-9, `${n}: swap ${ph.swap} inside the cover [${ph.a}, ${ph.a + ph.h}]`);
    const at = land(ph.swap, d);
    assert.ok(at.r >= farthest(at.x, at.y) * 1.04, `${n}: full cover at the swap`);
  }
  const ph = phasesOf(D, HOLD, true);
  assert.ok(ph.a < 0.5 && ph.a + ph.h > 0.5, JSON.stringify(ph));
  assert.equal(ph.swap, 0.5);
});

test('land: point and land: dot share the grow and the cover; a point shrinks over the collapse and the hand-over together', () => {
  const p = phasesOf(D, HOLD, false), q = phasesOf(D, HOLD, true);
  assert.ok(Math.abs(p.a - q.a) < 1e-9 && Math.abs(p.h - q.h) < 1e-9 && Math.abs(p.s - (q.s + q.b)) < 1e-9 && p.b === 0, JSON.stringify([p, q]));
  assert.equal(p.swap, 0.5);
});
