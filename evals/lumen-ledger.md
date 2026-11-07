# Eval: lumen-ledger

A fictional product; nothing here names a real company.

## Prompt

> Use the motion-machine skill. Lumen Ledger is a small app that turns a photo of a paper receipt
> into a tidy expense line in about three seconds, then files it by month so tax season is one
> export instead of a shoebox. People who freelance lose receipts; Lumen Ledger keeps them, and it
> works offline on the train. I need a short film for a product launch in social feeds.
>
> It should feel calm and trustworthy, not shouty. The one thing to remember: snap it, and it is
> filed. Facts you can use: a receipt becomes a line in about 3 seconds (our own timing on a
> mid-range phone, internal test, 2026); it exports a year of receipts as one CSV file (product
> spec). No faces. English only. Use the calm product look.

## Expected gate outcome

- Round 1 asks only for what is missing: the channel's formats are implied by "social feeds"
  (9x16 and 1x1; the agent may confirm 16x9), the three words (the agent proposes them from
  "calm and trustworthy" and asks), and the length (the agent proposes 20 s).
- Round 2 offers three directions with beat sheets; no fact appears on screen without one of the
  two supplied facts; the "about 3 seconds" claim keeps its qualifier in the copy (the layouts'
  figure slot carries only the number and a unit, so "about" goes in the headline or body line:
  "about 3 s"), and the beat sheet's fact row carries the source ("internal test, 2026").
- Round 3 uses the `calm-product` preset (`mm new --kind film --style calm-product --id lumen-ledger`)
  because the brief says "Use the calm product look". If the director says otherwise (a captured
  brand, another motion style), the director's words override the brief: the agent follows
  them, logs the change in round 1 and does not insist on the preset (SKILL.md, opening). Either
  outcome passes; silently ignoring the director fails.
- The story is written in style roles (`fx: "style:headline"`, a scene `position`, no `cut`), its
  first headline is finished at frame 0 (`at: 0`, `params.instant: true`; W-HOOK) and `cta`
  carries both `text` and `url` (`""` when there is no link).
- The piece is scaffolded where the agent works (`pieces/lumen-ledger/` or `--dir <folder>`) and
  never moved afterwards; any capture goes in the piece's `capture/` folder, not in `styles/`.
- Result: one 20 s film (W-LENGTH: 20.0 s), all requested formats exported at `--sub 1`, `mm check`
  exit 0, every WARN read and accepted or fixed (W-EMPTY and W-STAGGER included), `--prove` ok, a handover whose unverified list names the 3-second claim
  as needing a second read.
- Named gaps are expected (no phone recording exists): a device pattern (`devices/phone`) with
  placeholder screens is acceptable only if the handover says so; inventing a screen recording is
  a fail.
