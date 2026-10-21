// screen/zoom-to: pushes in on a mark or a percent point inside the screen until it sits at the
// screen's centre at scale `s`, from wherever the screen's zoom was. The device stays where it is;
// only its picture is magnified, clipped by the screen.
export default {
  name: 'zoom-to',
  group: 'screen',
  dur: 'slow',
  params: {
    at: { type: 'string', default: '50%,50%', meaning: 'a mark label from media.json, or "x%,y%" of the screen' },
    s: { type: 'number', default: 1.6, meaning: 'the magnification at p = 1 (1 to 4)' },
  },
  reduce(state, p, ctx) {
    const flat = { ...state, zoom: { x: 0.5, y: 0.5, s: 1 } };
    const c = ctx.locate(flat, ctx.params.at);
    const s = Math.min(4, Math.max(1, Number(ctx.params.s) || 1));
    const e = ctx.ease('move', p);
    const z = state.zoom;
    return { ...state, zoom: { x: z.x + (c.x - z.x) * e, y: z.y + (c.y - z.y) * e, s: z.s + (s - z.s) * e } };
  },
};
