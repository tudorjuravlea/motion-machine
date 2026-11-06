// Adds stub patterns to a work copy made by _variant.mjs, so a test can name patterns the fixtures' shared set does
// not hold (a catalogue id, a depth stub). The copy mounts from its own patterns/ folder afterwards.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NEG } from './_harness.mjs';

const BODY = {
  entrances: "at(el, p) { el.style.opacity = String(Math.min(1, Math.max(0, p))); }",
  exits: "at(el, p) { el.style.opacity = String(1 - Math.min(1, Math.max(0, p)) * 0.3); }",
  emphasis: "dur: 'standard', at() {}",
  transitions: "dur: 0, at() {}",
  moves: "at() {}",
  data: "at(el, p) { el.style.opacity = String(Math.min(1, Math.max(0, p))); }",
  devices: "at(el, p) { el.style.opacity = String(Math.min(1, Math.max(0, p))); }",
};

/** `refs` maps a pattern id to the module body to use (or null for the group's empty stub). */
export function withStubs(dir, refs = {}) {
  cpSync(join(NEG, '_shared', 'patterns'), join(dir, 'patterns'), { recursive: true });
  for (const [ref, body] of Object.entries(refs)) {
    const [group, name] = ref.split('/');
    mkdirSync(join(dir, 'patterns', ref), { recursive: true });
    writeFileSync(join(dir, 'patterns', ref, 'pattern.js'), `export default { name: '${name}', group: '${group}', params: {}, ${body ?? BODY[group]} };\n`);
    writeFileSync(join(dir, 'patterns', ref, 'pattern.css'), '');
  }
  const html = join(dir, 'index.html');
  writeFileSync(html, readFileSync(html, 'utf8').replace("new URL('../_shared/patterns/'", "new URL('./patterns/'"));
}
