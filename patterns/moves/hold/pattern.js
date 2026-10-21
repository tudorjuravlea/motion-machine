// moves/hold: the camera stays put. It exists so a story can say so on purpose (most beats hold)
// and so the gate and the lint see a named, listed move rather than a null.
export default {
  name: 'hold',
  group: 'moves',
  params: {},
  at() {
    // nothing moves, at any p
  },
};
