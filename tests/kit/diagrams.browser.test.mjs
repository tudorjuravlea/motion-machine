// The structure diagrams (data/org-chart, cycle, venn, pyramid, matrix, timeline): every variant of
// their demos, in one film, passes the gate's layout rules in all three formats (nothing overlaps or
// leaves the safe area, every text clears the floor, every rest holds still, no clock of its own); a
// frame is a function of t; the brand's params reach the diagram; a pattern with no text draws nothing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { runCheck } from '../../scripts/check.mjs';

const OUT = join(ROOT, 'out', 'diagrams-test');
const NAMES = ['org-chart', 'cycle', 'venn', 'pyramid', 'matrix', 'timeline'];
const demo = (n) => JSON.parse(readFileSync(join(ROOT, 'patterns', 'data', n, 'demo', 'story.json'), 'utf8'));
const scenes = NAMES.flatMap((n) => demo(n).scenes.map((s) => ({ ...s, id: `${n}-${s.id}` })));
// and the crowded cases: six items, long names, three items in a quadrant, a bold brand's params
const crowd = (id, fx, params) => ({ id, layout: 'layouts/title-stack', duration: 5, cut: 'transitions/hard-cut', move: null, say: 'x',
  beats: [{ at: 0.3, slot: 'headline', fx: `data/${fx}`, params: { ...params, dur: 'hold' } }, { at: 3, slot: 'sub', fx: 'entrances/fade', text: id }] });
const WHEN = 'Jan>Discovery phase|Mar>Prototype review|May>Pilot|Jul>Rollout|Sep>Scale|Dec>Review';
scenes.push(
  crowd('crowd-cycle', 'cycle', { nodes: 'Discover|Define|Develop|Deliver|Measure|Improve', centre: 'Double diamond', hero: 3 }),
  crowd('crowd-org', 'org-chart', { nodes: 'Chief Executive|>Sales,Tech,Money|>>Lead,Deal|>>Build,Data' }),
  crowd('crowd-roadmap', 'timeline', { nodes: WHEN, hero: 6 }),
  crowd('crowd-milestones', 'timeline', { nodes: WHEN, variant: 'milestones' }),
  crowd('crowd-gantt', 'timeline', { nodes: 'Discovery research>0-3|Prototype>2-6|Build>5-14|Test>12-16|Pilot>17-22', variant: 'gantt', unit: 'Week' }),
  crowd('crowd-stepper', 'timeline', { nodes: 'Brief>What and why|Design>Shape the look|Build>Make it work|Test>Break it|Ship>Tell the world', variant: 'stepper' }),
  crowd('crowd-pyramid', 'pyramid', { nodes: 'Vision|Strategy|Programmes|Projects|Tasks|Tools' }),
  crowd('crowd-matrix', 'matrix', { nodes: 'Quick wins>Search bar,Share sheet,Dark mode|Big bets>Realtime sync,Offline mode|Fill-ins>Themes,Tips,Badges|Money pits>Plugin store', x: 'Effort', y: 'Impact', hero: 2 }),
  crowd('crowd-venn', 'venn', { nodes: 'Desirable|Feasible|Viable', overlap: 'Innovation' }),
  crowd('crowd-bold', 'cycle', { nodes: 'Plan|Do|Check|Act', line: 0.012, shape: 'square', face: 'mono', accent: 'ink', edge: 'ink' }),
);
const story = { ...demo('cycle'), id: 'diagrams-test', title: 'diagrams', scenes };
const dir = join(OUT, 'piece'), brandDir = join(OUT, 'brand');
let server, browser;

before(async () => {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  newPiece({ kind: 'film', style: join(ROOT, 'styles/presets/editorial.json'), dir });
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story, null, 2));
  // the same story worn by a brand that sets params for two diagrams
  newPiece({ kind: 'film', style: join(ROOT, 'styles/presets/editorial.json'), dir: brandDir });
  const style = JSON.parse(readFileSync(join(brandDir, 'style.json'), 'utf8'));
  style.patterns = { 'data/org-chart': { variant: 'tree', shape: 'square', line: 0.012, accent: 'ink', face: 'mono' }, 'data/cycle': { shape: 'disc' } };
  writeFileSync(join(brandDir, 'style.json'), JSON.stringify(style, null, 2));
  writeFileSync(join(brandDir, 'story.json'), JSON.stringify(story, null, 2));
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const RULES = ['G-TIME', 'G-DETERMINISM', 'G-LOCAL', 'G-PATTERN-REF', 'G-LEGIBLE', 'G-REST', 'G-EDGE', 'G-OVERLAP', 'G-BRAND', 'W-LITERAL', 'W-OVERSHOOT', 'W-CONTRAST'];

for (const format of ['9x16', '1x1', '16x9']) {
  test(`every demo variant passes the layout rules in ${format}`, async () => {
    const r = await runCheck(dir, { formats: [format], browser, server, only: RULES });
    assert.deepEqual(r.rules.map((x) => x.id).sort(), [...RULES].sort(), 'every rule ran');
    const bad = r.rules.filter((x) => x.status !== 'PASS').map((x) => `${x.id} ${x.status}: ${x.evidence?.reason ?? ''} ${JSON.stringify(x.evidence?.selector ?? x.evidence?.measured ?? '')}`);
    assert.deepEqual(bad, []);
  });
}

