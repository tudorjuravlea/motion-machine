// node pieces/catalogue/join.mjs
// Joins each family's exported parts (pieces/catalogue-<family>-<n>/out/*-16x9.mp4, each a gated film
// of at most 60 s) into one longer cut per family in pieces/catalogue/out/<family>.mp4. The parts
// share size, rate and codec, so the join copies the streams. Run after mm export (and mm sound).
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PIECES = join(HERE, '..');
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });

const families = new Map();
for (const d of readdirSync(PIECES).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
  const m = d.match(/^catalogue-(.+)-(\d+)$/);
  if (!m) continue;
  const mp4 = join(PIECES, d, 'out', `${d}-16x9.mp4`);
  if (!existsSync(mp4)) { console.log(`missing ${mp4}: run mm export ${d} first`); continue; }
  families.set(m[1], [...(families.get(m[1]) ?? []), mp4]);
}
for (const [fam, parts] of families) {
  const list = join(OUT, `${fam}.txt`);
  writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const out = join(OUT, `${fam}.mp4`);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out], { encoding: 'utf8' });
  console.log(r.status === 0 ? `${fam}: ${parts.length} part${parts.length > 1 ? 's' : ''} -> ${out}` : `${fam}: ${r.stderr}`);
}
