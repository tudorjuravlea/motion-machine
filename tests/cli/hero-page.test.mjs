// The hero page `mm showcase --html` writes (scripts/lib/hero-page.mjs): one self-contained file that plays
// the film once, then idles with a float that follows the pointer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heroPage } from '../../scripts/lib/hero-page.mjs';

const mp4 = Buffer.from('not really an mp4');

test('the film travels inside the page and nothing is fetched', () => {
  const { html, bytes } = heroPage({ mp4, title: 'App', canvas: '#102030' });
  assert.ok(html.includes(`data:video/mp4;base64,${mp4.toString('base64')}`));
  assert.equal(bytes, Buffer.byteLength(html));
  assert.doesNotMatch(html.replace(/src="data:video\/mp4;base64,[^"]+"/, ''), /https?:\/\/|src="(?!data:)|href=/);
});

test('it plays once (no loop), muted and inline, then idles: a float, and a tilt toward the pointer that skips touch', () => {
  const { html } = heroPage({ mp4, title: 'App', canvas: '#102030' });
  const video = /<video[^>]*>/.exec(html)[0];
  assert.doesNotMatch(video, /\bloop\b/);
  for (const a of ['autoplay', 'muted', 'playsinline']) assert.match(video, new RegExp(`\\b${a}\\b`));
  assert.match(html, /addEventListener\('ended'/);
  assert.match(html, /pointermove/);
  assert.match(html, /pointerType === 'touch'/);
  assert.match(html, /prefers-reduced-motion/);
});

test('the page takes the style\'s canvas colour and an escaped title; a colour that is not hex is refused', () => {
  const { html } = heroPage({ mp4, title: '<b>&"x"</b>', canvas: '#102030' });
  assert.match(html, /background: #102030/);
  assert.match(html, /<title>&lt;b&gt;&amp;&quot;x&quot;&lt;\/b&gt;<\/title>/);
  assert.throws(() => heroPage({ mp4, title: 'x', canvas: 'red;}body{' }), /hex/);
});
