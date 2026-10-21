# Capture notes: harbour-pine

Source: fixtures/capture/site/index.html (computed styles in headless Chromium). Captured 2026-10-17. Best effort: every value below is a guess with its evidence, and the director approves the composed style at gate 3 before it is used (SPEC §13).

## Colour roles

- **canvas** #F6F1E7: covers 87% of the painted page (5654 of 6500 grid samples), painted by body
- **ink** #1B2A2F: 330 of 442 text characters on the canvas (74.7%), e.g. h1
- **muted** #6A7478: second text colour on the canvas (63 characters), e.g. p.caption
- **surface** #FFFFFF: most common non-canvas background, 12.3% of the painted page (798 samples), painted by div.card
- **line** #D8D0C0: most common visible border colour (12 border sides), e.g. div.card
- **accent** #D2491F: most saturated colour on buttons, links and headings (chroma 0.70; link, button background; 2 candidate colours), e.g. a
- **accentInk** #FFF7F0: text colour on the accent background (15 characters), e.g. a.btn

## Type roles

- **type.display** Playfair Display -> Fraunces (nearest by classification, serif; the captured family is not bundled), weight 700, tracking -0.02em. Evidence: Playfair Display (declared, serif fallback) carries 74 of 74 heading characters, weight 700, tracking -0.02em, on h1, h3, h2
- **type.text** Manrope -> Manrope (same name), weight 400, tracking 0em. Evidence: Manrope (declared, sans-serif fallback) carries 534 of 534 body characters, weight 400, tracking 0em, on p, a
- **type.mono** IBM Plex Mono, weight 400: GUESS, no monospace text found; the bundled mono is the default

## Warnings

- WARN: muted #6A7478 on canvas #F6F1E7 is 4.26:1, below the 4.5:1 that W-CONTRAST asks of video text; darken muted (or lighten it on a dark canvas) in the half before composing.

## Banned fonts (advice only)

- NOTE: **Playfair Display** is on the banned-fonts list (references/bans.md, SPEC §15). Advice, not a gate: nothing fails on a font. The piece uses the bundled stand-in named above; keep the captured family only if you hold the right to ship it.

## Copied defaults (not measured)

- scale (ratios of the format base size), composition (alignment, headline scale, density), bans, space, radius are copied from the shipped brand half "paper"; adjust by hand if the brand differs.
- `source` is "fixtures/capture/site/index.html" and `fictional` is false.
