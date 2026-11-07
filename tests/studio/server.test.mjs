// The studio server on a temp copy of a piece. Every route's
// success and error shapes; a foreign Host or Origin, a path outside the root, a non-JSON body and an
// oversized body are refused; SSE names who changed the file (the studio, a journal writer, or an
// outside hand); two writers: the studio's stale save gets 409 (review focus 4), never an overwrite.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, request } from 'node:http';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startStudio } from '../../scripts/studio/server.mjs';
import { editStory, readStory, undoReceipt } from '../../scripts/lib/story-edit.mjs';
import { ROOT, workCopy } from '../cli/cli-helpers.mjs';

let w, s, port, origin;
before(async () => {
  w = workCopy('studio-server');
  s = await startStudio({ piece: w.film });
  port = new URL(s.url).port;
  origin = `http://127.0.0.1:${port}`;
});
after(async () => { await s?.close(); w.cleanup(); });

/** One HTTP request with full control of the headers; resolves { status, headers, body, json }. */
function call(method, path, { body, headers = {}, raw } = {}) {
  const data = raw ?? (body !== undefined ? JSON.stringify(body) : null);
  const h = { host: `127.0.0.1:${port}`, ...(data != null && !('content-type' in headers) ? { 'content-type': 'application/json' } : {}), ...headers };
  return new Promise((ok, fail) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: h }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
        ok({ status: res.statusCode, headers: res.headers, body: text, json });
      });
    });
    req.on('error', fail);
    if (data != null) req.write(data);
    req.end();
  });
}

/** An SSE subscription: `next(pred)` resolves with the first event { event, data } that matches. */
function subscribe() {
  const seen = [], waiters = [];
  let buf = '', res;
  const req = request({ host: '127.0.0.1', port, path: '/api/events', headers: { host: `127.0.0.1:${port}`, accept: 'text/event-stream' } }, (r) => {
    res = r;
    r.setEncoding('utf8');
    r.on('data', (c) => {
      buf += c;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = { event: 'message', data: null };
        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) ev.event = line.slice(7);
          else if (line.startsWith('data: ')) ev.data = JSON.parse(line.slice(6));
        }
        if (ev.data == null) continue;
        seen.push(ev);
        for (const wt of [...waiters]) if (wt.pred(ev)) { waiters.splice(waiters.indexOf(wt), 1); wt.ok(ev); }
      }
    });
  });
  req.end();
  return {
    seen,
    next(pred, ms = 5000) {
      const hit = seen.find(pred);
      if (hit) { seen.splice(seen.indexOf(hit), 1); return Promise.resolve(hit); }
      return new Promise((ok, fail) => {
        const wt = { pred, ok: (e) => { clearTimeout(timer); seen.splice(seen.indexOf(e), 1); ok(e); } };
        const timer = setTimeout(() => { waiters.splice(waiters.indexOf(wt), 1); fail(new Error(`no matching event in ${ms} ms; seen ${JSON.stringify(seen)}`)); }, ms);
        waiters.push(wt);
      });
    },
    close() { req.destroy(); res?.destroy(); },
  };
}

const storyFile = () => join(w.film, 'story.json');
const at = (value, beat = 0, scene = 'intro') => ({ op: 'beat.at', scene, beat, value });
const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));

