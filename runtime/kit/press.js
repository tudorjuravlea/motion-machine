// The deck's press model, without a DOM (SPEC §10). A press is the unit; a rest is an integer position.
//   Next    from a rest, the rest after it; under way, the end of that press; on the final pose, nothing.
//   Back    under way, the rest the step began from (the step restarts); at a rest, the rest before; never below 0.
//   a jump  a hash, ?press= or goto() lands on a rest and plays nothing: only a Next that is animated plays a press's cues.
// Reduced motion is the reader's preference (prefers-reduced-motion) or the style's (`motion.reduceMotion: "always"`).
// The idea of a latched jump against a resume, and of Back restarting the slide it is in, is Motion Canvas's presenter (NOTICE).

/** The rest a Next lands on from position `x` in a deck of `presses`, or null when there is none. */
export function nextRest(x, presses) {
  if (!Number.isInteger(x)) return Math.min(presses, Math.ceil(x));
  return x >= presses ? null : x + 1;
}

/** The rest a Back lands on from position `x`: the start of the step it is in, else the rest before. */
export function prevRest(x) {
  return Number.isInteger(x) ? Math.max(0, x - 1) : Math.max(0, Math.floor(x));
}

/** The rest a page address names in a deck of `presses`: `?press=n` (rounded, clamped), else a numeric `#n`, else null. */
export function pressFromLocation(search, hash, presses) {
  const clamp = (n) => Math.min(presses, Math.max(0, Math.round(n)));
  const asked = new URLSearchParams(search).get('press');
  if (asked != null && asked.trim() !== '' && Number.isFinite(Number(asked))) return clamp(Number(asked));
  const m = /^#(\d+)$/.exec(hash ?? '');
  return m ? clamp(Number(m[1])) : null;
}

/** Whether a deck draws without movement: the reader's preference, or a style that asks for it always. */
export function reducedMotion(style, prefers) {
  return Boolean(prefers) || style?.motion?.reduceMotion === 'always';
}

/** The sprite events ({ press, at, key }) a press plays, in the order they sound; rest 0 plays none. */
export function cuesOfPress(events, press) {
  if (!events || !(press >= 1)) return [];
  return events.filter((e) => e.press === press).sort((a, b) => a.at - b.at);
}
