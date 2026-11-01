// Path safety for the verbs that copy files into a folder meant to be published (mm share). A path
// named by a story, a manifest or a flag is read or written only inside the folder it is named
// against, and never through a symbolic link: a link in a piece must not carry a file from
// elsewhere into a shared folder. Own code; the idea (a contained read, a contained write that does
// not follow a link, and a flag parser that refuses a value that starts like a flag) is the
// presenter's (NOTICE).
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { UsageError } from './cli.mjs';

const linkError = (rel) => new UsageError(`${rel}: a symbolic link is not followed`);

/** The absolute path of `rel` under `root`; refuses an absolute path, a NUL byte, an empty name and any path that climbs out of `root`. */
export function insideDir(root, rel) {
  const name = String(rel ?? '');
  if (!name) throw new UsageError('an empty path name');
  if (name.includes('\0')) throw new UsageError('a path name with a NUL byte');
  if (isAbsolute(name)) throw new UsageError(`${name}: an absolute path is outside the folder`);
  const base = resolve(root), abs = resolve(base, name);
  const r = relative(base, abs);
  if (r === '') throw new UsageError(`${name}: names the folder itself`);
  if (r === '..' || r.startsWith(`..${sep}`) || isAbsolute(r)) throw new UsageError(`${name}: outside the folder`);
  return abs;
}

/** Throws when any part of `abs` below `root` (the last part included, when it exists) is a symbolic link. */
function assertNoLinks(root, abs, rel) {
  const base = resolve(root);
  let cur = base;
  for (const part of relative(base, abs).split(sep)) {
    cur = join(cur, part);
    let st;
    try { st = lstatSync(cur); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
    if (st.isSymbolicLink()) throw linkError(rel);
  }
}

/** The bytes of a regular file under `root`; refuses a link in the path, a dangling link and anything that is not a regular file. */
export function readInside(root, rel) {
  const abs = insideDir(root, rel);
  assertNoLinks(root, abs, rel);
  const fd = openSync(abs, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!fstatSync(fd).isFile()) throw new UsageError(`${rel}: not a regular file`);
    return readFileSync(fd);
  } finally { closeSync(fd); }
}

/** Writes `data` to `rel` under `root`, making the folders it needs; refuses to go through a link, and does not follow one at the file itself. */
export function writeInside(root, rel, data) {
  const abs = insideDir(root, rel);
  mkdirSync(resolve(root), { recursive: true });
  assertNoLinks(root, dirname(abs), rel);
  mkdirSync(dirname(abs), { recursive: true });
  assertNoLinks(root, abs, rel);
  const fd = openSync(abs, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0), 0o644);
  try {
    const bytes = typeof data === 'string' ? Buffer.from(data) : data;
    let off = 0;
    while (off < bytes.length) off += writeSync(fd, bytes, off);
  } finally { closeSync(fd); }
  return abs;
}

/** Copies one regular file from `fromRoot/fromRel` to `toRoot/toRel`, both contained. */
export function copyInside(fromRoot, fromRel, toRoot, toRel = fromRel) {
  return writeInside(toRoot, toRel, readInside(fromRoot, fromRel));
}

/**
 * The regular files under `root`, as sorted relative paths with `/` separators, and the links it did not enter (files, folders or
 * dangling). `skip(rel)` leaves a path out (and everything under it).
 */
export function listInside(root, { skip = () => false } = {}) {
  const base = realpathSync(resolve(root)), files = [], links = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name), rel = relative(base, abs).split(sep).join('/');
      if (skip(rel)) continue;
      if (e.isSymbolicLink()) links.push(rel);
      else if (e.isDirectory()) walk(abs);
      else if (e.isFile()) files.push(rel);
    }
  };
  walk(base);
  return { files: files.sort(), links: links.sort() };
}