test('it listens on 127.0.0.1 only', () => {
  assert.match(s.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(s.address, '127.0.0.1');
});

test('GET /api/piece: the piece, its text, story, version, generator, kind and formats', async () => {
  const r = await call('GET', '/api/piece');
  assert.equal(r.status, 200);
  const { text, version } = readStory(w.film);
  assert.equal(r.json.piece, `${w.dir.split('/').pop()}/kit-smoke/film`);
  assert.equal(r.json.text, text);
  assert.equal(r.json.version, version);
  assert.equal(r.json.story.id, 'kit-smoke-film');
  assert.equal(r.json.generator, null);
  assert.equal(r.json.kind, 'film');
  assert.deepEqual(r.json.formats, ['16x9', '9x16', '1x1']);
  assert.equal(r.json.patternsBase, `${w.dir.split('/').pop()}/kit-smoke/patterns`);
  assert.deepEqual(r.json.style, JSON.parse(readFileSync(join(w.film, 'style.json'), 'utf8')));
});

test('POST /api/edit: 200 with the receipt (who defaults to studio); 409 stale; 422 refused; 422 schema', async () => {
  const { version, text } = readStory(w.film);
  const ok = await call('POST', '/api/edit', { body: { version, edits: [at(0.3)], label: 'drag' } });
  assert.equal(ok.status, 200, ok.body);
  assert.equal(ok.json.receipt.who, 'studio');
  assert.equal(ok.json.receipt.label, 'drag');
  assert.equal(ok.json.version, readStory(w.film).version);
  assert.notEqual(readFileSync(storyFile(), 'utf8'), text);

  const stale = await call('POST', '/api/edit', { body: { version, edits: [at(0.4)] } });
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.json, { error: 'stale', version: ok.json.version, text: readFileSync(storyFile(), 'utf8') });

  const refused = await call('POST', '/api/edit', { body: { version: ok.json.version, edits: [at(0.5), at(5)] } });
  assert.equal(refused.status, 422);
  assert.equal(refused.json.error, 'refused');
  assert.equal(refused.json.code, 'out-of-range');
  assert.equal(refused.json.index, 1);
  assert.ok(refused.json.reason && refused.json.hint);

  const schema = await call('POST', '/api/edit', { body: { version: ok.json.version, edits: [{ ...at(0.5), extra: true }] } });
  assert.equal(schema.status, 422);
  assert.equal(schema.json.error, 'schema');
  assert.ok(Array.isArray(schema.json.errors) && schema.json.errors.length);

  const missing = await call('POST', '/api/edit', { body: { edits: [at(0.5)] } });
  assert.equal(missing.status, 400);
});

test('POST /api/undo: 200 restores; 404 with nothing to undo; 409 once the file changed', async () => {
  const before = readStory(w.film);
  const e = await call('POST', '/api/edit', { body: { version: before.version, edits: [at(0.7)] } });
  assert.equal(e.status, 200);
  const u = await call('POST', '/api/undo', { body: {} });
  assert.equal(u.status, 200, u.body);
  assert.equal(u.json.version, before.version);
  assert.equal(u.json.receipt.undoes, e.json.receipt.id);
  assert.equal(readFileSync(storyFile(), 'utf8'), before.text);

  const e2 = await call('POST', '/api/edit', { body: { version: before.version, edits: [at(0.8)] } });
  writeFileSync(storyFile(), readFileSync(storyFile(), 'utf8').replace('"duration": 3,', '"duration": 3.5,'));
  const changed = await call('POST', '/api/undo', { body: { receipt: e2.json.receipt.id } });
  assert.equal(changed.status, 409);
  assert.deepEqual(changed.json, { error: 'changed', version: readStory(w.film).version });
  const none = await call('POST', '/api/undo', { body: { receipt: 'r999-000000' } });
  assert.equal(none.status, 404);
  assert.equal(none.json.error, 'no-receipt');
});

test('GET/PUT /api/selection: kept in memory and in out/studio/selection.json', async () => {
  const empty = await call('GET', '/api/selection');
  assert.equal(empty.status, 200);
  assert.equal(empty.json, null);
  const sel = { path: '/scenes/1/beats/0', t: 3.4, format: '16x9' };
  const put = await call('PUT', '/api/selection', { body: sel });
  assert.equal(put.status, 200);
  assert.deepEqual((await call('GET', '/api/selection')).json, sel);
  assert.deepEqual(JSON.parse(readFileSync(join(w.film, 'out', 'studio', 'selection.json'), 'utf8')), sel);
  const bad = await call('PUT', '/api/selection', { body: { path: 3, t: 'x' } });
  assert.equal(bad.status, 400);
});

test('a Host that is not 127.0.0.1:<port> or localhost:<port> gets 403, on the API and on files', async () => {
  for (const host of ['evil.example', `evil.example:${port}`, '127.0.0.1', `127.0.0.1:${Number(port) + 1}`, `0.0.0.0:${port}`]) {
    assert.equal((await call('GET', '/api/piece', { headers: { host } })).status, 403, host);
    assert.equal((await call('GET', '/package.json', { headers: { host } })).status, 403, host);
  }
  assert.equal((await call('GET', '/api/piece', { headers: { host: `localhost:${port}` } })).status, 200);
});

