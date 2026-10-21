// mm doctor: verifies Node >= 22, Playwright's Chromium, ffmpeg >= 6 and ffprobe. Never installs
// anything (SPEC §8). Exit 0 when all are present, 2 naming each missing tool.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { toolVersion } from './lib/ffmpeg.mjs';
import { runMain } from './lib/cli.mjs';

export async function doctor() {
  const rows = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  rows.push({ tool: 'node', ok: nodeMajor >= 22, detail: `v${process.versions.node}`, fix: 'install Node 22 or newer' });

  let chromiumPath = null;
  try { chromiumPath = chromium.executablePath(); } catch { /* not resolvable */ }
  rows.push({ tool: 'chromium', ok: !!chromiumPath && existsSync(chromiumPath), detail: chromiumPath ?? 'not installed', fix: 'run `npx playwright install chromium` (mm never installs it)' });

  const ff = toolVersion('ffmpeg');
  rows.push({ tool: 'ffmpeg', ok: ff.ok && (ff.major == null || ff.major >= 6), detail: ff.ok ? ff.version : 'not found on PATH', fix: ff.ok ? 'ffmpeg 6 or newer is required' : 'install ffmpeg 6 or newer (macOS: brew install ffmpeg)' });
  const fp = toolVersion('ffprobe');
  rows.push({ tool: 'ffprobe', ok: fp.ok, detail: fp.ok ? fp.version : 'not found on PATH', fix: 'ships with ffmpeg; install ffmpeg 6 or newer' });

  for (const r of rows) console.log(`${r.ok ? 'ok     ' : 'MISSING'}  ${r.tool.padEnd(9)} ${r.detail}${r.ok ? '' : `  → ${r.fix}`}`);
  const missing = rows.filter((r) => !r.ok);
  if (missing.length) {
    console.error(`\nmm doctor: missing ${missing.map((r) => r.tool).join(', ')}`);
    return 2;
  }
  console.log('\nAll tools present.');
  return 0;
}

runMain(import.meta, doctor);
