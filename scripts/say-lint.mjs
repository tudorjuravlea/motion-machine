#!/usr/bin/env node
// mm say-lint [piece] [--text "…" | --script <file>] [--scene <id>] [--json]   (SPEC §8)
// Reads a film's voice-over, each scene's `say`, or one text, for the words a voice may get wrong before a paid
// voice reads it (scripts/lib/say.mjs): acronyms, camelCase names, identifiers, file names, web addresses, numbers
// with units and, when the brand keeps a `voice.lexicon`, product words it does not know. A word is cleared by a
// pronunciation marker `[display](spoken)` in the text or by the brand's lexicon (`voice.lexicon` in the style: word → how it is said).
// Cue markers `<<slot>>` are read too: each must name a beat of its scene, and sit before a word. Exit 0 when
// nothing is flagged, 1 when a word or a cue is, 2 for usage. `mm gen voice` runs the same reading before it asks to send.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { UsageError, resolvePiece, runMain } from './lib/cli.mjs';
import { KIND_NAMES, cueAnchors, lintSay } from './lib/say.mjs';

const q = (w) => JSON.stringify(String(w).replace(/[\u0000-\u001f]/g, ' '));

/** The lines to print for one reading: [{ at, findings }] where `at` names where the text came from. */
export function renderFindings(readings) {
  const lines = [];
  for (const { at, findings } of readings) for (const f of findings) lines.push(`  ${at}: ${q(f.word)} is a ${KIND_NAMES[f.kind] ?? f.kind} (word ${f.index + 1}); ${f.fix}`);
  return lines;
}

runMain(import.meta, async () => {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { text: { type: 'string' }, script: { type: 'string' }, scene: { type: 'string' }, json: { type: 'boolean', default: false } } });
  if (values.text !== undefined && values.script !== undefined) throw new UsageError('say-lint takes --text or --script, not both', 2);
  const loose = values.text !== undefined || values.script !== undefined;
  let style = {}, story = null, dir = null;
  if (!loose || positionals[0]) {
    dir = resolvePiece(positionals[0]);
    story = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
    if (existsSync(join(dir, 'style.json'))) style = JSON.parse(readFileSync(join(dir, 'style.json'), 'utf8'));
  }
  const lexicon = style.voice?.lexicon ?? {};
  const readings = [];
  let problems = [];
  if (loose) {
    const text = values.text ?? readFileSync(resolve(values.script), 'utf8');
    readings.push({ at: 'text', ...lintSay(text, { lexicon }) });
  } else {
    let scenes = story.scenes;
    if (values.scene) {
      scenes = scenes.filter((s) => s.id === values.scene);
      if (!scenes.length) throw new UsageError(`no scene "${values.scene}" in ${join(dir, 'story.json')} (scenes: ${story.scenes.map((s) => s.id).join(', ')})`, 2);
    }
    for (const sc of scenes) {
      if (typeof sc.say === 'string' && sc.say.trim()) readings.push({ at: `${sc.id}`, ...lintSay(sc.say, { lexicon }) });
      for (const [format, over] of Object.entries(sc.formats ?? {})) if (typeof over.say === 'string' && over.say.trim()) readings.push({ at: `${sc.id} (${format})`, ...lintSay(over.say, { lexicon }) });
    }
    problems = cueAnchors({ scenes }).problems;
  }
  const findings = readings.flatMap((r) => r.findings.map((f) => ({ at: r.at, ...f })));
  const checked = readings.some((r) => r.productWordsChecked);
  if (values.json) {
    console.log(JSON.stringify({ findings: findings.map(({ at, word, kind, index, reason, fix }) => ({ at, word, kind, index, reason, fix })), cueProblems: problems, productWordsChecked: checked }, null, 2));
    return findings.length || problems.length ? 1 : 0;
  }
  if (!findings.length && !problems.length) console.log(`say-lint: nothing a voice is likely to get wrong in ${readings.length} text${readings.length === 1 ? '' : 's'}`);
  else {
    console.log(`say-lint: ${findings.length} word${findings.length === 1 ? '' : 's'} a voice may get wrong${problems.length ? `, ${problems.length} cue marker${problems.length === 1 ? '' : 's'} to fix` : ''}`);
    for (const l of renderFindings(readings)) console.log(l);
    for (const p of problems) console.log(`  ${p.scene}: ${p.reason}`);
  }
  if (!checked) console.log('note: product words are not checked: the brand has no voice.lexicon (word → how it is said) to compare names against');
  return findings.length || problems.length ? 1 : 0;
});
