// Shared by tests/check/*.test.mjs: one browser and one server per test file, a negative runner,
// and the cross-contamination assertion (a negative fails with exactly its id).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, launchBrowser, serveRoot } from '../../scripts/lib/browser.mjs';
import { runCheck } from '../../scripts/check.mjs';

export const NEG = join(ROOT, 'fixtures', 'negatives');

/** Registers before/after hooks; returns run(dir, opts) → runCheck result on fixtures/negatives/<dir>. */
export function gate() {
  let browser, server;
  before(async () => { browser = await launchBrowser(); server = await serveRoot(ROOT); });
  after(async () => { await browser?.close(); await server?.close(); });
  return (dir, opts = {}) => runCheck(dir.startsWith('/') ? dir : join(NEG, dir), { browser, server, ...opts });
}

const show = (rows) => rows.map((r) => `${r.id} ${r.status}: ${r.evidence.reason ?? ''}`).join('\n  ');
export const row = (res, id) => res.rules.find((r) => r.id === id);

/**
 * A G- negative: its id FAILs, no other G- rule fails and no W- rule warns. `inherent` names
 * W- ids that are the same defect seen by a warning (a scene still arriving at its end has no hold,
 * so G-REST's negative also warns W-HOLD); nothing else may appear. Returns the row.
 */
export function failsOnly(res, id, { inherent = [] } = {}) {
  const r = row(res, id);
  assert.equal(r?.status, 'FAIL', `${id} should FAIL; got ${r?.status}: ${r?.evidence?.reason ?? ''}`);
  const others = res.rules.filter((x) => x.id !== id && !(x.status === 'WARN' && inherent.includes(x.id)) && (x.status === 'FAIL' || x.status === 'WARN'));
  assert.deepEqual(others, [], `cross-contamination: other findings\n  ${show(others)}`);
  assert.equal(res.code, 1);
  return r;
}

/** A W- negative: its id WARNs and nothing else fails or warns. Returns the row. */
export function warnsOnly(res, id) {
  const r = row(res, id);
  assert.equal(r?.status, 'WARN', `${id} should WARN; got ${r?.status}: ${r?.evidence?.reason ?? ''}`);
  const others = res.rules.filter((x) => x.id !== id && (x.status === 'FAIL' || x.status === 'WARN'));
  assert.deepEqual(others, [], `cross-contamination: other findings\n  ${show(others)}`);
  assert.equal(res.code, 0);
  return r;
}
