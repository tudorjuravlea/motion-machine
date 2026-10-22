#!/usr/bin/env node
// mm media layers <picture> --name <n> [--piece <dir>] (--mask <name>=<png>… [--poly <json>] | --key <#rrggbb|auto> [--min-area <px>])
//   [--plate <png>] [--depth <png> | --depths <d,d,…>]
// One still picture becomes a layer pack in <piece>/assets/<n>/: source.png (the picture as decoded),
// plate.png (the picture with its parts removed and the holes filled), part-<name>.png (each part
// cropped to its box), depth.png when a map is given (the plate's depth: the map with the parts' holes
// filled from around them), and media.json (`kind: layers`: the size, every
// file with its SHA-1, each part's box, stacking order z (0 = bottom) and depth (0 far to 1 near), and
// the recompose check). Offline: masks are the user's grey PNGs or RGBA cut-outs, polygons from a JSON
// file, or a colour key against a flat background (pieces under --min-area pixels, by default a
// thousandth of the picture, are noise and dropped); depth is a supplied grey map (near = white), a
// constant per part, or the stacking order. On one machine the same inputs give the same bytes; a JPEG
// or other compressed input is decoded by ffmpeg, whose CPU-specific paths can move a pixel by a level
// on another machine, and the PNG encoder's deflate can differ there too, so hashes are per machine.
// Exit 0 written (a warning when the plate had to be guessed), 1 the parts do not recompose the source
// (more than 0.1 % of pixels further than ΔE 10; the pack is written with recompose-off.png, a grey map
// of the error, white where it is off), 2 usage or a picture the key cannot split.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { isArgsError, usageText } from './lib/cli.mjs';
import { encodePng, readPicture } from './lib/layers-png.mjs';
import { autoKey, buildLayers, errorMap, keyParts, maskAlpha, minArea, rasterPolygon, ringOffKey } from './lib/layers.mjs';

const fail = (message, exitCode = 2) => Object.assign(new Error(message), { exitCode });
const sha1 = (buf) => createHash('sha1').update(buf).digest('hex');
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const MAX_PIXELS = 16_000_000;

