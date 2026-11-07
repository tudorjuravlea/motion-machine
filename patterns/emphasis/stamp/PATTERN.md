# emphasis/stamp

## Purpose
A verdict word (approved, shipped, sold out) is stamped onto the frame and stays there as a pitted rubber stamp in one palette role.

## Use when / Do not use when
**Use when**
- a verdict beat: a short word or two that closes an argument
- once in a piece, on a slot whose text is the verdict; pair it with `moves/shake` and a `sound/hit` cue for a heavy landing

**Do not use when**
- the text is a sentence: a stamp holds one to three words
- the brand never tilts or distresses anything (use `emphasis/indicate`)
- several stamps in one scene: the second one is noise

## Params
Give the beat `params.instant: true`, so the slam is the arrival: the stamp's look belongs to the slot from the moment it arrives, and the emphasis starts as the entrance ends. A beat with an entrance of its own still works: the stamp is seen arriving, then only lands (wobble, flash, jolt, no fall from large and faint), and `mm.warnings` carries a note naming the slot. `tone`, `tilt` and `size` style the slot, so give them among the beat's own params (they are written as `data-p-*`); the others may also sit in `params.emphasis`.

| name | type | default | meaning |
|---|---|---|---|
| `personality` | enum(slam\|press) | `slam` | `slam`: down from up to 2.6× (as far as the room around the word allows, see below) and 30 % opacity to rest in 0.09 s, accelerating, then a small wobble; `press`: a quiet set-down from up to 1.18× in 0.07 s with no wobble |
| `tone` | enum(accent\|ink) | `accent` | the palette role of the ink (word, rules and pits) |
| `tilt` | enum(left\|right\|none) | `left` | the plate turns 7° anticlockwise, clockwise or not at all; the word stays level |
| `size` | enum(h1\|h2) | `h1` | the size role of the word, whatever size the layout gives the slot |
| `flash` | number | 0.35 | strength of the flash at the landing, 0 to 0.5, in the lightest palette role |
| `shake` | number | 6 | how far the scene's other slots jolt at the landing, in px; 0 for none |

## Style variables consumed
- `--mm-color-accent` or `--mm-color-ink` (by `tone`) for the word, both rules, the plate tint (7 % of the role over the ground) and the mask
- the lightest of the seven roles, read from the composed style, for the flash (`--mm-color-<role>` in a spread shadow)
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display`, `--mm-size-h1` or `--mm-size-h2` (by `size`)
- `--mm-space-0` (pit sizes), `--mm-space-1` to `--mm-space-4` (padding, margin and the plate's inset), `--mm-radius-1`
- the emphasis window is the duration role `slow`, set by the kit; the slam's own timing is in seconds, because an impact is physical

## Legibility and rest notes
- At rest the word is level, unscaled and unmoved (no transform, scale, rotate or translate), at full opacity, in the chosen role; only the plate behind it (a `::before`) is tilted.
- The plate has a heavy outer rule (0.09 em) and a thin inner rule (0.035 em, inset 0.2 em) and a faint tint. Pits and worn patches are holes and soft spots in its mask, so they show the ground through and add no colour: every pixel is the role, the ground, or a blend of the two (G-BRAND).
- The word is uppercase in the display face at h1 (or h2), breaking only between words and after a hyphen, with the slot shrunk to fit its text and a margin that keeps the plate's rules outside the text box.
- The word is sized to its room in its own font size: the slot's style declares `--mm-fit: word`, and the kit sets the slot's font size at mount so its longest word fits the slot, which is the column less the plate's margin; never larger than h1 (or h2), and never under the format's body floor (44 px in 9x16, 40 in 1x1, 42 in 4x5, 36 in 16x9). A long verdict ("Non-negotiable" at h1 in 9x16) therefore rests inside the safe area in every format, a little smaller than h1. A word too long to fit at the floor ("Antidisestablishmentarianism") is broken in two balanced parts at a hyphen, and the two lines are sized to the room (about 73 px in 9x16 on nocturne-kinetic). The plate's rules are in em, so they follow the fitted size.
- The start scale is capped by `room.js` so the word stays inside the safe area on every frame of the slam, and the wobble never scales past that cap. The start is min(2.6, room) for `slam` and min(1.18, room) for `press`. A one-word verdict fills much of the column, so the room is the bound in practice: "Approved" at h1 starts at about 1.2× in 9x16, 1x1 and 4x5 and about 1.3× in 16x9 on nocturne-kinetic, and 1.3× to 1.5× on editorial; at h2 it starts at 1.3× to 1.7×. The 30 % opacity start carries the rest of the moment.
- The flash is the slot's own spread shadow at no more than 50 % of the lightest role, gone 0.12 s after the landing; the jolt moves the scene's other filled slots by at most `shake` px and is under 0.05 px long before the window ends. At the end of the window nothing is written.
- Pure in the beat's seconds: the same instant gives the same frame in any seek order.

## Provenance
- lemomo-ai/lemo-opuscar, MIT: no code taken; the timings and proportions are the source's, restated in our code. From the source: a rubber verdict stamp with a double rule and worn ink; the slam (2.6× to 1× in 0.09 s, ease-in cubic, opacity from 0.3) and its wobble (0.05·sin(30τ)·e^(−9τ)); the quieter press (1.18× to 1× in 0.07 s, ease-out); the rule weights (outer 0.09 em, inner thinner and inset); a flash capped at half strength fading linearly over 0.12 s; and neighbours that jolt as e^(−9τ)·cos(22τ). Ours: the look as the slot's own style, pits as mask holes in a palette role, level type on a tilted plate, the room cap on the start scale, the word sized to its room above the body floor, and the landing-only behaviour after an entrance.

## Known limits
- The look is keyed on the slot's `data-emphasis`, so it shows as soon as the slot arrives: without `instant: true` the stamp is visible during its entrance and the window only lands it (a note goes to `mm.warnings`).
- `tone`, `tilt` and `size` inside `params.emphasis` are not seen by the stylesheet (the kit writes only the beat's own params onto the slot).
- The pit pattern is the same for every stamp.
- W-CONTRAST may warn on the word: the tilted rules cross the corners of its box, and the rule pixels are the same role as the word. The word itself sits on the plate's tint.
- The slam's start scale is capped by the room around the word, so the documented 2.6× is reached only by a short word at h2 in a wide format: a one-word h1 verdict starts at 1.2× to 1.5×, and a long word that fills the column starts at about 1×, where the slam reads as an opacity pop.
- A word broken at the floor breaks where its two halves are balanced in width, not at a syllable.
- A slot that a layout absolutely positions keeps its position; the plate is drawn around it either way.
