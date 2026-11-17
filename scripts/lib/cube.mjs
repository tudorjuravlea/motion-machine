// A `.cube` colour grade: the text 3D lookup table that grading, editing and photo tools trade (and a
// camera maker's log conversion). It is read and checked here before ffmpeg sees it, so a
// broken file is named with its line instead of failing inside a filter graph. A grade applies to the
// pictures a brand brings, footage (`mm media prep --cube`) and stills (`mm media grade`), and never to
// the stage: palette roles, type and logos keep the brand's exact colours, and a picture is declared
// media, which G-BRAND masks. ffmpeg's lut3d applies it with tetrahedral interpolation in 8-bit RGB.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

/** The smallest and the largest LUT_3D_SIZE a grade may have. */
export const CUBE_SIZE = [2, 65];
const fail = (message, exitCode = 2) => Object.assign(new Error(message), { exitCode });
const r4 = (x) => Math.round(x * 1e4) / 1e4;

/**
 * A `.cube` file's text read into { title, size, min, max, table }: `table` holds size³ rows of r, g, b,
 * red changing fastest, as the format writes them. Throws (exit 2) naming the line of the first fault: a
 * 1D table, a size outside CUBE_SIZE, a row that is not three finite numbers, a domain whose min is not
 * below its max, or a row count other than size³.
 */
export function readCube(text, name = 'grade.cube') {
  let title = null, size = null, min = [0, 0, 0], max = [1, 1, 1];
  const rows = [];
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim(), at = `${name}:${i + 1}`;
    if (!line || line.startsWith('#')) continue;
    const [key, ...rest] = line.split(/\s+/);
    if (key === 'TITLE') { title = line.slice(5).trim().replace(/^"|"$/g, ''); continue; }
    if (key === 'LUT_1D_SIZE') throw fail(`${at}: a 1D table (LUT_1D_SIZE); a grade must be a 3D .cube (LUT_3D_SIZE)`);
    if (key === 'LUT_3D_SIZE') {
      size = Number(rest[0]);
      if (!Number.isInteger(size) || size < CUBE_SIZE[0] || size > CUBE_SIZE[1]) throw fail(`${at}: LUT_3D_SIZE must be a whole number from ${CUBE_SIZE[0]} to ${CUBE_SIZE[1]}, not ${rest[0]}`);
      continue;
    }
    if (key === 'DOMAIN_MIN' || key === 'DOMAIN_MAX') {
      const v = rest.map(Number);
      if (v.length !== 3 || !v.every(Number.isFinite)) throw fail(`${at}: ${key} must be three numbers`);
      if (key === 'DOMAIN_MIN') min = v; else max = v;
      continue;
    }
    if (/^[A-Z_]+$/.test(key)) continue;   // another keyword (LUT_IN_VIDEO_RANGE and the like) that does not change the table
    const v = line.split(/\s+/).map(Number);
    if (v.length !== 3 || !v.every(Number.isFinite)) throw fail(`${at}: a table row must be three numbers, not "${line.slice(0, 60)}"`);
    if (size == null) throw fail(`${at}: a table row before LUT_3D_SIZE`);
    rows.push(v);
  }
  if (size == null) throw fail(`${name}: no LUT_3D_SIZE line; not a 3D .cube`);
  if (!min.every((m, c) => m < max[c])) throw fail(`${name}: DOMAIN_MIN must lie below DOMAIN_MAX on every channel`);
  if (rows.length !== size ** 3) throw fail(`${name}: LUT_3D_SIZE ${size} needs ${size ** 3} rows, found ${rows.length}`);
  return { title, size, min, max, table: rows };
}

/**
 * How far a grade moves colour from the identity, in 0..1 of the domain per channel: the largest move
 * of any table row and the mean move. A grade that changes nothing reads 0 and 0.
 */
export function cubeStrength({ size, min, max, table }) {
  let far = 0, sum = 0;
  table.forEach((row, i) => {
    const at = [i % size, Math.floor(i / size) % size, Math.floor(i / size ** 2)];
    let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs((row[c] - min[c]) / (max[c] - min[c]) - at[c] / (size - 1)));
    far = Math.max(far, d); sum += d;
  });
  return { max: r4(far), mean: r4(sum / table.length) };
}

/** A grade file read and checked: what a record keeps of it ({ file, sha1, size, title, strength }) and its path. */
export function loadCube(file) {
  if (!existsSync(file)) throw fail(`no such grade: ${file}`);
  if (!/\.cube$/i.test(file)) throw fail(`a grade is a .cube file, not ${basename(file)}`);
  const bytes = readFileSync(file);
  const cube = readCube(bytes.toString('utf8'), basename(file));
  return {
    path: file,
    record: { file: basename(file), sha1: createHash('sha1').update(bytes).digest('hex'), size: cube.size, ...(cube.title ? { title: cube.title } : {}), strength: cubeStrength(cube) },
  };
}

/**
 * The -vf steps that grade a picture: to RGB through the frame's own colour matrix, then the table.
 * `alpha` keeps a still's transparency (lut3d leaves alpha as it was). The grade is copied to a fresh
 * temporary folder first, so the path in the filter graph holds no character the graph would read as
 * syntax; `withGrade` calls `fn(steps)` and removes the copy afterwards.
 */
export async function withGrade(path, fn, { alpha = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mm-grade-'));
  try {
    const copy = join(dir, 'grade.cube');
    copyFileSync(path, copy);
    if (!/^[\w/.-]+$/.test(copy)) throw fail(`the temporary folder ${dir} holds characters an ffmpeg filter graph cannot carry; set TMPDIR to a plain path`, 1);
    return await fn(`scale=in_color_matrix=auto:out_range=pc,format=${alpha ? 'rgba' : 'rgb24'},lut3d=file=${copy}:interp=tetrahedral`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
