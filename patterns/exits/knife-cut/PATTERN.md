# exits/knife-cut

## Purpose
Removes an element by slicing a blade through each line of its text, parting the letters along the cut, and folding the element shut onto the middle of the block.

## Use when / Do not use when
**Use when**
- something is being taken away: a cost cut, a step removed, an old version replaced [H-INFO]
- a grid or Swiss style where exits should be crisp and graphic rather than faded

**Do not use when**
- on an element that is not leaving for a reason: the cut reads as a deletion
- on a picture or a device: the fold flattens it, but no cut is drawn where there is no text
- on text set over a picture or a surface of another colour: the slit is the canvas role, so it shows the canvas there, not what is behind

## Params
| name | type | default | meaning |
|---|---|---|---|
| `rule` | enum(ink\|accent) | `ink` | the colour role of the blade's leading edge; accent when the cut is the story |

Params arrive as `data-p-*` attributes and as `ctx.params`; the kit casts them from the beat's `params` object.

## Style variables consumed
- `--mm-color-canvas` (the slit that parts the letters), `--mm-color-ink` or `--mm-color-accent` (the blade's leading edge, a short fade into the role)
- the slit's thickness is 7 % of the element's font size (at least 2 px) and the edge 45 % of it long, so the cut reads next to display type and stays fine on body text
- the exit's length is `exitRatio` of the entrance; easing role `exit` (applied by the kit)

## Legibility and rest notes
For the first 35 % of the exit a blade crosses each line of the text at an even speed, through the middle of its lowercase letters, and nothing else changes: behind its leading edge the letters are parted by a slit of the ground, so the line reads as cut, not struck through. Then the element folds shut onto the middle of the block (its vertical scale falls to 0 about that line) while the slits keep their thickness and close together with it; over the last 40 % of the fold the slits fade. The fold only closes, and at the end of the exit no height and no slit remain, so the last instant leaves nothing; the kit then hides the element. Nothing moves sideways or rotates, and the element never grows, so its text never leaves the safe area.

## Provenance
lemomo-ai/lemo-opuscar, MIT: ideas only; no code taken. The idea of a deletion drawn as a thin rule crossing the element and the element closing onto it is restated in our own code with one slit of the ground per laid-out line, cut through the lowercase middle behind a short edge, fading as the fold shuts.

## Known limits
- the slits span each line's text, not the element's box, so a padded plate is cut across its text only
- the exit lasts `exitRatio` of the entrance, so after an `instant: true` entrance it has no length and the cut never shows: give such a beat its own entrance, or another exit
- the cut height is a fixed share of each line's text box, so a face with an unusual x-height is cut a little above or below its lowercase middle
