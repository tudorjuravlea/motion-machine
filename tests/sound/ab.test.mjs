// `mm sound-listen --ab <a> <b> [--trials 20]` (SPEC §9): a blind A/B page. Both sounds are loudness-matched (K-weighted
// loudest 100 ms for short sounds, 400 ms from 1 s) with one common gain that keeps the true peak at -1 dBTP or under,
// trimmed at the same decay level with a 4 ms fade-in, refused (with the reason) when they differ by more than 0.5 LU,
// have more than 5 ms of pre-roll or sit less than 6 dB above their own floor; sides are randomised with A on exactly half;
// every verdict is kept in the page's local storage and exported as verdicts.json; the results view says the score and its p.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT } from '../../fixtures/sound/setup.mjs';
import { decodeStereo } from '../../scripts/lib/audio-decode.mjs';
import { AbRefused, abArrangement, buildAb, judgePair, loudestWindow, pValue, truePeakDb } from '../../scripts/lib/sound-ab.mjs';
import { wavOf } from '../../scripts/sound-listen.mjs';
import { plan } from '../../scripts/mm.mjs';

const SR = 48000;
let tmp;
before(() => { tmp = mkdtempSync(join(tmpdir(), 'mm-ab-')); });
after(() => rmSync(tmp, { recursive: true, force: true }));

/** A struck sound: a sine with a 2 ms attack and an exponential decay, on digital silence, `lead` seconds of it first. */
function blip({ f, amp, tau, seconds = 0.6, lead = 0.02, noise = 0 }) {
  const n = Math.round(seconds * SR), L = new Float32Array(n), R = new Float32Array(n);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  for (let i = Math.round(lead * SR); i < n; i++) {
    const t = (i - lead * SR) / SR, env = Math.min(1, t / 0.002) * Math.exp(-t / tau);
    L[i] = amp * env * (Math.sin(2 * Math.PI * f * t) + noise * rnd());
    R[i] = amp * env * (Math.sin(2 * Math.PI * f * t + 0.3) + noise * rnd());
  }
  return [L, R];
}
const put = (name, ch) => { const f = join(tmp, name); writeFileSync(f, wavOf(ch, SR)); return f; };

test('the arrangement: A on exactly half the trials, the same for the same seed, different for another', () => {
  for (const n of [20, 10, 6, 2]) {
    const a = abArrangement(n, 5);
    assert.equal(a.length, n);
    assert.equal(a.filter((x) => x === 'A').length, n / 2, `${n} trials`);
  }
  assert.deepEqual(abArrangement(20, 5), abArrangement(20, 5));
  assert.notDeepEqual(abArrangement(20, 5), abArrangement(20, 6));
  const odd = abArrangement(7, 3).filter((x) => x === 'A').length;
  assert.ok(odd === 3 || odd === 4);
  assert.throws(() => abArrangement(0, 1), /trials/);
});

test('the p-value: 15 right of 20 is p = 0.021, as a one-sided binomial at chance 0.5', () => {
  assert.ok(Math.abs(pValue(15, 20) - 0.0207) < 0.0005, `${pValue(15, 20)}`);
  assert.equal(pValue(0, 20), 1);
  assert.ok(Math.abs(pValue(20, 20) - 2 ** -20) < 1e-12);
  assert.ok(Math.abs(pValue(10, 20) - 0.5881) < 0.001);
  assert.equal(pValue(0, 0), 1);
});

test('true peak finds the peak between the samples; the loudest window follows the amplitude', () => {
  // a 12 kHz sine at 45 degrees of phase has samples at +-0.707 of its peak: sample peak -3 dB, true peak 0 dB
  const n = SR / 10, s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = Math.sin((2 * Math.PI * 12000 * i) / SR + Math.PI / 4);
  const tp = truePeakDb([s, s]);
  assert.ok(Math.abs(tp) < 0.3, `true peak ${tp}`);
  const k = (a) => Float32Array.from(s, (v) => v * a);
  assert.ok(Math.abs(loudestWindow([k(0.5), k(0.5)], SR, 0.1) - loudestWindow([s, s], SR, 0.1) + 6.02) < 0.05);
  const tone = (ms) => { const x = new Float32Array((SR * ms) / 1000); for (let i = 0; i < x.length; i++) x[i] = 0.1 * Math.sin((2 * Math.PI * 1000 * i) / SR); return [x, Float32Array.from(x)]; };
  const d = loudestWindow(tone(100), SR, 0.1) - loudestWindow(tone(50), SR, 0.1);   // 50 ms of sound is counted over the whole 100 ms window, silence after it
  assert.ok(Math.abs(d - 3.01) < 0.15, `${d} dB`);
});

