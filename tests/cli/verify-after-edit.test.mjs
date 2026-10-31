// Verify after edit (SPEC §7, §16.2): the story journal (out/studio/journal.jsonl) records every edit, `mm check`
// records the head of the journal it checked (out/check.json `journal`), and `mm export` refuses a report whose
// journal head is not the journal's now: an edit newer than the last check, even one that undid itself.
// `--force` exports anyway and stamps UNCHECKED, as for any report that does not match.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gateStatus } from '../../scripts/export.mjs';
import { editStory, journalHead, readJournal, readStory, undoReceipt } from '../../scripts/lib/story-edit.mjs';
import { mm, probeVideo, readJson, stampChecked, workCopy } from './cli-helpers.mjs';

let w;
before(() => { w = workCopy('verify-after-edit'); });
after(() => w?.cleanup());

const at = (value) => ({ op: 'beat.at', scene: 'intro', beat: 0, value });
const stamp = (extra = {}) => {
  stampChecked(w.film);
  const file = join(w.film, 'out', 'check.json');
  writeFileSync(file, JSON.stringify({ ...readJson(file), ...extra }));
};
const state = () => ({ version: readStory(w.film).version, formats: ['16x9', '9x16', '1x1'] });

test('journalHead: null with no journal, the last receipt\'s id after an edit, a new id after an undo', async () => {
  assert.equal(journalHead(w.film), null);
  const { version } = readStory(w.film);
  const r = await editStory(w.film, { edits: [at(0.45)], version });
  assert.equal(journalHead(w.film), r.receipt.id);
  const u = await undoReceipt(w.film, {});
  assert.equal(journalHead(w.film), u.receipt.id);
  assert.notEqual(u.receipt.id, r.receipt.id);
  assert.equal(readJournal(w.film).length, 2);
});

test('gateStatus: a report that names the journal head it checked passes; an edit newer than the check is refused, even when the text came back', () => {
  const head = journalHead(w.film);
  assert.ok(head, 'the previous test left receipts');
  stamp({ journal: head });
  assert.deepEqual(gateStatus(w.film, { ...state(), journal: head }), { ok: true });
  stamp({ journal: 'r1-aaaaaa' });
  const why = gateStatus(w.film, { ...state(), journal: head }).why;
  assert.match(why, /edited since mm check ran/);
  assert.match(why, new RegExp(head));
  assert.match(why, /run `mm check` again/);
});

test('gateStatus: a report from before the journal was recorded is refused only when the journal has edits; none, and it passes', () => {
  stamp();
  const head = journalHead(w.film);
  assert.match(gateStatus(w.film, { ...state(), journal: head }).why, /does not say which edits it covered/);
  assert.deepEqual(gateStatus(w.film, { ...state(), journal: null }), { ok: true });
  assert.deepEqual(gateStatus(w.film, state()), { ok: true }, 'a caller that does not pass the journal head asks nothing of it');
});

test('mm export refuses a report older than the last edit, writes nothing, and says what to run; --force stamps UNCHECKED', async () => {
  stamp({ journal: 'r1-aaaaaa' });
  const r = mm(['export', w.film, '--fps', '4', '--formats', '16x9']);
  assert.equal(r.status, 1, r.out);
  assert.match(r.stderr, /edited since mm check ran/);
  assert.match(r.stderr, /--force exports anyway and stamps UNCHECKED/);
  assert.ok(!existsSync(join(w.film, 'out', 'kit-smoke-film-16x9.mp4')), 'nothing rendered');
  const forced = mm(['export', w.film, '--fps', '4', '--formats', '16x9', '--force']);
  assert.equal(forced.status, 0, forced.out);
  assert.match(forced.stderr, /edited since mm check ran.*--force given, the media is stamped UNCHECKED/);
  assert.equal(probeVideo(join(w.film, 'out', 'kit-smoke-film-16x9.mp4')).comment, 'UNCHECKED');
});

test('mm check records the journal head it checked', () => {
  const head = journalHead(w.film);
  const r = mm(['check', w.film, '--format', '16x9', '--quiet']);
  assert.ok([0, 1].includes(r.status), r.out);
  assert.equal(readJson(join(w.film, 'out', 'check.json')).journal, head);
  assert.ok(head, 'a head to record');
  assert.equal(JSON.parse(readFileSync(join(w.film, 'out', 'check.json'), 'utf8')).journal, head);
});
