// The golden pieces, read from the artefacts the golden build left in pieces/golden-*/out/ (git-ignored:
// on a clean checkout without exports these tests SKIP with the command that makes them).
//   - every golden piece's last `mm check` passed and is newer than its story; only the accepted WARN stands
//   - the exports exist and `--prove` passed; review page, direction log (a row per gate), defects ledger
//   - the two films differ by more than 30 % of pixels at matched instants while their story timing
//     (every cut, arrival and cue instant) is identical, and the motion style speaks: the stories
//     name roles and positions, so the cut and entrance patterns differ
//   - fact f2 states the rule count the gate actually has
//   - the skill router stays a router: frontmatter, ≤ 250 lines, a cheatsheet row for every pattern
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { schedule } from '../../runtime/kit/schedule.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const P = (id, ...f) => join(ROOT, 'pieces', id, ...f);
const json = (f) => JSON.parse(readFileSync(f, 'utf8'));
const FILMS = ['golden-film-editorial', 'golden-film-kinetic'];
const DECKS = ['golden-deck-editorial', 'golden-deck-kinetic'];
const FORMATS = ['9x16', '1x1', '16x9'];
// The WARNs the director accepted are the rows of "Warnings and why they stand" in
// tests/golden/accepted-warnings.md (`| Rule | Piece | Evidence | Why it stands | Decided by |`); any
// other WARN fails, and so does an accepted row with no evidence or no reason.
function acceptedWarnings() {
  const md = readFileSync(join(ROOT, 'tests', 'golden', 'accepted-warnings.md'), 'utf8');
  const sec = /^## Warnings and why they stand\n([\s\S]*?)(?=^## )/m.exec(md)?.[1] ?? '';
  const out = Object.fromEntries([...FILMS, ...DECKS].map((id) => [id, []]));
  for (const line of sec.split('\n').filter((l) => /^\| [WG]-[A-Z-]+ \|/.test(l))) {
    const [rule, piece, evidence, why, by] = line.split('|').slice(1, -1).map((c) => c.trim());
    assert.ok(piece in out, `accepted ${rule} names an unknown piece ${piece}`);
    assert.ok(evidence && why && by, `accepted ${rule} on ${piece} needs evidence, a reason and who decided`);
    out[piece].push(rule);
  }
  for (const id of Object.keys(out)) out[id].sort();
  return out;
}
const ACCEPTED = acceptedWarnings();

const built = (id) => existsSync(P(id, 'out', 'check.json')) && existsSync(P(id, 'out', 'export.json'));
const skipFor = (id) => (built(id) ? false : `pieces/${id}/out is not built: run mm check, mm export --prove, mm sound, mm check --sub 1, mm review`);

