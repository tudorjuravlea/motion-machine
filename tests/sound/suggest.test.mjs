// `mm sound suggest` (SPEC §9): the film's own schedule names every moment that could take a sound; a cue, a
// weight and a frame go with each; a budget, each role's minimum gap, two at once at most and a hook in the
// first 2 s choose among them; `--apply` writes the chosen cues as beat `cue` fields through the story-edit path
// and never over a cue a beat already has.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, OUT, styleFor, writePiece } from '../../fixtures/sound/setup.mjs';
import { loadPatterns } from '../../scripts/check.mjs';
import { validators } from '../../scripts/lib/validate.mjs';
import { ROLES, CUE_ROLE } from '../../scripts/lib/sound-roles.mjs';
import { DEFAULTS, chooseMoments, editsOf, momentsOf, proposalOf, settingsOf } from '../../scripts/lib/sound-suggest.mjs';
import { plan } from '../../scripts/mm.mjs';
import { schedule as buildSchedule, resolveStory } from '../../runtime/kit/schedule.js';

const PATTERNS = join(ROOT, 'patterns');

// A film whose schedule is known: 24 s, five scenes.
//   open   0-3    pop headline at 0, typewriter sub at 1, phone with a tap at 1.5 (the beat arrives at 1.5)
//   count  3-8    cut: whip-pan; headline at 0.1; a counter at 0.2; a card with an exit at 1
//   quiet  8-14   cut: crossfade (silent); one text beat
//   hit    14-19  cut: impact; slam headline at 0.05
//   end    19-24  cut: hard-cut; the call to action pops at 0.3, then a card at 1.2
const story = () => ({
  id: 'suggest-probe', kind: 'film', formats: ['16x9'], title: 't', language: 'en', facts: [{ id: 'f1', text: 'n', source: 's' }],
  audio: { track: null, bpm: null, beats: null },
  scenes: [
    { id: 'open', move: null, say: 'x', layout: 'layouts/title-stack', duration: 3, cut: 'transitions/hard-cut', beats: [
      { at: 0, slot: 'headline', fx: 'entrances/pop', text: 'Hello' },
      { at: 1, slot: 'sub', fx: 'entrances/typewriter', text: 'a line that is typed out one letter at a time' },
      { at: 1.5, slot: 'stage', fx: 'devices/phone', asset: 'assets/x/', screen: [{ do: 'screen/tap', at: 0 }] },
    ] },
    { id: 'count', move: null, say: 'x', layout: 'layouts/title-stack', duration: 5, cut: 'transitions/whip-pan', beats: [
      { at: 0.1, slot: 'headline', fx: 'entrances/rise', text: 'Numbers' },
      { at: 0.2, slot: 'figure', fx: 'data/counter', value: 900, fact: 'f1' },
      { at: 1, slot: 'card', fx: 'entrances/pop', text: 'card', out: 4 },
    ] },
    { id: 'quiet', move: null, say: 'x', layout: 'layouts/title-stack', duration: 6, cut: 'transitions/crossfade', beats: [
      { at: 0.4, slot: 'headline', fx: 'entrances/rise', text: 'Calm' },
    ] },
    { id: 'hit', move: null, say: 'x', layout: 'layouts/title-stack', duration: 5, cut: 'transitions/impact', beats: [
      { at: 0.05, slot: 'headline', fx: 'entrances/slam', text: 'Now' },
    ] },
    { id: 'end', move: null, say: 'x', layout: 'layouts/title-stack', duration: 5, cut: 'transitions/hard-cut', beats: [
      { at: 0.3, slot: 'headline', fx: 'entrances/pop', text: 'Go' },
      { at: 1.2, slot: 'card', fx: 'entrances/pop', text: 'link' },
    ] },
  ],
  cta: { text: 'go', url: 'example.com' },
});

const style = () => styleFor(join(OUT, 'suggest-x'));

async function film(s = story(), st = style()) {
  const resolved = resolveStory(s, st);
  const patterns = await loadPatterns(resolved, PATTERNS);
  return { story: resolved, style: st, schedule: buildSchedule(resolved, st, { patterns }), patterns };
}

const kinds = (ms) => ms.map((m) => m.kind);
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;

