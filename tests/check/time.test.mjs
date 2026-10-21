// G-TIME (SPEC §2.3, §2.4): the static half, the computed-style half and the runtime recorder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, failsOnly, row } from './_harness.mjs';
import { timeOffenders, autoplayOffenders, cssTimeOffenders, markupOffenders } from '../../scripts/check/_lib.mjs';
import { launchBrowser, openPiece, serveRoot, ROOT } from '../../scripts/lib/browser.mjs';
import { join } from 'node:path';

const run = gate();

test('static half: setTimeout in piece.js fails G-TIME naming file and line', async () => {
  const r = failsOnly(await run('G-TIME/static'), 'G-TIME');
  assert.equal(r.evidence.file, 'piece.js');
  assert.equal(r.evidence.measured, 'setTimeout');
  assert.ok(r.evidence.line > 0);
});

test('runtime half: a transition that survives render mode fails G-TIME at a schedule instant', async () => {
  const r = failsOnly(await run('G-TIME/runtime'), 'G-TIME');
  assert.match(r.evidence.selector, /data-slot="headline"/);
  assert.match(r.evidence.measured, /transition-duration 0\.52s/);
});

test('recorder: a timer reached through a computed name fails G-TIME naming the file', async () => {
  const r = failsOnly(await run('G-TIME/trap'), 'G-TIME');
  assert.equal(r.evidence.measured, 'setTimeout');
  assert.match(r.evidence.file, /G-TIME\/trap\/piece\.js$/);
  assert.ok(r.evidence.line > 0);
});

test('recorder: every source is wrapped however it is reached; serve mode installs nothing', async () => {
  const browser = await launchBrowser(), server = await serveRoot(ROOT);
  try {
    const dir = join(ROOT, 'fixtures/negatives/_base/film');
    const p = await openPiece(dir, { browser, server, trap: true });
    const names = await p.page.evaluate(() => {
      const g = globalThis;
      window.__mmTimeLog.length = 0;   // Playwright's own polling may have used a frame callback (not from a served file)
      g['set' + 'Interval'](() => {}, 1e6); g['request' + 'AnimationFrame'](() => {}); new g['Da' + 'te'](); g.Date.now();
      Math['ran' + 'dom'](); performance['n' + 'ow'](); Reflect.apply(Crypto.prototype.getRandomValues, crypto, [new Uint8Array(2)]); crypto.randomUUID();
      return window.__mmTimeLog.map((x) => x.name);
    });
    assert.deepEqual(names, ['setInterval', 'requestAnimationFrame', 'Date', 'Date.now', 'Math.random', 'performance.now', 'crypto.getRandomValues', 'crypto.randomUUID']);
    assert.ok(await p.page.evaluate(() => new Date(0) instanceof Date && typeof Date.UTC === 'function'));
    await p.close();
    const plain = await openPiece(dir, { browser, server });
    assert.equal(await plain.page.evaluate(() => window.__mmTimeLog), undefined);
    await plain.close();
  } finally { await browser.close(); await server.close(); }
});

test('the base film calls nothing the recorder watches', async () => {
  const r = row(await run('_base/film', { only: ['G-TIME'] }), 'G-TIME');
  assert.equal(r.status, 'PASS');
  assert.ok(r.evidence.recorded >= 0, 'the recorder ran (calls made by the gate itself, outside served files, are not counted)');
});

test('the grep ignores comments and finds every forbidden name', () => {
  assert.deepEqual(timeOffenders('// setTimeout is banned\n/* Date */ const x = 1;'), []);
  const names = timeOffenders('setInterval(f); requestAnimationFrame(f); performance.now(); Math.random(); new Date(); crypto.getRandomValues(a); crypto.randomUUID(); v.autoplay = true;').map((h) => h.match);
  assert.deepEqual(names, ['setInterval', 'requestAnimationFrame', 'performance.now', 'Math.random', 'Date', 'getRandomValues', 'randomUUID', 'autoplay']);
  assert.equal(autoplayOffenders('<video src="a.mp4" muted autoplay></video>').length, 1);
});

for (const [dir, measured, what] of [
  ['G-TIME/realm', 'iframe', 'an iframe realm (its timers are unrecorded) is refused and recorded'],
  ['G-TIME/worker', 'Worker', 'a worker thread is refused and recorded'],
  ['G-TIME/post-task', 'scheduler.postTask', 'a delayed scheduler.postTask is recorded'],
  ['G-TIME/entropy', 'performance.timeOrigin', 'per-load entropy from performance.timeOrigin is recorded'],
]) {
  test(`${dir}: ${what}`, async () => {
    const r = failsOnly(await run(dir), 'G-TIME');
    assert.equal(r.evidence.measured, measured);
    assert.match(r.evidence.file, new RegExp(`${dir}/piece\\.js$`));
  });
}

test('G-TIME/smil: SVG SMIL animation in piece code fails the static half', async () => {
  const r = failsOnly(await run('G-TIME/smil'), 'G-TIME');
  assert.equal(r.evidence.measured, 'SVG <set>');
  assert.equal(r.evidence.file, 'piece.js');
});

