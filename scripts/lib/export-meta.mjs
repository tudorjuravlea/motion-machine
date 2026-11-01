// The tags a finished file carries (SPEC §8): a title, a description (the piece, the Motion Machine version, and the
// provenance of any generated media the piece holds) and, when the story dates itself, a creation time. All of it
// comes from the story and the piece's records, never from the clock, so two exports of one piece are the same
// bytes. Library only; Node.
//
//   provenanceOf(dir)        "provider/model (kind); …" from assets/gen/*.gen.json, sorted and de-duplicated ('' for none)
//   exportMeta(dir, story)   { title, description, createdAt? } for ffmpeg's -metadata (scripts/lib/ffmpeg.mjs metaArgs)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

/** The generated media in a piece's assets/gen/ as "provider/model (kind)", sorted; an unreadable record is skipped. */
export function provenanceOf(dir) {
  const gen = join(dir, 'assets', 'gen');
  if (!existsSync(gen)) return '';
  const seen = new Set();
  for (const name of readdirSync(gen).filter((f) => f.endsWith('.gen.json'))) {
    let rec;
    try { rec = JSON.parse(readFileSync(join(gen, name), 'utf8')); } catch { continue; }
    if (rec?.provider) seen.add(`${rec.provider}${rec.model ? `/${rec.model}` : ''}${rec.kind ? ` (${rec.kind})` : ''}`);
  }
  return [...seen].sort().join('; ');
}

/** { title, description, createdAt } for a story: `createdAt` only when the story carries a `date` (YYYY-MM-DD). */
export function exportMeta(dir, story) {
  const generated = provenanceOf(dir);
  return {
    title: story.title,
    description: `Motion Machine ${VERSION}; piece ${story.id}${generated ? `; generated: ${generated}` : ''}`,
    ...(story.date ? { createdAt: `${story.date}T00:00:00Z` } : {}),
  };
}
