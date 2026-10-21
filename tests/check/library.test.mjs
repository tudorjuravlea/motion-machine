// W-PATTERN-CARD and W-PROVENANCE (SPEC §5, §7): a piece that carries its own patterns, with a card that
// is incomplete or sources that PROVENANCE.md does not know, is warned and never blocked. The library
// the engine publishes is held to the same text strictly by `mm pattern lint` (tests/pattern-lint.test.mjs)
// and by release-check's R-PATTERNS (tests/cli/release-check.test.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ROOT, launchBrowser, serveRoot } from '../../scripts/lib/browser.mjs';
import { runCheck } from '../../scripts/check.mjs';
import { lintRoot } from '../../scripts/pattern-lint.mjs';
import { workCopy } from '../cli/cli-helpers.mjs';

let browser, server, w;
before(async () => { browser = await launchBrowser(); server = await serveRoot(ROOT); w = workCopy('library-warn'); });
after(async () => { await browser?.close(); await server?.close(); w?.cleanup(); });

test('a piece whose own patterns have no card warns W-PATTERN-CARD and W-PROVENANCE; neither fails, and the exit code is the other rules\'', async () => {
  const res = await runCheck(w.film, { format: '16x9', browser, server });
  for (const id of ['W-PATTERN-CARD', 'W-PROVENANCE']) {
    const r = res.rules.find((x) => x.id === id);
    assert.equal(r.status, 'WARN', `${id}: ${JSON.stringify(r.evidence)}`);
    assert.match(r.evidence.reason, /missing PATTERN\.md|no card/);
  }
  const fails = res.rules.filter((r) => r.status === 'FAIL').map((r) => r.id);
  assert.deepEqual(fails, ['G-LOCAL'], 'only the copy\'s font, which sits outside the piece, fails');
});

test('the same patterns fail `mm pattern lint`: the library stays complete', () => {
  const res = lintRoot(w.patterns);
  const failed = new Set(res.patterns.flatMap((p) => p.rules.filter((r) => r.status === 'FAIL').map((r) => r.id)));
  assert.ok(failed.has('W-PATTERN-CARD') && failed.has('W-PROVENANCE'), [...failed].join(', '));
  assert.deepEqual(res.complete, []);
});
