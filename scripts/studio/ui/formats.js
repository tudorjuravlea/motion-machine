// The film formats as the studio names them: each with the platforms it is for
// and its output size (SPEC §12), in the order a story writes them (9x16, 1x1, 4x5, 16x9; ops.js
// story.formats). The switch shows every one side by side, whatever the piece ships; Export adds a format to the piece when it renders it.
import { h } from './dom.js';

export const FORMATS = [
  { id: '9x16', name: 'Vertical', where: 'Instagram Reels & Stories, TikTok, YouTube Shorts, LinkedIn vertical', size: '1080×1920' },
  { id: '1x1', name: 'Square', where: 'Instagram & LinkedIn post (square)', size: '1080×1080' },
  { id: '4x5', name: 'Portrait', where: 'Instagram & LinkedIn post (best on phones)', size: '1080×1350' },
  { id: '16x9', name: 'Landscape', where: 'YouTube, LinkedIn, presentations', size: '1920×1080' },
];
export const FORMAT_ORDER = FORMATS.map((f) => f.id);
const BY_ID = Object.fromEntries(FORMATS.map((f) => [f.id, f]));

export const formatInfo = (id) => BY_ID[id] ?? { id, name: id, where: '', size: '' };
/** "9×16" */
export const formatShort = (id) => id.replace('x', '×');
/** A one-line description: "Vertical: Instagram Reels & Stories, TikTok, YouTube Shorts (1080×1920)";
 *  a format the piece does not ship yet says how it gets in (Export adds what it renders). */
export const formatTitle = (id, shipped = true) => { const f = formatInfo(id); return `${f.name}: ${f.where} (${f.size})${shipped ? '' : '. Not exported yet: tick it in Export to add it to the piece'}`; };

/** A small outline of the frame's shape, so the formats read at a glance. */
export function frameGlyph(id) {
  const [w, hh] = id.split('x').map(Number), k = 12 / Math.max(w, hh);
  const g = h('span', 'fmt-glyph', { 'aria-hidden': 'true' });
  g.style.width = `${Math.round(w * k)}px`;
  g.style.height = `${Math.round(hh * k)}px`;
  return g;
}
