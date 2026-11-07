// W-AUDIBLE (SPEC §7, §9; provisional): a cue that cannot be heard, or is heard badly. `mm sound` measures each cue in the finished
// mix (scripts/lib/sound-audible.mjs) and writes the verdict into out/cues.json: the third-octave margin of the cue over the music and
// the voice that sound with it, in the bands within 30 dB of its peak, over its loudest 60 ms and its first 20 ms (6 dB or more clear,
// 3-6 ok, 0-3 barely, under 0 masked). This rule warns for a masked cue, a silent one (peaking under -70 dBFS: the sound is not there),
// a cue on top of speech when ducking is off, and a cue whose 2-6 kHz level is more than 6 dB over the music's loudest (harsh). A cue
// that is only barely heard is listed as information. A beat's `params.cue.soundOk: "reason"` acknowledges a cue. Each warning names
// the rule that placed the cue (out/sound-trace.json says more when `mm sound --trace` ran). Nothing measured (no out/cues.json, a
// cues.json from before the margins were measured, palette "none", a deck, no cues) is SKIP.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rule } from '../lib/report.mjs';
import { cueEvents } from '../lib/cues.mjs';
import { AUDIBLE } from '../lib/sound-audible.mjs';

const MATCH_S = 0.2;

export default async function (ctx) {
  if (ctx.schedule?.kind === 'deck') return rule('W-AUDIBLE', 'SKIP', { reason: 'deck cues sit on presses, not on a clock' });
  if (ctx.style?.sound?.palette === 'none') return rule('W-AUDIBLE', 'SKIP', { reason: 'style.sound.palette is "none": cues are not rendered' });
  const events = cueEvents(ctx.schedule).filter((c) => c.name !== 'bed');
  if (!events.length) return rule('W-AUDIBLE', 'SKIP', { reason: 'the schedule has no cues' });
  const file = join(ctx.dir, 'out', 'cues.json');
  if (!existsSync(file)) return rule('W-AUDIBLE', 'SKIP', { reason: 'not measured: no out/cues.json (run `mm sound`)' });
  let json;
  try { json = JSON.parse(readFileSync(file, 'utf8')); } catch { return rule('W-AUDIBLE', 'SKIP', { reason: 'not measured: out/cues.json cannot be read' }); }
  const rows = (Array.isArray(json) ? json : json.cues ?? []).filter((c) => c.name !== 'bed' && c.audible);
  if (!rows.length) return rule('W-AUDIBLE', 'SKIP', { reason: 'not measured: out/cues.json holds no audibility margins (run `mm sound` again)' });

  const okOf = (r) => {
    const t = r.requestedAt ?? r.at;
    const near = events.filter((e) => e.name === r.name).sort((a, b) => Math.abs(a.pictureS - t) - Math.abs(b.pictureS - t))[0];
    return near && Math.abs(near.pictureS - t) <= MATCH_S ? near.params?.soundOk ?? null : null;
  };
  const reasons = [], barely = [], acknowledged = [];
  for (const r of rows) {
    const a = r.audible, by = r.rule ? ` (placed by ${r.rule})` : '';
    const found = [];
    if (a.silent) found.push({ kind: 'silent', message: `${r.name} at ${r.at} s is silent: it peaks at ${a.peakDb ?? '< -70'} dBFS, under ${AUDIBLE.silentDb}, so the sound is not in the mix${by}` });
    else if (a.verdict === 'masked') found.push({ kind: 'masked', message: `${r.name} at ${r.at} s is masked: its best band is ${a.readDb} dB against the music${a.vsVoiceDb != null ? ' and the voice' : ''}, under 0${by}` });
    if (a.overSpeech && !a.ducked) found.push({ kind: 'speech', message: `${r.name} at ${r.at} s sounds over speech with ducking off: speech masks it${by}` });
    if (a.harshOverDb != null && a.harshOverDb > AUDIBLE.harshOverDb) found.push({ kind: 'harsh', message: `${r.name} at ${r.at} s is harsh: its 2-6 kHz level is ${a.harshOverDb} dB over the music's loudest, the limit is ${AUDIBLE.harshOverDb}${by}` });
    if (a.verdict === 'barely') barely.push({ cue: r.name, at: r.at, readDb: a.readDb, ...(r.rule ? { rule: r.rule } : {}) });
    const ok = found.length ? okOf(r) : null;
    if (ok) acknowledged.push({ cue: r.name, at: r.at, reason: String(ok), kinds: found.map((f) => f.kind) });
    else for (const f of found) reasons.push({ ...f, cue: r.name, instant: r.at });
  }
  const notJudged = rows.filter((r) => r.audible.verdict === 'not judged').length;     // nothing sounds with them: only silence and presence were judged
  const evidence = { measured: rows.length, ...(notJudged ? { notJudged } : {}), ...(barely.length ? { barely } : {}), ...(acknowledged.length ? { acknowledged } : {}) };
  if (!reasons.length) return rule('W-AUDIBLE', 'PASS', evidence);
  return rule('W-AUDIBLE', 'WARN', { ...evidence, instant: reasons[0].instant, reason: reasons.map((r) => r.message).join('; '), kinds: [...new Set(reasons.map((r) => r.kind))], reasons });
}
