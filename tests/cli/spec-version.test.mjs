// The version the gate writes into out/check.json is the version of the grammar in SPEC.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SPEC_VERSION, writeReport } from '../../scripts/lib/report.mjs';
import { ROOT } from './cli-helpers.mjs';

test("SPEC.md's header version equals SPEC_VERSION", () => {
  const header = readFileSync(join(ROOT, 'SPEC.md'), 'utf8').split('\n', 1)[0];
  const m = /\(?(?:version|v)\s*(\d+\.\d+)\b/i.exec(header);
  assert.ok(m, `no version in the SPEC header: ${header}`);
  assert.equal(SPEC_VERSION, m[1]);
});

test('the gate summary counts rules, not gates, and a report carries the spec version', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-report-'));
  const lines = [];
  const log = console.log;
  console.log = (s) => lines.push(String(s));
  try {
    const code = writeReport(dir, [{ id: 'G-A', status: 'FAIL', evidence: {} }, { id: 'G-B', status: 'FAIL', evidence: {} }, { id: 'W-C', status: 'PASS', evidence: {} }]);
    assert.equal(code, 1);
  } finally { console.log = log; }
  assert.match(lines.join('\n'), /2 rules failed/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'out', 'check.json'), 'utf8')).spec, SPEC_VERSION);
  rmSync(dir, { recursive: true, force: true });
});
