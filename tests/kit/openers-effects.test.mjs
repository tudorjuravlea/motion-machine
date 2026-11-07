// The openers and effects, without a browser: transitions/beam (light as a role, the reveal, the
// variants), entrances/power-on (held steps, a split that settles), text/cross-out and text/verdict
// (their progress, in order and finite), and emphasis/countdown-clock (a finite sweep). Each is a
// closed form of its own progress, so the same call gives the same answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import beam, { plan, settings, halfPlane, profile } from '../../patterns/transitions/beam/pattern.js';
import { stateAt as powerOn } from '../../patterns/entrances/power-on/pattern.js';
import { itemsOf, progressAt as crossAt } from '../../patterns/text/cross-out/pattern.js';
import { namesOf, progressAt as verdictAt } from '../../patterns/text/verdict/pattern.js';
import { stateAt as clockAt } from '../../patterns/emphasis/countdown-clock/pattern.js';

// ---- transitions/beam ----

const VARIANTS = ['beam', 'curtain', 'portal', 'streak'];
const FRAMES = [[1920, 1080], [1080, 1920], [1080, 1080], [1080, 1350]];

test('beam: every colour the light is made of is a role or a share of one over transparent, never a literal', () => {
  for (const variant of VARIANTS) for (const light of ['accent', 'canvas', 'ink', 'surface']) for (const panel of ['ink', 'accent']) {
    for (const p of [0.1, 0.35, 0.5, 0.8]) {
      for (const l of plan(1920, 1080, p, { variant, light, panel }).layers) {
        assert.doesNotMatch(l.style, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\bwhite\b|\bblack\b/i, `${variant} ${light} ${l.style}`);
        for (const m of l.style.matchAll(/color-mix\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
          assert.match(m[1], /^in srgb, var\(--mm-color-[a-zA-Z]+\) [\d.]+%, transparent$/, m[0]);
        }
      }
    }
  }
});

test('beam: params are clamped and an unknown value falls back to its default', () => {
  assert.deepEqual(settings({ variant: 'spiral', light: 'neon', panel: 'chrome', strength: 9, width: -1, weight: 'x', angle: 200, side: 'up', at: 'bad' }),
    { ...settings({}), strength: 1, width: 0.05, angle: 45 });
  assert.equal(settings({ at: '25%,80%' }).x, 0.25);
  assert.equal(settings({ at: '25%,80%' }).y, 0.8);
  assert.equal(settings({ side: 'right' }).right, true);
});

// Even-odd point in polygon, for the half-plane reveal.
function inside([x, y], pts) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const polyOf = (clip) => [...clip.matchAll(/(-?[\d.]+)px (-?[\d.]+)px/g)].map((m) => [Number(m[1]), Number(m[2])]);
const grid = (W, H, n = 24) => Array.from({ length: (n + 1) ** 2 }, (_, k) => [((k % (n + 1)) / n) * W, (Math.floor(k / (n + 1)) / n) * H]);
const revealed = (W, H, p, prm) => {
  const clip = plan(W, H, p, prm).clip;
  if (!clip) return null;
  if (clip.startsWith('circle')) {
    const m = /circle\(([\d.]+)px at ([\d.]+)px ([\d.]+)px\)/.exec(clip);
    return grid(W, H).filter(([x, y]) => Math.hypot(x - Number(m[2]), y - Number(m[3])) < Number(m[1])).length / grid(W, H).length;
  }
  const poly = polyOf(clip);
  return grid(W, H).filter((pt) => inside(pt, poly)).length / grid(W, H).length;
};

test('beam and portal: nothing is revealed at p = 0, everything just before p = 1, and the reveal only grows', () => {
  for (const [W, H] of FRAMES) for (const prm of [{ variant: 'beam' }, { variant: 'beam', angle: -30, side: 'right' }, { variant: 'beam', angle: 45 }, { variant: 'portal' }, { variant: 'portal', at: '10%,90%' }]) {
    assert.equal(revealed(W, H, 0, prm), 0, `${W}x${H} ${JSON.stringify(prm)} at 0`);
    assert.equal(revealed(W, H, 0.999, prm), 1, `${W}x${H} ${JSON.stringify(prm)} at 0.999`);
    let prev = 0;
    for (let i = 1; i <= 20; i++) { const r = revealed(W, H, i / 20, prm); assert.ok(r >= prev - 1e-9, `${JSON.stringify(prm)} p ${i / 20}`); prev = r; }
  }
});

test('beam: the front starts and ends outside the frame, light and all', () => {
  // the stops of the first layer, in px along the beam; the hot core is the fourth (the glow's three falling stops come before it)
  const core = (p) => [...plan(1920, 1080, p, { variant: 'beam', angle: 0 }).layers[0].style.matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]))[3];
  const edge = core;
  assert.ok(edge(0) < 0, `core at ${edge(0)}`);
  assert.ok(edge(0.999) > 1920 - 1, `core at ${edge(0.999)}`);
  const first = plan(1920, 1080, 0, { variant: 'beam', angle: 0 }).layers[0].style;
  const stops = [...first.matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...stops.slice(0, 8)) <= 0.5, 'no glow in the frame at p = 0');
});