test('a POST or PUT with a foreign Origin gets 403 and writes nothing; the studio\'s own origin passes', async () => {
  const { text, version } = readStory(w.film);
  for (const o of ['http://evil.example', `http://127.0.0.1:${Number(port) + 1}`, 'null']) {
    assert.equal((await call('POST', '/api/edit', { body: { version, edits: [at(0.9)] }, headers: { origin: o } })).status, 403, o);
    assert.equal((await call('PUT', '/api/selection', { body: { path: null, t: 0, format: '16x9' }, headers: { origin: o } })).status, 403, o);
  }
  assert.equal(readFileSync(storyFile(), 'utf8'), text);
  const own = await call('PUT', '/api/selection', { body: { path: null, t: 1, format: '16x9' }, headers: { origin } });
  assert.equal(own.status, 200);
  const local = await call('PUT', '/api/selection', { body: { path: null, t: 1, format: '16x9' }, headers: { origin: `http://localhost:${port}` } });
  assert.equal(local.status, 200);
});

test('a write must be JSON and at most 1 MB', async () => {
  const { version } = readStory(w.film);
  const plain = await call('POST', '/api/edit', { raw: JSON.stringify({ version, edits: [at(0.9)] }), headers: { 'content-type': 'text/plain' } });
  assert.equal(plain.status, 415);
  const form = await call('POST', '/api/edit', { raw: 'a=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(form.status, 415);
  const big = await call('POST', '/api/edit', { raw: `{"pad":"${'x'.repeat(1.1 * 1024 * 1024)}"}` });
  assert.equal(big.status, 413);
  const broken = await call('POST', '/api/edit', { raw: '{nope' });
  assert.equal(broken.status, 400);
});

test('files: served from the repo root by GET only; a path outside the root gets 403', async () => {
  const pkg = await call('GET', '/package.json');
  assert.equal(pkg.status, 200);
  assert.match(pkg.headers['content-type'], /json/);
  assert.equal((await call('GET', `/${w.dir.split('/').pop()}/kit-smoke/film/story.json`)).status, 200);
  for (const p of ['/..%2f..%2fetc%2fpasswd', '/%2e%2e/%2e%2e/etc/passwd', '/scripts/..%2f..%2f..%2fetc%2fhosts', '/.git/config']) {
    assert.equal((await call('GET', p)).status, 403, p);
  }
  assert.equal((await call('GET', '/no/such/file.js')).status, 404);
  assert.equal((await call('GET', '/%E0%A4%A')).status, 400);
  assert.equal((await call('POST', '/package.json', { body: {} })).status, 405);
  assert.equal((await call('DELETE', '/api/selection')).status, 405);
});

test('SSE: hello with the version; a studio write is "studio", a journal writer is its who, a plain write is "outside"', async () => {
  await settle();   // the last test's outside write is reported first: folded into one event with ours, it would make it "outside"
  const sub = subscribe();
  try {
    const hello = await sub.next((e) => e.event === 'hello');
    assert.equal(hello.data.version, readStory(w.film).version);

    const own = await call('POST', '/api/edit', { body: { version: hello.data.version, edits: [at(0.35)] } });
    assert.equal(own.status, 200);
    const e1 = await sub.next((e) => e.event === 'changed' && e.data.version === own.json.version);
    assert.equal(e1.data.by, 'studio');

    const cli = await editStory(w.film, { edits: [at(0.45)], version: own.json.version, who: 'agent-7' });
    const e2 = await sub.next((e) => e.event === 'changed' && e.data.version === cli.version);
    assert.equal(e2.data.by, 'agent-7');
    assert.equal(e2.data.receipt.id, cli.receipt.id);

    await writeFile(storyFile(), readFileSync(storyFile(), 'utf8').replace('"duration": 3,', '"duration": 3.75,'));
    const e3 = await sub.next((e) => e.event === 'changed' && e.data.by === 'outside');
    assert.equal(e3.data.version, readStory(w.film).version);
    assert.equal(e3.data.file, 'story.json');

    await writeFile(join(w.film, 'style.json'), `${readFileSync(join(w.film, 'style.json'), 'utf8')}\n`);
    const e4 = await sub.next((e) => e.event === 'changed' && e.data.file === 'style.json');
    assert.equal(e4.data.by, 'outside');

    await settle();
    assert.equal(sub.seen.filter((e) => e.event === 'changed' && e.data.file === 'story.json').length, 0, 'one event per change (duplicates folded)');
  } finally { sub.close(); }
});

test('two writers: the studio holds version A, the CLI writes B, the studio\'s save gets 409 (review focus 4)', async () => {
  const a = (await call('GET', '/api/piece')).json;
  const b = await editStory(w.film, { edits: [{ op: 'scene.duration', scene: 'outro', value: 3.25 }], version: a.version });
  const save = await call('POST', '/api/edit', { body: { version: a.version, edits: [at(0.55)] } });
  assert.equal(save.status, 409);
  assert.equal(save.json.version, b.version);
  assert.equal(save.json.text, readFileSync(storyFile(), 'utf8'));
  assert.match(save.json.text, /"duration": 3\.25/);
});

test('POST /api/check runs the gate for one format, one run at a time, and answers { exit, rules }', { timeout: 120_000 }, async () => {
  const bad = await call('POST', '/api/check', { body: { format: '4x5' } });
  assert.equal(bad.status, 422);
  const [r1, r2] = await Promise.all([call('POST', '/api/check', { body: { format: '16x9' } }), call('POST', '/api/check', { body: { format: '16x9' } })]);
  for (const r of [r1, r2]) {
    assert.equal(r.status, 200, r.body);
    assert.ok([0, 1].includes(r.json.exit), r.body);
    assert.ok(Array.isArray(r.json.rules) && r.json.rules.some((x) => x.id === 'G-TIME'));
  }
  assert.deepEqual(r1.json, r2.json, 'the second request joined the run in flight');
  assert.ok(existsSync(join(w.film, 'out', 'check.json')));
});

// ---- file serving, events and the story watcher ---------------------------------------------------

const storyEvents = (sub) => sub.seen.filter((e) => e.event === 'changed' && e.data.file === 'story.json');

test('.git is refused in any case, and through a symlink inside the root', async () => {
  for (const p of ['/.GIT/config', '/.Git/HEAD', '/.gIt/config', '/scripts/../.GIT/HEAD']) assert.equal((await call('GET', p)).status, 403, p);
  const link = join(w.dir, 'gitlink');
  symlinkSync(join(ROOT, '.git'), link);   // a folder in a clone, a file in a worktree: either is .git
  try { assert.equal((await call('GET', `/${w.dir.split('/').pop()}/gitlink`)).status, 403); } finally { rmSync(link); }
});

test('files carry frame protection: only this origin may frame the studio', async () => {
  const r = await call('GET', '/scripts/studio/ui/index.html');
  assert.equal(r.status, 200);
  assert.equal(r.headers['x-frame-options'], 'SAMEORIGIN');
  assert.match(r.headers['content-security-policy'], /frame-ancestors 'self'/);
});

test('SSE names the writer by receipt: two rapid studio edits, then a CLI undo, then an outside restore', async () => {
  const sub = subscribe();
  try {
    const v0 = (await sub.next((e) => e.event === 'hello')).data.version;
    const a = await call('POST', '/api/edit', { body: { version: v0, edits: [{ op: 'scene.duration', scene: 'intro', value: 3.1 }] } });
    const b = await call('POST', '/api/edit', { body: { version: a.json.version, edits: [{ op: 'scene.duration', scene: 'intro', value: 3.2 }] } });
    assert.equal(b.status, 200, b.body);
    const textB = readFileSync(storyFile(), 'utf8');
    const e1 = await sub.next((e) => e.event === 'changed' && e.data.version === b.json.version);
    assert.equal(e1.data.by, 'studio');
    assert.equal(e1.data.receipt.id, b.json.receipt.id);
    await settle();
    sub.seen.length = 0;

    const u = await undoReceipt(w.film, { who: 'cli' });   // back to a's version
    const e2 = await sub.next((e) => e.event === 'changed' && e.data.version === u.version);
    assert.equal(e2.data.by, 'cli', JSON.stringify(e2.data));
    assert.equal(e2.data.receipt.id, u.receipt.id);

    await writeFile(storyFile(), textB);   // an outside hand restores a version the studio once wrote
    const e3 = await sub.next((e) => e.event === 'changed' && e.data.version === b.json.version);
    assert.equal(e3.data.by, 'outside', JSON.stringify(e3.data));
    assert.equal(e3.data.receipt, undefined);
    await settle();
    assert.equal(storyEvents(sub).length, 0, 'one event per change');
  } finally { sub.close(); }
});

test('a story.json that does not parse: an unreadable event, 409 unreadable on the API, no absolute path', async () => {
  const sub = subscribe();
  const good = readFileSync(storyFile(), 'utf8');
  try {
    const { version } = (await sub.next((e) => e.event === 'hello')).data;
    await writeFile(storyFile(), good.slice(0, 200));
    const e1 = await sub.next((e) => e.event === 'changed' && e.data.file === 'story.json');
    assert.deepEqual({ ...e1.data, reason: undefined }, { version: null, by: 'outside', file: 'story.json', error: 'unreadable', reason: undefined });
    const piece = await call('GET', '/api/piece');
    assert.equal(piece.status, 409);
    assert.equal(piece.json.error, 'unreadable');
    assert.match(piece.json.reason, /story\.json/);
    assert.ok(!piece.body.includes(w.dir), piece.body);
    const edit = await call('POST', '/api/edit', { body: { version, edits: [at(0.5)] } });
    assert.equal(edit.status, 409);
    assert.equal(edit.json.error, 'unreadable');
    await writeFile(storyFile(), good);
    const e2 = await sub.next((e) => e.event === 'changed' && e.data.file === 'story.json');
    assert.equal(e2.data.version, version);
    assert.equal(e2.data.by, 'outside');
    rmSync(storyFile());
    const gone = await call('GET', '/api/piece');
    assert.equal(gone.status, 409);
    assert.match(gone.json.reason, /missing/);
    assert.ok(!gone.body.includes(w.dir), gone.body);
  } finally { writeFileSync(storyFile(), good); sub.close(); await settle(); }
});

test('the studio\'s receipts are always by studio; a client cannot name another author', async () => {
  const { version } = readStory(w.film);
  const spoof = await call('POST', '/api/edit', { body: { version, edits: [at(0.25)], who: 'cli' } });
  assert.equal(spoof.status, 400);
  assert.match(spoof.json.reason, /who/);
  const own = await call('POST', '/api/edit', { body: { version, edits: [at(0.25)], who: 'studio' } });
  assert.equal(own.status, 200, own.body);
  assert.equal(own.json.receipt.who, 'studio');
});

test('assets/ made after the start is watched; folders are not reported; same bytes give no event', async () => {
  const sub = subscribe();
  try {
    await sub.next((e) => e.event === 'hello');
    rmSync(join(w.film, 'assets'), { recursive: true, force: true });
    mkdirSync(join(w.film, 'assets', 'sub'), { recursive: true });
    await settle(150);
    writeFileSync(join(w.film, 'assets', 'sub', 'late.png'), 'z');
    const e = await sub.next((x) => x.event === 'changed' && x.data.file === 'assets/sub/late.png');
    assert.equal(e.data.by, 'outside');
    await settle(300);
    writeFileSync(join(w.film, 'assets', 'sub', 'late.png'), 'z');
    await settle(300);
    const files = sub.seen.filter((x) => x.event === 'changed').map((x) => x.data.file);
    assert.deepEqual(files.filter((f) => f === 'assets/sub/late.png'), [], 'same bytes: no event');
    assert.deepEqual(files.filter((f) => ['assets', 'assets/sub', 'assets/assets'].includes(f)), [], 'folders are not reported');
  } finally { sub.close(); rmSync(join(w.film, 'assets'), { recursive: true, force: true }); }
});

test('a selection must name a scene or beat of the story and one of its formats', async () => {
  for (const sel of [{ path: '/../../../etc', t: 0, format: null }, { path: '/scenes/99/beats/0', t: 0, format: null }, { path: '/scenes/0/beats/9', t: 0, format: null }, { path: '/scenes/0', t: 0, format: '4x5' }]) {
    const r = await call('PUT', '/api/selection', { body: sel });
    assert.equal(r.status, 400, JSON.stringify(sel));
  }
  for (const sel of [{ path: '/scenes/0', t: 0, format: '9x16' }, { path: '/scenes/1/beats/0', t: 1, format: null }, { path: null, t: 0, format: null }]) {
    assert.equal((await call('PUT', '/api/selection', { body: sel })).status, 200, JSON.stringify(sel));
  }
});

test('SSE clients are capped: past the cap, 503', async () => {
  const subs = Array.from({ length: 32 }, () => subscribe());
  try {
    await Promise.all(subs.map((x) => x.next((e) => e.event === 'hello')));
    const r = await call('GET', '/api/events');
    assert.equal(r.status, 503);
    assert.equal(r.json.error, 'too-many-clients');
  } finally { subs.forEach((x) => x.close()); await settle(); }
});

test('mm studio on a busy port says so in one line and exits 2; --port takes digits only; the URL encodes the piece', async () => {
  const busy = createServer().listen(0, '127.0.0.1');
  await new Promise((r) => busy.once('listening', r));
  try {
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'studio.mjs'), w.film, '--port', String(busy.address().port)], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(r.status, 2, `${r.signal} ${r.stderr}`);
    assert.equal(r.stderr.trim().split('\n').length, 1, r.stderr);
    assert.match(r.stderr, new RegExp(`port ${busy.address().port}`));
  } finally { busy.close(); }
  for (const p of ['1e3', '0x50', '-1', '80.5']) {
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'studio.mjs'), w.film, '--port', p], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(r.status, 2, p);
  }
  const odd = join(w.dir, 'a#b&c');
  cpSync(join(w.dir, 'kit-smoke'), odd, { recursive: true });
  const child = spawn(process.execPath, [join(ROOT, 'scripts', 'studio.mjs'), join(odd, 'film')], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const line = await new Promise((ok, fail) => { child.stdout.once('data', (d) => ok(String(d))); child.once('exit', (c) => fail(new Error(`exited ${c}`))); });
    const rel = `${w.dir.split('/').pop()}/a#b&c/film`;
    assert.ok(line.includes(`?piece=${encodeURIComponent(rel)}`), line);
  } finally { child.kill(); }
});

