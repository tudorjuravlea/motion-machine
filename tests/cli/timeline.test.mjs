// `mm timeline`, the studio's edits from the command line.
// Spawned as `node scripts/mm.mjs timeline` on temp copies: every verb, every ref form, every time
// form; --plan prints a diff and writes nothing; a refusal exits 2 with a hint; `undo last` restores
// the bytes; after a write the timing verdicts that changed are printed, new failures first.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, mm, workCopy } from './cli-helpers.mjs';

let w, golden;
const SRC = join(ROOT, 'fixtures', 'kit-smoke', 'film', 'story.json');
const GOLDEN_SRC = join(ROOT, 'pieces', 'golden-film-kinetic');
before(() => {
  w = workCopy('timeline');
  golden = join(w.dir, 'golden-film-kinetic');
  cpSync(GOLDEN_SRC, golden, { recursive: true, filter: (p) => !p.startsWith(join(GOLDEN_SRC, 'out')) });
});
after(() => w.cleanup());

const storyFile = () => join(w.film, 'story.json');
const journal = (dir = w.film) => { const f = join(dir, 'out', 'studio', 'journal.jsonl'); return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; };
/** A fresh story (and an empty journal) before each case. */
function fresh(text = readFileSync(SRC, 'utf8')) {
  writeFileSync(storyFile(), text);
  writeFileSync(join(w.film, 'out', 'studio', 'journal.jsonl'), '', { flag: 'w' });
  return text;
}
const tl = (...args) => mm(['timeline', w.film, ...args], { timeout: 60_000 });
const story = () => JSON.parse(readFileSync(storyFile(), 'utf8'));
before(() => mkdirSync(join(w.film, 'out', 'studio'), { recursive: true }));

test('no verb: the model as a table, or as JSON with --json', () => {
  fresh();
  const r = tl();
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /intro\s+0\.00\s+3\.00\s+3\.00\s+transitions\/hard-cut/);
  assert.match(r.stdout, /intro\/headline\s+0\.20\s+3\.\d\d\s+Only time moves things\./);
  assert.match(r.stdout, /outro\/sub\s+/);
  const j = tl('--json');
  assert.equal(j.status, 0, j.out);
  const model = JSON.parse(j.stdout);
  assert.deepEqual(model.scenes.map((s) => s.id), ['intro', 'outro']);
  assert.ok(model.lanes.some((l) => l.id === 'slot:headline'));
});

test('move <ref> <time>: only that beat\'s at changes; the receipt and the changed verdicts are printed', () => {
  const text = fresh();
  const r = tl('move', 'intro/headline', '0.5');
  assert.equal(r.status, 0, r.out);
  assert.equal(readFileSync(storyFile(), 'utf8'), text.replace('{ "at": 0.2, "slot": "headline", "fx": "entrances/rise", "text": "Only', '{ "at": 0.5, "slot": "headline", "fx": "entrances/rise", "text": "Only'));
  assert.match(r.stdout, /wrote r1-[0-9a-f]{6}/);
  assert.match(r.stdout, /timing:/);
  assert.equal(journal()[0].who, 'cli');
});

test('every ref form: <scene>, <scene>/<slot>, <scene>#<n>, <scene>/<slot>#<n>', () => {
  fresh();
  assert.equal(tl('move', 'intro#1', '1.1').status, 0);
  assert.equal(story().scenes[0].beats[1].at, 1.1);
  assert.equal(tl('move', 'intro/sub', '1.2').status, 0);
  assert.equal(story().scenes[0].beats[1].at, 1.2);
  // a second headline beat, then the n-th beat in that slot (0-based, as beat indexes are)
  const edits = join(w.dir, 'add.json');
  writeFileSync(edits, JSON.stringify([{ op: 'beat.add', scene: 'intro', beat: { at: 2, slot: 'headline', fx: 'entrances/fade', text: 'Again.' } }]));
  assert.equal(tl('apply', edits).status, 0);
  assert.equal(tl('move', 'intro/headline#1', '2.2').status, 0);
  assert.equal(story().scenes[0].beats[2].at, 2.2);
  assert.equal(tl('move', 'intro/headline#0', '0.3').status, 0);
  assert.equal(story().scenes[0].beats[0].at, 0.3);
  assert.equal(tl('trim', 'intro', '3.5').status, 0);
  assert.equal(story().scenes[0].duration, 3.5);
  for (const bad of ['nope/headline', 'intro/nope', 'intro#9', 'intro/headline#5', 'intro#x']) {
    const r = tl('move', bad, '1');
    assert.equal(r.status, 2, `${bad}: ${r.out}`);
    assert.match(r.stderr, /hint:/, bad);
  }
});