test('beam: the curtain closes, swaps behind the closed panels and parts; the streak swaps at its peak', () => {
  const c = (p) => plan(1920, 1080, p, { variant: 'curtain' });
  assert.equal(c(0).show, 'from');
  assert.equal(c(0).layers.length, 0, 'no panel at p = 0');
  assert.equal(c(0.29).show, 'from');
  assert.equal(c(0.31).show, 'to');
  const wide = (p) => Number(/width: ([\d.]+)px/.exec(c(p).layers[0].style)[1]);
  assert.ok(Math.abs(wide(0.3) - 960) < 1, 'each panel covers half the frame when the scenes swap');
  assert.ok(wide(0.15) < wide(0.3) && wide(0.9) < wide(0.5), 'closes, then parts');
  assert.equal(plan(1920, 1080, 0.4, { variant: 'streak' }).show, 'from');
  assert.equal(plan(1920, 1080, 0.6, { variant: 'streak' }).show, 'to');
  const veil = (p) => Number(/ ([\d.]+)%, transparent\)/.exec(plan(1920, 1080, p, { variant: 'streak' }).layers[0].style)[1]);
  assert.equal(veil(0), 0);
  assert.ok(veil(0.5) > veil(0.25) && veil(0.5) > veil(0.75), 'the veil peaks as the scenes swap');
});

test('beam: halfPlane and profile are pure, and the stops of a profile run in order', () => {
  assert.equal(halfPlane(1920, 1080, 1, 0, 100), halfPlane(1920, 1080, 1, 0, 100));
  const poly = polyOf(halfPlane(1920, 1080, 1, 0, 0));
  assert.ok(inside([100, 500], poly) && !inside([1800, 500], poly), 'left of the centre line is behind a front at the centre');
  const xs = [...profile('accent', 500, 200, 100, 4, 0.8).matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]));
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
});

function stubSection(W = 1920, H = 1080) {
  const raw = {}, kids = [];
  const node = () => ({ attrs: {}, style: { cssText: '' }, className: '', kids: [], setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { this.kids.push(...c); } });
  const stage = { kids, append(c) { kids.push(c); } };
  return {
    raw, kids, stage, offsetWidth: W, offsetHeight: H, parentNode: stage,
    ownerDocument: { createElement: () => node() },
    style: new Proxy(raw, { get: (o, k) => (k === 'removeProperty' ? (n) => delete o[n] : o[k]), set: (o, k, v) => { o[k] = v; return true; } }),
    getAttribute: () => null, removeAttribute() {},
  };
}

test('beam: at p = 1 nothing is written; mid-cut one overlay is appended to the stage, marked for the kit to remove', () => {
  for (const variant of VARIANTS) {
    const from = stubSection(), to = stubSection();
    beam.at(to, 1, { from, to, params: { variant } });
    assert.deepEqual([from.raw, to.raw, to.stage.kids.length], [{}, {}, 0], `${variant} at p = 1`);
    const f2 = stubSection(), t2 = stubSection();
    beam.at(t2, 0.5, { from: f2, to: t2, params: { variant } });
    assert.equal(t2.stage.kids.length, 1, `${variant}: one overlay`);
    assert.ok('data-mm-overlay' in t2.stage.kids[0].attrs);
    assert.equal(beam.group, 'transitions');
  }
});

// ---- entrances/power-on ----

test('power-on: the line crosses first, the content opens, then held flicker steps and a split that settles to nothing', () => {
  const s = (q, prm) => powerOn(q, prm);
  assert.deepEqual([s(0.05).open, s(0.05).opacity], [0, 1]);
  assert.ok(s(0.1).line < s(0.19).line && s(0.19).line <= 1);
  assert.ok(s(0.25).open > 0 && s(0.25).open < 1 && s(0.44).open > s(0.25).open);
  assert.equal(s(0.5).open, 1);
  const end = s(0.9999);
  assert.ok(end.opacity === 1 && end.dx === 0 && end.dy === 0, 'the last held frame is exactly the rest');
  assert.deepEqual(s(1), { line: null, open: 1, opacity: 1, dx: 0, dy: 0, frame: -1 });
});

test('power-on: flicker is a count of held frames, each constant across its step', () => {
  for (const flicker of [0, 1, 3, 6]) {
    const frames = new Map();
    for (let i = 0; i < 2000; i++) {
      const q = 0.45 + (0.55 * i) / 2000, st = powerOn(q, { flicker });
      const key = `${st.frame}`;
      const seen = frames.get(key);
      if (seen) assert.deepEqual([seen.opacity, seen.dx, seen.dy].slice(0, 1), [st.opacity], `frame ${key} holds its opacity`);
      else frames.set(key, st);
    }
    assert.equal(frames.size, 2 * flicker + 1, `flicker ${flicker}: ${frames.size} frames`);
  }
  assert.equal(powerOn(0.7, { flicker: 0 }).opacity, 1, 'no flicker: the content opens straight to rest');
});

