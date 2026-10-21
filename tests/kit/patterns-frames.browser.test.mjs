// Pattern frames, the browser half: the zoom-through never shows two scenes at once;
// punch and slam never carry text past the safe margin mid-entrance; a dropping
// plate never covers the headline above it; a counted figure never shows a unit against a
// number it has not reached ("1 rules"); and a gentle idle under the hook keeps frame 0
// finished while the first second moves (G-HOOK). Every check samples 30 fps.
// Fixtures: fixtures/kit-smoke/composition (layouts.json, opening.json); golden via golden-smoke.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'fixtures/kit-smoke/composition');
const GOLDEN = join(ROOT, 'fixtures/kit-smoke/golden-smoke');
const PRESETS = ['editorial', 'kinetic', 'calm-product'];
const FPS = 30;
let server, browser;

before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (query, format = '9x16', page = PAGE) => openPiece(page, { server, browser, format, query: { story: 'layouts', ...query } });
const frames = (a, b) => { const out = []; for (let f = Math.ceil(a * FPS - 1e-9); f / FPS <= b + 1e-9; f++) out.push(Math.round((f / FPS) * 1e6) / 1e6); return out; };
const sceneOf = (sched, id) => sched.scenes.find((s) => s.id === id);

// The opacity each of two scenes shows at instant t (0 when hidden). A scene is a layer: its canvas
// and its text, so a second scene at any opacity is a second exposure (the incoming scene's
// small canvas rectangle over the outgoing scaled one read as doubled edges).
const exposures = (page, t, a, b) => page.evaluate(([x, ids]) => {
  window.mm.seek(x);
  return ids.map((id) => {
    const s = document.querySelector(`[data-scene="${id}"]`);
    const cs = getComputedStyle(s);
    if (cs.visibility === 'hidden') return 0;
    let o = Number(cs.opacity);
    for (let n = s.parentElement; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  });
}, [t, [a, b]]);

async function zoomCheck(o, fromId, toId, label) {
  const { schedule } = await o.mm.meta();
  const to = sceneOf(schedule, toId);
  assert.equal(to.cut.pattern, 'transitions/zoom-through', `${label}: the cut is the zoom-through`);
  assert.ok(to.cut.d > 0);
  const both = [], seenFrom = [], seenTo = [];
  for (const t of frames(to.start, to.start + to.cut.d)) {
    const [a, b] = await exposures(o.page, t, fromId, toId);
    if (a > 0.002 && b > 0.002) both.push(`${t}: ${a.toFixed(3)} / ${b.toFixed(3)}`);
    if (a > 0.002) seenFrom.push(t); if (b > 0.002) seenTo.push(t);
  }
  assert.deepEqual(both, [], `${label}: two scenes' text on one frame`);
  assert.ok(seenFrom.length && seenTo.length, `${label}: both scenes appear in the cut (it is not a blank)`);
}

for (const preset of PRESETS) {
  test(`zoom-through · ${preset}: the outgoing scene clears before the incoming one appears, at 30 fps`, async () => {
    for (const format of ['9x16', '16x9']) {
      const o = await open({ preset }, format);
      try { await zoomCheck(o, 'force-left', 'zoom', `${preset} ${format}`); } finally { await o.close(); }
    }
  });
}

test('the golden climax in editorial and calm-product (a zoom-through) never double-exposes', async () => {
  for (const [kind, preset, format] of [['film', 'editorial', '9x16'], ['film', 'editorial', '16x9'], ['film', 'calm-product', '1x1']]) {
    const o = await openPiece(GOLDEN, { server, browser, format, query: { story: kind, preset } });
    try { await zoomCheck(o, 'patterns', 'gate', `golden ${kind} ${preset} ${format}`); } finally { await o.close(); }
  }
});

test('the golden deck\'s zoom-through press never double-exposes (editorial)', async () => {
  const o = await openPiece(GOLDEN, { server, browser, format: '16x9', query: { story: 'deck', preset: 'editorial' } });
  try {
    const { schedule } = await o.mm.meta();
    const gate = sceneOf(schedule, 'gate');
    assert.equal(gate.cut.pattern, 'transitions/zoom-through');
    const both = [];
    for (let i = 0; i <= 40; i++) {
      const x = gate.start + i / 40;
      const [a, b] = await exposures(o.page, x, 'patterns', 'gate');
      if (a > 0.002 && b > 0.002) both.push(`${x}: ${a.toFixed(3)} / ${b.toFixed(3)}`);
    }
    assert.deepEqual(both, []);
  } finally { await o.close(); }
});

// The ink box of a slot's text, in frame pixels, as drawn (transforms included).
const inkAt = (page, t, id, slot) => page.evaluate(([x, id, slot]) => {
  window.mm.seek(x);
  const el = document.querySelector(`[data-scene="${id}"] [data-slot="${slot}"]`);
  const r = document.createRange(); r.selectNodeContents(el);
  const b = r.getBoundingClientRect();
  const safe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mm-safe'));
  return { l: b.left, r: b.right, t: b.top, b: b.bottom, W: innerWidth, H: innerHeight, safe, scale: el.style.scale || 'none', o: Number(getComputedStyle(el).opacity) };
}, [t, id, slot]);

for (const preset of PRESETS) {
  test(`slam and punch · ${preset}: text never crosses the safe margin mid-entrance, and still lands from larger`, async () => {
    for (const format of ['9x16', '1x1', '16x9']) {
      const o = await open({ preset }, format);
      try {
        const { schedule } = await o.mm.meta();
        for (const id of ['slam', 'punch']) {
          const arrive = schedule.events.find((e) => e.kind === 'arrive' && e.selector === `[data-scene="${id}"] [data-slot="headline"]`);
          const out = []; let grew = false;
          for (const t of frames(arrive.t, arrive.t + arrive.d)) {
            const k = await inkAt(o.page, t, id, 'headline');
            if (k.o <= 0) continue;
            if (k.l < k.safe - 1 || k.r > k.W - k.safe + 1 || k.t < k.safe - 1 || k.b > k.H - k.safe + 1) out.push(`${t}: ${Math.round(k.l)}-${Math.round(k.r)} x ${Math.round(k.t)}-${Math.round(k.b)} scale ${k.scale}`);
            if (k.scale !== 'none' && Number(k.scale) > 1.001) grew = true;
          }
          assert.deepEqual(out, [], `${preset} ${format} ${id}: text outside the safe area mid-entrance`);
          assert.ok(grew, `${preset} ${format} ${id}: the entrance still starts larger than rest`);
        }
      } finally { await o.close(); }
    }
  });
}

test('a dropping plate never covers the headline above it (bento-3, every preset and format)', async () => {
  for (const preset of PRESETS) for (const format of ['9x16', '1x1', '16x9']) {
    const o = await open({ preset }, format);
    try {
      const { schedule } = await o.mm.meta();
      const sc = sceneOf(schedule, 'bento');
      const hits = [];
      for (const t of frames(sc.start, sc.end - 0.01)) {
        const r = await o.page.evaluate((x) => {
          window.mm.seek(x);
          const box = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
          const h = box(document.querySelector('[data-scene="bento"] [data-slot="headline"]'));
          return [1, 2, 3].map((i) => {
            const el = document.querySelector(`[data-scene="bento"] [data-slot="tile-${i}"]`);
            if (getComputedStyle(el).visibility === 'hidden' || Number(getComputedStyle(el).opacity) === 0) return null;
            const b = el.getBoundingClientRect();
            const overlap = b.left < h.right && b.right > h.left && b.top < h.bottom && b.bottom > h.top;
            return overlap ? `tile-${i} top ${Math.round(b.top)} < headline bottom ${Math.round(h.bottom)}` : null;
          }).filter(Boolean);
        }, t);
        hits.push(...r.map((x) => `${t}: ${x}`));
      }
      assert.deepEqual(hits, [], `${preset} ${format}`);
    } finally { await o.close(); }
  }
});

// What a viewer reads of a figure: innerText skips text that is not visible.
const figureText = (page, x, id) => page.evaluate(([x, id]) => {
  window.mm.seek(x);
  const el = document.querySelector(`[data-scene="${id}"] [data-slot="figure"]`);
  const s = getComputedStyle(el.closest('[data-scene]'));
  if (s.visibility === 'hidden' || getComputedStyle(el).visibility === 'hidden') return null;
  return { text: el.innerText.trim(), full: el.textContent.trim() };
}, [x, id]);

// The figure "35 rules" is the composition fixture's own invented fact (layouts.json), not the gate's count.
test('a counted figure shows its unit only on the number it lands on, and keeps its place (count and counter)', async () => {
  for (const preset of PRESETS) {
    const o = await open({ preset }, '16x9');
    try {
      const { schedule } = await o.mm.meta();
      for (const id of ['stat', 'counter']) {
        const sc = sceneOf(schedule, id);
        const rest = schedule.rests.find((r) => r >= sc.start && r < sc.end);
        const final = await figureText(o.page, rest, id);
        assert.equal(final.text, '35 rules', `${preset} ${id}: the rest shows the fact`);
        const bad = [], unheld = [];
        let counted = 0;
        for (const t of frames(sc.start, rest)) {
          const f = await figureText(o.page, t, id);
          if (!f || !f.text) continue;
          if (/rules/.test(f.text) && f.text !== '35 rules') bad.push(`${t}: "${f.text}"`);
          if (/^\d+$/.test(f.text)) { counted++; if (f.full !== `${f.text} rules`) unheld.push(`${t}: "${f.full}"`); }
        }
        assert.deepEqual(bad, [], `${preset} ${id}: a unit against a number the fact does not carry`);
        assert.ok(counted > 0, `${preset} ${id}: the figure counts`);
        assert.deepEqual(unheld, [], `${preset} ${id}: the unit keeps its place (laid out, not shown) while the number counts`);
      }
    } finally { await o.close(); }
  }
});

// The golden deck states the gate's rule count; the tree is the source of that number.
const RULES = readdirSync(join(ROOT, 'scripts/check')).filter((f) => /^[GW]-.*\.mjs$/.test(f)).length;

test('the golden deck\'s gate figure never reads "1 rules", and every rest shows the fact (editorial)', async () => {
  const o = await openPiece(GOLDEN, { server, browser, format: '16x9', query: { story: 'deck', preset: 'editorial' } });
  try {
    const { schedule } = await o.mm.meta();
    const gate = sceneOf(schedule, 'gate');
    const bad = [];
    for (let i = 0; i <= 100; i++) {
      const x = gate.start + (i / 100) * (gate.end - gate.start);
      const f = await figureText(o.page, x, 'gate');
      if (f && /rules/.test(f.text) && f.text !== `${RULES} rules`) bad.push(`${x}: "${f.text}"`);
      if (f && Number.isInteger(x) && x > gate.start) assert.equal(f.text, `${RULES} rules`, `rest ${x}`);
    }
    assert.deepEqual(bad, []);
  } finally { await o.close(); }
});

test('an idle under the hook keeps frame 0 finished (G-HOOK) and moves in the first second', async () => {
  for (const preset of PRESETS) {
    const o = await open({ preset, story: 'opening' }, '9x16');
    try {
      const at = (t) => o.page.evaluate((x) => {
        window.mm.seek(x);
        const r = window.mm.report().elements.find((e) => e.selector === '[data-scene="hook"] [data-slot="headline"]');
        const cam = document.querySelector('[data-scene="hook"] .mm-camera');
        return { progress: r.progress, visible: r.visible, box: r.box, transform: getComputedStyle(cam).transform };
      }, t);
      const f0 = await at(0);
      assert.deepEqual([f0.progress, f0.visible], [1, true], `${preset}: the hook is finished on frame 0`);
      assert.ok(f0.transform === 'none' || f0.transform === 'matrix(1, 0, 0, 1, 0, 0)', `${preset}: frame 0 is the rest picture (${f0.transform})`);
      const moved = [];
      for (const t of frames(1 / FPS, 1)) { const f = await at(t); if (Math.abs(f.box.y - f0.box.y) > 0.25 || Math.abs(f.box.w - f0.box.w) > 0.25) moved.push(t); }
      assert.ok(moved.length >= FPS / 2, `${preset}: the first second moves on most frames (${moved.length} of ${FPS})`);
    } finally { await o.close(); }
  }
});