test('every time form: 4.5, 4.5s, +0.5, -0.25, 30f, end; beat:<n> and bar:<n> from beats.json', () => {
  fresh();
  const at = () => story().scenes[0].beats[1].at;
  tl('move', 'intro#1', '1.5'); assert.equal(at(), 1.5);
  tl('move', 'intro#1', '1.25s'); assert.equal(at(), 1.25);
  tl('move', 'intro#1', '+0.5'); assert.equal(at(), 1.75);
  tl('move', 'intro#1', '-0.25'); assert.equal(at(), 1.5);
  tl('move', 'intro#1', '30f'); assert.equal(at(), 1);
  tl('move', 'intro#1', '+3f'); assert.equal(at(), 1.1);
  assert.equal(tl('out', 'intro#1', 'end').status, 0); assert.equal(story().scenes[0].beats[1].out, 3);
  assert.equal(tl('trim', 'intro', '+0.5').status, 0); assert.equal(story().scenes[0].duration, 3.5);
  const r = tl('move', 'intro#1', 'beat:2');
  assert.equal(r.status, 2, 'no beat grid in this story');
  assert.match(r.stderr, /beats\.json|audio\.beats/);

  // golden-film-kinetic: 120 bpm, beats every 0.5 s, downbeats every 2 s
  const model = JSON.parse(mm(['timeline', golden, '--json', '--format', '16x9']).stdout);
  const sc = model.scenes.find((s) => s.id === 'time');
  const grid = JSON.parse(readFileSync(join(golden, 'assets', 'beats.json'), 'utf8'));
  const n = grid.beats.findIndex((b) => b > sc.start + 0.5) + 1;   // 1-based, as a musician counts
  const g = mm(['timeline', golden, '--format', '16x9', 'move', 'time#1', `beat:${n}`]);
  assert.equal(g.status, 0, g.out);
  const gs = () => JSON.parse(readFileSync(join(golden, 'story.json'), 'utf8')).scenes.find((s) => s.id === 'time');
  assert.equal(gs().beats[1].at, Math.round((grid.beats[n - 1] - sc.start) * 100) / 100);
  const m = grid.downbeats.findIndex((b) => b > sc.start) + 1;
  const b = mm(['timeline', golden, '--format', '16x9', 'trim', 'time', `bar:${m + 1}`]);
  assert.equal(b.status, 0, b.out);
  assert.equal(gs().duration, Math.round((grid.downbeats[m] - sc.start) * 100) / 100);
});

