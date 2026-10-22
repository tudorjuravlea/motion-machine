# data/unit-stack

## Purpose
A figure is built from countable plates, one plate per stated unit, and the number on screen counts the plates that have landed.

## Use when / Do not use when
**Use when**
- an impact number should feel like a quantity of something: tonnes saved, trees planted, homes connected, orders shipped
- the unit is meaningful and can be said once ("2 t each")
- annual reports, sustainability and sales scenes, where the figure is the picture

**Do not use when**
- the figure is a ratio or a percentage (use `data/ring` or `data/fill-bar`)
- two figures should be compared side by side (one stack per beat; see Known limits)
- the value is below one unit: nothing would stack

## Params
The figure comes from the beat's `value` (written as `data-value`); cite its fact with the beat's `fact`. The entrance lasts 2.4 s, in seconds rather than a style role, because a stack needs time to read as built; a beat's `params.dur` overrides it.

| name | type | default | meaning |
|---|---|---|---|
| `unit` | number | 1 | what one plate stands for, in the figure's own units; above 100 plates the next 1-2-5 step that fits (2, 5, 10, 20, 50 …) is used, and the rule line states it |
| `per` | number | 10 | plates per column, 4 to 20; further plates start a new column to the right |
| `ruler` | number | 10 | every n-th plate is drawn in the accent, a ruler to count by; 0 for none |
| `rule` | string | (empty) | the line under the stack that states the unit; empty writes "<unit> each" with the prefix and suffix; ignored when the unit was coarsened, so the line is never wrong |
| `fix` | number | (unset) | decimal places of the figure, 0 to 4; unset keeps the value's own decimals and the unit's (7.3 rests on "7.3", 100.5 on "100.5", 37 at 2.5 a plate climbs 2.5, 5.0 … 37.0) |
| `prefix` | string | (empty) | text before the figure |
| `suffix` | string | (empty) | text after the figure, and after the unit in the rule line |
| `size` | enum(display\|h1\|h2) | `h1` | the style size role of the figure |

## Style variables consumed
- `--mm-color-muted` for the plates, `--mm-color-accent` for ruler plates; the lighter of `--mm-color-ink` and `--mm-color-canvas` lights the top faces and the darker shades the side faces, each as an alpha laid over the plate's role
- `--mm-color-ink` for the figure, `--mm-color-muted` for the rule line
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display` and `--mm-size-<size>` for the figure; `--mm-font-mono`, `--mm-weight-mono`, `--mm-tracking-mono`, `--mm-size-body` for the rule line
- `--mm-space-3` between the figure, the stack and the rule; `--mm-align` for their alignment
- plate sizes scale with the format's base size (`ctx.unit`), the slot's laid-out width and the safe height: the stack takes at most a fifth of it

## Legibility and rest notes
- One plate is one unit; a value that is not a multiple ends on a part plate (37.5 at 2.5 a plate is fifteen plates; 46 at 2 is twenty-three).
- Plate k lands at fall + (d − fall)·((k + 1)/n)^0.85, so the stack speeds up as it rises and the last plate lands at the end of the entrance; each plate is set down from above with a quintic ease, fading in and turning a few degrees as it settles. A seeded offset, tilt and shade per plate make the stack read as stacked; the same value gives the same stack in every load.
- The figure is always the landed plates times the unit, capped at the value: never a roll on the clock. It reaches the fact's value exactly as the last plate lands, to the value's own decimals unless `fix` says otherwise. The prefix and suffix keep their place but show only on the finished stack, as `data/counter` does.
- A figure of five or more integer digits is grouped in threes with a narrow no-break space ("1 234 567 890 t"), and so is the unit in the rule line ("20 000 000 t each"); decimals are never grouped.
- A value of zero or below has nothing to stack: no plates are drawn, the figure shows the value from the start, and `mm.warnings` names the slot.
- At p = 1 (and at a deck rest) every plate is in place, upright apart from its seeded tilt of under half a degree, and the figure reads the value.
- Plates are `aria-hidden` boxes with no text; the figure and the rule line are DOM text at or above the body size. Every face is the plate's role with an alpha of another role over it (G-BRAND).

## Provenance
- lemomo-ai/lemo-opuscar, MIT: no code taken; the cascade's timing constants are the source's, restated in our code. From the source: a figure built as a stack of countable plates with a ruler plate every tenth; the cascade that speeds up as it rises (landing k at ((k + 1)/n)^0.85 of the run); each plate falling 0.42 s with a quintic (1 − x)^5 set-down and a little turn; seeded jitter so it reads as stacked; and a counter that follows the landed plates. Ours: a 2D oblique stack in palette roles with columns, part plates, a coarser 1-2-5 unit above 100 plates, the fall capped at 35 % of a short entrance, the figure's precision and grouping.

## Known limits
- One series: two stacks to compare take two beats in a layout with two figure slots.
- 2D only: the plates are oblique boxes, not a lit 3D scene.
- The rule "a plate is the same in every stack" is the story's to keep: two stacks in one piece should use the same unit.
- Rounding a near value to whole plates could hide a difference: choose a unit fine enough that two compared values never share a plate count.
- A value of zero or below draws no plates (a note goes to `mm.warnings`); a negative quantity needs another pattern.
- Grouping uses a narrow no-break space in every language, not the language's own separator.
