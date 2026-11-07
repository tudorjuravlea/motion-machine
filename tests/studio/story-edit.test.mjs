// The story-edit service. A write happens only when the
// caller's version is the file's, only when the result passes the story schema, atomically, and
// each write appends a receipt to out/studio/journal.jsonl; a receipt is undone by applying its
// inverse, and only while the file is still the receipt's `after`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { readStory, editStory, undoReceipt, readJournal, StaleVersion, SchemaRefused, ChangedSince, EditRefused, Unreadable, Unwritable } from '../../scripts/lib/story-edit.mjs';
import { workCopy } from '../cli/cli-helpers.mjs';

let w;
before(() => { w = workCopy('story-edit'); });
after(() => w.cleanup());

const storyFile = () => join(w.film, 'story.json');
const journalFile = () => join(w.film, 'out', 'studio', 'journal.jsonl');
const original = () => readFileSync(join(w.dir, '..', 'fixtures', 'kit-smoke', 'film', 'story.json'), 'utf8');
const reset = () => { writeFileSync(storyFile(), original()); rmSync(join(w.film, 'out'), { recursive: true, force: true }); };
const at = (value, beat = 0, scene = 'intro') => ({ op: 'beat.at', scene, beat, value });

test('readStory: the text, the parsed story, and the version as 16 hex of the SHA-256', () => {
  const { text, story, version } = readStory(w.film);
  assert.equal(text, readFileSync(storyFile(), 'utf8'));
  assert.equal(story.id, 'kit-smoke-film');
  assert.equal(version, createHash('sha256').update(text).digest('hex').slice(0, 16));
});

test('editStory: writes only the edited bytes, atomically, and appends a receipt', async () => {
  const { text, version } = readStory(w.film);
  const r = await editStory(w.film, { edits: [at(0.45)], version, label: 'nudge' });
  const now = readFileSync(storyFile(), 'utf8');
  assert.equal(now, text.replace('{ "at": 0.2, "slot": "headline", "fx": "entrances/rise", "text": "Only', '{ "at": 0.45, "slot": "headline", "fx": "entrances/rise", "text": "Only'));
  assert.equal(r.version, readStory(w.film).version);
  assert.match(r.receipt.id, /^r1-[0-9a-f]{6}$/);
  assert.equal(r.receipt.who, 'cli');
  assert.equal(r.receipt.label, 'nudge');
  assert.ok(!Number.isNaN(Date.parse(r.receipt.at)));
  assert.deepEqual(r.receipt.edits, [at(0.45)]);
  assert.deepEqual(r.receipt.inverse, [at(0.2)]);
  assert.equal(r.receipt.before, version);
  assert.equal(r.receipt.after, r.version);
  assert.deepEqual(readJournal(w.film), [r.receipt]);
  assert.deepEqual(readdirSync(w.film).filter((f) => !['index.html', 'story.json', 'style.json', 'out'].includes(f)), [], 'no temporary file left');
  reset();
});

test('a version that is not the file\'s: StaleVersion with the current version, nothing written', async () => {
  const { text, version } = readStory(w.film);
  await assert.rejects(editStory(w.film, { edits: [at(0.5)], version: '0000000000000000' }), (e) => e instanceof StaleVersion && e.current === version);
  assert.equal(readFileSync(storyFile(), 'utf8'), text);
  assert.deepEqual(readJournal(w.film), []);
});

test('a result the story schema rejects: SchemaRefused with the errors, nothing written', async () => {
  // the ops restate the schema for what they write, so a bad result comes from a story already off-contract
  writeFileSync(storyFile(), original().replace('"title": "kit-smoke film', `"title": "${'x'.repeat(120)}`));
  const { text, version } = readStory(w.film);
  await assert.rejects(editStory(w.film, { edits: [at(0.5)], version }), (e) => e instanceof SchemaRefused && e.of === 'story' && (e.errors.some((x) => x.path === '/title') || /title/.test(e.message)));
  assert.equal(readFileSync(storyFile(), 'utf8'), text);
  assert.deepEqual(readJournal(w.film), []);
  reset();
});

