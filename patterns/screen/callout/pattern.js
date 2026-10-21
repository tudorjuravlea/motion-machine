// screen/callout: a leader line from a mark on the screen to a label beside the device. The line
// draws on over the first 35 %, the label fades in from 25 %, both hold, and both fade over the last
// 15 %. The mark is found through the screen state of the same seek, then through the screen's live
// box on the page, so the line follows the device through its own moves. It draws outside the
// screen (outside: true): the kit gives it a fresh overlay in the device's slot on every seek.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r1 = (x) => Math.round(x * 10) / 10;

export default {
  name: 'callout',
  group: 'screen',
  dur: 'hold',
  outside: true,
  holds: true,   // in a deck the finished callout shows at its rest
  params: {
    at: { type: 'string', default: '50%,50%', meaning: 'a mark label from media.json, or "x%,y%" of the screen' },
    text: { type: 'string', default: '', meaning: 'the label, a few words' },
    side: { type: 'enum', values: ['auto', 'left', 'right'], default: 'auto', meaning: 'the side of the device the label sits on; auto picks the roomier one' },
  },
  reduce(state) { return state; },
  draw(el, p, ctx) {
    const host = ctx.host();                       // { w, h } of the slot, and the screen's box in it
    const pt = ctx.toHost(ctx.at(ctx.params.at));  // the mark, in slot px
    const scr = host.screen;
    const roomR = host.w - (scr.x + scr.w), roomL = scr.x;
    const side = ctx.params.side === 'left' || ctx.params.side === 'right' ? ctx.params.side : roomR >= roomL ? 'right' : 'left';
    const gap = ctx.unit * 0.5;
    const ax = side === 'right' ? scr.x + scr.w + gap : scr.x - gap;
    const draw = clamp01(p / 0.35), label = clamp01((p - 0.25) / 0.25), out = ctx.deck ? 1 : 1 - clamp01((p - 0.85) / 0.15);
    // the label: beside the screen where it fits; else as near the point as the frame allows, never over it
    el.innerHTML = '<span class="callout__label"></span>';
    const lab = el.querySelector('.callout__label');
    lab.textContent = String(ctx.params.text ?? '');
    const w = lab.offsetWidth;
    const fits = (x) => x >= gap && x + w <= host.w - gap;
    let lx = side === 'right' ? ax : ax - w;
    if (!fits(lx)) lx = fits(pt.x + gap) ? pt.x + gap : fits(pt.x - gap - w) ? pt.x - gap - w : Math.min(host.w - gap - w, Math.max(gap, lx));
    const right = lx >= pt.x;
    const x2 = right ? lx : lx + w;
    const len = Math.abs(x2 - pt.x) + 1;
    el.insertAdjacentHTML('afterbegin', `<svg class="callout__line" width="${r1(host.w)}" height="${r1(host.h)}" viewBox="0 0 ${r1(host.w)} ${r1(host.h)}" aria-hidden="true">`
      + `<circle class="callout__dot" cx="${r1(pt.x)}" cy="${r1(pt.y)}" r="${r1(gap * 0.18)}"/>`
      + `<line x1="${r1(pt.x)}" y1="${r1(pt.y)}" x2="${r1(x2)}" y2="${r1(pt.y)}" stroke-dasharray="${r1(len)}" stroke-dashoffset="${r1(len * (1 - ctx.ease('enter', draw)))}"/></svg>`);
    lab.style.left = `${r1(lx)}px`;
    lab.style.top = `${r1(pt.y)}px`;
    lab.style.opacity = String(Math.round(ctx.ease('enter', label) * out * 1000) / 1000);
    el.querySelector('svg').style.opacity = String(Math.round(out * 1000) / 1000);
  },
};
