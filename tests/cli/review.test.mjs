// `mm review` builds out/review.html from direction-log.md: two rounds give two
// entries, newest first, each opening with its quoted director's note.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRounds, newestFirst, renderMarkdown } from '../../scripts/review.mjs';
import { mm, workCopy } from './cli-helpers.mjs';

let w;
before(() => { w = workCopy('review'); });
after(() => w.cleanup());

const articles = (html) => [...html.matchAll(/<article class="round" id="(round-\d+)">([\s\S]*?)<\/article>/g)].map((m) => ({ id: m[1], html: m[2] }));

test('a log with two rounds yields two entries, newest first, each opening with its quoted note', () => {
  writeFileSync(join(w.film, 'direction-log.md'), `# Direction log

## Round 1: treatment
> "Slower in. I want the headline to land like a stamp."

| gate | call |
|---|---|
| Treatment | **calm** |

## Round 2: style frames
> "Warmer, and the second scene is too loud."

- option A: rise at \`standard\`
- option B: fade only
`);
  const r = mm(['review', w.film]);
  assert.equal(r.status, 0, r.out);
  const html = readFileSync(join(w.film, 'out', 'review.html'), 'utf8');
  const rounds = articles(html).filter((a) => a.id.startsWith('round-'));
  assert.deepEqual(rounds.map((a) => a.id), ['round-2', 'round-1']);
  assert.match(rounds[0].html, /^\s*<h2>Round 2: style frames<\/h2>\s*<blockquote class="note">&quot;Warmer, and the second scene is too loud\.&quot;<\/blockquote>/);
  assert.match(rounds[1].html, /^\s*<h2>Round 1: treatment<\/h2>\s*<blockquote class="note">&quot;Slower in\. I want the headline to land like a stamp\.&quot;<\/blockquote>/);
  assert.match(rounds[1].html, /<table>[\s\S]*<strong>calm<\/strong>/, 'the gate table is rendered');
  assert.match(rounds[0].html, /<li>option A: rise at <code>standard<\/code><\/li>/);
  // The newest round carries the stills, the contact sheet, the phone sheet and the last frame.
  for (const f of ['contact.png', 'phone.png', 'last.png']) {
    assert.match(rounds[0].html, new RegExp(`rounds/round-02/${f}`));
    assert.ok(existsSync(join(w.film, 'out', 'rounds', 'round-02', f)), f);
  }
  assert.ok(!/<script|https?:\/\//.test(html), 'dependency-free: no script, no URL');
});

test('headings without numbers: the last round in the file is the newest', () => {
  writeFileSync(join(w.film, 'direction-log.md'), '## Treatment\n> first note\n\n## Style frames\n> second note\n');
  const r = mm(['review', w.film, '--no-stills']);
  assert.equal(r.status, 0, r.out);
  const rounds = articles(readFileSync(join(w.film, 'out', 'review.html'), 'utf8'));
  assert.match(rounds[0].html, /Style frames[\s\S]*second note/);
  assert.match(rounds[1].html, /Treatment[\s\S]*first note/);
});

test('parseRounds, newestFirst and renderMarkdown on their own', () => {
  const rounds = parseRounds('## Round 3\n> c\nbody c\n## Round 1\n> a\n');
  assert.deepEqual(newestFirst(rounds).map((r) => r.n), [2, 1], 'chronological numbers, newest first');
  assert.equal(newestFirst(rounds)[0].title, 'Round 3');
  assert.equal(rounds[0].note, 'c');
  assert.equal(rounds[0].body, 'body c');
  assert.match(renderMarkdown('<b>x</b>'), /&lt;b&gt;/, 'html in the log is escaped');
});

test('review without a direction log exits 2 and says why', () => {
  const r = mm(['review', w.deck]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.stderr, /direction-log\.md/);
});
