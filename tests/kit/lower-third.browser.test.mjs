// text/lower-third, exits/lower-third, text/annotate, layouts/social-card and emphasis/keyword-cta in
// a page: every pattern's demo renders in three formats in two brands with no kit warning; at every
// rest the text is in the DOM and inside the host's box, nothing is left mid-motion (no caret, no
// sonar ring, no arrow), a frame is the same whichever way it is reached, a brand sets a mechanism
// for every beat, and the exit takes the slot away.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { newPiece } from '../../scripts/new.mjs';

const OUT = join(ROOT, 'out', 'lower-third-test');
const demo = (ref) => JSON.parse(readFileSync(join(ROOT, 'patterns', ref, 'demo/story.json'), 'utf8'));
const FORMATS = ['9x16', '1x1', '16x9'];
let server, browser;
const dirs = {};

// a piece folder for a story in a preset; `patch` edits the composed style (a brand's pattern defaults)
function piece(name, story, preset, patch) {
  const dir = join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  newPiece({ kind: 'film', style: join(ROOT, 'styles/presets', `${preset}.json`), dir });
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story, null, 2));
  if (patch) {
    const sp = join(dir, 'style.json');
    const style = JSON.parse(readFileSync(sp, 'utf8'));
    patch(style);
    writeFileSync(sp, JSON.stringify(style, null, 2));
  }
  return dir;
}

