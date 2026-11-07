#!/usr/bin/env node
// mm credits <piece> [--json]   (SPEC §8)
// The credits the asset licence ledger asks the piece to carry (CC-BY assets, any record with a `credit` line, and
// every sound found on Openverse, with Openverse's own attribution line), for an end card or a credits scene. Reads
// story.json, style.json (the sounds it maps), assets/<name>.licence.json and assets/sounds/<name>.json; writes nothing.
// The words in a record came from outside, so the plain output fences them as material (scripts/lib/fence.mjs);
// --json prints plain data. Assets the story uses that have no record are named on stderr.
// Exit 0, 2 usage or no piece.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { UsageError, isArgsError, resolvePiece, usageText } from './lib/cli.mjs';
import { fenceLine } from './lib/fence.mjs';
import { auditAssets, creditsFor } from './lib/licence.mjs';

export async function main(argv, io = {}) {
  const out = io.out ?? console.log, err = io.err ?? console.error;
  try {
    const { values: v, positionals: p } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: { json: { type: 'boolean' } } });
    if (p.length !== 1) throw new UsageError('mm credits takes one piece folder');
    const dir = resolvePiece(p[0]);
    let story;
    try { story = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8')); } catch (e) { throw new UsageError(`story.json: ${e.message}`); }
    let style = null;
    try { style = JSON.parse(readFileSync(join(dir, 'style.json'), 'utf8')); } catch { /* no style, or one that is not JSON: the story's sounds are still listed */ }
    const credits = creditsFor({ dir, story, style });
    const unrecorded = auditAssets({ dir, story }).filter((f) => f.problem === 'missing').map((f) => f.asset);
    if (v.json) out(JSON.stringify({ credits, unrecorded }));
    else {
      if (!credits.length) out('no credits are owed: no used asset carries a CC-BY licence or a credit line');
      for (const c of credits) out(`${c.asset}  ${fenceLine(c.text, 'credit')}`);
    }
    for (const a of unrecorded) err(`${a} has no licence record: its credit, if any, is unknown (W-ASSET-LICENSE)`);
    return 0;
  } catch (e) {
    if (isArgsError(e)) { (io.err ?? console.error)(`${e.message}\n${usageText('credits')}`); return 2; }
    (io.err ?? console.error)(e instanceof UsageError ? `mm credits: ${e.message}\n${usageText('credits')}` : e.message);
    return e.exitCode ?? 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