test('power-on: split 0 turns the split off; a split starts at its amount and settles', () => {
  for (let i = 0; i < 100; i++) { const st = powerOn(0.2 + i * 0.008, { split: 0 }); assert.ok(st.dx === 0 && st.dy === 0, `q ${0.2 + i * 0.008}`); }
  assert.ok(Math.abs(powerOn(0.3, { split: 10 }).dx) === 10, 'full while it opens');
  const amp = (q) => Math.abs(powerOn(q, { split: 10 }).dx);
  assert.ok(amp(0.5) >= amp(0.75) && amp(0.75) >= amp(0.95) && amp(0.9999) === 0);
});

test('power-on: the same instant gives the same state, in any order of asking', () => {
  const qs = [0.7, 0.3, 0.95, 0.5, 0.7];
  const first = qs.map((q) => powerOn(q));
  assert.deepEqual(qs.map((q) => powerOn(q)), first);
});

// ---- text/cross-out ----

test('cross-out: the items are the beat\'s text, trimmed; the last is the survivor', () => {
  assert.deepEqual(itemsOf(' a | b |c| d '), ['a', 'b', 'c', 'd']);
  assert.deepEqual(itemsOf('a / b', '/'), ['a', 'b']);
  assert.deepEqual(itemsOf('only'), ['only']);
  assert.deepEqual(itemsOf(''), []);
});

test('cross-out: strikes run in order, finish, and the survivor lands last; at q = 1 everything is whole', () => {
  for (const n of [1, 2, 3, 5]) {
    for (let i = 0; i <= 100; i++) {
      const q = i / 100, pr = crossAt(q, n);
      for (let k = 1; k < n; k++) assert.ok(pr.strike[k - 1] >= pr.strike[k] - 1e-9, `n ${n} q ${q}: strike ${k - 1} leads ${k}`);
      if (pr.land > 0) assert.ok(pr.strike.every((x) => x === 1), `n ${n} q ${q}: the survivor lands after the strikes`);
      if (pr.strike[0] > 0) assert.equal(pr.arrive, 1, 'the list is in before the first strike');
    }
    const end = crossAt(1, n);
    assert.deepEqual([end.arrive, end.land, ...end.strike], [1, 1, ...Array(n).fill(1)]);
    const start = crossAt(0, n);
    assert.deepEqual([start.arrive, start.land, ...start.strike], [0, 0, ...Array(n).fill(0)]);
  }
});

// ---- text/verdict ----

test('verdict: the names are the beat\'s text; the others dim only after the stamp lands, and finish', () => {
  assert.deepEqual(namesOf('Plan A | Plan B'), ['Plan A', 'Plan B']);
  const land = 0.55;
  for (let i = 0; i <= 100; i++) {
    const q = i / 100, pr = verdictAt(q, land);
    if (q < land) assert.ok(pr.since < 0 && pr.dim === 0, `q ${q}: held, nothing dimmed`);
    assert.ok(pr.dim >= 0 && pr.dim <= 1 && pr.arrive >= 0 && pr.arrive <= 1);
  }
  assert.equal(verdictAt(0.15, land).arrive, 1, 'both names are in well before the stamp');
  assert.equal(verdictAt(1, land).dim, 1);
  assert.equal(verdictAt(0.9, 5).since, 0.9 - 0.9, 'land is clamped to 0.9');
  assert.equal(verdictAt(0.2, 0.01).since, 0.2 - 0.3, 'land is clamped to 0.3');
});

// ---- emphasis/countdown-clock ----

test('countdown-clock: nothing outside the window; the hand turns steadily, `turns` times, and stops; presence comes in and leaves', () => {
  assert.deepEqual(clockAt(0), { presence: 0, turn: 0, scroll: 0 });
  assert.deepEqual(clockAt(1), { presence: 0, turn: 0, scroll: 0 });
  let prev = -1;
  for (let i = 1; i < 100; i++) { const t = clockAt(i / 100, 2).turn; assert.ok(t >= prev, `q ${i / 100}`); prev = t; }
  assert.ok(Math.abs(clockAt(0.9, 2).turn - 720) < 1e-9, 'two full turns by the time the clock leaves');
  assert.ok(clockAt(0.5, 1).turn > 0 && clockAt(0.5, 1).turn < 360);
  assert.equal(clockAt(0.5).presence, 1);
  assert.ok(clockAt(0.03).presence < 1 && clockAt(0.97).presence < 1, 'it comes in and leaves');
  assert.equal(clockAt(0.5, 99).turn, clockAt(0.5, 4).turn, 'turns are clamped to four');
});
