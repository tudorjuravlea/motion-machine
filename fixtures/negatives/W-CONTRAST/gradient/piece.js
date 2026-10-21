// Mounts the piece: story.json and style.json beside this file, the kit and the pattern library
// from the repo. The kit import below was written by `mm new` for where this piece lives; if the folder moves, fix it.
// Keep this file free of clocks, timers and unseeded randomness (G-TIME): the kit draws every
// frame from t alone.
import { mount } from '../../../../runtime/kit/kit.js';

const load = (f) => fetch(new URL(f, import.meta.url)).then((r) => r.json());
const [story, style] = await Promise.all([load('story.json'), load('style.json')]);
await mount({ story, style });