test('edits that are not edit ops (the edit-ops contract): SchemaRefused, nothing written', async () => {
  const { text, version } = readStory(w.film);
  await assert.rejects(editStory(w.film, { edits: [{ ...at(0.5), junk: 1 }], version }), (e) => e instanceof SchemaRefused && e.of === 'edits');
  await assert.rejects(editStory(w.film, { edits: 'nope', version }), SchemaRefused);
  assert.equal(readFileSync(storyFile(), 'utf8'), text);
});

test('a refused edit: EditRefused with code, hint and index, nothing written', async () => {
  const { text, version } = readStory(w.film);
  await assert.rejects(editStory(w.film, { edits: [at(0.5), at(9)], version }), (e) => e instanceof EditRefused && e.code === 'out-of-range' && e.index === 1 && /duration/.test(e.hint));
  await assert.rejects(editStory(w.film, { edits: [{ op: 'beat.param', scene: 'intro', beat: 0, key: 'nope', value: 1 }], version }), (e) => e instanceof EditRefused && e.code === 'unknown-param');
  assert.equal(readFileSync(storyFile(), 'utf8'), text);
  assert.deepEqual(readJournal(w.film), []);
});

test('an edit that changes nothing writes nothing and records no receipt', async () => {
  const { text, version } = readStory(w.film);
  const r = await editStory(w.film, { edits: [at(0.2)], version });
  assert.deepEqual(r, { version, receipt: null });
  assert.equal(readFileSync(storyFile(), 'utf8'), text);
  assert.deepEqual(readJournal(w.film), []);
});

test('undo last restores the bytes and is itself a receipt; undo by id; an older receipt waits its turn', async () => {
  const start = readStory(w.film);
  const a = await editStory(w.film, { edits: [at(0.4)], version: start.version, who: 'studio' });
  const b = await editStory(w.film, { edits: [{ op: 'scene.duration', scene: 'outro', value: 3.5 }], version: a.version });
  await assert.rejects(undoReceipt(w.film, { receipt: a.receipt.id }), (e) => e instanceof ChangedSince && e.current === b.version);
  const u1 = await undoReceipt(w.film, { receipt: b.receipt.id, who: 'agent' });
  assert.equal(u1.version, a.version);
  assert.equal(u1.receipt.who, 'agent');
  assert.equal(u1.receipt.label, `undo ${b.receipt.id}`);
  assert.equal(u1.receipt.undoes, b.receipt.id);
  const u2 = await undoReceipt(w.film);   // 'last': the newest receipt not undone and not an undo, so a
  assert.equal(u2.receipt.undoes, a.receipt.id);
  assert.equal(readFileSync(storyFile(), 'utf8'), start.text, 'bytes restored');
  assert.equal(u2.version, start.version);
  assert.equal(readJournal(w.film).length, 4);
  assert.match(readJournal(w.film)[3].id, /^r4-/);
  reset();
});

test('undo restores a hand-written value exactly, not rounded to 0.01 s (through the service)', async () => {
  reset();
  const hand = original().replace('{ "at": 0.2, "slot": "headline"', '{ "at": 0.483, "slot": "headline"');
  writeFileSync(storyFile(), hand);
  await editStory(w.film, { edits: [at(1)], version: readStory(w.film).version });
  await undoReceipt(w.film, { receipt: 'last' });
  assert.equal(readFileSync(storyFile(), 'utf8'), hand);
  reset();
});

test('undo is refused once the file changed outside the journal', async () => {
  const start = readStory(w.film);
  await editStory(w.film, { edits: [at(0.6)], version: start.version });
  writeFileSync(storyFile(), readFileSync(storyFile(), 'utf8').replace('"duration": 3,', '"duration": 3.25,'));
  const current = readStory(w.film).version;
  await assert.rejects(undoReceipt(w.film, { receipt: 'last' }), (e) => e instanceof ChangedSince && e.current === current);
  assert.equal(readJournal(w.film).length, 1);
  reset();
});

// ---- the journal lock ---------------------------------------------------------------------------

const lockFile = () => join(w.film, 'out', 'studio', 'journal.lock');
const dur = (value, scene = 'intro') => ({ op: 'scene.duration', scene, value });