test('mm studio --open hands the printed URL to the platform opener; an opener that is missing or fails is a note, never an exit', async () => {
  if (process.platform === 'win32') return;   // the opener there is cmd's start; this test fakes open and xdg-open on PATH
  const bin = join(w.dir, 'fake-bin'), got = join(w.dir, 'opened.txt');
  mkdirSync(bin, { recursive: true });
  for (const name of ['open', 'xdg-open']) { writeFileSync(join(bin, name), `#!/bin/sh\nprintf '%s' "$1" > "${got}"\n`); chmodSync(join(bin, name), 0o755); }
  const run = async (PATH) => {
    const child = spawn(process.execPath, [join(ROOT, 'scripts', 'mm.mjs'), 'studio', w.film, '--open'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH } });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    const killer = setTimeout(() => child.kill('SIGKILL'), 15_000);
    try {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline && !(PATH.startsWith(bin) ? existsSync(got) : /open/i.test(out.split('\n').slice(2).join('\n')))) await new Promise((r) => setTimeout(r, 100));
      assert.equal(child.exitCode, null, `still serving: ${out}`);
      return out;
    } finally { clearTimeout(killer); child.kill(); }
  };
  const out = await run(`${bin}:${process.env.PATH}`);
  const url = /studio (http\S+)/.exec(out)?.[1];
  assert.ok(url, out);
  assert.equal(readFileSync(got, 'utf8'), url, 'the opener got the printed URL');
  const empty = join(w.dir, 'empty-bin'); mkdirSync(empty, { recursive: true });
  const note = await run(empty);
  assert.match(note, /could not open a browser/i, note);
});

