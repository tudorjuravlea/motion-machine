// The pure part of the gate's shared readings (no Node built-in, no package), so the schedule-only
// rules load in a browser (the studio). scripts/check/_lib.mjs re-exports all of it.

export const EPS = 1e-9;
export const round = (x, n = 3) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 10 ** n) / 10 ** n : x);
export const words = (s) => (s ? String(s).trim().split(/\s+/).filter(Boolean).length : 0);
export const banActive = (style, name) => (style.bans ?? []).includes(name) && !(style.allow ?? []).includes(name);
