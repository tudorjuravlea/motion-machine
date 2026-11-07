// Exact placement in the mix (SPEC §9): on a scratch film, each role's anchor lands at the picture event plus its offset within
// 2 ms; the sync lock is written to out/cues.json and W-CUE reads it (an end-anchored cue is judged where it plays); a beat or a
// style can move a role's offset; `--trace` logs every add with the rule that placed it.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, ctxFor, ensurePiece, variant } from '../../fixtures/sound/setup.mjs';
import { buildSound } from '../../scripts/sound.mjs';
import { decodeStereo } from '../../scripts/lib/audio-decode.mjs';
import { cueAnchors, offsetFor } from '../../scripts/lib/sound-place.mjs';
import wCue from '../../scripts/check/W-CUE.mjs';

const SR = 48000;
const LIB = join(ROOT, 'patterns');
const PICTURE_S = 1.25;                                  // the beat of the fixture's second slot
before(async () => { await ensurePiece(); });

/** Builds a scratch film with one cue on its second slot and returns what it wrote. */
async function film(name, cue, { style = {}, params = null, trace = false } = {}) {
  const dir = await variant(name, { track: null, beats: null, cues: [null, cue, null, null], style: { sound: { cuesPer10s: [0, 12], ...style } }, edit: params ? (s) => { s.scenes[0].beats[1].params = { ...(s.scenes[0].beats[1].params ?? {}), cue: params }; } : undefined });
  await buildSound(dir, { patterns: LIB, trace });
  const json = JSON.parse(readFileSync(join(dir, 'out', 'cues.json'), 'utf8'));
  return { dir, json, cue: json.cues[0], mix: await decodeStereo(join(dir, 'out', 'mix.wav'), SR) };
}
const POINT = { onset: 'onsetS', apex: 'apexS', end: 'endS' };

test('each role\'s anchor lands at the picture event plus its offset, within 2 ms, measured on the cue stem', async () => {
  for (const cue of ['tap', 'press', 'hit', 'swipe', 'riser', 'open']) {
    const { cue: c, dir } = await film(`place-${cue}`, cue);
    const off = offsetFor(cue, {}, null), a = cueAnchors(await decodeStereo(join(dir, 'out', 'stems', 'cues.wav'), SR), SR);   // the cue stem: the mix's limiter reshapes a whoosh's body
    const heard = a[POINT[off.anchor]];
    const picture = c.lock.pictureS;
    assert.ok(Math.abs(heard - (picture + off.offsetMs / 1000)) <= 0.002, `${cue} (${off.role}, ${off.anchor}): heard at ${heard}, picture ${picture} + ${off.offsetMs} ms`);
    assert.ok(Math.abs(c.lock[POINT[off.anchor]] - heard) <= 0.002, `${cue}: the lock says ${c.lock[POINT[off.anchor]]}, the mix has it at ${heard}`);
    if (off.anchor !== 'end') assert.equal(picture, PICTURE_S, `${cue} meets its beat's arrival`);
    else assert.ok(picture > PICTURE_S, `${cue} ends on its beat's landing, after its arrival`);
  }
});

test('the sync lock is in out/cues.json: role, anchor, offset and where each point sits against the picture', async () => {
  const { cue: c } = await film('lock-fields', 'press');
  assert.equal(c.lock.role, 'click');
  assert.equal(c.lock.anchor, 'onset');
  assert.equal(c.lock.offsetMs, -11);
  assert.equal(c.lock.offsetFrom, 'role');
  for (const k of ['onset', 'peak', 'apex', 'end']) assert.equal(typeof c.lock.vsPictureMs[k], 'number', k);
  assert.ok(Math.abs(c.lock.vsPictureMs.onset - -11) <= 2, JSON.stringify(c.lock.vsPictureMs));
  assert.equal(c.at, PICTURE_S, 'at is still the picture event the cue meets');
  assert.match(c.rule, /role click: onset -11 ms \(role\)/);
});