test('two sounds are matched within 0.1 LU on the loudest 100 ms, with one common gain under -1 dBTP', async () => {
  const a = put('a.wav', blip({ f: 1200, amp: 0.2, tau: 0.05 }));
  const b = put('b.wav', blip({ f: 300, amp: 0.9, tau: 0.12, noise: 0.2 }));
  const out = join(tmp, 'pair');
  const r = await buildAb({ a, b, out, trials: 20, seed: 1 });
  assert.equal(r.ok, true, JSON.stringify(r.reasons));
  const [s1, s2] = await Promise.all([decodeStereo(join(out, 's1.wav')), decodeStereo(join(out, 's2.wav'))]);
  const d = Math.abs(loudestWindow(s1, SR, 0.1) - loudestWindow(s2, SR, 0.1));
  assert.ok(d < 0.1, `${d} LU apart`);
  assert.equal(r.window, '100 ms');
  assert.ok(Math.max(truePeakDb(s1), truePeakDb(s2)) <= -1 + 0.1, `${truePeakDb(s1)} ${truePeakDb(s2)}`);
  assert.ok(Math.abs(r.facts.loudDiffLu) < 0.1);
  assert.ok(r.facts.prerollMs <= 5, 'a 4 ms fade-in and nothing before it');
  const lead = (ch) => { let i = 0; while (i < ch[0].length && Math.abs(ch[0][i]) < 1e-6) i++; return i / SR; };
  assert.ok(lead(s1) < 0.005 && lead(s2) < 0.005, 'both start within their 4 ms fade-in of the onset');
  assert.ok(Math.abs(r.gains.s1Db - r.gains.s2Db) > 1, 'the louder one was turned down');
});

test('a sound of a second or more is matched on its loudest 400 ms', async () => {
  const a = put('long-a.wav', blip({ f: 500, amp: 0.3, tau: 0.5, seconds: 2.5 }));
  const b = put('long-b.wav', blip({ f: 220, amp: 0.15, tau: 0.3, seconds: 2.5 }));
  const r = await buildAb({ a, b, out: join(tmp, 'long'), trials: 4, seed: 1 });
  assert.equal(r.window, '400 ms');
  const [s1, s2] = await Promise.all([decodeStereo(join(tmp, 'long', 's1.wav')), decodeStereo(join(tmp, 'long', 's2.wav'))]);
  assert.ok(Math.abs(loudestWindow(s1, SR, 0.4) - loudestWindow(s2, SR, 0.4)) < 0.1);
});

test('a recipe cue by name is a sound too', async () => {
  const r = await buildAb({ a: 'tap', b: 'ready', out: join(tmp, 'cues'), trials: 6, seed: 2, profile: 'soft-ui' });
  assert.equal(r.ok, true, JSON.stringify(r.reasons));
  assert.deepEqual([r.labels.a, r.labels.b], ['tap', 'ready']);
});

test('the pair is refused, with the reason, when a sound has no decay to trim at, is silent, or is not there', async () => {
  const click = put('click.wav', blip({ f: 2000, amp: 0.5, tau: 0.01, seconds: 0.4 }));
  const hum = put('hum.wav', (() => { const n = SR / 2, L = new Float32Array(n); for (let i = 0; i < n; i++) L[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / SR); return [L, Float32Array.from(L)]; })());
  await assert.rejects(() => buildAb({ a: click, b: hum, out: join(tmp, 'refused'), trials: 20, seed: 1 }), (e) => e instanceof AbRefused && /floor/.test(e.reasons.join(' ')));
  assert.ok(!existsSync(join(tmp, 'refused', 'ab.html')), 'nothing is written for a refused pair');
  const silent = put('silent.wav', [new Float32Array(SR / 4), new Float32Array(SR / 4)]);
  await assert.rejects(() => buildAb({ a: click, b: silent, out: join(tmp, 'refused2'), trials: 20, seed: 1 }), (e) => e instanceof AbRefused && /silent/.test(e.reasons.join(' ')));
  await assert.rejects(() => buildAb({ a: click, b: join(tmp, 'nope.wav'), out: join(tmp, 'refused3'), trials: 20, seed: 1 }), /nope\.wav/);
});

test('judgePair: more than 0.5 LU, more than 5 ms of pre-roll, a floor margin under 6 dB, a true peak over -1 dBTP', () => {
  const ok = { loudDiffLu: 0.02, prerollMs: 4, floorMarginDb: 30, truePeakDbtp: -1.2, trimEdgeDiffDb: 1, trimEdgeLoudDb: -60 };
  assert.deepEqual(judgePair(ok), { ok: true, reasons: [] });
  const bad = (patch, re) => { const j = judgePair({ ...ok, ...patch }); assert.equal(j.ok, false); assert.match(j.reasons.join(' '), re); };
  bad({ loudDiffLu: 0.8 }, /0\.8.*LU/);
  bad({ loudDiffLu: -0.51 }, /LU/);
  bad({ prerollMs: 9 }, /pre-roll/);
  bad({ floorMarginDb: 3 }, /floor/);
  bad({ truePeakDbtp: -0.2 }, /true peak/);
  bad({ trimEdgeDiffDb: 14, trimEdgeLoudDb: -10 }, /trim/);
  assert.equal(judgePair({ ...ok, loudDiffLu: 0.5 }).ok, true, '0.5 LU is the limit, not past it');
});

