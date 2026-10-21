// mm serve [piece] [--port N] [--format F] [--t 12.5] [--press 4]: local preview with a play clock,
// keyboard and ?t= / ?press= (SPEC §2.9, §8). The clock lives in scripts/lib/serve-page.html, the
// wrapper page this serves from the repo root; the piece itself stays a pure function of t.
import { relative, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, VIEWPORTS, serveRoot } from './lib/browser.mjs';
import { UsageError, portOf, resolvePiece, runMain } from './lib/cli.mjs';

export async function startServe(dir, { port = 0, format, t, press } = {}) {
  const rel = relative(ROOT, dir).split(sep).join('/');
  if (rel.startsWith('..')) throw new UsageError(`a piece must live under the repo root to be served: ${dir}`);
  if (format && !VIEWPORTS[format]) throw new UsageError(`unknown format ${format} (${Object.keys(VIEWPORTS).join(', ')})`);
  const server = await serveRoot(ROOT, { port });
  const q = new URLSearchParams({ piece: rel });
  if (format) q.set('format', format);
  if (t != null) q.set('t', String(t));
  if (press != null) q.set('press', String(press));
  return { ...server, preview: `${server.url}/scripts/lib/serve-page.html?${q}` };
}

runMain(import.meta, async () => {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { port: { type: 'string' }, format: { type: 'string' }, t: { type: 'string' }, press: { type: 'string' } } });
  const s = await startServe(resolvePiece(positionals[0]), { port: portOf(values.port), format: values.format, t: values.t, press: values.press });
  console.log(`serving ${s.preview}\n  Ctrl-C to stop`);
  await new Promise(() => {});   // runs until interrupted
});
