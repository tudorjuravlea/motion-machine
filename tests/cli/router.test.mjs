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
