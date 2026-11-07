// A render's fingerprint for the engine tests: per channel, the RMS of eight equal windows and the peak. Two runtimes
// may round Math's functions differently in the last bit, which changes every sample's bits but not these numbers past
// their sixth digit; any real change to a recipe or the engine moves them far more.
export const WINDOWS = 8;

/** [[rms of window 1..8, peak] per channel] of a rendered { channels }. */
export function fingerprint(r) {
  return r.channels.map((c) => {
    const out = [];
    let peak = 0;
    for (let w = 0; w < WINDOWS; w++) {
      const a = Math.floor((w * c.length) / WINDOWS), b = Math.floor(((w + 1) * c.length) / WINDOWS);
      let e = 0;
      for (let i = a; i < b; i++) { e += c[i] * c[i]; peak = Math.max(peak, Math.abs(c[i])); }
      out.push(Math.sqrt(e / Math.max(1, b - a)));
    }
    out.push(peak);
    return out;
  });
}

/** The first number of `got` more than a millionth (plus 1e-9) away from `want`, as text, or null when they match. */
export function fingerprintDiff(got, want) {
  if (got.length !== want.length) return `${got.length} channels, stored ${want.length}`;
  for (let c = 0; c < want.length; c++) {
    for (let i = 0; i < want[c].length; i++) {
      const a = got[c][i], b = want[c][i];
      if (!(Math.abs(a - b) <= 1e-6 * Math.abs(b) + 1e-9)) return `channel ${c}, ${i < WINDOWS ? `window ${i + 1}` : 'peak'}: ${a}, stored ${b}`;
    }
  }
  return null;
}
