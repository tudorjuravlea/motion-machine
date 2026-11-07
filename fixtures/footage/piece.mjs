// A footage piece for the browser tests, built in a git-ignored scratch folder at the repository's
// depth: the synthetic recording (make.sh), its frames (mm media prep, 30 fps), its edit with the
// fixture words (mm footage cut --words), a shipped preset as the style, and a story the caller
// writes from the edit. `story(edit)` returns the story object; `cleanup()` removes the folder.
// cutoutPiece does the same for the matte fixture, with its person matte.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

const indexHtml = (preset) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>footage piece</title></head>
<body>
  <script type="module">
    import { mount } from '../../runtime/kit/kit.js';
    const load = (f) => fetch(new URL(f, import.meta.url)).then((r) => r.json());
    const [story, style] = await Promise.all([load('story.json'), load('../../styles/presets/${preset}.json')]);
    for (const face of Object.values(style.type)) for (const f of face.files) f.src = '../../' + f.src;
    await mount({ story, style, patternsBase: new URL('../../patterns/', import.meta.url) });
  </script>
</body>
</html>
`;

function mm(args) {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/mm.mjs'), ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`mm ${args.join(' ')}: ${r.stdout}${r.stderr}`);
}

export function footagePiece(tag, story, { preset = 'editorial', env = {} } = {}) {
  const tmp = join(ROOT, `.tmp-footage-${tag}-${process.pid}`);
  const dir = join(tmp, 'piece');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const r = spawnSync('sh', [join(HERE, 'make.sh'), tmp], { encoding: 'utf8', env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`make.sh: ${r.stderr}`);
  const video = join(tmp, 'talk.mp4');
  mm(['media', 'prep', video, '--name', 'talk', '--piece', dir]);
  mm(['footage', 'cut', video, '--name', 'talk', '--piece', dir, '--words', join(HERE, 'words.json')]);
  const edit = JSON.parse(readFileSync(join(dir, 'assets/talk/edit.json'), 'utf8'));
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story(edit), null, 2));
  writeFileSync(join(dir, 'index.html'), indexHtml(preset));
  return { dir, edit, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

/** In the page: the source frame index burned into a footage picture (ten cells along the top, bit 0 left). */
export function readBarcode(selector) {
  const img = document.querySelector(selector);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const k = img.naturalWidth / 360;
  let n = 0;
  for (let b = 0; b < 10; b++) if (g.getImageData(Math.round((b * 36 + 18) * k), Math.round(20 * k), 1, 1).data[0] > 128) n |= 1 << b;
  return n;
}

/**
 * A cut-out piece: the matte fixture (make-matte.sh: a red disc travelling over grey, with supplied
 * masks), its frames, its edit (one clip) and its matte from those masks (mm footage matte --masks),
 * at the repository's depth like footagePiece. The asset is named `shape`.
 */
export function cutoutPiece(tag, story, { preset = 'nocturne-kinetic' } = {}) {
  const tmp = join(ROOT, `.tmp-cutout-${tag}-${process.pid}`);
  const dir = join(tmp, 'piece');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const r = spawnSync('sh', [join(HERE, 'make-matte.sh'), tmp], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`make-matte.sh: ${r.stderr}`);
  const video = join(tmp, 'shape.mp4');
  mm(['media', 'prep', video, '--name', 'shape', '--piece', dir]);
  mm(['footage', 'cut', video, '--name', 'shape', '--piece', dir]);
  mm(['footage', 'matte', '--name', 'shape', '--piece', dir, '--masks', join(tmp, 'masks')]);
  const edit = JSON.parse(readFileSync(join(dir, 'assets/shape/edit.json'), 'utf8'));
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story(edit), null, 2));
  writeFileSync(join(dir, 'index.html'), indexHtml(preset));
  return { dir, edit, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}
