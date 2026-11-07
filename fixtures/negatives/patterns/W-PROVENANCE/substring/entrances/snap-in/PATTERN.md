# entrances/snap-in

## Purpose
Brings an element in by stepping its opacity from hidden to shown at the half-way point of its entrance.

## Use when / Do not use when
Use when: a terse, mechanical arrival suits the beat (a counter tick, a status flag).

Do not use when: the element is a headline that should ease in, or the style is calm.

## Params
| name | type | default | meaning |
|---|---|---|---|
| at | number | 0.5 | the progress at which the element appears |

## Style variables consumed
None in CSS; the duration comes from the role the schedule gives the entrance (`--mm-dur-standard` by default).

## Legibility and rest notes
At p = 1 the element is fully opaque with no transform; it adds no text and changes no size.

## Provenance
- hyperframes, Apache-2.0, the step timing, re-derived as a function of p

## Known limits
A hard step reads as a glitch on slow styles; it carries no travel, so W-FADE-ONLY counts it as a non-fade only by name.