test('moments: every entrance, type-on, counter end, cut, press, exit and settle of the schedule, with a cue, a weight and a frame', async () => {
  const f = await film();
  const ms = momentsOf(f);
  const at = (kind, t) => ms.find((m) => m.kind === kind && near(m.t, t));
  assert.ok(at('entrance', 0), 'the opening headline');
  const type = ms.find((m) => m.kind === 'type');
  assert.ok(type && near(type.t, 4) === false && near(type.t, 1), 'a type-on at 1 s');
  assert.equal(type.cue, 'key');
  const count = ms.find((m) => m.kind === 'count');
  assert.equal(count.cue, 'counter');
  assert.ok(count.t > 3.2, `a counter is judged at its end (${count.t})`);
  const press = ms.find((m) => m.kind === 'press');
  assert.ok(press && near(press.t, 1.5));
  assert.equal(press.cue, 'tap', 'a phone is touched');
  const cuts = ms.filter((m) => m.kind === 'cut');
  assert.deepEqual(cuts.map((m) => m.scene).sort(), ['count', 'end', 'hit'], 'the crossfade is silent and the opening is no cut');
  assert.equal(cuts.find((m) => m.scene === 'count').cue, 'whoosh');
  assert.equal(cuts.find((m) => m.scene === 'hit').cue, 'cut-hit', 'the strongest cut takes the hit');
  assert.ok(ms.some((m) => m.kind === 'exit'), 'the card that leaves');
  assert.ok(ms.some((m) => m.kind === 'settle'), 'a scene that comes to rest and holds');
  for (const m of ms) {
    assert.equal(m.frame, Math.round(m.t * 30), 'a frame on the 30 fps grid');
    assert.ok(m.weight > 0 && Number.isFinite(m.weight));
    assert.ok(typeof m.cue === 'string' && m.cue);
    assert.ok(m.why);
  }
});

test('weights: the first 2 s, a hero beat and the call to action weigh more', async () => {
  const f = await film();
  const ms = momentsOf(f);
  const entrance = (scene, slot) => ms.find((m) => m.kind === 'entrance' && m.scene === scene && m.slot === slot);
  const opening = entrance('open', 'headline'), midCard = entrance('count', 'card');
  assert.ok(opening.weight > midCard.weight, 'the opening headline outweighs a card mid-film');
  const endHead = entrance('end', 'headline'), endCard = entrance('end', 'card');
  assert.ok(endHead.weight > endCard.weight, 'a headline outweighs a card of the same pattern');
  assert.ok(endCard.weight > midCard.weight, 'a card in the call to action scene outweighs the same card mid-film');
});

test('a cut takes a hit only if it is among the top third of the cuts', async () => {
  const f = await film();
  const ms = momentsOf(f);
  const hits = ms.filter((m) => m.kind === 'cut' && m.cue === 'cut-hit');
  assert.equal(hits.length, 1, 'one of three');
  assert.equal(hits[0].scene, 'hit');
});

test('choosing: the budget, each role\'s minimum gap, two at once at most, a hook in the first 0.6 s', async () => {
  const f = await film();
  const ms = momentsOf(f);
  const dur = f.schedule.duration;
  const res = chooseMoments(ms, { durationS: dur, budgetPer10s: 5, existing: [], durOf: () => 0.3, cfg: settingsOf(f.style) });
  assert.ok(res.chosen.length > 0 && res.chosen.length <= Math.round((dur / 10) * 5), `${res.chosen.length} chosen for ${dur} s at 5 per 10 s`);
  assert.ok(res.chosen[0].t <= 0.6, 'the film opens with a hook sound');
  for (const a of res.chosen) for (const b of res.chosen) {
    if (a === b) continue;
    if (CUE_ROLE[a.cue] && CUE_ROLE[a.cue] === CUE_ROLE[b.cue]) assert.ok(Math.abs(a.t - b.t) * 1000 >= ROLES[CUE_ROLE[a.cue]].minGapMs - 1e-6, `${a.cue} ${a.t} and ${b.cue} ${b.t} sit closer than their role allows`);
    if (a.cue === b.cue) assert.ok(Math.abs(a.t - b.t) * 1000 >= DEFAULTS.repeatGapMs - 1e-6, 'the same cue is not repeated within the repeat gap');
  }
  for (const c of res.chosen) assert.ok(res.chosen.filter((o) => o.t <= c.t + 1e-9 && o.t + 0.3 > c.t + 1e-9).length <= 2, 'at most two at once');
  assert.deepEqual(res.chosen.map((c) => c.t), [...res.chosen.map((c) => c.t)].sort((a, b) => a - b), 'in time order');
  assert.equal(new Set(res.chosen.map((c) => c.beat && `${c.beat.scene}#${c.beat.index}`).filter(Boolean)).size, res.chosen.filter((c) => c.beat).length, 'no two share a beat');
  const again = chooseMoments(ms, { durationS: dur, budgetPer10s: 5, existing: [], durOf: () => 0.3, cfg: settingsOf(f.style) });
  assert.deepEqual(again.chosen, res.chosen, 'the same film gives the same proposal');
  const tight = chooseMoments(ms, { durationS: dur, budgetPer10s: 1, existing: [], durOf: () => 0.3, cfg: settingsOf(f.style) });
  assert.ok(tight.chosen.length <= Math.round(dur / 10) && tight.chosen.length >= 1);
  assert.ok(tight.chosen[0].t <= 2, 'a thin budget still spends its first cue on the opening');
});

