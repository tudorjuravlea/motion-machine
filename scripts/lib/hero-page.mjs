// The hero page `mm showcase --html` writes: one HTML file with the film inside it (a data URI, so it opens
// from anywhere and fetches nothing) that plays the film once and then idles on its last frame, floating
// gently and tilting toward the pointer (not on touch, and not at all under reduced motion). The page is
// not a piece: its idle runs on the viewer's clock, after the film, which is drawn from t like every film.
// The page's ground is the style's canvas role. The behaviour follows showcase's --html export (MIT, same
// author; see NOTICE): its idle float and hover-follow tuning.
const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** { html, bytes } for the film `mp4` (bytes), titled `title`, on the `canvas` colour (hex). */
export function heroPage({ mp4, title, canvas }) {
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(canvas))) throw new Error(`the hero page takes the canvas as a hex colour, not ${canvas}`);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
  html, body { margin: 0; height: 100%; background: ${canvas}; }
  body { display: grid; place-items: center; overflow: hidden; perspective: 1400px; }
  video { max-width: 100vw; max-height: 100vh; display: block; transform-style: preserve-3d; will-change: transform; }
</style>
</head>
<body>
<video autoplay muted playsinline preload="auto" src="data:video/mp4;base64,${Buffer.from(mp4).toString('base64')}"></video>
<script>
(() => {
  const v = document.querySelector('video');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FLOAT_Y = 8, FLOAT_TURN = 1.2, HOVER = 6, SPRING = 0.06;   // px, degrees, degrees, share per frame toward the pointer
  const aim = { x: 0, y: 0 }, at = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') return; aim.x = (e.clientX / innerWidth) * 2 - 1; aim.y = (e.clientY / innerHeight) * 2 - 1; });
  addEventListener('pointerleave', () => { aim.x = 0; aim.y = 0; });
  v.play().catch(() => addEventListener('pointerdown', () => v.play(), { once: true }));   // a browser that blocks autoplay plays on the first press
  v.addEventListener('ended', () => {
    if (still) return;
    const from = performance.now();
    const idle = (now) => {
      const s = (now - from) / 1000, ease = Math.min(1, s / 1.2);   // the float eases in from the film's last frame
      at.x += (aim.x - at.x) * SPRING; at.y += (aim.y - at.y) * SPRING;
      const y = Math.sin(s * 0.9) * FLOAT_Y * ease, turn = Math.sin(s * 0.6) * FLOAT_TURN * ease;
      v.style.transform = 'translateY(' + y.toFixed(2) + 'px) rotateY(' + (turn + at.x * HOVER).toFixed(3) + 'deg) rotateX(' + (-at.y * HOVER).toFixed(3) + 'deg)';
      requestAnimationFrame(idle);
    };
    requestAnimationFrame(idle);
  });
})();
</script>
</body>
</html>
`;
  return { html, bytes: Buffer.byteLength(html) };
}
