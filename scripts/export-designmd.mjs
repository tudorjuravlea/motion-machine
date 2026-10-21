#!/usr/bin/env node
// `export-designmd --style <composed style.json> --out DESIGN.md`: a DESIGN.md-compatible file
// (tokens as a YAML front block, then prose) with our motion tokens in an extra `motion:` section
// (the DESIGN.md format tolerates unknown sections). This module also owns the reading
// side (`parseDesignMd`) so `capture-brand --from DESIGN.md` and the round-trip test share it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { validators } from './lib/validate.mjs';
import { isArgsError, usageText } from './lib/cli.mjs';

export const ROLES = ['canvas', 'ink', 'muted', 'surface', 'line', 'accent', 'accentInk'];
const ROLE_NOTE = {
  canvas: 'the page behind everything', ink: 'primary text on the canvas', muted: 'secondary text and captions',
  surface: 'cards and tiles lifted off the canvas', line: 'hairlines and borders', accent: 'the one colour that asks for attention',
  accentInk: 'text and icons on the accent',
};

// ---------------------------------------------------------------- YAML subset: emit

const KEY = /^[A-Za-z_][\w-]*$/;
const key = (k) => (KEY.test(k) ? k : JSON.stringify(k));
const scalar = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
const flow = (a) => `[${a.map((x) => (Array.isArray(x) ? flow(x) : scalar(x))).join(', ')}]`;

/** Emits plain objects (nested), arrays (flow) and scalars (strings always double-quoted). */
export function emitYaml(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  return Object.entries(obj).map(([k, v]) => {
    if (Array.isArray(v)) return `${pad}${key(k)}: ${flow(v)}`;
    if (v && typeof v === 'object') return `${pad}${key(k)}:\n${emitYaml(v, indent + 1)}`;
    return `${pad}${key(k)}: ${scalar(v)}`;
  }).join('\n');
}

// ---------------------------------------------------------------- YAML subset: parse

function parseScalar(raw) {
  const s = raw.trim();
  if (s.startsWith('"')) { const m = s.match(/^"((?:[^"\\]|\\.)*)"/); if (m) { try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; } } }
  if (s.startsWith("'")) { const m = s.match(/^'((?:[^']|'')*)'/); if (m) return m[1].replace(/''/g, "'"); }
  const hex = s.match(/^#[0-9a-f]{3,8}\b/i); // lenient: an unquoted hex is a value here, not a comment
  const plain = hex ? hex[0] : s.replace(/\s+#.*$/, '').trim();
  if (/^-?\d+(\.\d+)?$/.test(plain)) return Number(plain);
  if (plain === 'true') return true;
  if (plain === 'false') return false;
  if (plain === 'null' || plain === '~' || plain === '') return null;
  return plain;
}

/** One flow collection or scalar starting at s[i]; returns [value, nextIndex]. */
function parseFlow(s, i = 0) {
  const skip = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  skip();
  if (s[i] === '[' || s[i] === '{') {
    const isMap = s[i] === '{'; const close = isMap ? '}' : ']'; i++;
    const out = isMap ? {} : [];
    for (;;) {
      skip();
      if (i >= s.length) break;
      if (s[i] === close) { i++; break; }
      if (s[i] === ',') { i++; continue; }
      if (isMap) {
        const km = s.slice(i).match(/^(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^:,{}[\]]+?))\s*:/);
        if (!km) break;
        i += km[0].length;
        const [v, next] = parseFlow(s, i); i = next;
        out[km[1] ?? km[2] ?? km[3].trim()] = v;
      } else { const [v, next] = parseFlow(s, i); i = next; out.push(v); }
    }
    return [out, i];
  }
  const start = i;
  if (s[i] === '"' || s[i] === "'") {
    const q = s[i++]; while (i < s.length && s[i] !== q) i += s[i] === '\\' && q === '"' ? 2 : 1; i++;
  } else while (i < s.length && !',]}'.includes(s[i])) i++;
  return [parseScalar(s.slice(start, i)), i];
}

/** Block maps, block lists of scalars, flow collections; comments and blank lines skipped. No anchors, no multi-line scalars. */
export function parseYaml(text) {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => ({ indent: l.match(/^ */)[0].length, text: l.trim() })).filter((l) => l.text && !l.text.startsWith('#'));
  let n = 0;
  function block(indent) {
    if (lines[n]?.text.startsWith('- ') || lines[n]?.text === '-') {
      const list = [];
      while (n < lines.length && lines[n].indent === indent && lines[n].text.startsWith('-')) {
        const rest = lines[n].text.slice(1).trim(); n++;
        list.push(rest ? parseFlow(rest)[0] : null);
      }
      return list;
    }
    const map = {};
    while (n < lines.length && lines[n].indent === indent) {
      const m = lines[n].text.match(/^(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^:\s][^:]*?))\s*:(?:\s+(.*))?$/);
      if (!m) { n++; continue; }
      const k = m[1] ?? m[2] ?? m[3]; const rest = m[4]; n++;
      if (rest === undefined || rest === '') map[k] = lines[n] && lines[n].indent > indent ? block(lines[n].indent) : null;
      else map[k] = parseFlow(rest)[0];
    }
    return map;
  }
  return lines.length ? block(lines[0].indent) : {};
}

/**
 * Finds the tokens in a DESIGN.md: the YAML front block, else the first fenced yaml block that has
 * a `colors:` key, else markdown tables (name | value rows). Returns { tokens, via, body }.
 */
