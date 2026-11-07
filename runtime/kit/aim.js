// Aim knobs: land a cue's duration, its apex and its pitch through the recipe's own fields, never by resampling.
// They live in synth.js (a recipe's `durS` is aimed as it is resolved, and a module graph has no cycles); this module
// is their name.
export { AIM_TOL, aim, estimatePitch, measureCue } from './synth.js';
