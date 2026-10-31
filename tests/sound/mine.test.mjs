// `mm sound mine`: a folder of sounds is cut into its sounds by onset, each is measured with the sound system's
// one measurer, and a profile is fitted to the set. The sounds here are rendered from known recipes
// (tests/sound/_synthetic.mjs), so what mining should recover is known: pitch, T60, attack, partial ratios,
// material, family. The licence rule: a sound that is not your own recording needs its terms.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mm } from '../cli/cli-helpers.mjs';
import { KNOWN, SR, recording, render, writeSet } from './_synthetic.mjs';
import { analyseSound, findInputs, fitProfile, modeOf, splitSounds } from '../../scripts/lib/sound-mine.mjs';
import { mineSounds } from '../../scripts/sound-mine.mjs';
import { wavOf } from '../../scripts/sound-listen.mjs';
import { validators } from '../../scripts/lib/validate.mjs';

let tmp, set;
before(() => { tmp = mkdtempSync(join(tmpdir(), 'mm-mine-')); set = writeSet(join(tmp, 'set')); });
after(() => rmSync(tmp, { recursive: true, force: true }));

const near = (got, want, rel, what) => assert.ok(Math.abs(got - want) <= rel * want, `${what}: ${got} is not within ${rel * 100} % of ${want}`);

test('a tonal sound gives back its pitch, its T60, its attack, its partials as ratios and its material', () => {
  for (const [name, k] of Object.entries(KNOWN).filter(([, x]) => x.pitchHz)) {
    const a = analyseSound(render(name), SR);
    assert.equal(a.tonal, true, `${name} is tonal`);
    near(a.pitchHz, k.pitchHz, 0.01, `${name} pitch`);
    near(a.t60S, k.t60, 0.15, `${name} T60`);
    assert.ok(a.attackS >= 0.0008 && a.attackS <= k.attackS * 1.2, `${name} attack ${a.attackS}`);
    assert.equal(a.family, k.family, `${name} family`);
    assert.equal(a.mode, k.mode, `${name} material`);
    for (const ratio of k.ratios) assert.ok(a.partials.some((p) => Math.abs(p[0] / ratio - 1) <= 0.03), `${name}: no partial near ${ratio} in ${JSON.stringify(a.partials)}`);
    assert.ok(Math.abs(a.sideMidDb + 22) <= 1.5, `${name} side/mid ${a.sideMidDb}`);
    assert.ok(a.pitchClasses.includes(k.pitchClass), `${name}: ${a.pitchClasses}`);
  }
});

test('a knock is not tonal: no pitch, no partials, an input-length sound', () => {
  const a = analyseSound(render('knock'), SR);
  assert.equal(a.tonal, false);
  assert.equal(a.pitchHz, null);
  assert.deepEqual(a.partials, []);
  assert.equal(a.family, 'input');
  near(a.t60S, 0.03, 0.25, 'knock T60');
});

test('modeOf reads the material from the ratios', () => {
  assert.equal(modeOf([2.76, 5.4]), 'bar');
  assert.equal(modeOf([3.99]), 'mallet');
  assert.equal(modeOf([2, 3, 4]), 'string');
  assert.equal(modeOf([]), 'none');
  assert.equal(modeOf([1.7]), 'none');
});

test('one recording is split into its sounds: overlapping notes stay one sound, separate ones part', () => {
  // a bar, a mallet, a three-note rise (success-like), then three knocks 120 ms apart
  const chan = recording([['bar-a', 0.5], ['mallet', 1.5], ['string', 2.5], ['knock', 4.0], ['knock', 4.12], ['knock', 4.24]], 5.5);
  const sounds = splitSounds(chan, SR);
  assert.equal(sounds.length, 6, sounds.map((s) => (s.from / SR).toFixed(2)).join(' '));
  const at = [0.5, 1.5, 2.5, 4.0, 4.12, 4.24];
  sounds.forEach((s, i) => assert.ok(Math.abs(s.from / SR + 0.015 - at[i]) < 0.03, `sound ${i} starts at ${(s.from / SR).toFixed(3)}, wanted about ${at[i]}`));
  const rise = recording([['bar-c', 0.2], ['bar-e', 0.27], ['bar-a', 0.34]], 1.5);
  assert.equal(splitSounds(rise, SR).length, 1, 'three notes 70 ms apart ring together: one sound');
});