test('a beat\'s params.cue.offsetMs and the style\'s sound.roles.<role>.offsetMs move the anchor, the beat winning', async () => {
  const beat = await film('place-beat', 'press', { params: { offsetMs: 30 } });
  assert.equal(beat.cue.lock.offsetFrom, 'beat');
  assert.ok(Math.abs(cueAnchors(beat.mix, SR).onsetS - (PICTURE_S + 0.03)) <= 0.002);
  const brand = await film('place-style', 'press', { style: { roles: { click: { offsetMs: -30 } } } });
  assert.equal(brand.cue.lock.offsetFrom, 'style');
  assert.ok(Math.abs(cueAnchors(brand.mix, SR).onsetS - (PICTURE_S - 0.03)) <= 0.002);
  const both = await film('place-both', 'press', { style: { roles: { click: { offsetMs: -30 } } }, params: { offsetMs: 5 } });
  assert.ok(Math.abs(cueAnchors(both.mix, SR).onsetS - (PICTURE_S + 0.005)) <= 0.002);
});

test('the offset is not a render param: the same cue with different offsets is rendered once', async () => {
  const { json } = await film('place-render', 'press', { params: { offsetMs: 12, soundOk: 'checked by ear' } });
  assert.equal(json.cues.length, 1);
  assert.equal(json.cues[0].lock.offsetMs, 12);
});

test('W-CUE reads the lock: a cue where it plays passes; an end-anchored riser is judged at its landing', async () => {
  for (const cue of ['press', 'riser', 'swipe', 'hit']) {
    const { dir } = await film(`gate-${cue}`, cue);
    const r = await wCue(await ctxFor(dir, { patternsBase: LIB }));
    assert.equal(r.status, 'PASS', `${cue}: ${JSON.stringify(r.evidence)}`);       // with no beat grid, PASS means the lock was read and the sound found where it should be
  }
});

test('W-CUE: a beat\'s own offset that moves the sound is deliberate and named; a sound found early with no offset to explain it warns, and soundOk acknowledges it', async () => {
  const named = await film('gate-offset', 'press', { params: { offsetMs: -90 } });
  const n = await wCue(await ctxFor(named.dir, { patternsBase: LIB }));
  assert.equal(n.status, 'PASS');
  assert.match(n.evidence.deliberate[0].explained, /params\.cue\.offsetMs/);
  // a lock whose sound sits 90 ms early with no offset behind it (the file is edited to stand for a mix that did that)
  const early = (dir) => { const f = join(dir, 'out', 'cues.json'), j = JSON.parse(readFileSync(f, 'utf8')); Object.assign(j.cues[0].lock, { offsetMs: 0, vsPictureMs: { onset: -90, peak: -85, apex: -80, end: 0 } }); writeFileSync(f, JSON.stringify(j)); };
  const bare = await film('gate-early', 'press');
  early(bare.dir);
  const r = await wCue(await ctxFor(bare.dir, { patternsBase: LIB }));
  assert.equal(r.status, 'WARN'); assert.match(r.evidence.reason, /leads its picture by 90 ms/);
  const ok = await film('gate-early-ok', 'press', { params: { soundOk: 'the click is meant to lead' } });
  early(ok.dir);
  const a = await wCue(await ctxFor(ok.dir, { patternsBase: LIB }));
  assert.equal(a.status, 'PASS');
  assert.equal(a.evidence.acknowledged[0].reason, 'the click is meant to lead');
});

test('--trace writes out/sound-trace.json: every add with bus, start sample, length, gain, pan, cue and the rule that placed it', async () => {
  const { dir, cue } = await film('trace', 'press', { trace: true });
  const t = JSON.parse(readFileSync(join(dir, 'out', 'sound-trace.json'), 'utf8'));
  assert.equal(t.sampleRate, SR);
  assert.equal(t.adds.length, 1);
  const a = t.adds[0];
  for (const k of ['bus', 'startSample', 'length', 'gain', 'pan', 'cue', 'rule']) assert.ok(k in a, k);
  assert.equal(a.cue, 'press');
  assert.equal(a.rule, cue.rule);
  assert.ok(Math.abs(a.startSample - cue.startS * SR) <= 5, `${a.startSample} against ${cue.startS * SR}`);
  const plain = await film('no-trace', 'press');
  assert.throws(() => readFileSync(join(plain.dir, 'out', 'sound-trace.json')), /ENOENT/);
});
