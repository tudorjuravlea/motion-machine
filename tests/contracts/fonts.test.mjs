// Every bundled font has its licence beside it, every brand face file exists, and
// the union of a family's subsets maps the Latin Extended glyphs Romanian and most European
// languages need. The reader is tests/contracts/lib/woff2-cmap.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/validate.mjs';
import { woff2Codepoints } from './lib/woff2-cmap.mjs';

const FONTS = join(ROOT, 'styles', 'fonts');
const families = readdirSync(FONTS).filter((d) => statSync(join(FONTS, d)).isDirectory());

// Romanian first (Ș ș Ț ț Ă ă Â â Î î, and the cedilla forms older texts use), then a spread of
// Latin Extended-A the main European languages need.
const REQUIRED = [0x0102, 0x0103, 0x00c2, 0x00e2, 0x00ce, 0x00ee, 0x0218, 0x0219, 0x021a, 0x021b, 0x015e, 0x015f, 0x0162, 0x0163,
  0x0106, 0x0107, 0x010c, 0x010d, 0x0110, 0x0111, 0x011a, 0x011b, 0x0141, 0x0142, 0x0143, 0x0144, 0x0150, 0x0151, 0x0158, 0x0159,
  0x015a, 0x015b, 0x0160, 0x0161, 0x0170, 0x0171, 0x0179, 0x017a, 0x017b, 0x017c, 0x017d, 0x017e, 0x00df, 0x00f8, 0x00e6, 0x20ac];
const BASIC = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'].map((c) => c.codePointAt(0));

test('every font family folder carries a LICENSE.txt and only woff2 files', () => {
  assert.ok(families.length >= 4, 'four families expected');
  for (const fam of families) {
    const files = readdirSync(join(FONTS, fam));
    assert.ok(files.includes('LICENSE.txt'), `${fam}: LICENSE.txt`);
    assert.match(readFileSync(join(FONTS, fam, 'LICENSE.txt'), 'utf8'), /SIL Open Font License|OFL/i, `${fam}: licence is OFL`);
    for (const f of files) if (f !== 'LICENSE.txt') assert.match(f, /\.woff2$/, `${fam}/${f}: woff2 only`);
  }
});

test('every face file a brand names exists', () => {
  const dir = join(ROOT, 'styles', 'brands');
  for (const f of readdirSync(dir)) {
    const b = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const role of ['display', 'text', 'mono']) for (const file of b.type[role].files) {
      assert.ok(existsSync(join(ROOT, file.src)), `${f} ${role}: ${file.src} exists`);
    }
  }
});

test('each family maps Basic Latin and the required Latin Extended code points across its subsets', () => {
  for (const fam of families) {
    const union = new Set();
    for (const f of readdirSync(join(FONTS, fam)).filter((x) => x.endsWith('.woff2'))) {
      for (const c of woff2Codepoints(readFileSync(join(FONTS, fam, f)))) union.add(c);
    }
    const missing = [...BASIC, ...REQUIRED].filter((c) => !union.has(c));
    assert.deepEqual(missing.map((c) => 'U+' + c.toString(16).toUpperCase().padStart(4, '0')), [], `${fam}: missing code points`);
    const extA = Array.from({ length: 0x80 }, (_, i) => 0x100 + i).filter((c) => union.has(c)).length;
    assert.ok(extA >= 100, `${fam}: maps ${extA} of 128 Latin Extended-A code points`);
  }
});