test('the page: 20 trials with A on exactly ten, both sounds beside it, verdict choices, an export, no network', async () => {
  const out = join(tmp, 'page');
  const a = put('pa.wav', blip({ f: 900, amp: 0.3, tau: 0.06 })), b = put('pb.wav', blip({ f: 450, amp: 0.5, tau: 0.09 }));
  await buildAb({ a, b, out, trials: 20, seed: 11 });
  const html = readFileSync(join(out, 'ab.html'), 'utf8');
  const data = JSON.parse(/<script type="application\/json" id="ab-data">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.equal(data.sound1At.length, 20);
  assert.equal(data.sound1At.filter((x) => x === 'A').length, 10, 'A is the first sound on exactly half');
  assert.deepEqual(data.files, ['s1.wav', 's2.wav']);
  for (const tag of ['ok', 'loud', 'masked', 'harsh', 'extra', 'missing']) assert.match(html, new RegExp(`>${tag}<`));
  assert.match(html, /verdicts\.json/);
  assert.match(html, /localStorage/);
  assert.doesNotMatch(html, /https?:\/\//, 'nothing is loaded from the network');
  assert.doesNotMatch(html, /sound1At[^<]*"s1/, 'the sides are not in the file names');
  assert.ok(existsSync(join(out, 's1.wav')) && existsSync(join(out, 's2.wav')) && existsSync(join(out, 'ab-facts.json')));
});

test('the page works: a verdict is kept in local storage, the results say the score and p, the export carries them', async () => {
  const out = join(tmp, 'page2');
  const a = put('qa.wav', blip({ f: 900, amp: 0.3, tau: 0.06 })), b = put('qb.wav', blip({ f: 450, amp: 0.5, tau: 0.09 }));
  await buildAb({ a, b, out, trials: 20, seed: 11 });
  const data = JSON.parse(/id="ab-data">([\s\S]*?)<\/script>/.exec(readFileSync(join(out, 'ab.html'), 'utf8'))[1]);
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`file://${join(out, 'ab.html')}`);
    // 15 right of 20: pick the side that holds sound 1 on the first 15 trials, the other on the last five
    for (let i = 0; i < 20; i++) {
      const right = i < 15;
      const side = right ? data.sound1At[i] : data.sound1At[i] === 'A' ? 'B' : 'A';
      await page.click(`[data-pick="${side}"]`);
      if (i === 0) await page.click('[data-tag="loud"]');
      await page.click('[data-next]');
    }
    const stored = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
    const v = JSON.parse(JSON.parse(stored).find(([k]) => k.startsWith('mm-ab:'))[1]);
    assert.equal(v.length, 20, 'every verdict is kept');
    assert.deepEqual([v[0].pick, v[0].tag], [data.sound1At[0], 'loud']);
    const text = await page.innerText('#results');
    assert.match(text, /15 of 20/);
    assert.match(text, /p = 0\.021/);
    await page.reload();
    assert.match(await page.innerText('#results'), /15 of 20/, 'and they survive a reload');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
    assert.equal(dl.suggestedFilename(), 'verdicts.json');
    const exported = JSON.parse(readFileSync(await dl.path(), 'utf8'));
    assert.equal(exported.score.right, 15);
    assert.equal(exported.score.n, 20);
    assert.equal(exported.verdicts.length, 20);
    assert.ok(exported.verdicts.every((x) => ['A', 'B'].includes(x.pick) && ['A', 'B'].includes(x.sound1At)));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

const mm = (...args) => spawnSync(process.execPath, [join(ROOT, 'scripts', 'mm.mjs'), ...args], { encoding: 'utf8', timeout: 120_000 });

test('mm sound-listen --ab: routes, builds the page, and exits 1 with the reason for a pair it refuses', () => {
  assert.equal(plan(['sound-listen', '--ab', 'a.wav', 'b.wav', '--trials', '12']).script, 'sound-listen.mjs');
  assert.match(plan(['sound-listen', '--help']).help, /--ab/);
  const a = put('ca.wav', blip({ f: 1000, amp: 0.3, tau: 0.05 })), b = put('cb.wav', blip({ f: 500, amp: 0.4, tau: 0.08 }));
  const out = join(tmp, 'cli');
  const r = mm('sound-listen', '--ab', a, b, '--trials', '12', '--out', out);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /12 trials/);
  assert.ok(existsSync(join(out, 'ab.html')));
  const hum = put('chum.wav', (() => { const n = SR / 2, L = new Float32Array(n); for (let i = 0; i < n; i++) L[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / SR); return [L, Float32Array.from(L)]; })());
  const bad = mm('sound-listen', '--ab', a, hum, '--out', join(tmp, 'cli2'));
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /refus/i);
  assert.match(bad.stderr, /floor/);
  const one = mm('sound-listen', '--ab', a);
  assert.equal(one.status, 2, 'two sounds are needed');
});
