// Brand steering for `mm gen` (SPEC §8): a pure module. steer() turns what a person typed into what
// is sent to a generator, with the brand's imagery, palette, music and voice added, so a result comes
// out on brand and a later brand can be applied by generating again. brandHash() fingerprints the
// style fields a kind was steered by; the sidecar records it and W-GEN-BRAND compares it.
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

/** A brand-steering problem the person can fix (the CLI exits 2 with the message). */
export class SteerError extends Error {}

const BAN = 'no text, no logos, no watermarks';
const ASKS_FOR_TEXT = /\b(text|headlines?|titles?|captions?|typography|lettering|words?|says?|reads?)\b|["“”]/i;
const TIMBRE = {
  'soft-ui': 'soft, rounded interface sounds, gentle and clean',
  percussive: 'short, punchy, percussive hits',
  cinematic: 'wide, cinematic sounds with depth and a long tail',
};
/** The timbre words a motion half's sound palette gives a sound effect ('' for none or an unknown palette). */
export const soundPaletteHint = (palette) => TIMBRE[palette] ?? '';

/** [r, g, b] 0..255 for #rgb or #rrggbb, else null. */
function rgbOf(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function hsl([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255, max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

// hue bands in degrees: the first band whose upper edge is above the hue
const HUES = [[15, 'red'], [40, 'orange'], [70, 'yellow'], [170, 'green'], [200, 'teal'], [255, 'blue'], [290, 'purple'], [330, 'pink'], [360, 'red']];
const GREYS = [[0.3, 'charcoal'], [0.45, 'dark grey'], [0.65, 'mid grey'], [0.85, 'light grey'], [0.93, 'pale grey'], [2, 'off-white']];

/** A colour as plain words ("deep green", "warm off-white", "near-black") from a fixed table of hue and lightness names; null for a non-colour. */
export function colorWord(hex) {
  const rgb = rgbOf(hex);
  if (!rgb) return null;
  const { h, s, l } = hsl(rgb);
  if (l < 0.03) return 'black';
  if (l >= 0.995) return 'white';
  if (s < 0.08) return l < 0.2 ? 'near-black' : GREYS.find(([top]) => l < top)[1];
  if (l < 0.2 && s < 0.4) return 'near-black';
  if (l >= 0.93 && s < 0.5) return h >= 15 && h < 75 ? 'warm off-white' : h >= 180 && h < 270 ? 'cool off-white' : 'off-white';
  const hue = HUES.find(([top]) => h < top)[1];
  const prefix = l < 0.35 ? 'deep' : l >= 0.82 ? 'pale' : l >= 0.68 ? 'light' : s > 0.75 ? 'vivid' : s < 0.25 ? 'muted' : '';
  return `${prefix} ${hue}`.trim();
}

const upper = (hex) => (rgbOf(hex) ? `#${hex.trim().replace('#', '').toUpperCase()}` : null);
const phrase = (hex, tail) => { const w = colorWord(hex); return w ? `${w} ${upper(hex)} ${tail}` : null; };

/** "Palette: deep green #2F6F5E as the accent, warm off-white #FAFAF7 as the ground, near-black #23262B for ink." ('' when the style has none of the three). */
export function paletteSentence(color = {}) {
  const parts = [phrase(color.accent, 'as the accent'), phrase(color.canvas, 'as the ground'), phrase(color.ink, 'for ink')].filter(Boolean);
  return parts.length ? `Palette: ${parts.join(', ')}.` : '';
}

const stop = (s) => (/[.!?"”]$/.test(s) ? s : `${s}.`);
const join = (typed, extra) => { const add = extra.filter(Boolean); return add.length ? [stop(typed.trim()), ...add.map(stop)].join(' ') : typed; };

const STEERED = new Set(['image', 'video', 'replace', 'music', 'sfx', 'voice']);

/**
 * steer(kind, prompt, style, { brand = true, voice, styleDir }) → { prompt, negative, refs, voice, parts, notes }.
 * `prompt` is what is sent (for a voice, the text untouched); `negative` what the picture or music must not
 * hold; `refs` the brand's reference pictures resolved against `styleDir`; `voice` the narration voice
 * ({ provider, id, model?, language?, stability?, similarity?, style?, speed? }); `parts` the pieces a
 * provider may place itself (the style words, the tempo); `notes` what the person should be told.
 */
export function steer(kind, prompt, style, { brand = true, voice: voiceId, styleDir } = {}) {
  style ??= {};
  const out = { prompt, negative: '', refs: [], voice: null, parts: {}, notes: [] };
  if (kind === 'voice') {
    const base = brand ? style.voice : null;
    if (!base && !voiceId) throw new SteerError('mm gen voice needs a voice: pass --voice <id>, or set a brand voice (a `voice` block with provider and id in the brand half)');
    out.voice = { provider: 'elevenlabs', ...(base ?? {}), ...(voiceId ? { id: voiceId } : {}) };
    if (!brand) out.notes.push('brand off: the voice is the one named by --voice, with the provider\'s default delivery');
    return out;
  }
  if (!brand) { if (STEERED.has(kind)) out.notes.push('brand off: the prompt is sent untouched'); return out; }
  if (!STEERED.has(kind)) return out;

  if (kind === 'image' || kind === 'video' || kind === 'replace') {
    const im = style.imagery;
    if (!im) out.notes.push('the style has no imagery block: the prompt carries the palette only');
    out.parts = { style: im?.style ?? '', mood: im?.mood ? `Mood: ${im.mood}` : '', palette: paletteSentence(style.color) };
    out.prompt = join(prompt, [out.parts.style, out.parts.mood, out.parts.palette]);
    out.negative = [im?.avoid, ASKS_FOR_TEXT.test(prompt) ? 'no logos, no watermarks' : BAN].filter(Boolean).join(', ');
    out.refs = (im?.references ?? []).map((r) => (styleDir ? resolve(styleDir, r) : r));
  } else if (kind === 'music') {
    const bpm = style.sound?.bpm ?? null;
    if (!style.music) out.notes.push('the style has no music block: the prompt is sent as typed');
    out.parts = { style: style.music?.style ?? '', bpm, tempo: bpm ? `Tempo: about ${bpm} bpm` : '' };
    out.prompt = join(prompt, [out.parts.style, out.parts.tempo]);
    out.negative = style.music?.avoid ?? '';
  } else if (kind === 'sfx') {
    out.parts = { timbre: soundPaletteHint(style.sound?.palette) };
    out.prompt = join(prompt, [out.parts.timbre]);
  }
  return out;
}

/** A value with its object keys sorted, so equal values hash and print alike. */
export const stable = (v) => (v && typeof v === 'object' ? (Array.isArray(v) ? v.map(stable) : Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]))) : v ?? null);
const sha = (v) => createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');

/**
 * sha256 of the style fields that steer `kind`: a picture or clip, the palette's accent, ground and ink
 * and the imagery block; music, its block and the tempo; a sound effect, the sound palette; a voice, the
 * voice block. A field that does not steer a kind does not move its hash. null for a kind that is not steered.
 */
export function brandHash(kind, style = {}) {
  if (kind === 'image' || kind === 'video' || kind === 'replace') return sha({ color: { accent: style.color?.accent, canvas: style.color?.canvas, ink: style.color?.ink }, imagery: style.imagery });
  if (kind === 'music') return sha({ music: style.music, bpm: style.sound?.bpm });
  if (kind === 'sfx') return sha({ palette: style.sound?.palette });
  if (kind === 'voice') return sha({ voice: style.voice });
  return null;
}