test('two at once at most: a cue that would be the third is left out', () => {
  const cfg = settingsOf({ sound: {} });
  const m = (id, t, cue) => ({ id, kind: 'entrance', t, frame: Math.round(t * 30), cue, weight: 1, beat: null, why: 'x' });
  const ms = [m('a', 5, 'pop-in'), m('b', 5.1, 'whoosh'), m('c', 5.2, 'cut-hit')];
  const res = chooseMoments(ms, { durationS: 10, budgetPer10s: 12, existing: [], durOf: () => 1, cfg });
  assert.equal(res.chosen.length, 2);
  assert.match(res.left.find((l) => !res.chosen.some((c) => c.id === l.id)).reason, /two at once/);
});

test('the same role may not sound again inside its minimum gap', () => {
  const cfg = settingsOf({ sound: {} });
  const m = (id, t) => ({ id, kind: 'press', t, frame: Math.round(t * 30), cue: 'tap', weight: 1, beat: null, why: 'x' });
  const gap = ROLES.tap.minGapMs / 1000;
  const res = chooseMoments([m('a', 4), m('b', 4 + gap / 2), m('c', 4 + gap + 0.01)], { durationS: 10, budgetPer10s: 12, existing: [], durOf: () => 0.05, cfg: { ...cfg, repeatGapMs: 0 } });
  assert.deepEqual(res.chosen.map((c) => c.id), ['a', 'c']);
});

test('a cue the beats already carry is never proposed over, and it counts toward the budget and the gaps', async () => {
  const s = story();
  s.scenes[0].beats[0].cue = 'hit';                      // the opening headline already has its sound
  const f = await film(s);
  const ms = momentsOf(f);
  assert.ok(!ms.some((m) => m.beat && m.beat.scene === 'open' && m.beat.index === 0), 'no moment is carried by that beat');
  assert.ok(!ms.some((m) => m.kind === 'entrance' && m.scene === 'open' && near(m.t, 0)), 'its own entrance is covered');
  const existing = [{ t: 0, name: 'hit' }];
  const res = chooseMoments(ms, { durationS: f.schedule.duration, budgetPer10s: 5, existing, durOf: () => 0.3, cfg: settingsOf(f.style) });
  assert.ok(res.chosen.length <= Math.round((f.schedule.duration / 10) * 5) - 1, 'one place in the budget is taken');
  assert.ok(res.chosen.every((c) => !(c.cue === 'cut-hit' && c.t < 0.4)), 'nothing within the hit\'s gap');
  const p = proposalOf({ ...f, existing, budgetPer10s: 5, exists: () => true, durOf: () => 0.3 });
  const edits = editsOf(p.chosen);
  assert.ok(edits.every((e) => !(e.scene === 'open' && e.beat === 0)), 'no edit touches the beat that has a cue');
});

test('an opening that already has a sound is not given another hook', async () => {
  const s = story();
  s.scenes[0].beats[0].cue = 'hit';
  const f = await film(s);
  const res = chooseMoments(momentsOf(f), { durationS: f.schedule.duration, budgetPer10s: 5, existing: [{ t: 0, name: 'hit' }], durOf: () => 0.3, cfg: settingsOf(f.style) });
  assert.ok(res.chosen.every((c) => c.t > 0.6 || c.hook !== true));
});

