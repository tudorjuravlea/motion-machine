// The one static-file handler of every local server (`mm serve`, the gate, the exporter, the
// capture verbs, the studio): files from a root folder by GET and HEAD, on loopback only. It
// answers 403 to a Host that is not this server's own (DNS rebinding), to a path that leaves the
// root, and to `.git` in any case, before or after symlinks; 400 to a path that is not valid
// percent-encoding; 404 to a missing file. A file error is an error response, never a crash.
// Every response forbids framing by another origin and content sniffing, and Range requests are
// honoured so a <video> can seek.
import { accessSync, constants, createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

const TYPES = [
  ['text/html; charset=utf-8', '.html'],
  ['text/javascript', '.js', '.mjs'],
  ['text/css', '.css'],
  ['application/json', '.json'],
  ['text/plain; charset=utf-8', '.txt', '.md'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/jpeg', '.jpg', '.jpeg'],
  ['image/svg+xml', '.svg'],
  ['font/woff2', '.woff2'],
  ['font/woff', '.woff'],
  ['font/ttf', '.ttf'],
  ['audio/wav', '.wav'],
  ['audio/mpeg', '.mp3'],
  ['video/mp4', '.mp4'],
];
/** Content type by lower-case extension. */
export const MIME = Object.fromEntries(TYPES.flatMap(([type, ...exts]) => exts.map((ext) => [ext, type])));

/** Whether `file` is `dir` or inside it. */
export const isWithin = (file, dir) => file === dir || file.startsWith(dir + sep);

/** The Host header values a loopback server on `port` answers to. */
export const loopbackHosts = (port) => new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);

/** Whether the request's Host header is one of `hosts` (a Set of lower-case `host:port`). */
export const hostAllowed = (req, hosts) => hosts.has(String(req.headers.host ?? '').toLowerCase());

/**
 * `{ start, end }` of an HTTP Range header over `size` bytes; null when absent, not one bytes range, or
 * ending before it starts (the whole file is sent); 'unsatisfiable' when it starts past the end.
 */
export function byteRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start, end;
  if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }   // the last N bytes
  else if (m[2] !== '' && Number(m[2]) < Number(m[1])) return null;   // invalid, so ignored (RFC 9110 §14.1.1)
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}

/** The headers of every file response. */
const FILE_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'content-security-policy': "frame-ancestors 'self'",
  'accept-ranges': 'bytes',
};

/**
 * Whether a path segment names the `.git` folder: in any case, and in the spellings Windows resolves to
 * it (trailing dots or spaces, an NTFS stream such as `.git::$INDEX_ALLOCATION`, the short name `GIT~1`).
 */
export const isGitSegment = (seg) => /^\.git[.\s]*$/i.test(seg) || /^\.git:/i.test(seg) || /^git~\d+$/i.test(seg);

const inGit = (file, root) => relative(root, file).split(sep).some(isGitSegment);

/** A function `(req, res, rawPath)` that answers one request with a file of `root` (the Host check is the caller's). */
export function staticFiles(root) {
  const base = resolve(root);
  const realBase = realpathSync.native(base);
  return function serve(req, res, rawPath) {
    const reply = (status, headers) => { if (!res.headersSent) res.writeHead(status, headers); res.end(); };
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return reply(405, { allow: 'GET, HEAD' });
      let p;
      try { p = decodeURIComponent(rawPath); } catch { return reply(400); }
      if (p.includes('\0')) return reply(400);
      const abs = resolve(base, `.${p}`);
      if (!isWithin(abs, base) || inGit(abs, base)) return reply(403);
      // where the path itself leads, before a folder is read as its index.html: a link to .git is refused as the folder it is
      if (existsSync(abs)) {
        const there = realpathSync.native(abs);
        if (!isWithin(there, realBase) || inGit(there, realBase)) return reply(403);
      }
      const target = existsSync(abs) && statSync(abs).isDirectory() ? join(abs, 'index.html') : abs;
      if (!existsSync(target) || statSync(target).isDirectory()) return reply(404);
      const real = realpathSync.native(target);   // the long, canonical spelling of the path
      if (!isWithin(real, realBase) || inGit(real, realBase)) return reply(403);   // a link that leaves the root or enters .git
      try { accessSync(target, constants.R_OK); } catch { return reply(403); }
      const size = statSync(target).size;
      const head = { ...FILE_HEADERS, 'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream' };
      const range = byteRange(req.headers.range, size);
      if (range === 'unsatisfiable') return reply(416, { ...head, 'content-range': `bytes */${size}` });
      if (range) res.writeHead(206, { ...head, 'content-range': `bytes ${range.start}-${range.end}/${size}`, 'content-length': range.end - range.start + 1 });
      else res.writeHead(200, { ...head, 'content-length': size });
      if (req.method === 'HEAD') return res.end();
      createReadStream(target, range ?? {}).on('error', () => res.destroy()).pipe(res);
    } catch {
      reply(500);
    }
  };
}