describe('golden pieces: gate, exports, log', () => {
  for (const id of [...FILMS, ...DECKS]) {
    test(`${id}: last check passed, fresh, only accepted warnings`, { skip: skipFor(id) }, () => {
      const report = json(P(id, 'out', 'check.json'));
      const failed = report.rules.filter((r) => r.status === 'FAIL').map((r) => r.id);
      assert.deepEqual(failed, [], `G- failures: ${failed.join(', ')}`);
      const warned = report.rules.filter((r) => r.status === 'WARN').map((r) => r.id).sort();
      assert.deepEqual(warned, ACCEPTED[id]);
      const checked = statSync(P(id, 'out', 'check.json')).mtimeMs;
      assert.ok(checked >= statSync(P(id, 'story.json')).mtimeMs, 'check.json is older than story.json');
      // The last check read what ships: it is newer than the export record and every muxed MP4.
      assert.ok(checked >= statSync(P(id, 'out', 'export.json')).mtimeMs, 'check.json is older than export.json');
      if (FILMS.includes(id)) for (const f of FORMATS) assert.ok(checked >= statSync(P(id, 'out', `${id}-${f}.mp4`)).mtimeMs, `check.json is older than the ${f} MP4`);
      if (FILMS.includes(id)) {
        const st = Object.fromEntries(report.rules.map((r) => [r.id, r.status]));
        assert.equal(st['W-SUB'], 'PASS', 'final check ran with --sub 1, the export default');
        assert.equal(st['G-PEAK'], 'PASS', 'true peak measured on the muxed MP4s');
        assert.equal(st['W-LOUDNESS'], 'PASS', 'loudness measured on the muxed MP4s');
        assert.equal(st['W-CUE'], 'PASS', 'cues measured against the 120 BPM grid');
      }
    });

    test(`${id}: exports present and --prove passed`, { skip: skipFor(id) }, () => {
      const m = json(P(id, 'out', 'export.json'));
      assert.equal(m.proved, true);
      assert.ok(m.prove.length >= 1 && m.prove.every((p) => p.mismatches.length === 0));
      assert.equal(m.forced, false);
      if (FILMS.includes(id)) {
        assert.deepEqual(m.prove.map((p) => p.format), FORMATS);
        for (const f of FORMATS) {
          const mp4 = P(id, 'out', `${id}-${f}.mp4`);
          assert.ok(existsSync(mp4), `${f} MP4`);
          const streams = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', mp4], { encoding: 'utf8' }).stdout).streams.map((s) => s.codec_type);
          assert.deepEqual(streams.sort(), ['audio', 'video'], `${f} has picture and sound`);
        }
        for (const f of ['poster.png', 'loop_check.mp4', 'contact.png', 'mix.wav']) assert.ok(existsSync(P(id, 'out', f)), f);
      } else {
        for (const f of ['deck/index.html', 'handout.pdf', 'walkthrough.mp4', 'contact.png']) assert.ok(existsSync(P(id, 'out', f)), f);
      }
      assert.ok(existsSync(P(id, 'out', 'review.html')), 'review.html');
    });

    test(`${id}: direction log has a row per gate; defects ledger exists`, () => {
      const log = readFileSync(P(id, 'direction-log.md'), 'utf8');
      for (let g = 1; g <= 7; g++) {
        const sec = new RegExp(`^## Gate ${g} · [^\\n]+\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(log);
        assert.ok(sec, `gate ${g} section`);
        assert.match(sec[1], /^> /m, `gate ${g} opens with the director's note`);
        assert.match(sec[1], /^\| \d+\.\d+ \|/m, `gate ${g} has at least one call row`);
      }
      assert.match(readFileSync(P(id, 'defects.md'), 'utf8'), /^\| D1 \|/m);
    });
  }
});

/** Fraction of pixels whose largest channel difference exceeds `tol` between two rgb24 frames. */
function differing(a, b, tol = 24) {
  let n = 0;
  for (let i = 0; i < a.length; i += 3) {
    if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > tol) n++;
  }
  return n / (a.length / 3);
}
const frameAt = (mp4, t) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', mp4, '-frames:v', '1', '-vf', 'scale=480:270', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 24 });
  assert.equal(r.status, 0, String(r.stderr));
  return r.stdout;
};

describe('golden films: one schedule, two styles', () => {
  const load = (id) => ({ story: json(P(id, 'story.json')), style: json(P(id, 'style.json')) });
  const [ed, ki] = FILMS.map(load);

  test('the two films wear one story (only the id differs)', () => {
    assert.deepEqual({ ...ed.story, id: null }, { ...ki.story, id: null });
    assert.notDeepEqual(ed.style, ki.style);
    // the grid and the type hierarchy are the brand's, so the two styles differ in composition.
    assert.deepEqual(ed.style.composition, { align: 'left', headlineScale: 1, density: 'airy' });
    assert.deepEqual(ki.style.composition, { align: 'center', headlineScale: 1.2, density: 'compact' });
  });

  test('story timing is identical: duration, scenes, every cut, arrival and cue instant', () => {
    const a = schedule(ed.story, ed.style), b = schedule(ki.story, ki.style);
    assert.equal(a.duration, 30);
    assert.equal(a.duration, b.duration);
    assert.deepEqual(a.scenes.map((s) => [s.id, s.start, s.end]), b.scenes.map((s) => [s.id, s.start, s.end]));
    // Story timing: when and what. Which pattern plays is the motion style's, so the key
    // carries the cue name but not the resolved cut or entrance.
    const key = (e) => [e.t.toFixed(6), e.kind, e.selector, e.cue ?? ''].join(' ');
    const story = (s) => s.events.filter((e) => ['cut', 'arrive', 'cue'].includes(e.kind)).map(key);
    assert.deepEqual(story(a), story(b));
    assert.equal(story(a).length, 36);   // 8 cuts, 19 arrivals, 9 cues
    // The style speaks: every cut after the opening and most entrances resolve differently.
    const cuts = (s) => s.scenes.map((sc) => sc.cut.pattern);
    const differs = (x, y) => x.filter((v, i) => v !== y[i]).length;
    assert.equal(differs(cuts(a), cuts(b)), a.scenes.length - 1, `cuts: ${cuts(a)} vs ${cuts(b)}`);
    const fx = (s) => s.events.filter((e) => e.kind === 'arrive').map((e) => e.fx);
    assert.ok(differs(fx(a), fx(b)) >= fx(a).length - 2, `entrances: ${fx(a)} vs ${fx(b)}`);
    for (const sc of ed.story.scenes) assert.ok(sc.cut == null && sc.position, `${sc.id} names its position, not a cut`);
    // Owned by the motion style, by design: how long each arrival takes, so when it
    // settles and when an emphasis that follows it starts.
    assert.notDeepEqual(a.items.map((i) => i.d), b.items.map((i) => i.d));
    const moves = (s) => s.events.filter((e) => e.kind === 'move');
    assert.equal(moves(a).length, moves(b).length);
    for (const s of [a, b]) for (const m of moves(s)) {
      const it = s.items.find((i) => i.selector === m.selector);
      assert.ok(Math.abs(m.t - (it.start + it.d)) < 1e-6, 'an emphasis starts as its entrance settles');
    }
  });

  const skip = FILMS.every(built) ? false : 'film exports not built';
  test('the films differ by more than 30 % of pixels at matched instants (16x9)', { skip }, () => {
    for (const t of [2.0, 13.5, 25.0]) {
      const share = differing(...FILMS.map((id) => frameAt(P(id, 'out', `${id}-16x9.mp4`), t)));
      assert.ok(share > 0.3, `${t}s: ${(share * 100).toFixed(1)} % of pixels differ`);
    }
  });
});