test('G-TIME/custom-duration: a transition timed through a custom property fails', async () => {
  const r = failsOnly(await run('G-TIME/custom-duration'), 'G-TIME');
  assert.equal(r.evidence.file, 'piece.css');
  assert.match(r.evidence.measured, /^transition: opacity var\(--t\)$/);
});

test('recorder: postTask, per-load entropy, refused realms and threads, SMIL removed on insertion, shadow roots and canvas text', async () => {
  const browser = await launchBrowser(), server = await serveRoot(ROOT);
  try {
    const p = await openPiece(join(ROOT, 'fixtures/negatives/_base/film'), { browser, server, trap: true });
    const out = await p.page.evaluate(async () => {
      const g = globalThis, log = window.__mmTimeLog, text = window.__mmTextLog;
      log.length = 0;
      const refused = [];
      const tryIt = (name, f) => { try { f(); } catch (e) { refused.push(`${name}: ${e.name}`); } };
      g['sched' + 'uler'].postTask(() => {}, { delay: 1e6 });
      void performance['time' + 'Origin']; void performance.timing; performance.getEntriesByType('navigation'); performance.mark('x');
      void document.timeline.currentTime; void new Event('x').timeStamp;
      new Intl.DateTimeFormat('en').format(); new Intl.DateTimeFormat('en').format(0);
      URL.createObjectURL(new Blob(['x']));
      tryIt('Worker', () => new g['Wor' + 'ker']('data:text/javascript,'));
      tryIt('SharedWorker', () => new g['Shared' + 'Worker']('data:text/javascript,'));
      tryIt('iframe', () => document.createElement('IFRAME'));
      const host = document.createElement('div');
      document.body.append(host);
      host.innerHTML = '<iframe></iframe>';
      const f = host.firstElementChild;
      const cw = f.contentWindow;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.append(document.createElementNS('http://www.w3.org/2000/svg', 'an' + 'imate'));
      host.append(svg);
      await new Promise((r) => queueMicrotask(r));
      const left = host.querySelectorAll('iframe, animate').length;
      tryIt('attachShadow', () => host['attach' + 'Shadow']({ mode: 'closed' }));
      const c = document.createElement('canvas').getContext('2d');
      c['fill' + 'Text']('a', 0, 0); c.strokeText('b', 0, 0);
      host.remove();
      return { names: log.map((x) => x.name), always: log.filter((x) => x.always).map((x) => x.name), text: text.map((x) => x.name), refused, cw, left, frames: window.length };
    });
    for (const n of ['scheduler.postTask', 'performance.timeOrigin', 'performance.timing', 'performance.getEntriesByType', 'performance.mark', 'document.timeline.currentTime',
      'Event.timeStamp', 'Intl.DateTimeFormat (now)', 'URL.createObjectURL', 'Worker', 'SharedWorker', 'iframe', 'SVG <animate>']) assert.ok(out.names.includes(n), `${n} recorded: ${out.names}`);
    assert.equal(out.names.filter((n) => n === 'Intl.DateTimeFormat (now)').length, 1, 'a format with an explicit instant is not entropy');
    assert.deepEqual(out.refused, ['Worker: NotSupportedError', 'SharedWorker: NotSupportedError', 'iframe: NotSupportedError', 'attachShadow: NotSupportedError']);
    assert.equal(out.cw, null, 'an iframe that slipped in through markup gives no window');
    assert.equal(out.left, 0, 'the iframe and the SMIL element are removed when the mutation is delivered');
    assert.equal(out.frames, 0);
    assert.ok(out.always.includes('SVG <animate>') && out.always.includes('iframe'));
    assert.deepEqual(out.text, ['attachShadow', 'canvas fillText', 'canvas strokeText']);
    await p.close();
  } finally { await browser.close(); await server.close(); }
});

test('the grep: realms, threads, schedulers, entropy names, SMIL markup, custom-property durations', () => {
  const names = timeOffenders("new Worker(u); new SharedWorker(u); navigator.serviceWorker; scheduler.postTask(f); performance.timeOrigin; e.timeStamp; URL.createObjectURL(b); document.createElement('iframe'); document.createElementNS(ns, 'set');").map((h) => h.match);
  assert.deepEqual(names, ['Worker', 'SharedWorker', 'serviceWorker', 'postTask', 'timeOrigin', 'timeStamp', 'createObjectURL', 'iframe', 'SVG <set>']);
  assert.deepEqual(timeOffenders('el.animate(keys, opts); map.set(k, v); const frame = 1;'), [], 'WAAPI, Map#set and a variable called frame are not offenders');
  assert.deepEqual(markupOffenders('<svg><rect><animateTransform attributeName="transform"/></rect><set to="1"/></svg><iframe src="x"></iframe><frameset>').map((h) => h.match), ['<iframe>', 'SVG <animateTransform>', 'SVG <set>']);
  assert.deepEqual(cssTimeOffenders('.a { transition: none; } .b { animation: spin var(--d) linear; } .c { transition-duration: var(--mm-dur-quick); } .d { --t: .3s; }').map((h) => h.match),
    ['animation: spin var(--d) linear', 'transition-duration: var(--mm-dur-quick)']);
});
