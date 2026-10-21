// The gate's positives: the base film and deck pass every rule; kit-smoke's known conflicts with
// the §12 thresholds are pinned so they are fixed, not forgotten; usage errors exit 2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';
import { IDS } from '../../scripts/check.mjs';
import { gate } from './_harness.mjs';

const run = gate();
const findings = (res) => res.rules.filter((r) => r.status === 'FAIL' || r.status === 'WARN').map((r) => `${r.id} ${r.status}: ${r.evidence.reason ?? ''}`);
const SOUND = new Set(['G-LOUD', 'W-CUE', 'W-MIX']);

for (const kind of ['film', 'deck']) {
  test(`_base/${kind}: every rule PASS or SKIP with a reason, exit 0`, async () => {
    const res = await run(`_base/${kind}`);
    assert.deepEqual(findings(res), []);
    assert.equal(res.code, 0);
    assert.deepEqual(res.rules.map((r) => r.id), IDS, 'one row per SPEC §7 id, in order');
    for (const r of res.rules) if (r.status === 'SKIP') assert.ok(r.evidence.reason, `${r.id} SKIP needs a reason`);
    const ran = res.rules.filter((r) => r.status === 'PASS').map((r) => r.id);
    assert.ok(ran.length >= (kind === 'film' ? 22 : 15), `only ${ran.length} rules ran`);
    for (const r of res.rules) if (!SOUND.has(r.id) && r.status === 'SKIP') assert.doesNotMatch(r.evidence.reason, /no rule file/, `${r.id} has no rule file`);
  });
}

// The kit-smoke fixtures are kit fixtures, not productions: the film is 6 s and the deck
// 3 presses (under G-LENGTH), and the deck's last press brings two elements (G-QUIET). Everything
// else passes (G-LEGIBLE since scale.body is 0.27). Empty these when kit-smoke is
// brought inside the thresholds.
const KIT_SMOKE = { film: ['G-LENGTH'], deck: ['G-QUIET', 'G-LENGTH'] };
// G-HOOK also fails there until the kit lane gives kit-smoke's first headline
// `params.instant` (film) or `step: 0` (deck); the pin follows the fixture.
const hooked = (kind) => {
  const story = JSON.parse(readFileSync(join(ROOT, 'fixtures/kit-smoke', kind, 'story.json'), 'utf8'));
  const b = story.scenes[0].beats.find((x) => x.slot === 'headline') ?? story.scenes[0].beats[0];
  return kind === 'deck' ? b.step === 0 : b.params?.instant === true;
};

for (const kind of ['film', 'deck']) {
  test(`kit-smoke ${kind}: no G- failure beyond the pinned threshold conflicts`, async () => {
    const res = await run(join(ROOT, 'fixtures/kit-smoke', kind));
    const fails = res.rules.filter((r) => r.status === 'FAIL').map((r) => r.id);
    const expected = hooked(kind) ? KIT_SMOKE[kind] : [...KIT_SMOKE[kind], 'G-HOOK'];
    assert.deepEqual([...fails].sort(), [...expected].sort(), findings(res).join('\n'));
    for (const r of res.rules) if (r.status === 'SKIP') assert.ok(r.evidence.reason);
  });
}

test('usage and setup errors exit 2', () => {
  const cli = (...args) => spawnSync(process.execPath, [join(ROOT, 'scripts/check.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(cli().status, 2);
  assert.equal(cli('fixtures/negatives').status, 2, 'a folder with no story.json');
  assert.equal(cli('fixtures/negatives/_base/film', '--bogus').status, 2);
});

test('_base/ground: the base film over a brand ground passes every rule, exit 0', async () => {
  const res = await run('_base/ground');
  assert.deepEqual(findings(res), []);
  assert.equal(res.code, 0);
  assert.equal(res.rules.find((r) => r.id === 'G-LITERAL').status, 'PASS', 'the ground colours and their blends are the palette');
});

test('_base/finish: the base film with every finish layer passes every rule, exit 0', async () => {
  const res = await run('_base/finish');
  assert.deepEqual(findings(res), []);
  assert.equal(res.code, 0);
  assert.equal(res.rules.find((r) => r.id === 'G-LITERAL').status, 'PASS', 'the finish draws only palette roles and their blends');
});

test('_base/variants: a scene drawn differently in 9x16 passes every rule in both formats, exit 0', async () => {
  const res = await run('_base/variants');
  assert.deepEqual(findings(res), []);
  assert.equal(res.code, 0);
});
