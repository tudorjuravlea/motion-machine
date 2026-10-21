# text/elastic

## Purpose
The line arrives stretched: a width wave starts at the middle letter and travels outward, each letter swelling and settling back on a locked baseline.

## Use when / Do not use when
**Use when**
- a short, loud headline in a face with a width axis (Archivo, the kinetic preset), where the letters really widen
- a playful or energetic beat: a launch word, a "now" moment

**Do not use when**
- a calm or editorial piece: the swell reads as bounce
- long lines: the wave takes the whole entrance to reach the ends

## Params
| name | type | default | meaning |
|---|---|---|---|
| `amp` | number | 0.22 | peak width gain at the wave front, 0.08 to 0.25 |

## Style variables consumed
- the slot's own face, size and tracking (a `wdth` axis is used when the face has one)
- `motion.durations.slow` (the default length; a beat's `params.dur` sets a longer one)

## Legibility and rest notes
- At p = 1 the slot is its plain text, exactly as without the pattern.
- Words never break mid-wave (each word is a no-wrap run). With a width axis the tracking tightens while letters are wide, so the line stays inside the slot; without one, letters scale from the baseline and a scaled letter never crosses the slot's edge.
- The wave is linear in time; no letter's width overshoots its normal width at the end (SPEC §15).

## Provenance
- charlie947/motion-graphics-skills, MIT: the idea of a variable-width wave from the middle letter outward on a locked baseline (effect 10, "elastic type"); restated. No code taken.

## Known limits
- In a face with no width axis the swell is a horizontal scale, which thickens vertical strokes a little at the peak.
- With a width axis the line reflows while letters are wide; a slot that is exactly full may shift a word between lines mid-entrance.
