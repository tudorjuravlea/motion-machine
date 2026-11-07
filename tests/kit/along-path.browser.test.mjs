// moves/along-path in the browser, on the pattern's own demo story: the carried slot's centre is on the
// path at every instant (to within a pixel and a half), it turns to face the way it goes, it waits at the
// start and rests at the end, the trail is drawn behind it and nothing leaves the camera; a frame is the
// same in either seek order. The camera target dives and is back on the whole frame at rest.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { frameOf, carry } from '../../patterns/moves/along-path/pattern.js';

const OUT = join(ROOT, 'out', 'along-path-test');
const demo = JSON.parse(readFileSync(join(ROOT, 'patterns/moves/along-path/demo/story.json'), 'utf8'));
const camera = JSON.parse(JSON.stringify(demo));
camera.scenes[0].moveParams = { ...demo.scenes[0].moveParams, target: 'camera', trail: 'comet', zoom: 1.6 };
let server, browser, dir, camDir;
const build = (name, story) => {
  const d = join(OUT, name), style = join(OUT, `${name}.style.json`);
  composeToFile({ brand: 'paper', motion: 'calm', out: style });
  newPiece({ kind: 'film', style, dir: d });
  writeFileSync(join(d, 'story.json'), JSON.stringify(story, null, 2));
  return d;
};
before(async () => {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  dir = build('carry', demo); camDir = build('camera', camera);
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);
const probe = (o) => o.page.evaluate(() => {
  const el = document.querySelector('[data-slot="sub"]'), cam = document.querySelector('.mm-camera');
  const r = el.getBoundingClientRect(), c = cam.getBoundingClientRect();
  const m = getComputedStyle(el).transform;
  const v = m === 'none' ? [1, 0, 0, 1] : m.match(/matrix\(([^)]*)\)/)[1].split(',').map(Number);
  const path = document.querySelector('.mm-along path');
  return {
    cx: r.left + r.width / 2 - c.left, cy: r.top + r.height / 2 - c.top, angle: Math.atan2(v[1], v[0]), W: cam.offsetWidth, H: cam.offsetHeight,
    trail: path ? { dash: path.style.strokeDasharray, hidden: path.style.visibility === 'hidden' } : null, camTransform: getComputedStyle(cam).transform,
  };
});

for (const format of ['16x9', '9x16']) {
  test(`${format}: the slot rides the path, facing the way it goes, waits at the start and rests at the end`, async () => {
    const o = await openPiece(dir, { server, browser, format });
    try {
      const prm = demo.scenes[0].moveParams;
      await o.mm.seek(0.2);
      const first = await probe(o);
      const frame = frameOf(prm.path, first.W, first.H, 0.12);
      const at = (q) => carry(frame, q, { window: prm.soften });
      near(first.cx, at(0).x, 1.5, 'waits at the start x'); near(first.cy, at(0).y, 1.5, 'waits at the start y');
      assert.ok(first.trail === null || first.trail.hidden, 'no trail drawn before it sets off');
      for (const u of [1.2, 1.8, 2.4, 3.0]) {
        await o.mm.seek(u);
        const s = await probe(o);
        const raw = Math.min(1, Math.max(0, (u - prm.start) / prm.dur));
        // the style's move ease turns the clock into q; read it back from where the slot is instead: it is on the path
        let best = Infinity, bq = 0;
        for (let k = 0; k <= 8000; k++) { const p = at(k / 8000); const d = Math.hypot(p.x - s.cx, p.y - s.cy); if (d < best) { best = d; bq = k / 8000; } }
        assert.ok(best < 1.5, `at ${u}s the slot is ${best}px off the path (q ${bq})`);
        const want = at(bq).angle, got = s.angle;
        near(Math.atan2(Math.sin(got - want), Math.cos(got - want)), 0, 0.03, `heading at ${u}s`);
        assert.ok(s.trail && !s.trail.hidden, 'the trail is drawn');
        assert.ok(raw > 0 && raw < 1);
      }
      await o.mm.seek(4.8);
      const end = await probe(o);
      near(end.cx, at(1).x, 1.5); near(end.cy, at(1).y, 1.5);
      assert.deepEqual(o.errors, []);
    } finally { await o.close(); }
  });
}

test('a frame is the same in either seek order', async () => {
  const o = await openPiece(dir, { server, browser, format: '16x9' });
  try {
    const ts = [0.2, 1.4, 2.0, 3.1, 4.8];
    const fwd = {};
    for (const t of ts) { await o.mm.seek(t); fwd[t] = JSON.stringify(await probe(o)); }
    for (const t of ts.slice().reverse()) { await o.mm.seek(t); assert.equal(JSON.stringify(await probe(o)), fwd[t], `t ${t}`); }
  } finally { await o.close(); }
});

test('target camera: the camera dives towards the point and is back on the whole frame at rest', async () => {
  const o = await openPiece(camDir, { server, browser, format: '16x9' });
  try {
    await o.mm.seek(0.2);
    assert.equal((await probe(o)).camTransform, 'none');
    await o.mm.seek(2.1);
    const mid = await probe(o);
    assert.notEqual(mid.camTransform, 'none');
    const k = Number(mid.camTransform.match(/matrix\(([^,]*),/)[1]);
    assert.ok(k > 1.2 && k <= 1.6 + 1e-6, `dived by ${k}`);
    await o.mm.seek(4.8);
    assert.equal((await probe(o)).camTransform, 'none', 'the whole frame at rest');
    assert.deepEqual(o.errors, []);
  } finally { await o.close(); }
});
