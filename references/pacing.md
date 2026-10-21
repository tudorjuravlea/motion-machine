# Pacing

How long things stay, how often something new arrives, and where a film breathes. Numbers marked provisional may move as more pieces are measured against them. Credits for the ideas behind these numbers are in `PROVENANCE.md`.

## Holds

- The default hold is 1 s; after a new figure appears hold 2-3 s; holds of 6-30 s are only for a scene under narration
- A rest shorter than the style's hold floor (default 1.2 s) draws W-HOLD [SPEC §3]
- Before a key number lands, pause 0.3-0.5 s so the eye is already in place
- Explanatory verbs default to 1 s on a smooth curve; writing text takes 1 s for a short group and 2 s for a long one; a copy that morphs away from its source takes 1-2 s
- Stagger defaults: 0.05 s per item; 0.1 s for four to eight items; 0.25 s for three or four large ones; 0.5 s for two
- Here a cascade is capped at 0.5 s in total, and a scene's first arrival waits 0.1 s after its cut settles (W-STAGGER)
- Gaps of 30-80 ms between staggered items read as one gesture; wider gaps read as a list

## Arrivals per 10 seconds

- Four seconds with no arrival, departure, cut or move is dead time (G-DEAD, provisional)
- Dead time is measured over four seconds, not one, because a deliberate hold is not dead [SPEC §12]
- A style declares a band of arrivals per 10 s; the default is 3-6, and W-PACE reads it [SPEC §3]
- Starting bands by energy, still to be measured: calm 2-4, medium 3-6, high 5-9 [SPEC §3]
- A scene layers its motion: primary at full strength, secondary at 30-50 %, ambient at 10-20 %
- Ambient drift never exceeds 20 % of the primary travel and text scale never oscillates beyond 5 % either way (W-AMBIENT)
- A piece runs through three phases, build, breathe and resolve, with the share of each declared by the style

## Reading time

- Allow 0.3 s for each word on screen, on top of the time the words need to arrive (W-READ, provisional)
- To learn how long a line must remain, read it aloud at a natural pace; an estimate is not a measurement
- When a piece has to get shorter, drop beats; the reading time of each remaining line stays as it was
- Design for muted playback: the piece has to make sense with no audio

## First and last seconds

- Open on the piece's strongest image within the first two seconds; a logo is not that image
- Keep the ending quiet: the last arrival has settled at least two seconds before the final frame (G-QUIET, provisional)
- The final rest holds; it does not fade unless the style names a fade as its outro [SPEC §15]
- The last frame is the line to remember, and it must be a legal still
- A deck's last press introduces at most one element

## One idea at a time

- One idea per scene in a film and one idea per press in a deck
- A figure stands alone in its press; the number is the whole picture [SPEC §7]
- After a big moment, be still: hold after a slam, a count-up or a reveal before anything else moves
- When a scene feels too busy, halve distance, turn and bounce before adding anything
- Motion that carries no information is removed, not softened

## Music-aware scenes

- If music is planned or possible, make every scene last a round count of beats from the first draft
- Verify against the beat map that no cut sits more than a frame away from a beat
- A music edit is made on a downbeat: fade across 12 ms with an equal-power curve, finishing slightly ahead of the beat so its attack survives
- A sound cue within 40 ms of a beat is snapped to it; further away it is reported (W-CUE) [SPEC §9]

## Camera moves

- Eight moves cover the grammar: hold (most beats), push-in (scale to 0.6-0.8 of the frame for emphasis), pull-back (reveals context after a detail, about 2 s ease-in-out), pan, reframe, orbit (a very slow turn for depth), rack-focus, dolly-zoom (once, for a reveal)
- Ken Burns drift stays between 1.03 and 1.06; parallax layers move at 1, 0.5 and 0.2

## Length and format

- Film length is 20-60 s and a deck has 6-20 presses (G-LENGTH, provisional) [SPEC §12]
- One story renders in every format the brief names: 9x16, 4x5, 1x1 and 16x9
- On square and portrait frames, scale the end card up by at least 1.5 times
- A looping GIF for a feed is 12 fps at 1200 by 675 with 160 colours and stays under 5 MB; its cover is the first frame rendered at twice size
- Review each scene at three points: how it opens, its main transition and where it ends; check separately that a looped piece meets itself
