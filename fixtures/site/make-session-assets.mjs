// Assets for the session demos (patterns/screen/pointer/demo, patterns/devices/demo-frame/demo), made with the
// capture and media CLIs from fixtures/site/demo-session.html and its steps: the scripted session is recorded in a
// scratch folder, then cut again at a small size (640 px wide, 8 frames a second) so what is committed stays
// light: frames, media.json and the pointer track cursor.json beside them. Committed, so `mm pattern stills`
// needs no browser session; re-run after changing the page or its steps:  node fixtures/site/make-session-assets.mjs
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MM = join(ROOT, 'scripts', 'mm.mjs');
const run = (args) => { const r = spawnSync(process.execPath, [MM, ...args], { encoding: 'utf8' }); if (r.status !== 0) throw new Error(`mm ${args.slice(0, 2).join(' ')} failed: ${r.stdout}${r.stderr}`); return r; };

const tmp = mkdtempSync(join(tmpdir(), 'mm-session-assets-'));
try {
  run(['capture', 'site', '--url', pathToFileURL(join(ROOT, 'fixtures/site/demo-session.html')).href, '--name', 'plan', '--piece', tmp, '--device', 'laptop', '--script', join(ROOT, 'fixtures/site/demo-session.steps.json')]);
  const { sync } = JSON.parse(readFileSync(join(tmp, 'assets/plan.cursor.json'), 'utf8'));
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(tmp, 'assets/plan.webm')], { encoding: 'utf8' });
  const end = Number(probe.stdout.trim()).toFixed(3);
  for (const n of ['screen/pointer', 'devices/demo-frame']) {
    run(['media', 'prep', join(tmp, 'assets/plan.webm'), '--name', 'plan', '--piece', join(ROOT, 'patterns', n, 'demo'), '--fps', '8', '--fit', '640x400', '--quality', '60', '--trim', `${sync.cutS}-${end}`]);
    writeFileSync(join(ROOT, 'patterns', n, 'demo', 'assets', 'plan.licence.json'), `${JSON.stringify({ source: 'own', licence: 'own' }, null, 2)}\n`);
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
