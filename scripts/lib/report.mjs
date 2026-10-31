// The gate's report shape (SPEC §7): one row per rule, a JSON file, a console summary, an exit code.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export { rule } from './rule.mjs';

export const SPEC_VERSION = '0.11';

/**
 * Writes <dir>/out/check.json whole (a temporary file renamed over it), prints a summary, returns the
 * exit code (0 pass, 1 any FAIL). `version` (the story version checked), `journal` (the head of the story edit journal it saw), `formats` (the formats
 * checked) and `complete` (false when the run could not judge every rule: exit 2) are what `mm export`
 * holds the report to. `tuned` names the warning rules the style's gate block tuned: it is written to the
 * report and printed after the summary, so the people who read the warnings see which thresholds moved.
 */
export function writeReport(dir, rules, { quiet = false, version, journal = null, formats, complete, tuned = [] } = {}) {
  const out = join(dir, 'out');
  mkdirSync(out, { recursive: true });
  const report = { spec: SPEC_VERSION, when: new Date().toISOString(), piece: dir, version, journal, formats, complete, ...(tuned.length ? { tuned } : {}), rules };
  const tmp = join(out, `check.json.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(report, null, 2) + '\n');
  renameSync(tmp, join(out, 'check.json'));
  const count = (s) => rules.filter((r) => r.status === s).length;
  if (!quiet) {
    for (const r of rules) {
      const ev = r.evidence && Object.keys(r.evidence).length ? '  ' + summarise(r.evidence) : '';
      console.log(`${r.status.padEnd(4)}  ${r.id}${ev}`);
    }
    console.log(`\n${count('FAIL') ? `${count('FAIL')} rule${count('FAIL') > 1 ? 's' : ''} failed` : 'All rules passed'}; ${count('WARN')} warning${count('WARN') === 1 ? '' : 's'}, ${count('SKIP')} skipped. Report: ${join(out, 'check.json')}`);
    if (tuned.length) console.log(`Tuned by the style's gate block: ${tuned.join(', ')}.`);
  }
  return count('FAIL') ? 1 : 0;
}

function summarise(ev) {
  const parts = [];
  for (const k of ['reason', 'selector', 'instant', 'press', 'measured', 'threshold', 'frame', 'file', 'line', 'message']) {
    if (ev[k] !== undefined) parts.push(`${k}=${typeof ev[k] === 'number' ? +ev[k].toFixed(3) : ev[k]}`);
  }
  return parts.join(' ');
}
