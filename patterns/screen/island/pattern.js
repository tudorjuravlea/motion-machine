// screen/island: the device's cutout (a phone's island, a laptop's camera notch, the desktop
// stage's notch: whatever carries data-island) grows into a widget with a line of text, and with
// `close` shrinks back to rest. Width and height spring on separate curves when opening (width on
// the ui spring, height on the heavier one), and both ease out with no overshoot when closing.
// Every action starts from the island's incoming size, so a reopen that begins mid-close carries on
// from where the island is: the fold makes the island's shape a function of the whole
// action history. paint() draws the state on every seek, so an open island stays open.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const between = (x, a, b) => Math.min(b, Math.max(a, Number(x)));

export default {
  name: 'island',
  group: 'screen',
  dur: 'slow',
  params: {
    w: { type: 'number', default: 0.86, meaning: 'open width as a fraction of the screen width (0.31 to 0.96)' },
    h: { type: 'number', default: 0.12, meaning: 'open height as a fraction of the screen height (0.035 to 0.4)' },
    text: { type: 'string', default: '', meaning: 'the line shown inside once the island is open' },
    close: { type: 'boolean', default: false, meaning: 'shrink back to rest instead of opening' },
  },
  reduce(state, p, ctx) {
    const rest = ctx.islandRest ?? { w: 0.31, h: 0.035 };
    const from = state.island ?? { w: rest.w, h: rest.h, text: '', reveal: 0 };
    const closing = ctx.params.close === true || ctx.params.close === 'true';
    const to = closing ? { w: rest.w, h: rest.h } : { w: between(ctx.params.w ?? 0.86, 0.31, 0.96), h: between(ctx.params.h ?? 0.12, 0.035, 0.4) };
    let ew, eh;
    if (p >= 1) ew = eh = 1;
    else if (closing) ew = eh = ctx.ease('exit', p);
    else { const u = p * ctx.d; ew = ctx.spring(u, 'ui'); eh = ctx.spring(u, 'heavy'); }
    const island = { w: ew === 1 ? to.w : from.w + (to.w - from.w) * ew, h: eh === 1 ? to.h : from.h + (to.h - from.h) * eh };
    if (closing) { island.text = p >= 1 ? '' : from.text; island.reveal = from.reveal * (1 - clamp01(p / 0.3)); }
    else { island.text = String(ctx.params.text ?? ''); island.reveal = p >= 1 ? 1 : clamp01((eh - 0.6) / 0.4); }
    return { ...state, island };
  },
  paint(screenEl, state, ctx) {
    const el = screenEl.querySelector('[data-island]') ?? screenEl.closest('[data-device]')?.querySelector('[data-island]');
    if (!el) return;
    const text = el.querySelector('.island__text');
    const s = state.island;
    if (!s) { el.style.removeProperty('width'); el.style.removeProperty('height'); el.style.removeProperty('border-radius'); if (text) text.textContent = ''; return; }
    const w = s.w * ctx.box.w, h = s.h * ctx.box.h;
    el.style.width = `${Math.round(w * 100) / 100}px`;
    el.style.height = `${Math.round(h * 100) / 100}px`;
    el.style.borderRadius = `${Math.round(Math.min(h / 2, ctx.box.w * 0.07) * 100) / 100}px`;
    if (text) {
      text.textContent = s.text ?? '';
      text.style.opacity = String(Math.round((s.reveal ?? 0) * 1000) / 1000);
    }
  },
};
