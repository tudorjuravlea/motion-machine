# On brand, always

Read when: gate 3 (style), a brand says "that is not us", the same param appears in more than one
beat, or you are about to generate a picture, a voice or a track (`mm gen`).

Anything a piece does can be made more on brand without touching the story. A brand has two ways to
say how it moves and looks, besides its colours, type and composition: a `patterns` block, and the
generation blocks `imagery`, `voice` and `music`. Use them before you edit a beat.

## Set a pattern's params once, in the brand

A brand's `patterns` block holds, per pattern id (`group/name`), defaults for any of that pattern's
params, as strings, numbers or booleans. The kit reads a pattern's params in this order, and the last
one wins:

1. the pattern's own default (its card, `patterns/<id>/PATTERN.md`)
2. the brand's `patterns["group/name"]`
3. the beat's `params` in `story.json`

So a brand sets how it always rises, leans or drifts, and a beat overrides only when one moment is
different. A card may carry a line under "Params" named `Brand knobs:`: the params a brand usually
sets (a variant or mechanism, which role carries the accent, stroke weight, corner style, whether a
dot grid shows). Where there is none, the Params table is the list. Read the card before you pick a
value, and keep to values it allows.

```json
{
  "patterns": {
    "entrances/rise":  { "d": 24, "side": "up" },
    "devices/phone":   { "tilt": 12, "size": "large" },
    "moves/ken-burns": { "to": 1.03 }
  }
}
```

This brand rises a shorter way than the default (24 px, not 40), leans its phone 12 degrees (not 24)
and drifts a still by 3 %. No beat in any story of this brand needs to say so.

Rules of thumb:
- Same param, same value in three beats of one piece: move it to the brand.
- A param that is a colour, size, space, radius, time or curve is not a brand knob: those come from
  the palette roles, the `--mm-*` variables and the motion half (`style:` roles, `dur` buckets).
  The `patterns` block carries choices, not literals.
- Capture a reference's grammar into the brand (`mm brand capture`, `mm motion capture`), then
  write what you saw as `patterns` entries. Never copy a reference's content (H-REF).
- Log it: a change to the brand's `patterns` is a direction call (`references/direction-log.md`),
  with the stills that show the difference (`mm pattern stills <id> --style <piece>/style.json`).
- `mm style compose` copies `patterns`, `imagery`, `voice` and `music` into the piece's
  `style.json`, so edit the brand half and compose again; do not hand-edit the composed file.

## Steer generation: `imagery`, `voice`, `music`

When a piece needs a generated picture, clip, narration or track, the brand says how it should look
and sound, once, and every generator call reads it. Ask `mm gen --help` for the verbs on this
machine; they send prompts or text to a paid outside service, so ask the director first (AXIOM 14)
and say what leaves the machine.

- `imagery`: `style` (required: the look in words), `mood`, `avoid` (what must not appear; sent as the
  negative prompt where a model takes one), `references` (up to eight pictures beside the brand
  file), `tone` (`none`, `palette` or `duotone`: after generation, pull the picture's colours toward
  the brand's palette, or map it from ink to canvas). Added to every image and video prompt together
  with the palette.
- `voice`: `provider` and `id` (required), `language`, and the delivery: `stability`, `similarity`,
  `style`, `speed` (0.7 to 1.2).
- `music`: `style` (required) and `avoid`. The tempo comes from the motion half's `sound.bpm`, not
  from here.

```json
{
  "imagery": {
    "style": "flat paper cut-outs, soft shadow, matte, no gloss",
    "mood": "calm, warm morning light",
    "avoid": "photoreal faces, lens flare, neon, text in the picture",
    "tone": "palette"
  },
  "voice": { "provider": "elevenlabs", "id": "<the provider's voice id>", "language": "en", "speed": 0.95 },
  "music": { "style": "slow warm piano, soft pulse, no drums", "avoid": "epic risers, vocals" }
}
```

After a generation, look at the result against the brand before it goes in the story: a picture
that ignores `avoid`, or a voice that is the wrong pace, is fixed in the brand block (and generated
again), not in one story. Generated people and voices need the same consent as real ones (H-FACES).
