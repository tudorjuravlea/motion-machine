// The pointer track a recorded session leaves beside its video (`<name>.cursor.json`): the recorder
// that builds it from a scripted session, and the cut that follows when the recording is trimmed.
// Pure; no browser. The shape is OpenScreen's cursor sidecar, version 2 (siddharthvaddem/openscreen,
// MIT, Copyright (c) 2025 Siddharth Vaddem; see NOTICE), with the surface it was recorded on and the
// boxes of what was clicked added: positions and boxes are 0..1 of the recorded surface.

/** Playwright's video begins about 40 ms after `newPage()` returns (measured over repeated runs: its first frame is that late). */
export const CLOCK_OFFSET_MS = 40;

const r5 = (n) => Math.round(n * 1e5) / 1e5;
const clamp01 = (n) => Math.min(1, Math.max(0, n));

export class TrackRecorder {
  /** @param {{ w: number, h: number }} surface the viewport that is recorded, in css px */
  constructor(surface) { this.surface = { w: surface.w, h: surface.h }; this.samples = []; this.targets = []; }

  /** A pointer sample at `timeMs` (video time; before the first frame is the first frame) at x, y css px. */
  sample(timeMs, x, y, { visible = true, type = 'arrow', kind = 'move' } = {}) {
    this.samples.push({ timeMs: Math.max(0, Math.round(timeMs)), cx: r5(clamp01(x / this.surface.w)), cy: r5(clamp01(y / this.surface.h)), visible, cursorType: type, interactionType: kind });
  }

  /** What a click landed on: its selector and its box (css px, x y width height) at the time. */
  target(timeMs, selector, box) {
    this.targets.push({ timeMs: Math.max(0, Math.round(timeMs)), selector, box: { x: r5(clamp01(box.x / this.surface.w)), y: r5(clamp01(box.y / this.surface.h)), w: r5(box.width / this.surface.w), h: r5(box.height / this.surface.h) } });
  }

  toJSON() {
    const by = (a, b) => a.timeMs - b.timeMs;
    return { version: 2, provider: 'none', surface: this.surface, samples: [...this.samples].sort(by), targets: [...this.targets].sort(by) };
  }
}

/**
 * A sidecar cut to the part of the recording from `startS` to `endS`: times run from the cut's first
 * frame, what happened before it is dropped except where the pointer stood at that moment (the last
 * sample before the cut is kept, at time 0), and what happens after is dropped. Pure; returns a new object.
 */
export function cutTrack(raw, startS, endS) {
  const a = startS * 1000, b = endS * 1000;
  const shift = (o) => ({ ...o, timeMs: Math.round(o.timeMs - a) });
  const samples = (raw.samples ?? []).filter((s) => s.timeMs <= b);
  const before = samples.filter((s) => s.timeMs < a), inside = samples.filter((s) => s.timeMs >= a);
  const held = before.length ? [{ ...shift(before.at(-1)), timeMs: 0 }] : [];
  return {
    ...raw,
    samples: [...held, ...inside.map(shift)],
    targets: (raw.targets ?? []).filter((g) => g.timeMs >= a && g.timeMs <= b).map(shift),
  };
}

/**
 * How far the script's clock runs ahead of the video's, from the sync flashes: each was shown at a
 * time on the script's clock (`shownMs`) and was first seen in the video at another (`seenMs`); the
 * mean of the differences is the offset. When a flash was not found the clock is estimated at
 * CLOCK_OFFSET_MS, the lag the recorder was measured to start with.
 */
export function flashOffset(shownMs, seenMs) {
  if (!shownMs.length || seenMs.length !== shownMs.length) return CLOCK_OFFSET_MS;
  return shownMs.reduce((sum, t, i) => sum + (t - seenMs[i]), 0) / shownMs.length;
}

/** A sidecar with every time `byMs` earlier (a time before the first frame is the first frame); a new object. */
export function shiftTrack(raw, byMs) {
  const move = (o) => ({ ...o, timeMs: Math.max(0, Math.round(o.timeMs - byMs)) });
  return { ...raw, samples: (raw.samples ?? []).map(move), targets: (raw.targets ?? []).map(move) };
}