test('out <ref> <time|none>; set <ref> key=value (beat keys, pattern params, removal)', () => {
  fresh();
  assert.equal(tl('out', 'intro#0', '2.5').status, 0);
  assert.equal(story().scenes[0].beats[0].out, 2.5);
  assert.equal(tl('out', 'intro#0', '+0.25').status, 0);
  assert.equal(story().scenes[0].beats[0].out, 2.75);
  assert.equal(tl('out', 'intro#0', 'none').status, 0);
  assert.ok(!('out' in story().scenes[0].beats[0]));
  assert.equal(tl('set', 'intro#0', 'text=Time moves things.', 'cue=tick').status, 0);
  assert.equal(story().scenes[0].beats[0].text, 'Time moves things.');
  assert.equal(story().scenes[0].beats[0].cue, 'tick');
  assert.equal(tl('set', 'intro#0', 'text=42').status, 0, 'a text that looks like a number stays text');
  assert.equal(story().scenes[0].beats[0].text, '42');
  assert.equal(tl('set', 'intro#0', 'd=60').status, 0);
  assert.deepEqual(story().scenes[0].beats[0].params, { d: 60 });
  assert.equal(tl('set', 'intro#0', 'd=').status, 0);
  assert.ok(!('params' in story().scenes[0].beats[0]));
  assert.equal(tl('set', 'outro#0', 'spring=').status, 0);
  assert.ok(!('params' in story().scenes[1].beats[0]));
  assert.equal(tl('set', 'intro#0', 'cue=').status, 0);
  assert.ok(!('cue' in story().scenes[0].beats[0]));
  assert.equal(tl('set', 'intro', 'say=One number draws it.').status, 0);
  assert.equal(story().scenes[0].say, 'One number draws it.');
  assert.equal(tl('set', 'intro', 'cut=transitions/probe').status, 0);
  assert.equal(story().scenes[0].cut, 'transitions/probe');
  const bad = tl('set', 'intro#0', 'd=fast');
  assert.equal(bad.status, 2, bad.out);
  assert.match(bad.stderr, /refused \(bad-type\)/);
  assert.match(bad.stderr, /hint: give d a number/);
});

test('move <scene> before|after <scene> reorders; trim sets the duration', () => {
  fresh();
  assert.equal(tl('move', 'intro', 'after', 'outro').status, 0);
  assert.deepEqual(story().scenes.map((s) => s.id), ['outro', 'intro']);
  assert.equal(tl('move', 'intro', 'before', 'outro').status, 0);
  assert.deepEqual(story().scenes.map((s) => s.id), ['intro', 'outro']);
  assert.equal(readFileSync(storyFile(), 'utf8'), readFileSync(SRC, 'utf8'), 'two moves back restore the bytes');
  assert.equal(tl('trim', 'outro', '4').status, 0);
  assert.equal(story().scenes[1].duration, 4);
  const r = tl('move', 'intro', '2');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /hint:.*trim/);
});

test('apply <edits.json>; undo last restores the bytes; undo <receipt>; --who names the author', () => {
  const text = fresh();
  const file = join(w.dir, 'edits.json');
  writeFileSync(file, JSON.stringify([{ op: 'beat.at', scene: 'outro', beat: 1, value: 1 }, { op: 'scene.duration', scene: 'outro', value: 3.4 }]));
  const a = tl('apply', file, '--who', 'agent-1', '--json');
  assert.equal(a.status, 0, a.out);
  const out = JSON.parse(a.stdout);
  assert.equal(out.receipt.who, 'agent-1');
  assert.ok(Array.isArray(out.changed));
  assert.equal(story().scenes[1].duration, 3.4);
  const m = tl('move', 'intro#0', '0.4');
  assert.equal(m.status, 0);
  assert.equal(tl('undo', 'last').status, 0);
  assert.equal(tl('undo', out.receipt.id).status, 0);
  assert.equal(readFileSync(storyFile(), 'utf8'), text, 'bytes restored');
  const none = tl('undo', 'r99-000000');
  assert.equal(none.status, 2);
  writeFileSync(file, '[{ "op": "beat.at", "scene": "intro" }]');
  const badApply = tl('apply', file);
  assert.equal(badApply.status, 2);
  assert.match(badApply.stderr, /edit-ops/);
});

test('undo is refused after an outside change, with a hint', () => {
  fresh();
  assert.equal(tl('move', 'intro#0', '0.4').status, 0);
  writeFileSync(storyFile(), readFileSync(storyFile(), 'utf8').replace('"duration": 3,', '"duration": 3.5,'));
  const r = tl('undo');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /changed since/);
  assert.match(r.stderr, /hint:/);
});

