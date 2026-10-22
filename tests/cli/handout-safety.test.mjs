// The handout page puts style values into a <style> element. A family or a colour that came from a
// captured page must not be able to end the element and run script in the page that renders the PDF:
// the builder refuses such a style, naming the value, before it builds anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handoutHtml } from '../../scripts/export.mjs';

const build = (type = {}, color = {}) => handoutHtml({
  story: { title: 'T"><script>3</script>', scenes: [] },
  style: {
    type: { text: { family: 'Manrope' }, display: { family: 'ok Display' }, mono: { family: 'IBM Plex Mono' }, ...type },
    color: { canvas: '#fff', ink: '#111111', muted: '#555', ...color },
  },
  dir: '.', pngs: [Buffer.from('x')], rests: [0], sceneOf: () => ({ id: 's"><script>5</script>', say: '<script>6</script>' }), viewport: { width: 1920, height: 1080 },
});

test('handoutHtml: a hostile family name is refused, naming the family', () => {
  for (const family of ['x"</style><script>1</script>', "a'; } </style><script>2</script>", 'a'.repeat(65), '']) {
    for (const role of ['text', 'display', 'mono']) {
      assert.throws(() => build({ [role]: { family } }), (e) => e.exitCode === 2 && /family/i.test(e.message) && e.message.includes(JSON.stringify(family)), `${role} ${family}`);
    }
  }
});

test('handoutHtml: a value that is not a colour is refused, naming the role', () => {
  assert.throws(() => build({}, { canvas: 'red;}</style><script>4</script>' }), (e) => e.exitCode === 2 && /canvas/.test(e.message));
  assert.throws(() => build({}, { line: 'url(http://x/y)' }), /line/);
});

test('handoutHtml: a clean style builds, with no script element in the page, and its values are kept', () => {
  const html = build();
  assert.doesNotMatch(html.replace(/<script>3<\/script>/g, ''), /<script/i, 'only the escaped title text could mention one');
  assert.match(html, /"ok Display"/);
  assert.match(html, /color: #111111/);
  assert.doesNotMatch(html, /<script/i);
});
