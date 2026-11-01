// A piece's schedule in Node, the way the gate reads it (scripts/check.mjs): the story resolved for a
// format, the patterns' timings read from their modules, no browser. Used by `mm share` for chapters
// and captions; the numbers are the gate's, which `mm check` proves equal to the kit's.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPatterns } from '../check.mjs';
import { addImplicitPlays, forFormat, resolveStory, schedule as buildSchedule } from '../../runtime/kit/schedule.js';
import { UsageError } from './cli.mjs';
import { patternsBaseOf } from './patterns-base.mjs';

/** { story (resolved), rawStory, style, schedule, format } for the piece in `dir` at `format` (the story's first by default). */
export async function pieceSchedule(dir, format = null) {
  const read = (f) => {
    try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch (e) { throw new UsageError(`${f}: ${e.message}`); }
  };
  const written = read('story.json'), style = read('style.json');
  format ??= written.formats[0];
  if (!written.formats.includes(format)) throw new UsageError(`this story ships ${written.formats.join(', ')}, not ${format}`);
  const rawStory = forFormat(written, format);
  const story = resolveStory(rawStory, style);
  addImplicitPlays(story, (asset) => { try { return JSON.parse(readFileSync(join(dir, asset, 'media.json'), 'utf8')); } catch { return null; } });
  const patterns = await loadPatterns(story, patternsBaseOf(dir));
  let schedule;
  try { schedule = buildSchedule(story, style, { patterns }); } catch (e) { throw new UsageError(`schedule: ${e.message}`); }
  return { story, rawStory, style, schedule, format, written };
}
