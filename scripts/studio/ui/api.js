// The studio server's HTTP API, exactly as scripts/studio/server.mjs serves it. Every call
// returns { status, body } and never throws on an HTTP error; the caller decides what a 409 or 422
// means. A call throws only when the server cannot be reached (the page then shows it disconnected).

async function call(method, path, body) {
  const init = { method, cache: 'no-store', headers: {} };
  if (body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
  const r = await fetch(path, init);
  let json = null;
  try { json = await r.json(); } catch { /* an empty or non-JSON answer */ }
  return { status: r.status, body: json };
}

export const getPiece = () => call('GET', '/api/piece');
export const postEdit = ({ version, edits, label }) => call('POST', '/api/edit', { version, edits, ...(label ? { label: label.slice(0, 200) } : {}) });
/** Undo by receipt: refused with 409 `changed` once the file is not that receipt's result. */
export const postUndo = (receipt) => call('POST', '/api/undo', { receipt });
export const putSelection = ({ path, t, format }) => call('PUT', '/api/selection', { path, t, format });
export const postCheck = (format) => call('POST', '/api/check', { format });
/** Export (gate, render, sound): 202 when started; progress arrives as `export` events (listen's onExport). */
export const postExport = ({ formats, force, sound }) => call('POST', '/api/export', { formats, force: Boolean(force), sound: Boolean(sound) });
export const getExport = () => call('GET', '/api/export');
export const cancelExport = () => call('POST', '/api/export/cancel', {});

/** The piece's journal receipts (the server reads out/studio/journal.jsonl); [] when there is none. */
export async function getJournal() {
  try {
    const { status, body } = await call('GET', '/api/journal');
    return status === 200 && Array.isArray(body?.receipts) ? body.receipts.filter((x) => x && typeof x.id === 'string') : [];
  } catch { return []; }
}

/**
 * SSE: onChanged({ version, by, file, receipt? }) for every `changed`, onExport(event) for every `export`, onHello({ version }) on every
 * (re)connect, onDown(reason|null) when the stream drops: null while the browser reconnects by itself,
 * else the server's reason for refusing it (it is then retried every 5 s). Returns a closer.
 */
export function listen({ onChanged, onHello, onDown, onExport }) {
  let es = null, retry = 0, closed = false;
  const open = () => {
    es = new EventSource('/api/events');
    es.addEventListener('changed', (e) => { try { onChanged(JSON.parse(e.data)); } catch { /* a malformed frame */ } });
    es.addEventListener('export', (e) => { try { onExport?.(JSON.parse(e.data)); } catch { /* a malformed frame */ } });
    es.addEventListener('hello', (e) => { try { onHello(JSON.parse(e.data)); } catch { /* a malformed frame */ } });
    es.onerror = async () => {
      if (closed) return;
      if (es.readyState !== EventSource.CLOSED) { onDown(null); return; }
      // refused outright (no reconnect): ask why, then try again in a while
      let reason = 'the server refused the live connection';
      try {
        const ctl = new AbortController();
        const r = await fetch('/api/events', { cache: 'no-store', signal: ctl.signal });
        if (r.status !== 200) reason = (await r.json().catch(() => null))?.reason ?? `status ${r.status}`;
        ctl.abort();
      } catch { reason = null; }   // unreachable: the caller's probe says so
      onDown(reason ?? null);
      clearTimeout(retry);
      retry = setTimeout(() => { if (!closed) open(); }, 5000);
    };
  };
  open();
  return () => { closed = true; clearTimeout(retry); es?.close(); };
}
