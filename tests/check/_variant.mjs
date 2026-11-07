// A copy of fixtures/negatives/<from> that a test edits and runs the gate on: made next to the originals
// (so its relative paths still resolve; git-ignored as .tmp-*) and removed by cleanup().
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NEG } from './_harness.mjs';

const made = [];

/** edit({ story, style, dir }) changes the parsed story and style in place (and may write files into dir); returns the copy's folder. */
export function variant(from, edit = () => {}, { css = null } = {}) {
  const dir = join(NEG, `.tmp-lotd-${process.pid}-${made.length}`);
  made.push(dir);
  rmSync(dir, { recursive: true, force: true });
  cpSync(join(NEG, from), dir, { recursive: true, filter: (p) => !p.includes('/out') });
  // a fixture two folders down (_base/film) reaches the repository one level further than its copy does
  if (from.split('/').length === 2) {
    const html = readFileSync(join(dir, 'index.html'), 'utf8').replace('../../../../runtime', '../../../runtime').replace("new URL('../../_shared", "new URL('../_shared");
    writeFileSync(join(dir, 'index.html'), html);
    writeFileSync(join(dir, 'style.json'), readFileSync(join(dir, 'style.json'), 'utf8').replaceAll('../../../../', '../../../'));
  }
  const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const story = read('story.json'), style = read('style.json');
  edit({ story, style, dir });
  writeFileSync(join(dir, 'story.json'), `${JSON.stringify(story, null, 2)}\n`);
  writeFileSync(join(dir, 'style.json'), `${JSON.stringify(style, null, 2)}\n`);
  if (css != null) writeFileSync(join(dir, 'piece.css'), css);
  return dir;
}

export function cleanup() {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
}

export const scene = (story, id) => story.scenes.find((sc) => sc.id === id);
export const beat = (story, id, slot) => scene(story, id).beats.find((b) => b.slot === slot);
