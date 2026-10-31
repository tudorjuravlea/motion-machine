// W-ASSET-LICENSE (SPEC §7, §8): an asset the piece uses that MM did not draw (a still, a recording, a captured
// page, imported or generated media, a sample) has no licence record, an unreadable one, or a licence outside
// the allowlist (own, generated, CC0, CC-BY, public domain). The record is assets/<name>.licence.json, written
// by `mm gen` and `mm capture site`; the story's `licences.accepted` lists what the person accepted anyway.
// Data files (words, beats) and assets that are not on disk are not this rule's business.
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { auditAssets, assetsIn } from '../lib/licence.mjs';
import { rule } from '../lib/rule.mjs';

// the story as written, so an asset only one format's variant uses is read too
function writtenStory(ctx) {
  try { return JSON.parse(readFileSync(join(ctx.dir, 'story.json'), 'utf8')); } catch { return ctx.story; }
}

export default async function (ctx) {
  const story = writtenStory(ctx);
  const found = auditAssets({ dir: ctx.dir, story });
  if (!found.length) return rule('W-ASSET-LICENSE', 'PASS', { measured: [], threshold: assetsIn(story).length });
  const piece = relative(ctx.root, ctx.dir) || '.';
  return rule('W-ASSET-LICENSE', 'WARN', {
    measured: found.map((f) => f.asset), threshold: [],
    reason: `${found.map((f) => `${f.asset}: ${f.detail}`).join('; ')}. Record where it came from and under what licence (mm credits ${piece} lists the credits owed), or accept it in the story's licences.accepted`,
  });
}