test('proposal: each row says whether it can be written, needs a cue, or needs a beat', async () => {
  const f = await film();
  const exists = (c) => ['pop-in', 'tap'].includes(c);
  const p = proposalOf({ ...f, budgetPer10s: 12, exists, durOf: () => 0.2, existing: [] });
  const by = (a) => p.chosen.filter((c) => c.apply === a);
  assert.ok(by('write').length > 0 && by('write').every((c) => exists(c.cue) && c.beat), 'writable rows have a beat and a cue that exists');
  assert.ok(by('needs cue').length > 0 && by('needs cue').every((c) => !exists(c.cue) && c.beat));
  assert.ok(by('needs beat').length > 0 && by('needs beat').every((c) => !c.beat), 'a settle or an exit has no beat that arrives there');
  assert.equal(editsOf(p.chosen).length, by('write').length);
  assert.ok(editsOf(p.chosen).every((e) => e.op === 'beat.set' && e.key === 'cue' && exists(e.value)));
  assert.equal(p.version, 1);
  assert.equal(p.budgetPer10s, 12);
});

test('style.sound.suggest names the cue of each kind of moment, the share of cuts that take a hit and the repeat gap', async () => {
  const st = style();
  st.sound = { ...st.sound, suggest: { cues: { entrance: 'tick', cut: 'swipe' }, hitShare: 0, repeatGapMs: 500 } };
  const cfg = settingsOf(st);
  assert.equal(cfg.cues.entrance, 'tick');
  assert.equal(cfg.cues.type, 'key', 'the rest keep their defaults');
  assert.equal(cfg.repeatGapMs, 500);
  const f = await film(story(), st);
  const ms = momentsOf(f);
  assert.ok(ms.filter((m) => m.kind === 'entrance').every((m) => m.cue === 'tick'));
  assert.ok(ms.filter((m) => m.kind === 'cut').every((m) => m.cue === 'swipe'), 'a share of 0 gives no cut the hit');
  const v = validators();
  const full = styleFor(join(OUT, 'suggest-x'));
  full.sound = { ...full.sound, suggest: { cues: { entrance: 'tick' }, hitShare: 0.5, repeatGapMs: 400 } };
  assert.ok(v.style(full), JSON.stringify(v.style.errors));
  full.sound.suggest = { cues: { nonsense: 'tick' } };
  assert.ok(!v.style(full), 'a kind the suggester does not know is refused');
});

// ---- the verb, on a scratch piece ---------------------------------------------------------------------------

const cli = (...args) => spawnSync(process.execPath, [join(ROOT, 'scripts', 'mm.mjs'), ...args], { encoding: 'utf8', timeout: 90_000 });