const sceneStart = async (o, id) => (await o.mm.meta()).schedule.scenes.find((s) => s.id === id).start;
const htmlAt = (o, t, id) => o.page.evaluate(async ([t, id]) => {
  await window.mm.seek(t);
  return document.querySelector(`[data-scene="${id}"] [data-slot="headline"]`).innerHTML;
}, [t, id]);

test('a frame is a function of t: the same instant twice, and after a detour, gives the same markup', async () => {
  const o = await openPiece(dir, { server, browser, format: '16x9' });
  try {
    for (const id of NAMES.map((n) => `${n}-${n === 'org-chart' ? 'chart' : n === 'cycle' ? 'four' : n === 'venn' ? 'two' : n === 'pyramid' ? 'pyramid' : n === 'matrix' ? 'matrix' : 'gantt'}`)) {
      const t = (await sceneStart(o, id)) + 1.1;
      const a = await htmlAt(o, t, id);
      await htmlAt(o, t + 2, id);
      assert.equal(await htmlAt(o, t, id), a, id);
      assert.ok(a.includes('mm-dg'), `${id} drew a diagram`);
    }
  } finally { await o.close(); }
});

test('a brand sets params for every use: variant, shape, line weight, accent role and face reach the diagram', async () => {
  const o = await openPiece(brandDir, { server, browser, format: '16x9' });
  try {
    const t = (await sceneStart(o, 'org-chart-chart')) + 4;
    await o.mm.seek(t);
    const got = await o.page.evaluate((id) => {
      const root = document.querySelector(`[data-scene="${id}"] .mm-org`);
      return { variant: root.dataset.variant, shape: root.dataset.shape, line: root.style.getPropertyValue('--dg-line'), accent: root.style.getPropertyValue('--dg-accent'), face: root.style.getPropertyValue('--dg-face'),
        radius: getComputedStyle(root.querySelector('.mm-dg__plate')).borderTopLeftRadius, stroke: getComputedStyle(root.querySelector('.mm-dg__edge')).strokeWidth };
    }, 'org-chart-chart');
    assert.deepEqual([got.variant, got.shape, got.line, got.accent, got.face], ['tree', 'square', '0.012', 'var(--mm-color-ink)', 'var(--mm-font-mono)']);
    assert.equal(got.radius, '0px');
    assert.ok(Math.abs(parseFloat(got.stroke) - 0.012 * 1080) < 0.5, `stroke ${got.stroke}`);
    // a beat's own param still wins over the brand's
    const t2 = (await sceneStart(o, 'org-chart-mind-map')) + 4;
    await o.mm.seek(t2);
    assert.equal(await o.page.evaluate(() => document.querySelector('[data-scene="org-chart-mind-map"] .mm-org').dataset.variant), 'mind-map');
    const t3 = (await sceneStart(o, 'cycle-four')) + 4;
    await o.mm.seek(t3);
    assert.equal(await o.page.evaluate(() => document.querySelector('[data-scene="cycle-four"] .mm-cycle').dataset.shape), 'disc');
  } finally { await o.close(); }
});

test('a rest is finished: every node of every scene is real text, placed, fully opaque and unscaled, and the shapes carry their palette fills', async () => {
  const o = await openPiece(dir, { server, browser, format: '1x1' });
  try {
    const { schedule } = await o.mm.meta();
    assert.ok(schedule.scenes.length >= 25);
    for (const sc of schedule.scenes) {
      await o.mm.seek(sc.end - 1.5);
      const got = await o.page.evaluate((id) => {
        const nodes = [...document.querySelectorAll(`[data-scene="${id}"] .mm-dg__node`)];
        const parts = [...document.querySelectorAll(`[data-scene="${id}"] .mm-dg__node, [data-scene="${id}"] .mm-dg__plate, [data-scene="${id}"] .mm-dg__label`)];
        return {
          n: nodes.length,
          empty: nodes.filter((n) => !n.textContent.trim() || !Number.isFinite(parseFloat(n.style.top))).length,
          off: parts.filter((e) => getComputedStyle(e).opacity !== '1' || getComputedStyle(e).scale !== 'none' || getComputedStyle(e).visibility === 'hidden').length,
        };
      }, sc.id);
      assert.ok(got.n >= 2, `${sc.id}: drew ${got.n} nodes`);
      assert.equal(got.empty, 0, `${sc.id}: ${got.empty} nodes with no text or no place`);
      assert.equal(got.off, 0, `${sc.id}: ${got.off} elements not at rest`);
    }
    // circles and cells are filled with palette tints and outlined in roles, not left as the bare line style
    await o.mm.seek((await sceneStart(o, 'venn-two')) + 4);
    const venn = await o.page.evaluate(() => [...document.querySelectorAll('[data-scene="venn-two"] .mm-venn__disc')].map((c) => [getComputedStyle(c).fill, getComputedStyle(c).stroke]));
    assert.equal(venn.length, 2);
    assert.ok(venn.every(([f, s]) => f !== 'none' && f !== s), JSON.stringify(venn));
    assert.notEqual(venn[0][1], venn[1][1], 'the circles are outlined in different roles');
    await o.mm.seek((await sceneStart(o, 'matrix-matrix')) + 4);
    assert.ok(await o.page.evaluate(() => [...document.querySelectorAll('[data-scene="matrix-matrix"] .mm-matrix__cell')].every((c) => getComputedStyle(c).fill !== 'none')));
  } finally { await o.close(); }
});
