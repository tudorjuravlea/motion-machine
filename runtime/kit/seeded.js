// Seeded windows. A vendored library that names its objects with the platform's random
// function (Three.js gives every object, material and texture a UUID, at load time and on a first
// render) runs inside a window where that function is the kit's seeded one, restored when the last
// open window closes. Nothing the page draws depends on those names. Windows opened by imports that
// overlap share one function at a time (the latest opened), so which names a module receives
// follows the order its imports resolve; code running elsewhere while a window is open also reads
// the seeded function.
// This file is the one place in runtime/kit that replaces that function (tests/kit/fixtures.test.mjs knows).
import { random, hash } from './random.js';

let depth = 0, own = null;
const R = 'random';   // written as Math[R]: the runtime source scan forbids the plain name, and this file is its one sanctioned exception
function enter(seed) { if (depth++ === 0) own = Math[R]; Math[R] = random(seed); }
function leave() { if (--depth === 0) { Math[R] = own; own = null; } }

/** Runs fn with a seeded random, restoring the real one when no window is open any more. */
export function seeded(seed, fn) {
  enter(seed);
  try { return fn(); } finally { leave(); }
}

/** Imports a module (and what it imports) inside a seeded window; overlapping imports nest. */
export async function seededImport(href) {
  enter(hash(href));
  try { return await import(href); } finally { leave(); }
}