test('a studio write that an outside hand reverts inside the watch debounce is still reported: studio, then outside', async () => {
  await settle();
  const sub = subscribe();
  try {
    const v0 = (await sub.next((e) => e.event === 'hello')).data.version;
    const before = readFileSync(storyFile(), 'utf8');
    const own = await call('POST', '/api/edit', { body: { version: v0, edits: [at(0.55)] } });
    assert.equal(own.status, 200, own.body);
    writeFileSync(storyFile(), before);   // within a few ms of the studio's write
    const e1 = await sub.next((e) => e.event === 'changed' && e.data.version === own.json.version);
    assert.equal(e1.data.by, 'studio');
    const e2 = await sub.next((e) => e.event === 'changed' && e.data.version === v0);
    assert.equal(e2.data.by, 'outside');
    await settle();
  } finally { sub.close(); }
});

test('a story.json replaced by a rename (an atomic write) is heard every time, and so is a plain write after it', async () => {
  await settle();
  const sub = subscribe();
  const good = readFileSync(storyFile(), 'utf8');
  const replace = (text) => { const tmp = join(w.film, '.story.json.tmp'); writeFileSync(tmp, text); renameSync(tmp, storyFile()); };
  try {
    await sub.next((e) => e.event === 'hello');
    for (const [i, write] of [replace, replace, (t) => writeFileSync(storyFile(), t)].entries()) {
      write(good.replace(/"duration": [\d.]+/, `"duration": ${(33 + i) / 10}`));
      const { version } = readStory(w.film);
      const e = await sub.next((x) => x.event === 'changed' && x.data.version === version);
      assert.equal(e.data.by, 'outside');
    }
  } finally { writeFileSync(storyFile(), good); sub.close(); await settle(); }
});

