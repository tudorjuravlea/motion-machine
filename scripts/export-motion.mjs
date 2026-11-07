#!/usr/bin/env node
// `export-motion --style <composed style.json> --out motion.css|motion.json`: a brand's eases and springs as tokens a
// developer can paste (scripts/lib/motion-tokens.mjs). `.css` writes custom properties (an easing per role; a duration
// and a sampled linear() easing per spring); `.json` writes the same data with each spring also as the Motion API's
// { type: "spring", visualDuration, bounce } and as its physics.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { validators } from './lib/validate.mjs';
import { isArgsError, usageText } from './lib/cli.mjs';
import { motionTokens, toCss, toJson } from './lib/motion-tokens.mjs';

export function exportMotion({ style, out }) {
  const ext = extname(out).toLowerCase();
  if (ext !== '.css' && ext !== '.json') throw Object.assign(new Error(`--out ${out}: the extension picks the format; use .css or .json`), { exitCode: 2 });
  const s = JSON.parse(readFileSync(resolve(style), 'utf8'));
  const v = validators().style;
  if (!v(s)) throw Object.assign(new Error(`${style} is not a valid composed style: ${v.errors.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')}`), { exitCode: 1 });
  const tokens = motionTokens(s);
  const text = ext === '.css' ? toCss(tokens) : toJson(tokens);
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), text);
  return { out, text, tokens };
}

export function main(argv) {
  let a;
  try {
    a = parseArgs({ args: argv, options: { style: { type: 'string' }, out: { type: 'string' } }, strict: true }).values;
    if (!a.style || !a.out) throw new Error(usageText('style export-motion'));
    exportMotion({ style: a.style, out: a.out });
    console.log(`wrote ${a.out}`);
    return 0;
  } catch (e) { console.error(isArgsError(e) ? `${e.message}\n${usageText('style export-motion')}` : e.message); return e.exitCode ?? 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