test('findInputs walks a folder for audio and video, skips the rest and hidden files', () => {
  const d = join(tmp, 'walk');
  mkdirSync(join(d, 'sub'), { recursive: true });
  for (const f of ['a.wav', 'sub/b.mp3', 'sub/c.mov', 'notes.txt', '.hidden.wav']) writeFileSync(join(d, f), '');
  assert.deepEqual(findInputs(d).map((p) => p.slice(d.length + 1)), ['a.wav', 'sub/b.mp3', 'sub/c.mov']);
});

test('the licence rule: a set that is not your own recording needs --licence (or --own), and nothing is written without it', async () => {
  const out = join(tmp, 'no-licence');
  await assert.rejects(mineSounds({ input: set, out }), (e) => e.exitCode === 2 && /no licence/.test(e.message) && /--own/.test(e.message));
  assert.equal(existsSync(join(out, 'records')), false, 'the output folder is not even made');
  const cli = mm(['sound', 'mine', set, '--out', join(tmp, 'no-licence-cli')]);
  assert.equal(cli.status, 2, cli.out);
  assert.match(cli.stderr, /licence/);
});

test('mining a set writes a record per sound, the sounds, the page and a profile that validates and covers the set', async () => {
  const out = join(tmp, 'mined');
  const res = await mineSounds({ input: set, out, name: 'bars', licence: 'CC0-1.0', source: 'synthetic test set', author: 'the test' });
  assert.equal(res.records.length, Object.keys(KNOWN).length);
  assert.deepEqual(readdirSync(join(out, 'records')).sort(), res.records.map((r) => `${r.id}.json`).sort());
  for (const r of res.records) {
    const rec = JSON.parse(readFileSync(join(out, 'records', `${r.id}.json`), 'utf8'));
    assert.equal(rec.licence, 'CC0-1.0');
    assert.equal(rec.source, 'synthetic test set');
    assert.equal(rec.author, 'the test');
    assert.ok(existsSync(join(out, rec.wav)));
    assert.ok(validators().soundSample(rec), 'a mined record is already a sample record, if the sound is kept as a sample');
  }
  const profile = JSON.parse(readFileSync(join(out, 'bars.profile.json'), 'utf8'));
  assert.ok(validators().soundProfile(profile), JSON.stringify(validators().soundProfile.errors));
  assert.equal(profile.name, 'bars');
  assert.equal(profile.modes, 'bar', 'three bars to one mallet and one string: the material is bar');
  for (const k of ['A', 'E', 'C', 'G']) assert.ok(profile.key.includes(k), `the key holds ${k}: ${profile.key}`);
  assert.ok(profile.register.maxCentreHz >= Math.max(...res.records.map((r) => r.centroidHz)));
  assert.equal(profile.register.tones, 'mixed', 'the string has strong partials, so not sines only');
  assert.equal(fitProfile(res.records.filter((r) => r.mode === 'bar')).register.tones, 'sine', 'the bars alone are sines with faint inharmonic partials');
  for (const r of res.records) {
    const [lo, hi] = profile.envelope.t60[r.family];
    const t60 = Math.min(r.t60S, r.lengthS);          // the profile reads the ring (lengthS) as a ceiling on the slope
    assert.ok(t60 >= lo && t60 <= hi, `${r.id}: T60 ${t60} outside the ${r.family} band ${lo}-${hi}`);
    // a struck attack is inside the range (a measured 0 is an attack under the measurer's resolution, read as the range's floor)
    if (r.attackS <= 0.01) assert.ok(Math.max(r.attackS, 0.0005) >= profile.envelope.attackS[0] && r.attackS <= profile.envelope.attackS[1], `${r.id}: attack ${r.attackS} outside ${profile.envelope.attackS}`);
  }
  const levels = res.records.map((r) => r.lufs100ms).sort((a, b) => a - b);
  assert.ok(Math.abs(profile.loudness.cueLufs100ms - (levels[2] + levels[3]) / 2) < 0.06, 'the target level is the set\'s median');
  assert.equal(profile.loudness.tolDb, 1.5, 'cues are matched to within 1.5 dB whatever the recordings\' own levels');
  assert.ok(profile.loudness.peakDbfs > profile.loudness.cueLufs100ms, 'the peak ceiling sits above the level by the set\'s crest');
  assert.deepEqual(profile.sources, [{ source: 'synthetic test set', licence: 'CC0-1.0', author: 'the test' }]);
  const html = readFileSync(join(out, 'mine.html'), 'utf8');
  assert.equal((html.match(/<audio /g) ?? []).length, res.records.length, 'a player for each sound');
  assert.match(html, /LUFS/);
  assert.doesNotMatch(html, /https?:\/\//, 'nothing is fetched from the network');
});

test('--own records an own recording; a record beside a file keeps that file its own terms', async () => {
  const d = join(tmp, 'own');
  writeSet(d, ['bar-a', 'knock']);
  writeFileSync(join(d, 'knock.json'), JSON.stringify({ source: 'a sample pack', licence: 'CC-BY-4.0', author: 'someone' }));
  const own = await mineSounds({ input: d, out: join(tmp, 'own-out'), own: true });
  const byFile = Object.fromEntries(own.records.map((r) => [r.file, r]));
  assert.equal(byFile['bar-a.wav'].licence, 'own recording');
  assert.equal(byFile['knock.wav'].licence, 'CC-BY-4.0', 'its own record wins');
  assert.equal(byFile['knock.wav'].author, 'someone');
  assert.deepEqual(own.profile.sources.map((s) => s.licence).sort(), ['CC-BY-4.0', 'own recording']);
});

test('mm sound mine: --help, a missing --out, then a clean run', () => {
  const help = mm(['sound', 'mine', '--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--licence/);
  assert.equal(mm(['sound', 'mine', set]).status, 2, 'no --out');
  const bad = mm(['sound', 'mine', set, '--out', join(tmp, 'x'), '--wobble']);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unknown option --wobble/);
  const out = join(tmp, 'cli-out');
  const ok = mm(['sound', 'mine', set, '--out', out, '--licence', 'CC0-1.0', '--name', 'cli-set']);
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.stdout, /6 sounds from 6 files/);
  assert.ok(existsSync(join(out, 'cli-set.profile.json')));
  assert.ok(existsSync(join(out, 'mine.html')));
});

test('a mined video is read like a recording (the sound track of an MP4)', async () => {
  const wav = join(tmp, 'rec.wav');
  writeFileSync(wav, wavOf(recording([['bar-a', 0.4], ['mallet', 1.4]], 2.6), SR));
  const mp4 = join(tmp, 'rec.mp4');
  const r = (await import('node:child_process')).spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=2.6:r=10', '-i', wav, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', mp4]);
  assert.equal(r.status, 0, String(r.stderr));
  const res = await mineSounds({ input: mp4, out: join(tmp, 'video-out'), licence: 'own work for the test' });
  assert.equal(res.records.length, 2);
  near(res.records[0].pitchHz, 440, 0.02, 'first pitch');
  near(res.records[1].pitchHz, 392, 0.02, 'second pitch');
});

test('fitProfile refuses an empty set and widens nothing it did not see', () => {
  assert.throws(() => fitProfile([]), /no sound/);
});