function scratch(name, patch = (s) => s, stylePatch = {}) {
  const dir = join(OUT, `${name}-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  const st = styleFor(dir);
  st.sound = { ...st.sound, suggest: { cues: { entrance: 'tick', cut: 'riser', count: 'tick', type: 'tick', tap: 'tick', click: 'tick', settle: 'tick', exit: 'tick', hit: 'riser' }, ...stylePatch } };
  const s = story();
  patch(s);
  writePiece(dir, { story: s, style: st });
  return dir;
}

test('mm sound suggest routes to its script and lists its flags', () => {
  assert.deepEqual(plan(['sound', 'suggest', 'p', '--budget', '4', '--apply']), { script: 'sound-suggest.mjs', args: ['p', '--budget', '4', '--apply'], label: 'sound suggest' });
  assert.match(plan(['sound', 'suggest', '--help']).help, /--budget/);
  assert.match(plan(['sound', 'suggest', 'p', '--wobble']).error, /unknown option --wobble/);
});

test('suggest writes out/sound-suggest.json and a table, changes no story, and exits 0', () => {
  const dir = scratch('suggest-plain');
  const before = readFileSync(join(dir, 'story.json'), 'utf8');
  const r = cli('sound', 'suggest', dir, '--budget', '3');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(readFileSync(join(dir, 'story.json'), 'utf8'), before, 'a proposal writes no story');
  const p = JSON.parse(readFileSync(join(dir, 'out', 'sound-suggest.json'), 'utf8'));
  assert.equal(p.budgetPer10s, 3);
  const capped = cli('sound', 'suggest', dir, '--budget', '9');
  assert.match(capped.stdout, /above the style's band/, 'a budget above the style\'s band is held to it');
  assert.equal(JSON.parse(readFileSync(join(dir, 'out', 'sound-suggest.json'), 'utf8')).budgetPer10s, 4);
  assert.equal(cli('sound', 'suggest', dir, '--budget', '3').status, 0);
  assert.ok(p.chosen.length >= 3 && p.chosen[0].t <= 0.6);
  assert.match(r.stdout, /hook|first/i);
  assert.match(r.stdout, /\bwrite\b/);
  assert.match(r.stdout, /frame/);
});

test('--apply writes the chosen cues as beat cue fields through the story-edit path, never over a cue, and the story still matches its schema', () => {
  const dir = scratch('suggest-apply', (s) => { s.scenes[1].beats[0].cue = 'riser'; });
  const r = cli('sound', 'suggest', dir, '--apply');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const after = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
  const v = validators();
  assert.ok(v.story(after), JSON.stringify(v.story.errors));
  assert.equal(after.scenes[1].beats[0].cue, 'riser', 'the cue a beat had stays');
  const written = after.scenes.flatMap((sc) => sc.beats).filter((b) => b.cue).length;
  assert.ok(written >= 3, `${written} beats carry a cue`);
  const p = JSON.parse(readFileSync(join(dir, 'out', 'sound-suggest.json'), 'utf8'));
  assert.equal(written, 1 + p.chosen.filter((c) => c.apply === 'write').length, 'exactly the writable rows were written, beside the cue that was there');
  const journal = readFileSync(join(dir, 'out', 'studio', 'journal.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(journal.length, 1, 'one receipt');
  assert.ok(journal[0].edits.every((e) => e.op === 'beat.set' && e.key === 'cue'));
  const again = cli('sound', 'suggest', dir, '--apply');
  assert.equal(again.status, 0, again.stderr + again.stdout);
  const twice = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
  for (const sc of twice.scenes) sc.beats.forEach((b, i) => { if (after.scenes.find((x) => x.id === sc.id).beats[i].cue) assert.equal(b.cue, after.scenes.find((x) => x.id === sc.id).beats[i].cue); });
});

test('--apply lists the cues that do not exist yet as needs cue and writes nothing for them', () => {
  const dir = scratch('suggest-needs', () => {}, { cues: { entrance: 'pop-in', cut: 'tick' } });
  const r = cli('sound', 'suggest', dir, '--apply');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /needs cue/);
  assert.match(r.stdout, /pop-in/);
  const after = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
  assert.ok(!JSON.stringify(after).includes('pop-in'), 'a cue that has no folder is never written');
});

test('--apply honours a row the person marked approved false in the proposal', () => {
  const dir = scratch('suggest-approve');
  assert.equal(cli('sound', 'suggest', dir).status, 0);
  const file = join(dir, 'out', 'sound-suggest.json');
  const p = JSON.parse(readFileSync(file, 'utf8'));
  const row = p.chosen.find((c) => c.apply === 'write');
  row.approved = false;
  writeJson(file, p);
  const r = cli('sound', 'suggest', dir, '--apply');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const after = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
  assert.equal(after.scenes.find((s) => s.id === row.beat.scene).beats[row.beat.index].cue, undefined, 'the row left out stays unwritten');
});

test('a deck is refused with a reason, and an unknown budget is a usage error', () => {
  const dir = scratch('suggest-deck', (s) => { s.kind = 'deck'; });
  const r = cli('sound', 'suggest', dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /deck/i);
  const film = scratch('suggest-badbudget');
  const b = cli('sound', 'suggest', film, '--budget', 'lots');
  assert.equal(b.status, 2);
  assert.match(b.stderr, /budget/);
  assert.ok(!existsSync(join(film, 'out', 'sound-suggest.json')));
});

import { writeFileSync } from 'node:fs';
function writeJson(file, j) { writeFileSync(file, `${JSON.stringify(j, null, 2)}\n`); }