test('two isolates committing against one version at the same instant: exactly one wins, ids unique', { timeout: 60_000 }, async () => {
  reset();
  // worker threads are separate isolates, as two processes are; a shared flag starts both commits together
  const sab = new SharedArrayBuffer(4), flag = new Int32Array(sab);
  const url = new URL('../../scripts/lib/story-edit.mjs', import.meta.url).href;
  const code = `const { parentPort, workerData } = require('node:worker_threads');
    import(${JSON.stringify(url)}).then(async ({ editStory }) => {
      const flag = new Int32Array(workerData.sab);
      await editStory(workerData.piece, { edits: [], version: 'x' }).catch(() => {});   // warm the pattern cache
      parentPort.on('message', async ({ v, i }) => {
        const p = editStory(workerData.piece, { version: v, edits: [{ op: 'scene.duration', scene: 'intro', value: 3 + (i % 40) / 100 + (workerData.k ? 0.5 : 0.6) }] });
        Atomics.wait(flag, 0, i);
        try { await p; parentPort.postMessage('ok'); } catch (e) { parentPort.postMessage(e.name); }
      });
      parentPort.postMessage('ready');
    });`;
  const ws = [0, 1].map((k) => new Worker(code, { eval: true, workerData: { piece: w.film, k, sab } }));
  try {
    await Promise.all(ws.map((x) => new Promise((ok) => x.once('message', ok))));
    const rounds = 40;
    for (let i = 0; i < rounds; i++) {
      const v = readStory(w.film).version;
      const done = ws.map((x) => new Promise((ok) => x.once('message', ok)));
      ws.forEach((x) => x.postMessage({ v, i }));
      await new Promise((r) => setTimeout(r, 5));
      Atomics.store(flag, 0, i + 1); Atomics.notify(flag, 0);
      const rs = await Promise.all(done);
      assert.equal(rs.filter((r) => r === 'ok').length, 1, `round ${i}: ${rs}`);
      assert.ok(rs.includes('StaleVersion'), `round ${i}: ${rs}`);
    }
    const j = readJournal(w.film);
    assert.equal(j.length, rounds);
    assert.equal(new Set(j.map((r) => r.id)).size, rounds, 'receipt ids are unique');
    for (let k = 1; k < j.length; k++) assert.equal(j[k].before, j[k - 1].after, `receipt ${j[k].id} follows ${j[k - 1].id}: no lost update`);
    assert.equal(j.at(-1).after, readStory(w.film).version);
    assert.ok(!existsSync(lockFile()), 'the lock is released');
  } finally { await Promise.all(ws.map((x) => x.terminate())); reset(); }
});

test('a stale lock (a dead pid, or older than the stale age) is recovered', async () => {
  reset();
  mkdirSync(join(w.film, 'out', 'studio'), { recursive: true });
  writeFileSync(lockFile(), JSON.stringify({ pid: 2 ** 22 + 12345, at: new Date().toISOString(), nonce: 'dead' }));
  const a = await editStory(w.film, { edits: [dur(3.5)], version: readStory(w.film).version });
  assert.ok(a.receipt);
  assert.ok(!existsSync(lockFile()));
  writeFileSync(lockFile(), JSON.stringify({ pid: process.ppid, at: new Date(0).toISOString(), nonce: 'old' }));
  const old = new Date(Date.now() - 60_000);
  utimesSync(lockFile(), old, old);
  const b = await editStory(w.film, { edits: [dur(3.6)], version: a.version });
  assert.ok(b.receipt);
  assert.ok(!existsSync(lockFile()));
  reset();
});

test('a journal that cannot be written refuses the edit before the story changes (Unwritable)', async () => {
  reset();
  const { text, version } = readStory(w.film);
  mkdirSync(journalFile(), { recursive: true });   // a directory where the journal goes: EISDIR on open
  await assert.rejects(editStory(w.film, { edits: [dur(3.8)], version }), (e) => e instanceof Unwritable && /journal\.jsonl/.test(e.message) && !e.message.includes(w.dir));
  assert.equal(readFileSync(storyFile(), 'utf8'), text, 'the story is untouched');
  rmSync(journalFile(), { recursive: true });
  writeFileSync(journalFile(), '');
  chmodSync(journalFile(), 0o444);
  try {
    await assert.rejects(editStory(w.film, { edits: [dur(3.8)], version }), Unwritable);
    assert.equal(readFileSync(storyFile(), 'utf8'), text, 'the story is untouched');
  } finally { chmodSync(journalFile(), 0o644); }
  assert.ok(!existsSync(lockFile()));
  reset();
});

