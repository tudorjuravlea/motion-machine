#!/usr/bin/env node
// mm studio <piece> [--port N] [--open]: starts the studio server on
// 127.0.0.1 and prints the studio page's URL; serves until killed. --open hands the URL to the
// platform's opener (open on macOS, xdg-open on Linux, cmd's start on Windows); an opener that is
// missing or fails prints a note and the studio keeps serving.
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { UsageError, resolvePiece, runMain, usageText } from './lib/cli.mjs';
import { startStudio } from './studio/server.mjs';

runMain(import.meta, async () => {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { port: { type: 'string' }, open: { type: 'boolean', default: false } } });
  if (!positionals[0]) throw new UsageError(`studio: name a piece\n${usageText('studio')}`);
  if (positionals.length > 1) throw new UsageError(`studio: unexpected argument ${positionals[1]}\n${usageText('studio')}`);
  const port = values.port === undefined ? 0 : /^\d{1,5}$/.test(values.port) ? Number(values.port) : NaN;
  if (!(port >= 0 && port <= 65535)) throw new UsageError(`studio: --port takes a port number (0 to 65535, digits only)\n${usageText('studio')}`);
  let s;
  try { s = await startStudio({ piece: resolvePiece(positionals[0]), port }); } catch (e) {
    // one line an agent can act on, then exit 2
    if (e?.code === 'EADDRINUSE') throw new UsageError(`studio: port ${port} is in use (another studio? leave out --port to take a free one)`);
    if (e?.code === 'EACCES') throw new UsageError(`studio: port ${port} is not allowed (ports below 1024 need privileges; leave out --port to take a free one)`);
    if (e?.code === 'EPIECE') throw new UsageError(`studio: ${e.message}`);
    throw e;
  }
  const url = `${s.url}/scripts/studio/ui/index.html?piece=${encodeURIComponent(s.piece)}`;
  console.log(`studio ${url}\n  Ctrl-C to stop`);
  if (values.open) openUrl(url);
  await new Promise(() => {});   // runs until interrupted
});

/** Opens `url` in the default browser; never throws, never stops the studio. */
function openUrl(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : ['xdg-open', [url]];
  const note = (why) => console.log(`  could not open a browser (${cmd}: ${why}); open the URL above`);
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', (e) => note(e.code ?? e.message));
    child.on('exit', (code) => { if (code) note(`exit ${code}`); });
    child.unref();
  } catch (e) { note(e.code ?? e.message); }
}
