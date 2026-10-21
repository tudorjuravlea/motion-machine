// The handout page puts style values into a <style> element. A family or a colour that came from a
// captured page must not be able to end the element and run script in the page that renders the PDF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handoutHtml } from '../../scripts/export.mjs';

const hostile = (extra = {}) => handoutHtml({
  story: { title: 'T"><script>3</script>', scenes: [] },
  style: {
    type: { text: { family: 'x"</style><script>1</script>' }, display: { family: 'ok Display' }, mono: { family: "a'; } </style><script>2</script>" } },
    color: { canvas: 'red;}</style><script>4</script>', ink: '#111', muted: 'rgb(1, 2, 3)', ...extra },
  },
  dir: '.', pngs: [Buffer.from('x')], rests: [0], sceneOf: () => ({ id: 's"><script>5</script>', say: '<script>6</script>' }), viewport: { width: 1920, height: 1080 },
});

test('handoutHtml: no family, colour, title or scene text can open a script element', () => {
  const html = hostile();
  assert.doesNotMatch(html, /<script/i);
});

test('handoutHtml: safe values are kept', () => {
  const html = hostile();
  assert.match(html, /"ok Display"/);
  assert.match(html, /color: rgb\(1, 2, 3\)/);
  assert.match(html, /color: #111/);
});
