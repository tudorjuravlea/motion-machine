// The play clock (as in scripts/lib/serve-page.html, SPEC §2.9): it lives in the studio, never in
// the piece, and only ever calls seek(t). J/K/L shuttle (each press of J or L doubles the speed in its
// direction, K stops), frame and second steps, Home/End, and I/O marks that loop playback between them.

export const FPS = 30;

export function createTransport({ onTime }) {
  let t = 0, rate = 0, duration = 0, last = 0, raf = 0;
  const marks = { in: null, out: null };

  const clamp = (x) => Math.min(duration, Math.max(0, x));
  const span = () => (marks.in != null && marks.out != null && marks.out > marks.in ? [marks.in, marks.out] : [0, duration]);

  function set(x, { keepPlaying = false } = {}) {
    t = clamp(x);
    if (!keepPlaying) stop();
    onTime(t);
  }

  function tick(now) {
    raf = 0;
    if (!rate) return;
    const [a, b] = span();
    let x = t + ((now - last) / 1000) * rate;
    last = now;
    if (rate > 0 && x >= b) x = a + ((x - a) % Math.max(1e-6, b - a));
    if (rate < 0 && x <= a) x = b - ((a - x) % Math.max(1e-6, b - a));
    t = clamp(x);
    onTime(t);
    raf = requestAnimationFrame(tick);
  }

  function play(r) {
    rate = r;
    last = performance.now();
    const [a, b] = span();
    if (rate > 0 && t >= b - 1e-6) t = a;
    if (rate < 0 && t <= a + 1e-6) t = b;
    if (!raf) raf = requestAnimationFrame(tick);
    onTime(t);
  }
  function stop() { rate = 0; if (raf) cancelAnimationFrame(raf); raf = 0; }

  return {
    get t() { return t; },
    get playing() { return rate !== 0; },
    get rate() { return rate; },
    marks,
    setDuration(d) { duration = d; if (t > d) set(d); },
    seek: (x) => set(x),
    toggle() { if (rate) { stop(); onTime(t); } else play(1); },
    forward() { play(rate > 0 ? Math.min(rate * 2, 8) : 1); },
    backward() { play(rate < 0 ? Math.max(rate * 2, -8) : -1); },
    pause() { stop(); onTime(t); },
    step(dt) { set(t + dt); },
    home() { set(0); },
    end() { set(duration); },
    markIn() { marks.in = t; if (marks.out != null && marks.out <= t) marks.out = null; onTime(t); },
    markOut() { marks.out = t; if (marks.in != null && marks.in >= t) marks.in = null; onTime(t); },
    clearMarks() { marks.in = marks.out = null; onTime(t); },
  };
}

/** "00:12.40" */
export function clock(t) {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
}

/** "7.2" (bar.beat), from the music grid when there is one, else from the bpm in 4/4; null without either. */
export function barBeat(t, grid) {
  const beats = grid?.beats ?? [];
  if (beats.length) {
    const strong = grid.strong?.length ? grid.strong : beats.filter((_, i) => i % 4 === 0);
    const bar = strong.filter((x) => x <= t + 1e-9).length;
    if (!bar) return null;
    const from = strong[bar - 1];
    const beat = beats.filter((x) => x >= from - 1e-9 && x <= t + 1e-9).length;
    return `${bar}.${Math.max(1, beat)}`;
  }
  if (grid?.bpm > 0) {
    const n = Math.floor((t * grid.bpm) / 60 + 1e-9);
    return `${Math.floor(n / 4) + 1}.${(n % 4) + 1}`;
  }
  return null;
}
