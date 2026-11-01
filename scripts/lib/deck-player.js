// The standalone deck's player (SPEC §10): what a deck does when a person, not a render, is driving it. Loaded by
// the standalone deck's loader (scripts/lib/standalone.mjs) after the piece has mounted, never by a piece and never
// in render mode, so a frame is still a function of t alone and the gate's recorder has nothing of this to refuse.
//   a press        takes over the kit's cancellable `mm:press` event: the press runs in real time from one rest to the next
//                  (seek between them, goto at the end) and plays the sprite's cues of that press as the time reaches each.
//                  A jump (a hash, ?press=, goto, Back) is not a press: it lands on a rest and plays nothing.
//   sound          the sprite (`mm sound` / `mm export`: one WAV, MP3 or AAC with { key: [startMs, endMs] } and the press
//                  events) is a base64 data URI, decoded without a request, so it plays from file://. Audio is unlocked by the
//                  first gesture: capture-phase touchstart, touchend, click and keydown, a one-sample buffer played, the
//                  context resumed. A mute button (and the m key) silences it; with no sprite there is no button.
//   fit            the stage is a fixed frame (1920 x 1080 for a 16x9 deck): outside a render it is scaled to fit the window, up or down,
//                  centred on the canvas colour, so a deck shows whole in a small window, a frame of a page or a big screen.
//   a parent page  may steer the deck with postMessage: { mm: 'goto', press: n }, { mm: 'next' }, { mm: 'prev' } (only from
//                  the page that embeds it).
// The unlock sequence and the data-URI decode are howler.js's ideas (NOTICE), written here in a few lines.
import { cuesOfPress } from '../../runtime/kit/press.js';

export const UNLOCK_EVENTS = ['touchstart', 'touchend', 'click', 'keydown'];
/** A cue asked for before the sprite has decoded still plays if the decode finishes within this many ms. */
export const LATE_MS = 1000;