test('a journal line cut short by a crash does not swallow the next receipt, and ids are never reused', async () => {
  reset();
  const a = await editStory(w.film, { edits: [dur(3.5)], version: readStory(w.film).version });
  const b = await editStory(w.film, { edits: [dur(3.6)], version: a.version });
  const full = readFileSync(journalFile(), 'utf8');
  writeFileSync(journalFile(), full.slice(0, full.length - 30));   // a crash mid-append: b's line is cut, no newline
  const c = await editStory(w.film, { edits: [dur(3.7)], version: b.version });
  const j = readJournal(w.film);
  assert.deepEqual(j.map((r) => r.id), [a.receipt.id, c.receipt.id], 'the cut line is skipped, the next receipt kept');
  assert.notEqual(c.receipt.id.split('-')[0], b.receipt.id.split('-')[0], 'the cut receipt\'s number is not reused');
  assert.match(c.receipt.id, /^r3-/);
  const u = await undoReceipt(w.film);
  assert.equal(u.receipt.undoes, c.receipt.id);
  assert.match(u.receipt.id, /^r4-/);
  reset();
});

test('a story.json that does not parse, or is missing: Unreadable naming story.json, no absolute path', async () => {
  reset();
  writeFileSync(storyFile(), original().slice(0, 200));
  assert.throws(() => readStory(w.film), (e) => e instanceof Unreadable && /story\.json/.test(e.message) && !e.message.includes(w.dir));
  await assert.rejects(editStory(w.film, { edits: [dur(3.5)], version: 'x' }), Unreadable);
  rmSync(storyFile());
  assert.throws(() => readStory(w.film), (e) => e instanceof Unreadable && /missing/.test(e.message) && !e.message.includes(w.dir));
  reset();
});

test('a pattern added after the first load is offered; a pattern that does not import names its error', async () => {
  reset();
  const { version } = readStory(w.film);
  const cut = (p) => ({ op: 'scene.cut', scene: 'intro', pattern: p });
  await assert.rejects(editStory(w.film, { edits: [cut('transitions/new-cut')], version }), (e) => e instanceof EditRefused && e.code === 'bad-value');
  cpSync(join(w.patterns, 'transitions', 'hard-cut'), join(w.patterns, 'transitions', 'new-cut'), { recursive: true });
  const ok = await editStory(w.film, { edits: [cut('transitions/new-cut')], version });
  assert.ok(ok.receipt);
  mkdirSync(join(w.patterns, 'transitions', 'broken-cut'));
  writeFileSync(join(w.patterns, 'transitions', 'broken-cut', 'pattern.js'), 'export default {{;');
  await assert.rejects(editStory(w.film, { edits: [cut('transitions/broken-cut')], version: ok.version }),
    (e) => e instanceof EditRefused && e.code === 'bad-value' && /does not load/.test(e.hint) && /broken-cut/.test(e.hint));
  rmSync(join(w.patterns, 'transitions', 'new-cut'), { recursive: true });
  rmSync(join(w.patterns, 'transitions', 'broken-cut'), { recursive: true });
  reset();
});

test('edit-ops schema errors keep only the branch the op names', async () => {
  reset();
  const { version } = readStory(w.film);
  await assert.rejects(editStory(w.film, { edits: [{ op: 'beat.at', scene: 'intro', beat: 0, value: -1 }], version }), (e) => {
    assert.ok(e instanceof SchemaRefused && e.of === 'edits');
    assert.ok(e.errors.length >= 1 && e.errors.every((x) => x.path === '/0/value'), JSON.stringify(e.errors));
    assert.doesNotMatch(e.message, /additional properties|equal to constant/);
    return true;
  });
});

test('a generated story refuses every edit with the generator in the hint', async () => {
  writeFileSync(storyFile(), original().replace('"kind": "film",', '"kind": "film",\n  "generator": "pieces/catalogue/build.mjs",'));
  const { version, text } = readStory(w.film);
  await assert.rejects(editStory(w.film, { edits: [at(0.5)], version }), (e) => e instanceof EditRefused && e.code === 'generated' && /catalogue\/build\.mjs/.test(e.hint));
  assert.equal(readFileSync(storyFile(), 'utf8'), text);
  assert.ok(!existsSync(journalFile()) || readJournal(w.film).length === 0);
  reset();
});
