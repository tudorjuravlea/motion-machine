// transitions/hard-cut: the incoming scene replaces the outgoing one in one frame. A hard cut takes
// 0 s, so the kit never calls at() mid-way and nothing is ever written to either section.
export default {
  name: 'hard-cut',
  group: 'transitions',
  params: {},
  dur: 0,
  at() {},
};
