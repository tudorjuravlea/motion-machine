// The gate: a pill with the live counts (the timing rules, run on every preview),
// the live rows that do not pass, and "Run gate", the full `mm check` for this format through POST
// /api/check. A row seeks to its instant, or, without one, to where its mark sits on the timeline (the
// scene end or the beat landing its selector names), and outlines its selector on the stage.
import { postCheck } from './api.js';
import { countsOf } from './engine.js';
import { h } from './dom.js';

export function createGate({ pill, panel, onGo, getFormat }) {
  const live = panel.querySelector('.gate-live');
  const full = panel.querySelector('.gate-full');
  const run = document.querySelector('[data-run-gate]');
  let fullRows = null, running = false;

  function rowEl(r, { tag } = {}) {
    const ev = r.evidence ?? {};
    const st = String(r.status).toLowerCase();
    const where = typeof ev.instant === 'number' ? `${ev.instant} s` : '';
    const b = h('button', `gate-row ${st}`, { type: 'button', 'data-rule': r.id, disabled: typeof ev.instant !== 'number' && !ev.selector ? true : null });
    b.append(h('span', `dot ${st}`, { 'aria-hidden': 'true' }), h('span', 'rule-id', {}, r.id), h('span', 'rule-why', {}, ev.reason ?? (r.status === 'PASS' ? 'passes' : r.status.toLowerCase())), h('span', 'rule-at', {}, where || tag || ''));
    b.addEventListener('click', () => onGo({ instant: ev.instant, selector: ev.selector ?? null, id: r.id }));
    return b;
  }

  function setLive(rows) {
    const { fail, warn } = countsOf(rows);
    pill.dataset.state = fail ? 'fail' : warn ? 'warn' : 'pass';
    pill.querySelector('.pill-text').textContent = `${fail} fail · ${warn} warn`;
    pill.setAttribute('aria-label', `Live timing gate: ${fail} failing, ${warn} warning. Show the gate`);
    const bad = rows.filter((r) => r.status === 'FAIL' || r.status === 'WARN');
    live.replaceChildren(...(bad.length ? bad.map((r) => rowEl(r)) : [h('p', 'muted', {}, `The ${rows.filter((r) => r.status === 'PASS').length} timing rules that apply pass.`)]));
  }

  async function runFull() {
    if (running) return;
    running = true;
    run.disabled = true;
    run.textContent = 'Running…';
    full.replaceChildren(h('p', 'muted', {}, 'Running mm check in a browser; this takes a few seconds.'));
    try {
      const r = await postCheck(getFormat()).catch(() => ({ status: 0, body: { reason: 'the studio server is not answering' } }));
      fullRows = r.body?.rules ?? null;
      const head = h('p', 'gate-full-head', {}, r.status !== 200 ? `The gate did not run: ${r.body?.reason ?? r.status}` : `Full gate, ${getFormat()}: exit ${r.body.exit}`);
      const order = { FAIL: 0, WARN: 1, SKIP: 2, PASS: 3 };
      const rows = (fullRows ?? []).slice().sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));
      full.replaceChildren(head, ...rows.map((x) => rowEl(x)));
    } finally {
      running = false;
      run.disabled = false;
      run.textContent = 'Run gate';
    }
  }

  run.addEventListener('click', runFull);
  return { setLive, runFull, get full() { return fullRows; } };
}
