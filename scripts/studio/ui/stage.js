// The stage: the piece in an iframe (index.html?format=&t=), scaled to fit and letterboxed. The
// selection outline is drawn in the studio's document from mm.report() boxes, never inside the
// piece. A reload loads a second iframe behind the first and swaps when it has mounted, so the
// stage never flashes empty. A click picks the smallest visible element under the pointer.

// the kit's viewports (runtime/kit/kit.js FORMATS, scripts/lib/browser.mjs VIEWPORTS); importing kit.js
// here would load the kit's runtime into the studio's own document
const SIZES = { '9x16': [1080, 1920], '1x1': [1080, 1080], '4x5': [1080, 1350], '16x9': [1920, 1080] };

export function createStage(root, { onPick }) {
  const hit = root.querySelector('.stage-hit');
  const outline = root.querySelector('.stage-outline');
  const message = root.querySelector('.stage-message');
  let frame = null, size = SIZES['16x9'], fit = { s: 1, x: 0, y: 0 }, outlined = null, loadSeq = 0;

  function layout() {
    const W = root.clientWidth, H = root.clientHeight, [w, h] = size;
    const s = Math.min(W / w, H / h) || 1;
    fit = { s, x: Math.round((W - w * s) / 2), y: Math.round((H - h * s) / 2) };
    for (const f of root.querySelectorAll('iframe')) Object.assign(f.style, { width: `${w}px`, height: `${h}px`, transform: `translate(${fit.x}px, ${fit.y}px) scale(${s})` });
    Object.assign(hit.style, { left: `${fit.x}px`, top: `${fit.y}px`, width: `${w * s}px`, height: `${h * s}px` });
    drawOutline();
  }
  new ResizeObserver(layout).observe(root);

  const mm = () => frame?.contentWindow?.mm?.ready ? frame.contentWindow.mm : null;

  /** Loads the piece at `t`; resolves with its mm once mounted (or throws with the kit's error). */
  async function load({ piece, format, t }) {
    const seq = ++loadSeq;
    size = SIZES[format] ?? SIZES['16x9'];
    const next = document.createElement('iframe');
    next.title = 'The piece';
    next.tabIndex = -1;
    next.className = 'stage-frame loading';
    next.src = `/${piece}/index.html?${new URLSearchParams({ format, t: String(Math.max(0, t)) })}`;
    root.insertBefore(next, hit);
    layout();
    const win = await new Promise((ok) => next.addEventListener('load', () => ok(next.contentWindow), { once: true }));
    for (let i = 0; i < 600 && !(win.mm && win.mm.ready !== undefined); i++) await new Promise((r) => setTimeout(r, 25));
    if (seq !== loadSeq) { next.remove(); return null; }   // a newer load won
    if (!win.mm || win.mm.ready === false) {
      next.remove();
      message.textContent = `The piece did not mount: ${String(win.mm?.error ?? 'no mm').split('\n')[0]}`;
      message.hidden = false;
      throw new Error(message.textContent);
    }
    message.hidden = true;
    frame?.remove();
    frame = next;
    frame.classList.remove('loading');
    layout();
    return win.mm;
  }

  function seek(t) {
    const m = mm();
    if (!m) return;
    m.seek(t);
    drawOutline();
  }

  /** The box of `selector` in stage pixels (from mm.report(), else the element itself), or null. */
  function boxOf(selector) {
    const m = mm();
    if (!m || !selector) return null;
    let b = m.report().elements.find((e) => e.selector === selector && e.visible)?.box;
    if (!b) {
      const el = frame.contentDocument.querySelector(selector);
      const r = el?.getBoundingClientRect();
      if (r && r.width && r.height) b = { x: r.x, y: r.y, w: r.width, h: r.height };
    }
    return b ?? null;
  }

  function drawOutline() {
    const b = boxOf(outlined);
    outline.hidden = !b;
    if (!b) return;
    Object.assign(outline.style, { left: `${fit.x + b.x * fit.s}px`, top: `${fit.y + b.y * fit.s}px`, width: `${b.w * fit.s}px`, height: `${b.h * fit.s}px` });
  }

  function outlineSelector(selector) { outlined = selector ?? null; drawOutline(); }

  hit.addEventListener('click', (e) => {
    const m = mm();
    if (!m) return;
    const r = hit.getBoundingClientRect();
    const x = (e.clientX - r.left) / fit.s, y = (e.clientY - r.top) / fit.s;
    const under = m.report().elements.filter((el) => el.visible && x >= el.box.x && x <= el.box.x + el.box.w && y >= el.box.y && y <= el.box.y + el.box.h);
    under.sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h);
    onPick(under[0]?.selector ?? null);
  });

  return { load, seek, outline: outlineSelector, get mm() { return mm(); } };
}
