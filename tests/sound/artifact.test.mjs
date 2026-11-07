// W-SOUND-ARTIFACT (SPEC §7, §9): every cue a piece plays is checked for the defects a synthesised cue shows: an edge click, a DC
// offset, clipping, a truncated tail, a comb ring, a tail that rises again, stacked attacks (of a hit) and a rising glide.
// The detectors are checked the way a gate should be: one defect of each kind is planted in a clean sound and must be found
// (and only it), the clean sound and every shipped cue must pass.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, ctxFor as ctxIn, ensurePiece, variant } from '../../fixtures/sound/setup.mjs';
import { runCheck, IDS } from '../../scripts/check.mjs';
import wArtifact from '../../scripts/check/W-SOUND-ARTIFACT.mjs';
import { clipRuns, findArtifacts, roleNameOf } from '../../scripts/lib/sound-artifacts.mjs';
import { loadProfile } from '../../scripts/lib/sound-profile.mjs';
import { renderRecipe } from '../../runtime/kit/synth.js';
import { wavOf } from '../../scripts/sound-listen.mjs';

const SR = 48000;
const LIB = join(ROOT, 'patterns');
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1; }; };
const kinds = (f) => f.map((x) => x.kind).sort();
const stereo = (x) => [x, Float32Array.from(x)];

/** A clean cue: a bell-like decaying tone (1 : 2.76 : 5.4) with a 2 ms attack and a fade to nothing, ending at -60 dB. */
function bell({ f = 440, t60 = 0.3, seconds = 0.5, partials = [[1, 1], [2.76, 0.1], [5.4, 0.03]], peak = 0.5 } = {}) {
  const n = Math.round(seconds * SR), x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR, env = Math.min(1, t / 0.002) * 10 ** ((-3 * t) / t60) * Math.min(1, (seconds - t) / 0.02);
    let s = 0;
    for (const [r, g] of partials) s += g * Math.sin(2 * Math.PI * f * r * t);
    x[i] = peak * env * s;
  }
  return x;
}

test('the rule is in the gate\'s order, after the last warning', () => {
  assert.ok(IDS.includes('W-SOUND-ARTIFACT'));
  assert.ok(IDS.indexOf('W-SOUND-ARTIFACT') > IDS.indexOf('W-SAMPLE-LICENSE'));
});

test('a clean cue has no finding', () => {
  assert.deepEqual(findArtifacts(stereo(bell()), SR), []);
  assert.deepEqual(findArtifacts(stereo(bell({ f: 220, t60: 0.5, seconds: 0.8 })), SR), []);
});

test('planted: a click in the middle of the sound is found, and only it', () => {
  const x = bell();
  x[Math.round(0.15 * SR)] += 0.35;                                          // one sample
  const f = findArtifacts(stereo(x), SR);
  assert.deepEqual(kinds(f), ['click'], JSON.stringify(f));
  assert.ok(Math.abs(f[0].measured.times[0] - 0.15) < 0.003);
});

test('planted: a sound that starts or ends off zero clicks when played', () => {
  const x = bell({ seconds: 0.3 }), y = Float32Array.from(x.subarray(Math.round(0.1 * SR)));       // cut inside the sound: starts at a loud sample
  assert.deepEqual(kinds(findArtifacts(stereo(y), SR)), ['click']);
});

test('planted: a DC offset', () => {
  const x = bell();
  for (let i = 0; i < x.length; i++) x[i] += 0.04;
  const f = findArtifacts(stereo(x), SR);
  assert.ok(kinds(f).includes('dc'), JSON.stringify(f));
  assert.equal(f.filter((q) => q.kind === 'dc').length, 1);
});

test('planted: clipping, whether the samples sit at the ceiling or run past full scale', () => {
  const x = bell({ peak: 2 });
  const hard = Float32Array.from(x, (v) => Math.max(-1, Math.min(1, v)));
  assert.deepEqual(kinds(findArtifacts(stereo(hard), SR)), ['clipping']);
  assert.deepEqual(kinds(findArtifacts(stereo(x), SR)), ['clipping'], 'samples over full scale');
});

