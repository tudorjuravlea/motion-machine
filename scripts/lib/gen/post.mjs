// After a picture or clip lands (SPEC §8): the brand's `imagery.tone`. `duotone` maps luma from the
// palette's ink to its canvas; `palette` is a gentle pull toward that same map (a quarter of it blended
// over the picture); `none` leaves the picture. Also the conversion of a picture to PNG and a clip to MP4
// when a provider returned another container. ffmpeg does it; the filter is built here, pure.

/** Share of the duotone blended over the picture by `palette`. */
export const PALETTE_PULL = 0.25;

/** [r, g, b] of #rgb or #rrggbb; null for anything else. */
function rgb(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** The ffmpeg graph from the input picture to `[v]` for a tone ("palette" or "duotone"), or null when the tone changes nothing or the style lacks ink and canvas. */
export function toneGraph(tone, color = {}, mediaKind = 'video') {
  const ink = rgb(color.ink), canvas = rgb(color.canvas);
  if ((tone !== 'duotone' && tone !== 'palette') || !ink || !canvas) return null;
  const ch = (i) => `${ink[i]}+(${canvas[i]}-${ink[i]})*val/maxval`;
  const map = `format=gray,format=gbrp,lutrgb=r='${ch(0)}':g='${ch(1)}':b='${ch(2)}'`;
  const end = mediaKind === 'image' ? 'format=rgb24' : 'format=yuv420p';   // a picture stays RGB: no round trip through limited-range video
  if (tone === 'duotone') return `[0:v]${map},${end}[v]`;
  return `[0:v]format=gbrp,split[a][b];[b]${map}[d];[a][d]blend=all_mode=normal:all_opacity=${PALETTE_PULL},${end}[v]`;
}

/** What the sidecar records about a tone pass. */
export const toneRecord = (tone, color = {}) => (toneGraph(tone, color) ? { tone, from: color.ink, to: color.canvas, ...(tone === 'palette' ? { pull: PALETTE_PULL } : {}) } : null);

/**
 * ffmpeg arguments that write `output` (a PNG, or an MP4) from `input`, through the tone graph when there is one.
 * A picture is one frame; a clip is re-encoded once (H.264, yuv420p) and keeps its sound.
 */
export function finishArgs({ input, output, mediaKind, tone, color }) {
  const graph = toneGraph(tone, color, mediaKind);
  const filter = graph ? ['-filter_complex', graph, '-map', '[v]'] : [];
  if (mediaKind === 'image') return ['-i', input, ...filter, '-frames:v', '1', '-c:v', 'png', '-f', 'image2', output];
  return ['-i', input, ...filter, ...(graph ? ['-map', '0:a?'] : []), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-f', 'mp4', output];
}
