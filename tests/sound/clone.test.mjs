// `mm sound clone`: a new cue in a profile's style, found by seeded analysis-by-synthesis. From a profile mined out of
// known sounds the clone must land inside the profile's bands (register, key, attack, length of its family, level), be
// the same every time, follow the meaning's contour and family, lean toward a --like sound, validate against the
// recipe contract, carry the profile's sources in its card, and play the same in an OfflineAudioContext as in Node.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mm } from '../cli/cli-helpers.mjs';
import { SR, render, writeSet } from './_synthetic.mjs';
import { mineSounds } from '../../scripts/sound-mine.mjs';
import { cloneCue } from '../../scripts/sound-clone.mjs';
import { lintPattern } from '../../scripts/pattern-lint.mjs';
import { loadProfile, loadRecipe } from '../../scripts/lib/sound-profile.mjs';
import { judgeCue, misses } from '../../scripts/lib/sound-palette.mjs';
import { contourOf, familyOfMeaning, likeOf, notesHz } from '../../scripts/lib/sound-clone.mjs';
import { applyProfile, familyOf, renderRecipe } from '../../runtime/kit/synth.js';
import * as M from '../../scripts/lib/audio-measure.mjs';

let tmp, profileFile, profile;
before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'mm-clone-'));
  await mineSounds({ input: writeSet(join(tmp, 'set')), out: join(tmp, 'mined'), name: 'bars', licence: 'CC0-1.0', source: 'synthetic test set', author: 'the test' });
  profileFile = join(tmp, 'mined', 'bars.profile.json');
  profile = loadProfile(profileFile);
});
after(() => rmSync(tmp, { recursive: true, force: true }));

const clone = (cue, meaning, { out = 'patterns', ...extra } = {}) => cloneCue({ profileRef: profileFile, cue, meaning, out: join(tmp, out), check: false, ...extra });
const hz = (f) => 69 + 12 * Math.log2(f / 440);

test('the meaning picks the family and the contour', () => {
  assert.equal(familyOfMeaning('a button tap'), 'input');
  assert.equal(familyOfMeaning('a side panel opens'), 'surface');
  assert.equal(familyOfMeaning('a payment went through'), 'outcome');
  assert.equal(contourOf('a task finished and saved'), 'rise');
  assert.equal(contourOf('the payment failed with an error'), 'fall');
  assert.equal(contourOf('the assistant is listening'), 'level');
});

test('a clone from a mined profile lands inside the profile: key, register, attack, length of its family, level', async () => {
  for (const [cue, meaning, fam] of [['finish-x', 'a task finished and saved', 'outcome'], ['panel-x', 'a side panel opens', 'surface'], ['tap-x', 'a button tap', 'input']]) {
    const r = await clone(cue, meaning);
    assert.equal(r.family, fam);
    assert.equal(familyOf(r.recipe.durationS), fam, `${cue}: durationS ${r.recipe.durationS} is a ${fam} length`);
    const recipe = loadRecipe(join(r.dir, 'recipe.json'));                    // validates against the contract
    const voiced = applyProfile(recipe, profile).recipe;
    for (const l of voiced.layers.filter((x) => x.kind === 'tone')) {
      const m = hz(l.f), k = profile.key.map((n) => ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[n[0]] + (n[1] === '#' ? 1 : 0)));
      const off = Math.min(...k.map((c) => Math.abs(((m - c + 6 + 120) % 12) - 6)));
      assert.ok(off < 0.2, `${cue}: ${l.f} Hz is ${off.toFixed(2)} semitones off the key ${profile.key}`);
      assert.ok(l.f >= profile.register.minHz && l.f <= profile.register.maxCentreHz, `${cue}: ${l.f} Hz outside the register`);
    }
    for (const l of voiced.layers.filter((x) => x.t60 > 0)) assert.ok(l.t60 <= profile.envelope.t60[fam][1] + 1e-9, `${cue}: T60 ${l.t60} over the ${fam} band`);
    const { channels } = renderRecipe(recipe, { sampleRate: SR, profile });
    const judged = judgeCue(channels, SR, profile, { durationS: recipe.durationS });
    assert.deepEqual(misses(judged).map((c) => c.message), [], `${cue} misses the profile`);
    const m = M.measure(channels, SR);
    // masterGain is calibrated as written (the convention of sound-listen --calibrate); the profile's own room then moves the level a little
    assert.ok(Math.abs(m.lufs100ms - profile.loudness.cueLufs100ms) <= profile.loudness.tolDb, `${cue}: level ${m.lufs100ms} against ${profile.loudness.cueLufs100ms} ± ${profile.loudness.tolDb}`);
    assert.ok(m.peakDbfs <= profile.loudness.peakDbfs, `${cue}: peak ${m.peakDbfs}`);
  }
});