test('a quiet deep sine is not clipped: its slow, round top is not a flat one', () => {
  const sub = Float32Array.from({ length: SR }, (_, i) => 0.055 * Math.sin((2 * Math.PI * 44 * i) / SR) * Math.min(1, i / 480, (SR - i) / 4800));
  assert.deepEqual(clipRuns([sub]).clipRuns, 0);
});

test('planted: a tail cut off while it still rings', () => {
  const x = bell({ t60: 1.2, seconds: 0.5 });
  const n = Math.round(0.2 * SR);
  const cut = Float32Array.from(x.subarray(0, n), (v, i) => v * Math.min(1, (n - i) / (0.002 * SR)));       // a 2 ms fade at 0.2 s, where the tail is still about -10 dB
  const f = findArtifacts(stereo(cut), SR);
  assert.deepEqual(kinds(f), ['truncated'], JSON.stringify(f));
  assert.ok(f[0].measured.cutDb > -40);
});

test('a riser that stops on its loudest moment is not a cut tail', () => {
  const n = Math.round(0.6 * SR), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 0.5 * (i / n) ** 2 * Math.sin(2 * Math.PI * (300 + 200 * (i / n)) * (i / SR)) * Math.min(1, (n - i) / 8);
  assert.ok(!kinds(findArtifacts(stereo(x), SR, { cue: 'riser' })).includes('truncated'));
});

test('planted: a metallic comb ring in a noise tail', () => {
  const n = Math.round(0.7 * SR), r = rng(4), x = new Float32Array(n), d = Math.round(0.003 * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR, env = Math.min(1, t / 0.002) * 10 ** ((-3 * t) / 0.25) * Math.min(1, (0.7 - t) / 0.02);
    x[i] = 0.3 * env * r() + (i >= d ? 0.92 * x[i - d] : 0);
  }
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const f = findArtifacts(stereo(Float32Array.from(x, (v) => (0.5 * v) / peak)), SR);
  assert.ok(kinds(f).includes('ring'), JSON.stringify(f));
  assert.ok(Math.abs(f.find((q) => q.kind === 'ring').measured.ms - 3) < 0.4);
  const plain = new Float32Array(n);
  const r2 = rng(4);
  for (let i = 0; i < n; i++) { const t = i / SR; plain[i] = 0.3 * Math.min(1, t / 0.002) * 10 ** ((-3 * t) / 0.25) * Math.min(1, (0.7 - t) / 0.02) * r2(); }
  assert.ok(!kinds(findArtifacts(stereo(plain), SR)).includes('ring'), 'the same noise without the comb is clean');
});

test('planted: a tail that rises again', () => {
  const x = bell({ t60: 0.15, seconds: 0.7 });
  for (let i = Math.round(0.4 * SR); i < Math.round(0.5 * SR); i++) {          // a ghost note 100 ms long, 22 dB under the peak, when the first has fallen 50 dB
    const t = (i - 0.4 * SR) / SR;
    x[i] += 0.04 * Math.sin(Math.PI * Math.min(1, t / 0.02, (0.1 - t) / 0.02) / 2) * Math.sin(2 * Math.PI * 1500 * t);
  }
  const f = findArtifacts(stereo(x), SR);
  assert.deepEqual(kinds(f), ['rerise'], JSON.stringify(f));
});

test('a cue of several notes is not a rise in the tail: the next note comes while the first still rings', () => {
  const a = bell({ f: 440, t60: 0.3, seconds: 0.5 }), b = bell({ f: 659, t60: 0.3, seconds: 0.5 }), x = new Float32Array(Math.round(0.65 * SR));
  x.set(a);
  for (let i = 0; i < b.length; i++) x[i + Math.round(0.06 * SR)] += b[i] * 0.9;
  assert.deepEqual(kinds(findArtifacts(stereo(x), SR)), []);
});