test('--plan prints a unified diff and writes nothing', () => {
  const text = fresh();
  const r = tl('move', 'intro#0', '0.5', '--plan');
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /^--- a\/.*story\.json$/m);
  assert.match(r.stdout, /^\+\+\+ b\/.*story\.json$/m);
  assert.match(r.stdout, /^@@ -\d+,\d+ \+\d+,\d+ @@$/m);
  assert.match(r.stdout, /^-.*"at": 0\.2, "slot": "headline"/m);
  assert.match(r.stdout, /^\+.*"at": 0\.5, "slot": "headline"/m);
  assert.equal(readFileSync(storyFile(), 'utf8'), text);
  assert.deepEqual(journal(), []);
  const reorder = tl('move', 'outro', 'before', 'intro', '--plan');
  assert.equal(reorder.status, 0);
  assert.equal(readFileSync(storyFile(), 'utf8'), text);
});

test('a refusal exits 2 with the reason and the hint; a generated story names its generator', () => {
  const text = fresh();
  const r = tl('move', 'intro#0', '9');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /refused \(out-of-range\)/);
  assert.match(r.stderr, /hint: at must be from 0 to below 3 s/);
  assert.equal(readFileSync(storyFile(), 'utf8'), text);
  fresh(text.replace('"kind": "film",', '"kind": "film",\n  "generator": "pieces/catalogue/build.mjs",'));
  const g = tl('move', 'intro#0', '0.5');
  assert.equal(g.status, 2);
  assert.match(g.stderr, /refused \(generated\)/);
  assert.match(g.stderr, /pieces\/catalogue\/build\.mjs/);
  for (const args of [['frob'], ['move', 'intro#0'], ['set', 'intro#0', 'novalue'], ['trim', 'intro', 'soon'], ['--frob']]) {
    const u = tl(...args);
    assert.equal(u.status, 2, `${args}: ${u.out}`);
    assert.doesNotMatch(u.out, /\n\s+at /);
  }
});

test('check prints the timing verdicts; after a write the changed verdicts come new failures first', () => {
  fresh();
  const c = tl('check');
  assert.ok([0, 1].includes(c.status), c.out);
  for (const id of ['G-DEAD', 'G-LENGTH', 'W-READ']) assert.match(c.stdout, new RegExp(id));
  const j = JSON.parse(tl('check', '--json').stdout);
  assert.ok(j.some((r) => r.id === 'W-READ' && r.format === '16x9'));
  // lengthening intro to 6 s opens a dead window (a new failure) and gives it its hold (an improvement)
  const r = tl('trim', 'intro', '6', '--json');
  assert.equal(r.status, 0, r.out);
  const { changed } = JSON.parse(r.stdout);
  assert.ok(changed.some((x) => x.id === 'G-DEAD' && x.before === 'PASS' && x.after === 'FAIL'), JSON.stringify(changed));
  assert.ok(changed.some((x) => x.id === 'W-HOLD' && x.after === 'PASS'), JSON.stringify(changed));
  const rank = (st) => (st === 'FAIL' ? 0 : st === 'WARN' ? 1 : 2);
  for (let i = 1; i < changed.length; i++) assert.ok(rank(changed[i - 1].after) <= rank(changed[i].after), JSON.stringify(changed));
  const back = tl('trim', 'intro', '3');
  assert.ok(back.stdout.indexOf('W-HOLD 16x9: PASS → WARN') > 0, back.stdout);
  assert.ok(back.stdout.indexOf('W-HOLD 16x9: PASS → WARN') < back.stdout.indexOf('G-DEAD 16x9: FAIL → PASS'), 'the new warning comes before the fixed failure');
});