describe('golden facts', () => {
  test('f2 states the rule count of the gate', () => {
    const files = readdirSync(join(ROOT, 'scripts', 'check'));
    const g = files.filter((f) => /^G-[A-Z0-9-]+\.mjs$/.test(f)).length, w = files.filter((f) => /^W-[A-Z0-9-]+\.mjs$/.test(f)).length;
    for (const f of ['story.film.json', 'story.deck.json']) {
      const f2 = json(join(ROOT, 'fixtures', 'golden', f)).facts.find((x) => x.id === 'f2');
      assert.equal(f2.text, `The gate checks ${g + w} rules: ${g} errors and ${w} warnings.`, f);
    }
    for (const id of [...FILMS, ...DECKS]) assert.deepEqual(json(P(id, 'story.json')).facts, json(join(ROOT, 'fixtures', 'golden', FILMS.includes(id) ? 'story.film.json' : 'story.deck.json')).facts, id);
  });
});

describe('golden facts on screen', () => {
  // A beat that cites a fact and carries a number shows the fact's number: the beat's `value` occurs in
  // the fact's text, and a beat's own `text` (a deck figure) starts with that value.
  const stories = [['fixtures/golden/story.film.json', json(join(ROOT, 'fixtures', 'golden', 'story.film.json'))],
    ['fixtures/golden/story.deck.json', json(join(ROOT, 'fixtures', 'golden', 'story.deck.json'))],
    ...[...FILMS, ...DECKS].map((id) => [`pieces/${id}/story.json`, json(P(id, 'story.json'))])];
  for (const [name, story] of stories) {
    test(`${name}: a cited number is the fact's number`, () => {
      const facts = Object.fromEntries(story.facts.map((f) => [f.id, f.text]));
      let checked = 0;
      for (const sc of story.scenes) for (const b of sc.beats) {
        if (!b.fact || typeof b.value !== 'number') continue;
        checked++;
        assert.ok(new RegExp(`(^|[^\\d.])${b.value}([^\\d]|$)`).test(facts[b.fact]), `${sc.id}: value ${b.value} is not in ${b.fact}: "${facts[b.fact]}"`);
        if (b.text) assert.ok(b.text.startsWith(String(b.value)), `${sc.id}: on-screen "${b.text}" does not start with ${b.value}`);
      }
      assert.ok(checked >= 2, 'both cited figures are checked');
    });
  }
});

describe('skill router', () => {
  const dir = join(ROOT, 'skill', 'motion-machine');
  const skill = readFileSync(join(dir, 'SKILL.md'), 'utf8');

  test('frontmatter and length', () => {
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1] ?? '';
    for (const k of [/^name: motion-machine$/m, /^description: .*Use when .*Do not use/m, /^license: Apache-2\.0$/m, /^compatibility: /m, /^metadata:\n\s+version: 0\.1\.0$/m]) assert.match(fm, k);
    const lines = skill.replace(/\n$/, '').split('\n').length; // a trailing newline is not a line
    assert.ok(lines <= 250, `${lines} lines`);
  });

  test('every referenced file exists and carries a "Read when" line', () => {
    for (const f of new Set([...skill.matchAll(/`references\/([\w-]+\.md)`/g)].map((m) => m[1]))) {
      const own = join(dir, 'references', f), repo = join(ROOT, 'references', f);
      assert.ok(existsSync(own) || existsSync(repo), f);
      if (existsSync(own)) assert.match(readFileSync(own, 'utf8'), /^Read when: /m, f);
    }
  });

  test('the cheatsheet lists every pattern id', () => {
    const ids = spawnSync(process.execPath, [join(ROOT, 'scripts', 'mm.mjs'), 'pattern', 'list'], { encoding: 'utf8' }).stdout.trim().split('\n');
    const sheet = readFileSync(join(dir, 'references', 'patterns-cheatsheet.md'), 'utf8');
    for (const id of ids) assert.ok(sheet.includes(`| \`${id}\` |`), id);
  });
});