before(async () => {
  mkdirSync(OUT, { recursive: true });
  for (const ref of ['text/lower-third', 'text/annotate', 'layouts/social-card', 'emphasis/keyword-cta', 'exits/lower-third']) {
    for (const preset of ['editorial', 'blueprint']) dirs[`${ref}@${preset}`] = piece(`${ref.replace('/', '-')}-${preset}`, demo(ref), preset);
  }
  const base = demo('text/lower-third');
  const plain = { ...base, scenes: [{ ...base.scenes[0], beats: base.scenes[0].beats.map((b) => (b.slot === 'overlay' ? { ...b, params: { side: 'left' } } : b)) }] };
  dirs.branded = piece('branded', plain, 'editorial', (s) => { s.patterns = { 'text/lower-third': { mechanism: 'pill', side: 'right', plate: false } }; });
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const restOf = (meta, scene) => meta.schedule.holds.find((h) => h.scene === scene);
const KIT_WARNING = /did not load|unknown pattern|unknown slot|has no slot|keyword-cta|stamp/;

for (const preset of ['editorial', 'blueprint']) {
  test(`every demo mounts in ${FORMATS.join(', ')} (${preset}) with no kit warning and every text inside the safe margin at its rests`, async () => {
    for (const ref of ['text/lower-third', 'text/annotate', 'layouts/social-card', 'emphasis/keyword-cta', 'exits/lower-third']) {
      for (const format of FORMATS) {
        const o = await openPiece(dirs[`${ref}@${preset}`], { server, browser, format });
        try {
          const meta = await o.mm.meta();
          assert.deepEqual((meta.warnings ?? []).filter((w) => KIT_WARNING.test(w)), [], `${ref} ${format}: ${JSON.stringify(meta.warnings)}`);
          for (const h of meta.schedule.holds) {
            await o.mm.seek(h.from + (h.to - h.from) / 2);
            const bad = await o.page.evaluate(() => {
              const root = getComputedStyle(document.documentElement);
              const safe = parseFloat(root.getPropertyValue('--mm-safe')), W = parseFloat(root.getPropertyValue('--mm-frame-w')), H = parseFloat(root.getPropertyValue('--mm-frame-h'));
              const out = [];
              for (const sc of document.querySelectorAll('[data-scene]')) {
                if (getComputedStyle(sc).visibility === 'hidden') continue;
                const walk = document.createTreeWalker(sc, NodeFilter.SHOW_TEXT);
                for (let n = walk.nextNode(); n; n = walk.nextNode()) {
                  if (!n.textContent.trim() || getComputedStyle(n.parentElement).visibility === 'hidden') continue;
                  const r = document.createRange(); r.selectNodeContents(n);
                  const b = r.getBoundingClientRect();
                  if (b.width && (b.left < safe - 1 || b.top < safe - 1 || b.right > W - safe + 1 || b.bottom > H - safe + 1)) out.push(`${n.textContent.trim().slice(0, 24)} ${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}`);
                }
              }
              return out;
            });
            assert.deepEqual(bad, [], `${ref} ${format} at ${h.scene}: text outside the safe margin`);
          }
        } finally { await o.close?.(); }
      }
    }
  });
}

test('lower third: at each rest the name and the role are text, no caret, no clip left on the plate of a typed name, the exit hides the slot', async () => {
  const o = await openPiece(dirs['text/lower-third@editorial'], { server, browser, format: '9x16' });
  const meta = await o.mm.meta();
  for (const sc of meta.schedule.scenes) {
    const rest = restOf(meta, sc.id);
    await o.mm.seek(rest.from + 0.05);
    const s = await o.page.evaluate((id) => {
      const lt = document.querySelector(`[data-scene="${id}"] .mm-lt`);
      const caret = lt.querySelector('.mm-lt__caret');
      return { mech: lt.dataset.mechanism, name: lt.querySelector('.mm-lt__name').textContent, role: lt.querySelector('.mm-lt__role').textContent, caretShown: caret && !caret.hidden, rest: lt.querySelector('.mm-lt__rest').textContent };
    }, sc.id);
    assert.equal(s.name, 'Alex Sample', sc.id);
    assert.equal(s.role, 'Design lead', sc.id);
    assert.equal(s.caretShown, false, `${sc.id}: no caret at rest`);
    assert.equal(s.rest, '', `${sc.id}: nothing untyped at rest`);
    // the beat leaves at 3.0 s into the scene: the slot is hidden once the exit is over
    const it = meta.schedule.items.find((x) => x.scene === sc.id && x.selector.endsWith('[data-slot="overlay"]'));
    await o.mm.seek(it.exit.start + it.exit.d + 0.05);
    const gone = await o.page.evaluate((id) => getComputedStyle(document.querySelector(`[data-scene="${id}"] [data-slot="overlay"]`)).visibility, sc.id);
    assert.equal(gone, 'hidden', `${sc.id}: gone after its exit`);
  }
  await o.close?.();
});

test('lower third: a frame is the same however it is reached (seek forward, back, forward)', async () => {
  const o = await openPiece(dirs['text/lower-third@editorial'], { server, browser, format: '16x9' });
  const meta = await o.mm.meta();
  for (const id of ['bar-wipe', 'typed', 'pill', 'stamp']) {
    const sc = meta.schedule.scenes.find((x) => x.id === id);
    const t = sc.start + 0.8;   // mid-entrance
    const html = () => o.page.evaluate((id) => document.querySelector(`[data-scene="${id}"] [data-slot="overlay"]`).outerHTML.replace(/ style=""/g, ''), id);
    await o.mm.seek(t); const a = await html();
    await o.mm.seek(sc.start + 3.3); await o.mm.seek(sc.start + 0.1); await o.mm.seek(t); const b = await html();
    assert.equal(a, b, id);
    assert.ok(/mm-lt/.test(a));
  }
  await o.close?.();
});

test('lower third: a brand sets the mechanism, the side and the plate for every beat that does not say otherwise', async () => {
  const o = await openPiece(dirs.branded, { server, browser, format: '9x16' });
  const meta = await o.mm.meta();
  await o.mm.seek(restOf(meta, 'bar-wipe').from + 0.05);
  const s = await o.page.evaluate(() => { const lt = document.querySelector('.mm-lt'); return { mech: lt.dataset.mechanism, side: lt.dataset.side, plate: lt.dataset.plate }; });
  assert.equal(s.mech, 'pill');
  assert.equal(s.plate, 'false');
  // the beat's own side wins over the brand's
  assert.equal(s.side, 'left');
  await o.close?.();
});

test('annotate: a pulse has its sonar rings only while it arrives; the label is inside the overlay area', async () => {
  const o = await openPiece(dirs['text/annotate@editorial'], { server, browser, format: '9x16' });
  const meta = await o.mm.meta();
  const sc = meta.schedule.scenes.find((x) => x.id === 'pulse');
  const it = meta.schedule.items.find((x) => x.scene === 'pulse' && x.selector.endsWith('[data-slot="overlay"]'));
  const rings = () => o.page.evaluate(() => document.querySelectorAll('[data-scene="pulse"] .mm-an__ring').length);
  await o.mm.seek(it.start + it.d * 0.55);
  assert.ok((await rings()) >= 1, 'a ring is expanding mid-entrance');
  await o.mm.seek(restOf(meta, 'pulse').from + 0.05);
  assert.equal(await rings(), 0, 'no ring at rest');
  for (const k of ['tooltip', 'brace', 'measure', 'leader', 'pulse', 'crosshair', 'chip', 'slot']) {
    const r = restOf(meta, k);
    await o.mm.seek(r.from + 0.05);
    const inside = await o.page.evaluate((k) => {
      const host = document.querySelector(`[data-scene="${k}"] [data-slot="overlay"]`).getBoundingClientRect();
      const lab = document.querySelector(`[data-scene="${k}"] .mm-an__label`).getBoundingClientRect();
      return lab.left >= host.left - 1 && lab.right <= host.right + 1 && lab.top >= host.top - 1 && lab.bottom <= host.bottom + 1;
    }, k);
    assert.ok(inside, `${k}: the label is inside the overlay area`);
  }
  await o.close?.();
});

test('keyword-cta: three arrows while the window runs, none at rest, the chip level; hold false relaxes to an outline', async () => {
  const o = await openPiece(dirs['emphasis/keyword-cta@editorial'], { server, browser, format: '9x16' });
  const meta = await o.mm.meta();
  const probe = (id) => o.page.evaluate((id) => {
    const el = document.querySelector(`[data-scene="${id}"] [data-slot="sub"]`), cs = getComputedStyle(el);
    return { arrows: el.querySelectorAll('.mm-kcta__arrow').length, scale: cs.scale, bg: cs.backgroundColor };
  }, id);
  for (const id of ['hold', 'quiet']) {
    const it = meta.schedule.items.find((x) => x.scene === id && x.selector.endsWith('[data-slot="sub"]'));
    await o.mm.seek(it.emphasis.start + it.emphasis.d * 0.5);
    const mid = await probe(id);
    assert.equal(mid.arrows, 3, `${id}: three arrows mid-window`);
    await o.mm.seek(restOf(meta, id).from + 0.05);
    const rest = await probe(id);
    assert.equal(rest.arrows, 0, `${id}: no arrows at rest`);
    assert.equal(rest.scale, 'none', `${id}: level at rest`);
    if (id === 'hold') assert.notEqual(rest.bg, 'rgba(0, 0, 0, 0)', 'hold: the plate stays'); else {
      assert.equal(rest.bg, 'rgba(0, 0, 0, 0)', 'no hold: an outline');
      assert.notEqual(mid.bg, 'rgba(0, 0, 0, 0)', 'no hold: the plate is drawn while the window runs');
    }
  }
  await o.close?.();
});

test('social card: the follow card shows its button, the post card does not; the like is pressed', async () => {
  const o = await openPiece(dirs['layouts/social-card@editorial'], { server, browser, format: '9x16' });
  const meta = await o.mm.meta();
  const probe = (id) => o.page.evaluate((id) => {
    const sc = document.querySelector(`[data-scene="${id}"]`);
    const act = sc.querySelector('.social-card__action');
    const heart = getComputedStyle(sc.querySelector('.social-card__icon[data-icon="1"]'));
    return { action: getComputedStyle(act).display, heart: heart.backgroundColor, icons: getComputedStyle(sc.querySelector('.social-card__icon[data-icon="2"]')).display, stat: sc.querySelector('[data-slot="stat-1"]').textContent };
  }, id);
  await o.mm.seek(restOf(meta, 'post').from + 0.05);
  const post = await probe('post');
  assert.equal(post.action, 'none');
  assert.equal(post.stat, '1284', 'the counter ends on its fact');
  assert.notEqual(post.icons, 'none');
  await o.mm.seek(restOf(meta, 'follow').from + 0.05);
  const follow = await probe('follow');
  assert.notEqual(follow.action, 'none');
  assert.equal(follow.icons, 'none');
  assert.equal(follow.stat, '212 posts');
  await o.close?.();
});