function picture(file, what) {
  if (!existsSync(file)) throw fail(`no such file: ${file}`);
  try { return readPicture(file); } catch (e) { throw fail(`${what}: ${e.message}`); }
}
function sameSize(img, src, what) {
  if (img.width !== src.width || img.height !== src.height) throw fail(`${what} is ${img.width}x${img.height}; it must match the picture, ${src.width}x${src.height}`);
}
function hexKey(key) {
  const m = /^#?([0-9a-f]{6})$/i.exec(key);
  if (!m) throw fail(`--key takes #rrggbb or auto, not ${key}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}
function polyParts(file, src) {
  if (!existsSync(file)) throw fail(`no such file: ${file}`);
  let spec;
  try { spec = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw fail(`--poly ${basename(file)} is not JSON: ${e.message}`); }
  const list = Array.isArray(spec) ? spec : spec?.parts;
  if (!Array.isArray(list) || !list.length) throw fail(`--poly ${basename(file)} needs { "parts": [{ "name", "points": [[x, y], …], "depth"? }] }`);
  return list.map((p, i) => {
    if (!Array.isArray(p?.points) || p.points.length < 3 || !p.points.every((q) => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite))) throw fail(`--poly part ${i + 1} needs at least three [x, y] points`);
    if (p.depth != null && !(p.depth >= 0 && p.depth <= 1)) throw fail(`--poly part ${p.name ?? i + 1}: depth must be between 0 and 1`);
    return { name: String(p.name ?? `poly-${i + 1}`), alpha: rasterPolygon(p.points, src.width, src.height), ...(p.depth != null ? { depth: Number(p.depth) } : {}) };
  });
}

export function layers({ file, name, piece = '.', masks = [], polys = [], key = null, minPart = null, plate = null, depth = null, depths = null }) {
  if (!NAME.test(name ?? '')) throw fail('--name must be lowercase letters, digits and hyphens');
  if (key != null && (masks.length || polys.length)) throw fail('--key splits the picture by itself; give it alone, or give --mask/--poly without --key');
  if (key == null && !masks.length && !polys.length) throw fail('say how to take the picture apart: --mask, --key or --poly');
  if (depth && depths) throw fail('give a depth map (--depth) or constants (--depths), not both');
  if (minPart != null && key == null) throw fail('--min-area sizes the pieces of a colour key; give it with --key');
  if (minPart != null && !(Number.isInteger(Number(minPart)) && Number(minPart) >= 1)) throw fail(`--min-area takes a whole number of pixels (1 or more), not ${minPart}`);
  const src = picture(file, 'the picture');
  if (src.width * src.height > MAX_PIXELS) throw fail(`the picture is ${src.width}x${src.height}; at most ${MAX_PIXELS / 1e6} megapixels`);

  let parts = [];
  for (const m of masks) {
    const eq = m.indexOf('=');
    if (eq < 1) throw fail(`--mask takes name=<png>, not ${m}`);
    const partName = m.slice(0, eq), png = m.slice(eq + 1);
    if (!NAME.test(partName)) throw fail(`part name "${partName}" must be lowercase letters, digits and hyphens`);
    const img = picture(png, `mask ${partName}`);
    sameSize(img, src, `mask ${partName} (${basename(png)})`);
    parts.push({ name: partName, alpha: maskAlpha(img) });
  }
  for (const p of polys) parts.push(...polyParts(p, src));
  if (key != null) {
    const k = key === 'auto' ? autoKey(src) : hexKey(key);
    // a quarter of the picture's edge off the key colour: the backdrop changes across the picture
    const ring = ringOffKey(src, k);
    if (ring > 0.25) throw fail(`the background is not flat enough for --key: ${Math.round(ring * 100)} % of the picture's edge differs from the key colour (give masks with --mask or polygons with --poly)`);
    const min = minPart != null ? Number(minPart) : minArea(src.width, src.height);
    parts = keyParts(src, k, { min }).map((alpha, i) => ({ name: `part-${i + 1}`, alpha }));
    if (!parts.length) throw fail('the colour key found nothing but background');
  }
  const names = new Set();
  for (const p of parts) { if (!NAME.test(p.name)) throw fail(`part name "${p.name}" must be lowercase letters, digits and hyphens`); if (names.has(p.name)) throw fail(`two parts are named "${p.name}"`); names.add(p.name); }

  let list = null;
  if (depths != null) {
    list = String(depths).split(',').map((s) => Number(s.trim()));
    if (list.length !== parts.length) throw fail(`--depths gives ${list.length} values for ${parts.length} parts`);
    if (!list.every((d) => d >= 0 && d <= 1)) throw fail('--depths values must be between 0 (far) and 1 (near)');
  }
  const map = depth ? picture(depth, 'the depth map') : null;
  if (map) sameSize(map, src, `the depth map (${basename(depth)})`);
  const given = plate ? picture(plate, 'the plate') : null;
  if (given) sameSize(given, src, `the plate (${basename(plate)})`);

  const built = buildLayers({ img: src, parts, plate: given, depthMap: map, depths: list, grow: key == null });
  const dir = join(resolve(piece), 'assets', name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const write = (f, buf) => { writeFileSync(join(dir, f), buf); return { file: f, sha1: sha1(buf) }; };
  const greyMap = map ? { width: map.width, height: map.height, data: built.plateDepthMap } : null;
  const meta = {
    kind: 'layers', w: src.width, h: src.height,
    source: { ...write('source.png', encodePng(src)), from: basename(file), fromSha1: sha1(readFileSync(file)) },
    plate: { ...write('plate.png', encodePng({ width: src.width, height: src.height, data: built.plate })), fill: built.fill, depth: built.plateDepth },
    ...(greyMap ? { depth: write('depth.png', encodePng(greyMap, { channels: 1 })) } : {}),
    depthFrom: built.depthFrom,
    parts: built.parts.map((p) => ({ name: p.name, ...write(`part-${p.name}.png`, encodePng({ width: p.w, height: p.h, data: p.data })), x: p.x, y: p.y, w: p.w, h: p.h, z: p.z, depth: p.depth })),
    recompose: (({ error, ...r }) => r)(built.recompose),
  };
  if (!built.recompose.ok) writeFileSync(join(dir, 'recompose-off.png'), encodePng({ width: src.width, height: src.height, data: errorMap(built.recompose.error, src.width, src.height) }));
  writeFileSync(join(dir, 'media.json'), `${JSON.stringify(meta, null, 2)}\n`);
  return { dir, meta, warnings: built.warnings };
}

export async function main(argv) {
  try {
    const { values: v, positionals: p } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
      name: { type: 'string' }, piece: { type: 'string' }, mask: { type: 'string', multiple: true }, poly: { type: 'string', multiple: true },
      key: { type: 'string' }, 'min-area': { type: 'string' }, plate: { type: 'string' }, depth: { type: 'string' }, depths: { type: 'string' } } });
    if (p.length !== 1 || !v.name) throw fail(usageText('media layers'));
    const { dir, meta, warnings } = layers({ file: p[0], name: v.name, piece: v.piece, masks: v.mask ?? [], polys: v.poly ?? [], key: v.key ?? null, minPart: v['min-area'] ?? null, plate: v.plate ?? null, depth: v.depth ?? null, depths: v.depths ?? null });
    for (const w of warnings) console.error(`mm media layers: warning: ${w}`);
    const r = meta.recompose;
    const summary = `${meta.parts.length} part${meta.parts.length === 1 ? '' : 's'} (${meta.parts.map((x) => x.name).join(', ')}) and a plate, ${meta.w}x${meta.h}, to ${dir}; recompose: ${(r.offShare * 100).toFixed(3)} % of pixels further than ${r.unit} ${r.threshold}`;
    if (!r.ok) { console.error(`mm media layers: the parts do not recompose the picture: ${summary} (limit ${r.limit * 100} %); see recompose-off.png`); return 1; }
    console.log(`wrote ${summary}`);
    return 0;
  } catch (e) { console.error(isArgsError(e) ? `mm: ${e.message}\n${usageText('media layers')}` : `mm: ${e.message}`); return e.exitCode ?? 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
