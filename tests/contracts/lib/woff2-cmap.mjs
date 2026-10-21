// A small WOFF2 reader that returns the set of code points a font file maps (its cmap).
// Enough for a coverage test; not a general font parser. Original code (WOFF2 spec, W3C).
import { brotliDecompressSync } from 'node:zlib';

const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

function base128(buf, pos) {
  let v = 0;
  for (let i = 0; i < 5; i++) {
    const b = buf[pos.i++];
    v = (v * 128) + (b & 0x7f);
    if ((b & 0x80) === 0) return v;
  }
  throw new Error('bad UIntBase128');
}

export function woff2Tables(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a WOFF2 file');
  const numTables = buf.readUInt16BE(12);
  const totalCompressed = buf.readUInt32BE(20);
  const pos = { i: 48 };
  const dir = [];
  for (let n = 0; n < numTables; n++) {
    const flags = buf[pos.i++];
    const idx = flags & 0x3f;
    const tag = idx === 63 ? buf.toString('latin1', pos.i, (pos.i += 4)) : KNOWN[idx];
    const transformVersion = (flags >> 6) & 0x3;
    const origLength = base128(buf, pos);
    const isGlyfLoca = tag === 'glyf' || tag === 'loca';
    const transformed = isGlyfLoca ? transformVersion === 0 : transformVersion !== 0;
    const transformLength = transformed ? base128(buf, pos) : origLength;
    dir.push({ tag, origLength, transformLength });
  }
  const data = brotliDecompressSync(buf.subarray(pos.i, pos.i + totalCompressed));
  const tables = new Map();
  let off = 0;
  for (const t of dir) { tables.set(t.tag, data.subarray(off, off + t.transformLength)); off += t.transformLength; }
  return tables;
}

export function cmapCodepoints(cmap) {
  const out = new Set();
  const n = cmap.readUInt16BE(2);
  let best = null;
  for (let i = 0; i < n; i++) {
    const platform = cmap.readUInt16BE(4 + i * 8), encoding = cmap.readUInt16BE(6 + i * 8), offset = cmap.readUInt32BE(8 + i * 8);
    const format = cmap.readUInt16BE(offset);
    const score = format === 12 ? 3 : format === 4 ? 2 : 0;
    if (score && (!best || score > best.score || (platform === 3 && score === best.score))) best = { offset, format, score };
  }
  if (!best) return out;
  const o = best.offset;
  if (best.format === 12) {
    const groups = cmap.readUInt32BE(o + 12);
    for (let g = 0; g < groups; g++) {
      const start = cmap.readUInt32BE(o + 16 + g * 12), end = cmap.readUInt32BE(o + 20 + g * 12);
      for (let c = start; c <= end && c < 0x110000; c++) out.add(c);
    }
  } else {
    const segX2 = cmap.readUInt16BE(o + 6), seg = segX2 / 2;
    const ends = o + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let s = 0; s < seg; s++) {
      const end = cmap.readUInt16BE(ends + s * 2), start = cmap.readUInt16BE(starts + s * 2);
      const delta = cmap.readUInt16BE(deltas + s * 2), rangeOff = cmap.readUInt16BE(ranges + s * 2);
      if (start === 0xffff) continue;
      for (let c = start; c <= end; c++) {
        let glyph;
        if (rangeOff === 0) glyph = (c + delta) & 0xffff;
        else {
          const addr = ranges + s * 2 + rangeOff + (c - start) * 2;
          if (addr + 2 > cmap.length) continue;
          const g = cmap.readUInt16BE(addr);
          glyph = g === 0 ? 0 : (g + delta) & 0xffff;
        }
        if (glyph !== 0) out.add(c);
      }
    }
  }
  return out;
}

export function woff2Codepoints(buf) {
  const cmap = woff2Tables(buf).get('cmap');
  if (!cmap) throw new Error('no cmap table');
  return cmapCodepoints(cmap);
}
