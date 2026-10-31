// scripts/mm.mjs: the verb router. Help, unknown verbs and usage errors exit 2; `pattern list`
// lists only complete patterns; a group verb with a missing subcommand says what it expects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mm } from './cli-helpers.mjs';

test('help exits 0, no verb and unknown verbs exit 2', () => {
  const help = mm(['help']);
  assert.equal(help.status, 0);
  for (const verb of ['doctor', 'new', 'serve', 'stills', 'check', 'export', 'review', 'pattern']) assert.match(help.stdout, new RegExp(verb));
  assert.equal(mm([]).status, 2);
  const bogus = mm(['bogus']);
  assert.equal(bogus.status, 2);
  assert.match(bogus.stderr, /unknown verb "bogus"/);
});

test('pattern list exits 0; a group verb without a known subcommand exits 2 naming the choices', () => {
  const list = mm(['pattern', 'list']);
  assert.equal(list.status, 0, list.out);
  const bad = mm(['pattern', 'wobble']);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /list \| lint \| stills/);
});

test('the verb scripts pass their exit codes through', () => {
  assert.equal(mm(['new', '--kind', 'film']).status, 2, 'usage error from new');
  assert.equal(mm(['stills', '/nonexistent-piece']).status, 2, 'usage error from stills');
});

test('mm sound routes mine and clone to their scripts and leaves `mm sound <piece>` alone', async () => {
  const { plan } = await import('../../scripts/mm.mjs');
  assert.deepEqual(plan(['sound', 'mine', 'in', '--out', 'o', '--own']), { script: 'sound-mine.mjs', args: ['in', '--out', 'o', '--own'], label: 'sound mine' });
  assert.deepEqual(plan(['sound', 'clone', '--profile', 'glass']), { script: 'sound-clone.mjs', args: ['--profile', 'glass'], label: 'sound clone' });
  assert.deepEqual(plan(['sound', 'pieces/demo-film', '--formats', '16x9']), { script: 'sound.mjs', args: ['pieces/demo-film', '--formats', '16x9'], label: 'sound' });
  assert.deepEqual(plan(['sound']), { script: 'sound.mjs', args: [], label: 'sound' });
  assert.deepEqual(plan(['sound', './mine']), { script: 'sound.mjs', args: ['./mine'], label: 'sound' }, 'a piece named mine is reached by path');
  assert.match(plan(['sound', 'mine', '--help']).help, /--licence/);
  assert.match(plan(['sound', 'clone', '-h']).help, /--meaning/);
  const bad = plan(['sound', 'mine', 'in', '--wobble']);
  assert.equal(bad.code, 2);
  assert.match(bad.error, /unknown option --wobble/);
  assert.match(plan(['help']).help, /sound mine/);
});
