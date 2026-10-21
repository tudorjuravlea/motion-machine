// export-designmd writes a DESIGN.md whose YAML front block parses and lists every
// colour role, with our motion tokens in an extra `motion:` section; the reader accepts three shapes.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/validate.mjs';
import { ROLES, parseDesignMd, parseYaml } from '../../scripts/export-designmd.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'mm-designmd-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const run = (...args) => spawnSync('node', [join(ROOT, 'scripts', 'export-designmd.mjs'), ...args], { encoding: 'utf8' });
const editorial = JSON.parse(readFileSync(join(ROOT, 'styles/presets/editorial.json'), 'utf8'));

test('the file round-trips: a YAML front block that lists every colour role and the motion tokens', () => {
  const out = join(tmp, 'DESIGN.md');
  const r = run('--style', 'styles/presets/editorial.json', '--out', out);
  assert.equal(r.status, 0, r.stderr);
  const text = readFileSync(out, 'utf8');
  assert.ok(text.startsWith('---\n'));
  const { tokens, via, body } = parseDesignMd(text);
  assert.equal(via, 'front block');
  assert.equal(tokens.name, 'editorial');
  for (const role of ROLES) assert.equal(tokens.colors[role], editorial.color[role], role);
  assert.equal(tokens.typography.display.fontFamily, 'Fraunces');
  assert.equal(tokens.typography.display.fontWeight, 700);
  assert.equal(tokens.typography.display.letterSpacing, '-0.02em');
  assert.deepEqual(Object.values(tokens.rounded), editorial.radius.map((v) => `${v}px`));
  assert.deepEqual(Object.values(tokens.spacing), editorial.space.map((v) => `${v}px`));
  // the extra motion section, structure intact
  assert.equal(tokens.motion.durations.quick, `${editorial.motion.durations.quick}ms`);
  assert.equal(tokens.motion.easings.enter, editorial.motion.easings.enter);
  assert.deepEqual(tokens.motion.spring.ui, editorial.motion.spring.ui);
  assert.deepEqual(tokens.motion.pacing.arrivalsPer10s, editorial.pacing.arrivalsPer10s);
  assert.equal(tokens.motion.sound.palette, editorial.sound.palette);
  assert.equal(tokens.motion.transitions.opening, editorial.transitions.opening);
  // prose follows the front block
  for (const h of ['## Overview', '## Colors', '## Typography', '## Motion']) assert.ok(body.includes(h), h);
});

test('an invalid style is refused (exit 1) and a usage slip is exit 2', () => {
  const bad = { ...editorial, color: { ...editorial.color, ink: 'red' } };
  const p = join(tmp, 'bad.json'); writeFileSync(p, JSON.stringify(bad));
  const out = join(tmp, 'BAD.md');
  assert.equal(run('--style', p, '--out', out).status, 1);
  assert.ok(!existsSync(out));
  assert.equal(run('--style', p).status, 2);
});

test('the reader takes a fenced yaml block and a markdown table too', () => {
  const fenced = parseDesignMd('# Brand\n\n```yaml\ncolors:\n  primary: "#336699"\n  surface: \'#EEEEEE\'\n```\n');
  assert.equal(fenced.via, 'fenced yaml block');
  assert.deepEqual(fenced.tokens.colors, { primary: '#336699', surface: '#EEEEEE' });
  const table = parseDesignMd('# Tokens\n\n| token | value |\n|---|---|\n| background | #FAFAFA |\n| heading font | Lora |\n| spacing | 8px |\n');
  assert.equal(table.via, 'markdown table');
  assert.equal(table.tokens.colors.background, '#FAFAFA');
  assert.equal(table.tokens.typography['heading font'].fontFamily, 'Lora');
  assert.equal(parseDesignMd('just prose').tokens, null);
});

test('the YAML subset reads maps, flow collections, lists, quotes and comments', () => {
  const y = parseYaml('a: 1\n# c\nb:\n  c: "x: y"\n  d: [1, 2.5, "z"]\n  e: {k: 3, m: \'q\'}\nlist:\n  - one\n  - 2\nt: true # trailing\nh: #ABCDEF\n');
  assert.deepEqual(y, { a: 1, b: { c: 'x: y', d: [1, 2.5, 'z'], e: { k: 3, m: 'q' } }, list: ['one', 2], t: true, h: '#ABCDEF' });
});
