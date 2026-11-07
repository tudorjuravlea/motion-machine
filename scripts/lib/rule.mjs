// One gate row (SPEC §7). Pure, so the schedule-only rules load in a browser (the studio);
// scripts/lib/report.mjs re-exports it for every other importer.

/** @param {string} id  @param {'PASS'|'FAIL'|'WARN'|'SKIP'} status  @param {object} [evidence] */
export function rule(id, status, evidence = {}) {
  if (!['PASS', 'FAIL', 'WARN', 'SKIP'].includes(status)) throw new Error(`bad status ${status} for ${id}`);
  if (status === 'SKIP' && !evidence.reason) throw new Error(`${id}: a SKIP needs a reason (AXIOM 8)`);
  return { id, status, evidence };
}
