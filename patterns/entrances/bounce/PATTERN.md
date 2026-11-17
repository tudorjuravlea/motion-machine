# entrances/bounce

## Purpose
An object drops onto its place and bounces, each hop lower, then settles, as its material and weight say: a light rubber object bounces long, a heavy wooden one lands with a hop or two.

## Use when / Do not use when
**Use when**
- an object arrives with weight: a product shot, an icon, a sticker, a card, a picture
- two objects land in one frame and should feel different: give each its own `material` and `weight`, and the lighter or more elastic one bounces more
- the landing should be heard: give the beat a `cue` (`tap`, `knock`, `hit`) and it sounds on every contact

**Do not use when**
- the beat sets type: type never bounces, so this falls and stops at its first contact (use `entrances/drop`)
- a calm or premium brand whose objects glide rather than fall
- several bouncing objects at once with cues: the contacts crowd the mix; keep the cue on the one that matters

## Params
| name | type | default | meaning |
|---|---|---|---|
| `material` | enum(rigid|wood|plastic|rubber) | `plastic` | how elastic the object is: rigid (glass, metal, a phone) keeps 30 % of its speed at a contact, wood 42 %, plastic 55 %, rubber 78 %; plastic and rubber squash a little on each contact |
| `weight` | enum(light|medium|heavy) | `medium` | how heavy it is: a heavy object keeps 35 % less of its bounce than a light one of the same material, and squashes half as much |
| `d` | number | 4 | drop height as a multiple of the format base size (ctx.unit), before the style multiplier; capped by the free room above the element |
| `fall` | number | 0.42 | seconds the first fall takes (up to 2); every hop after it is timed from it |

## Style variables consumed
- `ctx.unit` and `style.motion.travel` for the drop height
- no colour, type or space: the pattern moves the element and never paints it

## Legibility and rest notes
- Closed form (`runtime/kit/bounce.js`): the fall takes `fall` seconds; each contact keeps `e` of the speed (the material's restitution less up to 35 % for weight), so hop k lasts 2·eᵏ·fall and rises eᵏ² of the drop. Bouncing ends when a hop would last under 0.08 s or rise under 1.2 % of the drop, or after 8 contacts. The entrance lasts until the last contact (and its squash), so the schedule knows its length before a frame is drawn.
- Sound: a beat `cue` sounds on every contact (the schedule reads `contactsOf`), the first at its level and each later one quieter by half the physical slope of its impact (10·log10 of its speed against the first, never under −12 dB), so the fall is heard as it is seen. Contacts are at least 0.08 s apart, above the 45 ms retrigger floor.
- The squash is a scale from the bottom edge, widest at each contact and gone 0.05 s either side of it; in the air and at rest the object is its own shape.
- Type never bounces: a beat that sets type falls and stops at its first contact, and never passes its place.
- At p = 1 translate and scale are `none` and opacity is removed. Pure in the beat's seconds: any seek order draws the same frame.
- Reduced motion: the kit draws the finished object fading in (the cues stay where the contacts would be).

## Provenance
- jrouwe/JoltPhysics, MIT: the closed-form restitution bounce (contact times as a geometric series from the coefficient of restitution), restated in our own code. No code taken.

## Known limits
- The floor is the element's own place: it bounces on where it rests, not on another element below it.
- One cue name for every contact; the level falls, the sound does not change character.
- In a deck the contacts sound in the press's sprite at their times, but at one level: the later contacts are not quieter there.