export function parseDesignMd(text) {
  const t = text.replace(/^﻿/, '');
  const fm = t.match(/^\s*---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (fm) return { tokens: parseYaml(fm[1]), via: 'front block', body: t.slice(fm[0].length) };
  for (const m of t.matchAll(/```ya?ml\r?\n([\s\S]*?)```/g)) if (/^\s*colou?rs\s*:/m.test(m[1])) return { tokens: parseYaml(m[1]), via: 'fenced yaml block', body: t };
  const tokens = { colors: {}, typography: {} };
  for (const row of t.split('\n').filter((l) => /^\s*\|/.test(l))) {
    const cells = row.split('|').slice(1, -1).map((c) => c.trim().replace(/^`|`$/g, ''));
    if (cells.length < 2 || /^[-: ]+$/.test(cells[0])) continue;
    const hex = cells.slice(1).find((c) => /^#[0-9a-f]{3,8}$/i.test(c));
    if (hex) tokens.colors[cells[0]] = hex;
    else if (/font|type|family|heading|body|display|mono|code/i.test(cells[0]) && cells[1] && !/^[\d.]+(px|rem|em)?$/.test(cells[1]) && !/^(token|name|value)$/i.test(cells[1])) tokens.typography[cells[0]] = { fontFamily: cells[1] };
  }
  const found = Object.keys(tokens.colors).length || Object.keys(tokens.typography).length;
  return { tokens: found ? tokens : null, via: found ? 'markdown table' : null, body: t };
}

// ---------------------------------------------------------------- export

const px = (n) => `${n}px`;
const half = (path, fallback) => (path ? path.replace(/^.*\//, '').replace(/\.json$/, '') : fallback);

/** The composed style as DESIGN.md text. */
export function toDesignMd(style) {
  const t = style.type;
  const front = {
    version: 'alpha',
    name: style.name,
    description: `${style.fictional ? 'A fictional' : 'A'} Motion Machine style: the ${half(style.from?.brand, 'brand')} look moving the ${half(style.from?.motion, 'motion')} way.`,
    colors: Object.fromEntries(ROLES.map((r) => [r, style.color[r]])),
    typography: Object.fromEntries(['display', 'text', 'mono'].map((r) => [r, { fontFamily: t[r].family, fontWeight: t[r].weight, letterSpacing: `${t[r].tracking}em` }])),
    rounded: Object.fromEntries(style.radius.map((v, i) => [`r${i}`, px(v)])),
    spacing: Object.fromEntries(style.space.map((v, i) => [`s${i}`, px(v)])),
    motion: {
      durations: Object.fromEntries(Object.entries(style.motion.durations).map(([k, v]) => [k, `${v}ms`])),
      easings: style.motion.easings,
      spring: style.motion.spring,
      travel: style.motion.travel,
      overshootMax: style.motion.overshootMax,
      exitRatio: style.motion.exitRatio,
      stagger: style.motion.stagger,
      sound: style.sound,
      transitions: style.transitions,
      entrances: style.entrances,
      pacing: style.pacing,
    },
  };
  const colours = ROLES.map((r) => `- **${r}** \`${style.color[r]}\`: ${ROLE_NOTE[r]}.`).join('\n');
  const faces = ['display', 'text', 'mono'].map((r) => `- **${r}**: ${t[r].family}, weight ${t[r].weight}.`).join('\n');
  const bans = style.bans.filter((b) => !style.allow.includes(b));
  return `---\n${emitYaml(front)}\n---\n
## Overview

${style.name}: ${style.fictional ? 'a fictional style shipped with Motion Machine' : 'a style composed for a real brand'}, brand half \`${style.from?.brand ?? 'n/a'}\`, motion half \`${style.from?.motion ?? 'n/a'}\`. The \`motion:\` block above is an extra section for tools that read Motion Machine; other DESIGN.md readers can ignore it.

## Colors

${colours}

## Typography

${faces}

Sizes are ratios of the format's base size in Motion Machine (display ${style.scale.display}, h1 ${style.scale.h1}, h2 ${style.scale.h2}, body ${style.scale.body}, caption ${style.scale.caption}, micro ${style.scale.micro}).

## Motion

Durations (ms): ${Object.entries(style.motion.durations).map(([k, v]) => `${k} ${v}`).join(', ')}. Overshoot is bounded at ${style.motion.overshootMax}; exits take ${style.motion.exitRatio} of their entrance. Sound palette: ${style.sound.palette}. Pacing: ${style.pacing.energy}, holds of at least ${style.pacing.holdMinS} s.

## Do's and Don'ts

${bans.length ? bans.map((b) => `- Don't use ${b.replace(/-/g, ' ')}.`).join('\n') : '- No bans in force.'}
${style.allow.length ? `\nBans lifted by this style: ${style.allow.join(', ')}.\n` : ''}`;
}

export function exportDesignMd({ style, out }) {
  const s = JSON.parse(readFileSync(resolve(style), 'utf8'));
  const v = validators().style;
  if (!v(s)) throw Object.assign(new Error(`${style} is not a valid composed style: ${v.errors.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')}`), { exitCode: 1 });
  const text = toDesignMd(s);
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), text);
  return { out, text };
}

export function main(argv) {
  let a;
  try {
    a = parseArgs({ args: argv, options: { style: { type: 'string' }, out: { type: 'string' } }, strict: true }).values;
    if (!a.style || !a.out) throw new Error(usageText('style export-designmd'));
    exportDesignMd({ style: a.style, out: a.out });
    console.log(`wrote ${a.out}`);
    return 0;
  } catch (e) { console.error(isArgsError(e) ? `${e.message}\n${usageText('style export-designmd')}` : e.message); return e.exitCode ?? 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
