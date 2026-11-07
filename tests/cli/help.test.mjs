// `--help` on every verb and subverb prints its usage and exits 0; an unknown flag prints the usage
// and exits 2 with no stack; routing: `pattern list` is pattern-lint's own list,
// `pattern lint <name>` passes the name through, `motion capture` defaults --name to the --out basename.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUP_USAGE, USAGE } from '../../scripts/lib/cli.mjs';
import { plan } from '../../scripts/mm.mjs';
import { mm } from './cli-helpers.mjs';

const commands = Object.keys(USAGE);
const noStack = (text) => assert.doesNotMatch(text, /\n\s+at |ERR_PARSE_ARGS|TypeError|node:internal/);

test('every verb and subverb answers --help and -h with its usage line and exit 0', () => {
  assert.ok(commands.length >= 18);
  for (const cmd of commands) {
    for (const flag of ['--help', '-h']) {
      const r = mm([...cmd.split(' '), flag]);
      assert.equal(r.status, 0, `${cmd} ${flag}: ${r.out}`);
      assert.ok(r.stdout.startsWith(`usage: ${USAGE[cmd][0]}`), `${cmd} ${flag}: ${r.stdout}`);
      noStack(r.out);
    }
  }
});

test('a group alone, or with --help, lists its subcommands', () => {
  for (const [group, subs] of Object.entries(GROUP_USAGE)) {
    const r = mm([group, '--help']);
    assert.equal(r.status, 0, r.out);
    for (const sub of subs) assert.match(r.stdout, new RegExp(`usage: mm ${group} ${sub}`));
    const bare = mm([group]);
    assert.equal(bare.status, 2);
    assert.match(bare.stderr, new RegExp(`usage: mm ${group} ${subs[0]}`));
  }
});

test('an unknown flag prints the usage and exits 2, never a stack, on every verb', () => {
  for (const cmd of commands) {
    const r = mm([...cmd.split(' '), '--no-such-flag']);
    assert.equal(r.status, 2, `${cmd}: ${r.out}`);
    noStack(r.out);
    assert.match(r.stderr, /usage|unknown|needs a value/i, `${cmd} says what is wrong: ${r.stderr}`);
    if (!['check', 'pattern lint', 'motion capture'].includes(cmd)) assert.ok(r.stderr.includes(`usage: ${USAGE[cmd][0]}`), `${cmd} prints its usage`);
  }
});

test('the top-level help names every verb and its flags', () => {
  const help = mm(['--help']);
  assert.equal(help.status, 0);
  for (const cmd of commands) assert.ok(help.stdout.includes(USAGE[cmd][0].replace(/^mm /, '')), cmd);
});

test('pattern list is pattern-lint\'s own list', async () => {
  const { listComplete } = await import('../../scripts/pattern-lint.mjs');
  const r = mm(['pattern', 'list']);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(r.stdout.trim().split('\n'), listComplete());
  assert.deepEqual(plan(['pattern', 'list']), { list: true });
});

test('pattern lint passes the name through, qualifying a bare one', () => {
  assert.deepEqual(plan(['pattern', 'lint', 'entrances/rise', '--json']), { script: 'pattern-lint.mjs', args: ['entrances/rise', '--json'], label: 'pattern lint' });
  assert.equal(plan(['pattern', 'lint', 'rise']).args[0], 'entrances/rise');
  assert.deepEqual(plan(['pattern', 'lint']).args, []);
});

test('motion capture defaults --name to the --out basename, and keeps an explicit one', () => {
  const p = plan(['motion', 'capture', '--from', 'v.mp4', '--out', 'styles/motion/harbour.json']);
  assert.deepEqual(p.args, ['--from', 'v.mp4', '--out', 'styles/motion/harbour.json', '--name', 'harbour']);
  assert.deepEqual(plan(['motion', 'capture', '--from', 'v.mp4', '--out=a/b.json']).args.slice(-2), ['--name', 'b']);
  assert.deepEqual(plan(['motion', 'capture', '--from', 'v.mp4', '--out', 'x.json', '--name', 'mine']).args, ['--from', 'v.mp4', '--out', 'x.json', '--name', 'mine']);
});