test('GET /api/piece names the story-schema problems of a story that parses (null when valid)', async () => {
  const good = readFileSync(storyFile(), 'utf8');
  assert.equal((await call('GET', '/api/piece')).json.invalid, null);
  writeFileSync(storyFile(), good.replace('"say": "The kit draws every frame from one number."', '"say": 42'));
  try {
    const r = await call('GET', '/api/piece');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.invalid) && r.json.invalid.length > 0, r.body);
    assert.match(JSON.stringify(r.json.invalid), /say/);
  } finally { writeFileSync(storyFile(), good); await settle(); }
});

test('GET /api/journal answers 200 with the receipts, an empty list when the piece has no journal', async () => {
  const r = await call('GET', '/api/journal');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.receipts));
  assert.ok(r.json.receipts.every((x) => typeof x.id === 'string'));
});

test('GET /api/piece without style.json is 409 unreadable, naming style.json, as the header says', async () => {
  const style = join(w.film, 'style.json');
  const text = readFileSync(style, 'utf8');
  rmSync(style);
  try {
    const r = await call('GET', '/api/piece');
    assert.equal(r.status, 409);
    assert.equal(r.json.error, 'unreadable');
    assert.match(r.json.reason, /style\.json/);
    assert.ok(!r.body.includes(w.dir), r.body);
  } finally { writeFileSync(style, text); await settle(); }
});

test('a server whose own code changed since it started says so (GET /api/piece codeStale), so the page can ask for a restart', async () => {
  const dir = join(w.dir, 'fake-code');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'ops.js'), 'export const v = 1;\n');
  const sv = await startStudio({ piece: w.film, codeRoots: [dir] });
  try {
    const get = async () => (await fetch(`${sv.url}/api/piece`)).json();
    assert.equal((await get()).codeStale, false);
    writeFileSync(join(dir, 'ops.js'), 'export const v = 2;\n');
    assert.equal((await get()).codeStale, true);
  } finally { await sv.close(); }
});

test('by default the server watches the studio\'s own code: scripts/studio, the edit service, the contracts', async () => {
  const body = await (await fetch(`${s.url}/api/piece`)).json();
  assert.equal(body.codeStale, false);
});
