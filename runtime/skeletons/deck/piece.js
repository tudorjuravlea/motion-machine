// Mounts the piece: story.json and style.json beside this file, the kit and the pattern library
// from the repo. The import path assumes the piece lives at pieces/<id>/ (as `mm new` places it).
// Keep this file free of clocks, timers and unseeded randomness (G-TIME): the kit draws every
// frame from t alone.
import { mount } from '../../runtime/kit/kit.js';

const load = async (f) => {
  const r = await fetch(new URL(f, import.meta.url));
  if (!r.ok) throw new Error(`${f}: ${r.status}`);
  return r.json();
};
const [story, style] = await Promise.all([load('story.json'), load('style.json')]);
await mount({ story, style });
