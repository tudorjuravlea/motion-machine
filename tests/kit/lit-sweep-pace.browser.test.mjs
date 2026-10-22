// text/lit-sweep reads at a steady pace whatever the motion style's entrance easing: under kinetic (a sharp
// ease-out) a quarter of the way through the entrance most words are still unlit, and three quarters of the way
// through most are lit. A cursor that took the entrance easing lit nearly every word in the first quarter.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';

const OUT = join(ROOT, 'out', 'lit-sweep-pace-test');
const TEXT = 'We read what the light reaches, one steady line at a time, and never faster';
const story = {
  id: 'lit-sweep-pace-test', kind: 'film', formats: ['16x9'], title: 'lit-sweep pace test', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null },
  scenes: [{ id: 'a', layout: 'layouts/statement', duration: 5, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
    beats: [{ at: 0.2, slot: 'headline', fx: 'text/lit-sweep', text: TEXT }] }],
  cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' },
};
let server, browser, dir;
before(async () => {
  mkdirSync(OUT, { recursive: true });
  dir = join(OUT, 'kinetic');
  const style = join(OUT, 'kinetic.style.json');
  rmSync(dir, { recursive: true, force: true });
  composeToFile({ brand: 'paper', motion: 'kinetic', out: style });
  newPiece({ kind: 'film', style, dir });
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story, null, 2));
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const SEL = '[data-scene="a"] [data-slot="headline"]';
// The share of words whose colour is (almost) the full ink: the lit words.
const litShare = (o) => o.page.evaluate((s) => {
  const el = document.querySelector(s);
  const words = [...el.querySelectorAll('.mm-lit-sweep__w')];
  const full = words.filter((w) => !/color-mix/.test(w.style.color) || /var\(--mm-color-ink\) (9[5-9]|100)(\.\d+)?%/.test(w.style.color));
  return words.length ? full.length / words.length : 1;
}, SEL);

test('kinetic: a quarter through, most words are unlit; three quarters through, most are lit', async () => {
  const o = await openPiece(dir, { server, browser, format: '16x9' });
  try {
    const it = (await o.mm.meta()).schedule.items.find((i) => i.selector === SEL);
    await o.mm.seek(it.start + it.d * 0.25);
    const early = await litShare(o);
    await o.mm.seek(it.start + it.d * 0.75);
    const late = await litShare(o);
    assert.ok(early <= 0.45, `a quarter through, ${Math.round(early * 100)} % of words are lit`);
    assert.ok(late >= 0.55, `three quarters through, ${Math.round(late * 100)} % of words are lit`);
  } finally { await o.close(); }
});