test('a clone is the same every time and a different cue is a different cue', async () => {
  const a = await clone('same-x', 'a task finished', { out: 'a' }), b = await clone('same-x', 'a task finished', { out: 'b' });
  assert.equal(readFileSync(join(a.dir, 'recipe.json'), 'utf8'), readFileSync(join(b.dir, 'recipe.json'), 'utf8'));
  assert.equal(readFileSync(join(a.dir, 'PATTERN.md'), 'utf8'), readFileSync(join(b.dir, 'PATTERN.md'), 'utf8'));
  const c = await clone('other-x', 'a task finished', { out: 'c' });
  assert.notEqual(JSON.stringify(c.recipe.layers), JSON.stringify(a.recipe.layers));
});

test('success rises and an error falls: the order of the notes follows the meaning', async () => {
  const notes = (r) => r.recipe.layers.filter((l) => l.kind === 'tone' && !l.from).sort((x, y) => (x.offsetS ?? 0) - (y.offsetS ?? 0)).map((l) => l.f);
  const up = notes(await clone('up-x', 'a task finished and saved')), down = notes(await clone('down-x', 'a payment failed with an error'));
  assert.ok(up.at(-1) > up[0], `rising: ${up}`);
  assert.ok(down.at(-1) < down[0], `falling: ${down}`);
});

test('--like pulls the clone toward the sound it is given', async () => {
  const wav = join(tmp, 'like-knock.wav');
  writeFileSync(wav, (await import('../../scripts/sound-listen.mjs')).wavOf(render('knock'), SR));
  const like = likeOf(render('knock'), SR);
  const plain = await clone('like-a', 'a button tap', { out: 'l1' }), shaped = await clone('like-a', 'a button tap', { out: 'l2', like: wav });
  assert.equal(shaped.family, like.family, 'the family follows the sound');
  const centre = (r) => M.measure(renderRecipe(r.recipe, { sampleRate: SR, profile }).channels, SR).centroidHz;
  const dist = (r) => Math.abs(Math.log(centre(r) / like.centroidHz));
  assert.ok(dist(shaped) <= dist(plain) + 1e-9, `with --like ${Math.round(centre(shaped))} Hz, without ${Math.round(centre(plain))} Hz, the sound is ${Math.round(like.centroidHz)} Hz`);
  assert.match(readFileSync(join(shaped.dir, 'PATTERN.md'), 'utf8'), /like-knock\.wav/);
});

test('the card is a complete pattern card and carries the profile and its sources', async () => {
  const r = await clone('card-x', 'a task finished and saved', { out: 'cards' });
  const card = readFileSync(join(r.dir, 'PATTERN.md'), 'utf8');
  assert.match(card, /cloned from the sound profile `bars`/);
  assert.match(card, /synthetic test set, CC0-1\.0, the test/);
  assert.match(card, /^original\./m);
  const lint = lintPattern(r.dir);
  assert.equal(lint.complete, true, JSON.stringify(lint.rules));
  assert.deepEqual(JSON.parse(readFileSync(join(r.dir, 'demo', 'cue.json'), 'utf8')).emphasis, ['subtle', 'normal', 'strong']);
});

test('an existing cue is not overwritten without --force; a bad name or profile is a usage error', async () => {
  await clone('keep-x', 'a task finished', { out: 'keep' });
  await assert.rejects(clone('keep-x', 'a task finished', { out: 'keep' }), (e) => e.exitCode === 2 && /already holds a cue/.test(e.message));
  await clone('keep-x', 'something else done', { out: 'keep', force: true });
  await assert.rejects(clone('Bad Name', 'a task finished'), (e) => e.exitCode === 2);
  await assert.rejects(cloneCue({ profileRef: 'no-such-profile', cue: 'x-y', meaning: 'a thing', out: join(tmp, 'never') }), (e) => e.exitCode === 2 && /not found/.test(e.message));
  assert.equal(existsSync(join(tmp, 'never')), false);
});

test('the chosen recipe plays the same in an OfflineAudioContext as renderRecipe computes in Node', async () => {
  const r = await cloneCue({ profileRef: profileFile, cue: 'ctx-x', meaning: 'a task finished', out: join(tmp, 'ctx') });
  assert.ok(r.contextDiff !== null && r.contextDiff < 1e-5, `the audio context and Node differ by ${r.contextDiff}`);
});

test('a shipped profile works too, and mm sound clone runs from the router', () => {
  const out = join(tmp, 'cli');
  const ok = mm(['sound', 'clone', '--profile', 'glass', '--cue', 'cli-x', '--meaning', 'a draft was saved', '--out', out]);
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.stdout, /inside the profile/);
  assert.match(ok.stdout, /audio context agrees/);
  assert.ok(existsSync(join(out, 'sound', 'cli-x', 'recipe.json')));
  const again = mm(['sound', 'clone', '--profile', 'glass', '--cue', 'cli-x', '--meaning', 'a draft was saved', '--out', out]);
  assert.equal(again.status, 2);
  assert.match(again.stderr, /already holds a cue/);
  assert.equal(mm(['sound', 'clone', '--profile', 'glass']).status, 2, 'a cue and a meaning are required');
  assert.equal(mm(['sound', 'clone', '--help']).status, 0);
});

test('notesHz never comes back empty, even for a key with nothing in the range', () => {
  assert.ok(notesHz({ key: ['C'] }, 270, 280).length >= 1);
});