test('planted: stacked attacks of a hit (a double knock 80 ms apart); one clean decay is clean', () => {
  const knock = (t) => (t < 0 ? 0 : Math.sin(2 * Math.PI * 180 * t) * Math.exp(-40 * t) * Math.min(1, t / 0.002));
  const clean = Float32Array.from({ length: Math.round(0.5 * SR) }, (_, i) => 0.5 * knock(i / SR)), double = Float32Array.from(clean, (v, i) => v + 0.5 * knock(i / SR - 0.08));
  assert.deepEqual(kinds(findArtifacts(stereo(clean), SR, { cue: 'hit' })), []);
  const f = findArtifacts(stereo(double), SR, { cue: 'hit' });
  assert.deepEqual(kinds(f), ['stacked'], JSON.stringify(f));
  assert.deepEqual(kinds(findArtifacts(stereo(double), SR, { cue: 'warning' })), [], 'a cue that is not a hit may sound twice by design');
  assert.equal(roleNameOf('sound/hit'), 'hit');
  assert.equal(roleNameOf('anything'), 'tone');
});

test('planted: a long build before a hit', () => {
  const n = Math.round(0.8 * SR), x = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; x[i] = 0.5 * (t < 0.3 ? 0.06 * (t / 0.3) ** 2 + 0.01 : Math.exp(-30 * (t - 0.3))) * Math.sin(2 * Math.PI * 150 * t) * Math.min(1, (n - i) / 400); }
  const f = findArtifacts(stereo(x), SR, { role: 'hit' });
  assert.ok(kinds(f).includes('stacked'), JSON.stringify(f));
});

test('planted: a rising glide (the synth whip); a falling one and a steady tone are clean', () => {
  const sweep = (f0, f1, seconds = 0.3) => {
    const n = Math.round(seconds * SR), x = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, f = f0 * (f1 / f0) ** (t / seconds);
      ph += (2 * Math.PI * f) / SR;
      x[i] = 0.5 * Math.min(1, t / 0.005) * 10 ** ((-3 * t) / 0.25) * Math.min(1, (seconds - t) / 0.02) * Math.sin(ph);
    }
    return x;
  };
  const up = findArtifacts(stereo(sweep(300, 1200)), SR);
  assert.deepEqual(kinds(up), ['glide'], JSON.stringify(up));
  assert.ok(up[0].measured.riseSt > 8);
  assert.deepEqual(kinds(findArtifacts(stereo(sweep(1200, 300)), SR)), []);
  assert.deepEqual(kinds(findArtifacts(stereo(sweep(440, 450)), SR)), []);
});

test('silence has nothing to find', () => {
  assert.deepEqual(findArtifacts(stereo(new Float32Array(4800)), SR), []);
});

// ---- the shipped cues pass ----------------------------------------------------------------------------------------------
const recipes = readdirSync(join(LIB, 'sound')).filter((n) => existsSync(join(LIB, 'sound', n, 'recipe.json'))).sort().map((n) => [n, JSON.parse(readFileSync(join(LIB, 'sound', n, 'recipe.json'), 'utf8'))]);

test('every shipped recipe passes, under each profile and at every emphasis', () => {
  assert.ok(recipes.length >= 11);
  for (const [name, recipe] of recipes) for (const profile of [null, loadProfile('glass'), loadProfile('soft-ui')]) for (const emphasis of ['subtle', 'normal', 'strong']) {
    const { channels } = renderRecipe(recipe, { sampleRate: SR, emphasis, profile });
    assert.deepEqual(findArtifacts(channels, SR, { cue: name }).map((f) => `${f.kind}: ${f.message}`), [], `${name} (${profile?.name ?? 'no profile'}, ${emphasis})`);
  }
});

test('every shipped code cue passes, as the library draws it in each palette', async () => {
  const { openRenderer } = await import('../../scripts/lib/cue-render.mjs');
  const names = readdirSync(join(LIB, 'sound')).filter((n) => existsSync(join(LIB, 'sound', n, 'pattern.js')) && n !== 'bed').sort();
  const r = await openRenderer();
  try {
    for (const cue of names) for (const feel of ['soft-ui', 'percussive', 'cinematic']) {
      const { channels } = await r.renderChannels([{ cue, at: 0.05, feel, opts: {} }], { seconds: 2.5, sampleRate: SR });
      assert.deepEqual(findArtifacts(channels, SR, { cue }).map((f) => `${f.kind}: ${f.message}`), [], `${cue} (${feel})`);
    }
  } finally { await r.close(); }
});

