// Gate fixture stub: a caption group that simply fades in; enough for W-CAPTION to count groups.
export default {
  name: 'caption-karaoke',
  group: 'text',
  params: {},
  at(el, p) {
    el.style.opacity = String(Math.min(1, Math.max(0, p)));
  },
};