test('selection prints what the studio selected', () => {
  fresh();
  const none = tl('selection');
  assert.equal(none.status, 0);
  assert.match(none.stdout, /no selection/);
  writeFileSync(join(w.film, 'out', 'studio', 'selection.json'), JSON.stringify({ path: '/scenes/1/beats/0', t: 3.4, format: '16x9' }));
  const r = tl('selection', '--json');
  assert.deepEqual(JSON.parse(r.stdout), { path: '/scenes/1/beats/0', t: 3.4, format: '16x9' });
  assert.match(tl('selection').stdout, /outro#0/);
});

const oneLine = (r) => { assert.equal(r.stderr.trim().split('\n').filter((l) => !/^\s+hint:/.test(l)).length, 1, r.stderr); assert.doesNotMatch(r.out, /\n\s+at /); };

test('out-of-range times and scene say= are refused with a reason, not schema noise', () => {
  const text = fresh();
  for (const [args, re] of [[['move', 'intro#0', '-5'], /before intro starts/], [['move', 'intro#1', '-2'], /before intro starts/], [['trim', 'intro', '0'], /longer than 0/], [['out', 'intro#0', '-5'], /before intro starts/]]) {
    const r = tl(...args);
    assert.equal(r.status, 2, `${args}: ${r.out}`);
    assert.match(r.stderr, /refused \(out-of-range\)/, args.join(' '));
    assert.match(r.stderr, re, args.join(' '));
    assert.doesNotMatch(r.stderr, /additional properties|equal to constant/);
  }
  const say = tl('set', 'intro', 'say=');
  assert.equal(say.status, 2, say.out);
  assert.match(say.stderr, /refused \(bad-value\)/);
  assert.equal(readFileSync(storyFile(), 'utf8'), text);
  const cut = tl('set', 'intro', 'cut=null');   // null, not the text "null": the ops' own reason, not schema noise
  assert.equal(cut.status, 2, cut.out);
  assert.match(cut.stderr, /refused \(bad-value\): intro would have neither a cut nor a position/);
  assert.equal(readFileSync(storyFile(), 'utf8'), text);
  // a beat of the grid that falls before the scene starts
  const model = JSON.parse(mm(['timeline', golden, '--json', '--format', '16x9']).stdout);
  const sc = model.scenes.find((s) => s.id === 'time');
  const grid = JSON.parse(readFileSync(join(golden, 'assets', 'beats.json'), 'utf8'));
  assert.ok(grid.beats[0] < sc.start);
  const g = mm(['timeline', golden, '--format', '16x9', '--plan', 'move', 'time#1', 'beat:1']);
  assert.equal(g.status, 2, g.out);
  assert.match(g.stderr, /refused \(out-of-range\): beat:1 is [\d.]+ s before time starts/);
});

test('an apply whose op fails the contract names only that op\'s errors', () => {
  fresh();
  const file = join(w.dir, 'neg.json');
  writeFileSync(file, JSON.stringify([{ op: 'beat.at', scene: 'intro', beat: 0, value: -1 }]));
  const r = tl('apply', file);
  assert.equal(r.status, 2, r.out);
  assert.match(r.stderr, /\/0\/value must be >= 0/);
  assert.doesNotMatch(r.stderr, /additional properties|equal to constant/);
});

test('beat:<n> reads a bare-array beats.json as the gate does', () => {
  const file = join(golden, 'assets', 'beats.json');
  const orig = readFileSync(file, 'utf8');
  const grid = JSON.parse(orig);
  const sc = JSON.parse(mm(['timeline', golden, '--json', '--format', '16x9']).stdout).scenes.find((s) => s.id === 'time');
  const n = grid.beats.findIndex((b) => b > sc.start + 0.5) + 2;   // one past the beat the time-form test used
  writeFileSync(file, JSON.stringify([...grid.beats].reverse()));   // a bare array, unsorted: the gate sorts it
  try {
    const r = mm(['timeline', golden, '--format', '16x9', '--plan', 'move', 'time#1', `beat:${n}`]);
    assert.equal(r.status, 0, r.out);
    assert.match(r.stdout, new RegExp(`^\\+.*"at": ${Math.round((grid.beats[n - 1] - sc.start) * 100) / 100}\\b`, 'm'));
  } finally { writeFileSync(file, orig); }
});

test('--who cannot claim studio or outside', () => {
  fresh();
  for (const who of ['studio', 'outside']) {
    const r = tl('move', 'intro#0', '0.4', '--who', who);
    assert.equal(r.status, 2, r.out);
    assert.match(r.stderr, /--who/);
  }
  assert.deepEqual(journal(), []);
});

test('--json refusals on stdout; extra arguments refused; the diff puts - before +; a bad time is a refusal, not usage', () => {
  const text = fresh();
  const j = tl('--json', 'move', 'intro#0', '9');
  assert.equal(j.status, 2);
  const { refused } = JSON.parse(j.stdout);
  assert.equal(refused.code, 'out-of-range');
  assert.ok(refused.reason && refused.hint);
  for (const args of [['check', 'extra'], ['undo', 'last', 'extra'], ['selection', 'x'], ['move', 'intro#0', '0.5', 'extra'], ['trim', 'intro', '3', 'x'], ['apply', 'a.json', 'b.json']]) {
    const r = tl(...args);
    assert.equal(r.status, 2, `${args}: ${r.out}`);
    assert.match(r.stderr, /unexpected argument/, args.join(' '));
  }
  assert.equal(readFileSync(storyFile(), 'utf8'), text);
  const p = tl('move', 'intro#0', '0.5', '--plan');
  const lines = p.stdout.split('\n');
  assert.ok(lines.findIndex((l) => l.startsWith('-  ')) < lines.findIndex((l) => l.startsWith('+  ')), p.stdout);
  const t = tl('trim', 'intro', 'soon');
  assert.equal(t.status, 2);
  assert.match(t.stderr, /refused \(bad-time\)/);
  assert.doesNotMatch(t.stderr, /mm timeline <piece>/, 'no usage block after a bad time');
  oneLine(t);
});

test('a selection that is not in the story is said so; a selection file that does not parse is one line', () => {
  fresh();
  const sel = join(w.film, 'out', 'studio', 'selection.json');
  writeFileSync(sel, JSON.stringify({ path: '/scenes/9/beats/0', t: 1, format: '4x5' }));
  const r = tl('selection');
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(r.stdout, /undefined/);
  assert.match(r.stdout, /not in the story/);
  writeFileSync(sel, '{ nope');
  const b = tl('selection');
  assert.equal(b.status, 2, b.out);
  assert.match(b.stderr, /refused \(unreadable\)/);
  oneLine(b);
  rmSync(sel);
});

test('a story.json that does not parse, or a journal that cannot be written: one line, exit 2, nothing written', () => {
  const text = fresh();
  writeFileSync(storyFile(), text.slice(0, 200));
  for (const args of [[], ['move', 'intro#0', '0.4'], ['check']]) {
    const r = tl(...args);
    assert.equal(r.status, 2, r.out);
    assert.match(r.stderr, /refused \(unreadable\): story\.json/);
    oneLine(r);
  }
  fresh();
  const jf = join(w.film, 'out', 'studio', 'journal.jsonl');
  chmodSync(jf, 0o444);
  try {
    const r = tl('move', 'intro#0', '0.4');
    assert.equal(r.status, 2, r.out);
    assert.match(r.stderr, /refused \(unwritable\)/);
    oneLine(r);
    assert.equal(readFileSync(storyFile(), 'utf8'), text, 'the story is untouched');
  } finally { chmodSync(jf, 0o644); }
});

test('--format routes a beat edit into that format\'s variant beats (review focus 2)', () => {
  const base = readFileSync(SRC, 'utf8');
  fresh(base.replace('"say": "The kit draws every frame from one number."', '"say": "The kit draws every frame from one number.",\n      "variants": { "9x16": { "beats": [ { "at": 0.4, "slot": "headline", "fx": "entrances/rise", "text": "Only time." } ] } }'));
  assert.equal(tl('--format', '9x16', 'move', 'intro/headline', '0.6').status, 0);
  assert.equal(story().scenes[0].variants['9x16'].beats[0].at, 0.6);
  assert.equal(story().scenes[0].beats[0].at, 0.2);
  assert.equal(tl('move', 'intro/headline', '0.7').status, 0);
  assert.equal(story().scenes[0].beats[0].at, 0.7);
  assert.equal(story().scenes[0].variants['9x16'].beats[0].at, 0.6);
});
