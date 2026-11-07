# Bans

Every banned look, why it is banned and what the grammar does about it. Status is one of: gate (a named rule fails or warns), advice (the skill steers away, nothing fails), or style option (a brand's `bans` list or a motion style's numbers decide, and `allow` can lift it by name). Where two rules disagree, SPEC §15 rules. Credits for the ideas behind these lists are in `PROVENANCE.md`.

## Six looks that mark a piece as generated

| look | status | note |
|---|---|---|
| centred title on a gradient as the opening scene | gate: W-BAN | detected as one centred text block over a gradient canvas in the first scene |
| fade-only motion | gate: W-FADE-ONLY | warns when more than 70 % of entrances are plain fades |
| corner labels | gate: W-BAN | detected as small text inside the four corner zones |
| frame borders | gate: W-BAN | detected as a full-frame border element |
| glow on interface elements | style option | listed in a brand's bans; not detected |
| particle bursts | style option | listed in a brand's bans; not detected |

- A piece in which every entrance is a fade is the complaint. Fade stays a pattern; only a piece that uses nothing else is flagged [SPEC §15]

## Lazy defaults

| look | status | note |
|---|---|---|
| gradient text | advice | the skill picks solid ink |
| left accent stripes on cards | advice | a reflex decoration |
| cyan and purple-blue neon | advice | the stock "AI" palette |
| pure black and pure white | advice | brand palettes choose softer ink and canvas |
| identical cards, everything centred | advice | W-BAN catches only the opening-scene case |
| full-screen dark linear gradients | advice | they band after encoding |
| tile, hex and dot transitions | advice | absent from the catalogue by construction |
| pie charts, dual axes, legends, six-panel dashboards | advice | one chart, one message |
| equaliser bars, spectrum, music-note clip art, rainbow, strobe | advice | sound visuals that mark no event |
| wall-clock timers, CSS animations, unseeded randomness | gate: G-TIME, G-DETERMINISM | a frame must depend on time alone, so the two gates forbid all three |

## Banned fonts (advice only)

These families are so widely used as a default that setting a piece in one reads as not having chosen. Each group lists its families alphabetically.

| group | families | why |
|---|---|---|
| neutral sans that every template reaches for | Arial, Arimo, Inter, Lato, Noto Sans, Nunito, Open Sans, Outfit, Poppins, PT Sans, Roboto, Sora, Source Sans, Space Grotesk | a piece in them looks unbranded; the choice was made by the tool, not the brand |
| serifs and capitals used as shorthand for luxury | Bodoni Moda, Cinzel, Cormorant Garamond, EB Garamond, Playfair Display, Prata | the signal is stock: it says "premium" without saying anything about this brand |
| a fashionable display face | Syne | it dates a piece to a trend and is hard to pair |

- A system font as display type is on the same footing: the viewer's machine, not the piece, decides how it looks
- Ruling: advice, not a gate. Shipped presets avoid the most generic families; `mm brand capture` prints a note when a captured family is on the list; no rule fails on a font [SPEC §15]
- Every font in a piece must still be bundled, SIL OFL and loaded before capture (G-LOCAL) [SPEC §15]

## Slide defaults

| look | status | note |
|---|---|---|
| indigo as the default accent | advice | the colour an unconfigured template lands on |
| purple on white | advice | the same reflex in another pairing |
| glassmorphism | advice | frosted panels stand in for a layout idea |
| realistic illustration | advice | it competes with the type and ages quickly |

## Sound and endings

- Pure black and pure white backgrounds: advice, as under lazy defaults
- Fade-out endings: status is style option; the final rest holds unless the style names `outro: transitions/fade` [SPEC §15]
- Sound doctrine: cue priority, a bed that stays under its cues, at most two sounds at once; see sound.md

## Motion defaults

- Linear easing on spatial movement: advice; linear is right only for a scrub window or a slow build
- Opacity-only entrances: gate (W-FADE-ONLY for the piece, W-ENTRANCE for elements with no entrance at all)

## Interface rules that do not carry over to film

- Ease-in on interface movement: written for UI, not applied to film; ease-in stays legal on exits and wind-ups [SPEC §15]
- Scale from zero: advice; entrances start at 0.9-0.97 with opacity
- Blanket CSS transitions on all properties: gate, because G-TIME forbids CSS transitions and animations entirely
- Sub-300 ms speed caps: not applied to film; durations are per-role budgets [SPEC §15]

## Other contested looks

- Bounce and elastic are called dated by some guides and kept as personalities by others: allowed and bounded by `overshootMax` (0 to 0.30); type and opacity never overshoot [SPEC §15]
- Meme sound effects: advice
- Minimum sizes: the stricter floors in SPEC §12 stand over the common 60/20/16 px at 1080p; the label floor becomes the lower bound of the micro floor [SPEC §15]

## Timing reference values

- Settle tails, text-start offsets and the clear-before-enter gap come from measuring product films. They are inputs to W-STAGGER and W-HOLD, not rules of their own.

## Data restraint

Advice for any `data/*` pattern and any figure. One chart carries one message.

- No pie charts, no second axis, no gridlines, no legend, no dashboard of six panels. Label the
  thing on the thing; a bar is named at its end, not in a key
- Name the counted thing, not only the numeral: "412 signups this week", never "412"
- A figure alone in its press (H-ONE); a trend gets a line or bars, a share gets one filled bar or ring
- Every number cites a story fact (H-FACTS)

## Composition

Advice for layouts and motion styles; the gate covers the hold floor through W-HOLD.

- Use one or two accent colours in a piece, no more.
- Put text on a tile or plate; do not lay it directly over footage.
- A rest lasts at least 2.4 s before the next move (motion styles set `holdMinS` at or above this for calm energy).
- Do not blur-cut between tiles.
- Type at rest is never rotated.
- Type letter by letter only for a short headline.
- Keep the same cast of tiles while a grid is on screen: it reflows, it does not swap members.
- Give a bento grid room to breathe: alternate it with a full-bleed moment, in both directions.
- An end card settles; it does not cycle.
- At most four columns across 1080 px.