// ---- through the gate ---------------------------------------------------------------------------------------------------
const ctxFor = (dir, o = {}) => ctxIn(dir, { patternsBase: LIB, ...o });
before(async () => { await ensurePiece(); });

/** A piece variant whose first cue is a sample file: `samples` are written under assets/sounds with a licence record. */
async function sampled(name, x, { style = {}, cues = ['tick'] } = {}) {
  const dir = await variant(name, { cues, track: null, beats: null, style: { sound: { samples: { tick: 'assets/sounds/s.wav' }, ...style } } });
  mkdirSync(join(dir, 'assets', 'sounds'), { recursive: true });
  writeFileSync(join(dir, 'assets', 'sounds', 's.wav'), wavOf(stereo(x), SR));
  writeFileSync(join(dir, 'assets', 'sounds', 's.json'), JSON.stringify({ source: 'built for the test', licence: 'CC0-1.0', author: 'the test' }));
  return dir;
}

test('W-SOUND-ARTIFACT skips with no cues, a deck, or palette none; passes the shipped cues; warns for a planted defect, naming the cue and the measure', async () => {
  const none = await variant('artifact-nocues', { cues: [], track: null, beats: null });
  const s1 = await wArtifact(await ctxFor(none));
  assert.equal(s1.status, 'SKIP');
  assert.match(s1.evidence.reason, /no cues/);
  const off = await variant('artifact-off', { cues: ['tap'], track: null, beats: null, style: { sound: { palette: 'none' } } });
  assert.match((await wArtifact(await ctxFor(off))).evidence.reason, /palette is "none"/);

  const clean = await variant('artifact-clean', { cues: ['tap', 'ready', 'success'], track: null, beats: null, style: { sound: { profile: 'glass' } } });
  const pass = await wArtifact(await ctxFor(clean));
  assert.equal(pass.status, 'PASS', JSON.stringify(pass.evidence));
  assert.equal(pass.evidence.measured, 3);

  const x = bell();
  x[Math.round(0.15 * SR)] += 0.4;
  const bad = await sampled('artifact-click', x, { style: { profile: 'glass' } });
  const warn = await wArtifact(await ctxFor(bad));
  assert.equal(warn.status, 'WARN', JSON.stringify(warn.evidence));
  assert.ok(warn.evidence.selector, 'the beat that plays the cue is named');
  assert.match(warn.evidence.reason, /tick: .*click/);
  assert.equal(warn.evidence.findings[0].kind, 'click');
  assert.equal(warn.evidence.findings[0].cue, 'tick');
});

test('W-SOUND-ARTIFACT judges cues of a style with no sound profile too', async () => {
  const x = bell({ peak: 2 });
  const bad = await sampled('artifact-noprofile', x);
  const warn = await wArtifact(await ctxFor(bad));
  assert.equal(warn.status, 'WARN');
  assert.ok(warn.evidence.findings.some((f) => f.kind === 'clipping'));
});

test('through the composer the rule is found by name and no rule crashes', async () => {
  const rulesDir = mkdtempSync(join(tmpdir(), 'mm-artifact-rules-'));
  symlinkSync(join(ROOT, 'scripts/check', 'W-SOUND-ARTIFACT.mjs'), join(rulesDir, 'W-SOUND-ARTIFACT.mjs'));
  const x = bell();
  x[Math.round(0.15 * SR)] += 0.4;
  const r = await runCheck(await sampled('artifact-composer', x), { rulesDir, only: ['W-SOUND-ARTIFACT'] });
  const row = r.rules.find((q) => q.id === 'W-SOUND-ARTIFACT');
  assert.equal(row.status, 'WARN');
  assert.ok(!row.evidence.crash);
});