/** The bytes of a `data:<type>;base64,…` URI, without a request. */
export function decodeDataUri(src) {
  const m = /^data:[^;,]+;base64,([\s\S]*)$/.exec(String(src));
  if (!m) throw new Error('the sprite is not a base64 data URI');
  const bin = atob(m[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

const CSS = `.mm-deck-mute { position: fixed; right: var(--mm-space-2); bottom: var(--mm-space-2); z-index: 2147483000; font: var(--mm-weight-text) var(--mm-size-micro)/1 var(--mm-font-text); letter-spacing: var(--mm-tracking-text);
  color: color-mix(in srgb, var(--mm-color-ink) 70%, transparent); background: color-mix(in srgb, var(--mm-color-surface) 85%, transparent); border: 1px solid var(--mm-color-line); border-radius: var(--mm-radius-1); padding: .5em .8em; cursor: pointer; }
.mm-deck-mute:hover, .mm-deck-mute:focus-visible, .mm-deck-mute[aria-pressed="true"] { color: var(--mm-color-ink); }
.mm-deck-mute:focus-visible { outline: 2px solid var(--mm-color-accent); outline-offset: 2px; }`;

/**
 * Starts the player on the mounted deck (`win.mm`). `sound` is { src, cues, events } or null for a silent deck.
 * Returns { muted(), mute(on) }; the same two are on `window.mm.sound` when there is a sprite, and on `window.mm.player`
 * once the player has started (with or without a sprite).
 */
export function startDeckPlayer({ sound = null, win = window } = {}) {
  const doc = win.document, mm = win.mm;
  // a render (the gate, the stills, an export: <html data-render>) is a frame from t alone: no button, no sound, no press in real time
  if (doc.documentElement.hasAttribute('data-render')) return (mm.player = { muted: () => false, mute() {} });
  let ctx = null, gain = null, buffer = null, muted = false, started = false, failed = false, button = null;
  const waiting = [];

  const play = (key) => {
    const span = sound?.cues?.[key];
    if (!span || muted || failed) return;
    if (!buffer) { if (started) waiting.push({ key, asked: win.performance.now() }); return; }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    src.start(0, span[0] / 1000, (span[1] - span[0]) / 1000);
  };

  // ---- unlock: the first gesture makes the context, plays a one-sample buffer, resumes, and decodes the sprite
  const listen = (on) => { for (const type of UNLOCK_EVENTS) doc[on ? 'addEventListener' : 'removeEventListener'](type, unlock, true); };
  function unlock() {
    if (started) return;
    started = true;
    try {
      const AC = win.AudioContext || win.webkitAudioContext;
      ctx = new AC();
      gain = ctx.createGain();
      gain.gain.value = muted ? 0 : 1;
      gain.connect(ctx.destination);
      const one = ctx.createBufferSource();
      one.buffer = ctx.createBuffer(1, 1, 22050);
      one.connect(ctx.destination);
      one.onended = () => { one.disconnect(); listen(false); };
      one.start(0);
      ctx.resume?.();
      ctx.decodeAudioData(decodeDataUri(sound.src)).then((b) => {
        buffer = b;
        const now = win.performance.now();
        for (const w of waiting.splice(0)) if (now - w.asked <= LATE_MS) play(w.key);
      }, () => { failed = true; });
    } catch { failed = true; listen(false); }
  }

  // ---- fit: the whole frame in the window
  const stage = doc.querySelector('.mm-stage');
  const fit = () => {
    const w = stage.offsetWidth, h = stage.offsetHeight, vw = win.innerWidth, vh = win.innerHeight;
    if (!(w > 0 && h > 0 && vw > 0 && vh > 0)) return;
    const k = Math.min(vw / w, vh / h);
    stage.style.transformOrigin = '0 0';
    stage.style.transform = `translate(${(vw - w * k) / 2}px, ${(vh - h * k) / 2}px) scale(${k})`;
  };
  if (stage) {
    const hold = doc.createElement('style');
    hold.textContent = 'html, body { overflow: hidden; height: 100%; }';
    doc.head.append(hold);
    fit();
    win.addEventListener('resize', fit);
  }

  // ---- a press: real time from one rest to the next, with the cues of that press
  win.addEventListener('mm:press', (e) => {
    e.preventDefault();
    const { from, to } = e.detail;
    const len = mm.schedule.pressLengths?.[to] ?? 0;
    const due = cuesOfPress(sound?.events, to);
    const t0 = win.performance.now();
    let set = from, fired = 0;
    const step = () => {
      if (mm.position() !== set) return;                // someone else navigated: the press is over, its cues are not played
      const s = (win.performance.now() - t0) / 1000;
      while (fired < due.length && (len <= 0 || s >= len || due[fired].at <= s)) play(due[fired++].key);
      if (!(len > 0) || s >= len) { mm.goto(to); return; }
      set = from + (to - from) * (s / len);
      mm.seek(set);
      win.requestAnimationFrame(step);
    };
    step();
  });

  // ---- a parent page steering the deck
  win.addEventListener('message', (e) => {
    if (e.source !== win.parent) return;
    const m = e.data;
    if (!m || typeof m !== 'object') return;
    if (m.mm === 'goto' && Number.isInteger(m.press)) mm.goto(m.press);
    else if (m.mm === 'next') mm.next();
    else if (m.mm === 'prev') mm.prev();
  });

  // ---- the mute button
  const api = {
    muted: () => muted,
    mute(on = !muted) {
      muted = Boolean(on);
      if (gain) gain.gain.value = muted ? 0 : 1;
      if (button) { button.setAttribute('aria-pressed', String(muted)); button.textContent = muted ? 'Sound off' : 'Sound on'; }
    },
  };
  if (sound?.src) {
    listen(true);
    const style = doc.createElement('style');
    style.textContent = CSS;
    doc.head.append(style);
    button = doc.createElement('button');
    button.type = 'button';
    button.className = 'mm-deck-mute';
    button.setAttribute('aria-label', 'Mute sound');
    button.setAttribute('aria-pressed', 'false');
    button.textContent = 'Sound on';
    button.addEventListener('click', () => api.mute());
    doc.body.append(button);
    win.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'm' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.target?.closest?.('input, textarea, select, [contenteditable]')) api.mute(); });
    mm.sound = api;
  }
  mm.player = api;   // the player has started: the kit was ready before it, so whoever drives the deck waits for this
  return api;
}
