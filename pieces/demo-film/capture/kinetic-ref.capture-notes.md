# Motion capture notes: kinetic-ref

Measured from `golden-film-kinetic-16x9.mp4`: 900 frames at 30 fps (30 s), greyscale at 160 px wide (entrance signatures at 320 px); candidate events found at 10 fps and read again at 30 fps.
Grammar only, never content (H-REF): no text, colour or image of the reference is kept. Capture is best effort; the director approves the composed style before use (SPEC §13).

## Shot list

| # | start (s) | end (s) | length (s) | cut in | transition (s) | confidence | evidence |
|---|---|---|---|---|---|---|---|
| 1 | 0.00 | 4.00 | 4.00 | film start | - | - | - |
| 2 | 4.00 | 7.50 | 3.50 | hard | 0.00 | 0.98 | one frame pair replaces 98 % of the picture |
| 3 | 7.50 | 11.50 | 4.00 | push (left) | 0.17 | 0.81 | 4 frame pairs shifted left, mean error cut by 81 % |
| 4 | 11.50 | 15.00 | 3.50 | hard | 0.00 | 0.90 | one frame pair replaces 90 % of the picture |
| 5 | 15.00 | 18.50 | 3.50 | push (left) | 0.17 | 0.77 | 4 frame pairs shifted left, mean error cut by 77 % |
| 6 | 18.50 | 22.50 | 4.00 | whip-pan (left) | 0.07 | 0.90 | 1 frame pair shifted left, mean error cut by 90 %, the picture cleared in 0.07 s |
| 7 | 22.50 | 26.50 | 4.00 | hard | 0.00 | 1.00 | one frame pair replaces 100 % of the picture |
| 8 | 26.50 | 30.00 | 3.50 | hard | 0.00 | 0.71 | one frame pair replaces 71 % of the picture |

A gradual cut starts at the last frame before the picture begins to change; a hard cut at its first new frame. The transition column is the visible change; the eased tails of a cut are timed under "cut timing" below.

## Arrivals

- onset 0.55 s, about 475 ms (visible burst 0.333 s, picture change 0.242 grey levels), added to a film that opens finished: no headline entrance read
- onset 4.05 s, about 605 ms (visible burst 0.4 s, picture change 13.465 grey levels), opens its shot: slam|punch
- onset 7.82 s, about 361 ms (visible burst 0.4 s, picture change 5.185 grey levels), opens its shot: slam|punch
- onset 8.47 s, about 3141 ms (visible burst 0.7 s, picture change 2.208 grey levels)
- onset 9.07 s, about 55 ms (visible burst 0.133 s, picture change 1.225 grey levels)
- onset 11.53 s, about 395 ms (visible burst 0.133 s, picture change 3.27 grey levels), opens its shot: family not distinguishable
- onset 11.92 s, about 504 ms (visible burst 0.133 s, picture change 3.214 grey levels)
- onset 15.17 s, about 79 ms (visible burst 0.067 s, picture change 0.662 grey levels)
- onset 15.43 s, about 656 ms (visible burst 0.633 s, picture change 60.77 grey levels)
- onset 15.50 s, about 183 ms (visible burst 0.433 s, picture change 60.019 grey levels)
- onset 15.80 s, about 277 ms (visible burst 0.133 s, picture change 1.39 grey levels)
- onset 18.57 s, about 40 ms (visible burst 0.033 s, picture change 2.088 grey levels)
- onset 18.86 s, about 1016 ms (visible burst 0.6 s, picture change 5.182 grey levels)
- onset 20.06 s, about 504 ms (visible burst 0.4 s, picture change 0.401 grey levels)
- onset 22.50 s, about 1089 ms (visible burst 0.4 s, picture change 7.03 grey levels), opens its shot: slam|punch
- onset 23.07 s, about 565 ms (visible burst 0.367 s, picture change 0.248 grey levels)
- onset 26.59 s, about 559 ms (visible burst 0.4 s, picture change 11.14 grey levels), opens its shot: slam|punch
- onset 26.99 s, about 620 ms (visible burst 0.533 s, picture change 0.401 grey levels)

## Derived

- pacing.energy: **high**: weighted votes 1 at the calm|medium edge and 1 at the medium|high edge (positive = past the edge) from median shot 3.75 s (votes -1 / 1, weights 0 / 0); 6 arrivals per 10 s (votes 1 / -1, weights 0 / 0); hard-cut share 0.571 (votes 0 / 1, weights 0 / 20); median timed cut 0.261 s (push, whip-pan, wipe, iris under a reference ease-in-out) (votes 1 / 1, weights 4.8 / 15.8). Bands are calibrated on labelled films; a weight of 0 means the feature did not part those energies there
- pacing.arrivalsPer10s: [4,9] from 18 arrivals over 30 s (min and max over 10 s windows)
- arrivals not named as a role (outside every kinetic role's basin): 3141, 55, 1016, 1089 ms
- motion.durations.quick: 152 ms, median of 2 timed changes in its basin (arrivals, and cuts whose pattern takes quick)
- motion.durations.standard: 280 ms, median of 5 timed changes in its basin (arrivals, and cuts whose pattern takes standard)
- motion.durations.slow: 562 ms, median of 8 timed changes in its basin (arrivals, and cuts whose pattern takes slow)
- cut timing (move easing): push (left) at 7.5 s, 280 ms (its pattern takes standard); push (left) at 15 s, 280 ms (its pattern takes standard); whip-pan (left) at 18.5 s, 121 ms (its pattern takes quick)
- motion.durations.hold: 2576 ms, median of 7 rests (settle of a shot's last arrival to its end: 2.97, 2.84, 2.58, 2.42, 1.94, 2.86, 2.39 s). The film's rests are set by its story; the style's hold is a floor they stay above
- pacing.holdMinS: 1.9 s, the shortest rest (SPEC §3: the floor W-HOLD reads is a rest, so the shortest shot, 3.5 s, is reported but not used)
- transitions.opening: transitions/hard-cut (first cut, 4 s)
- transitions.outro: transitions/hard-cut (last cut, 26.5 s)
- transitions.topic: transitions/hard-cut (most common kind, 4 of 7)
- transitions.related: transitions/push (second most common kind, 2 of 7)
- transitions.climax: transitions/hard-cut (the cut at 22.5 s opens the longest shot in the last third, 4 s)
- entrances.headline: entrances/slam, family slam|punch (4 of 5 shot openings: 4 s: slam|punch (shift -8, shift -6, shift -4, scale 1.15); 7.8 s: slam|punch (shift -8, shift -6, shift -4, shift -3); 11.5 s: not distinguishable; 22.5 s: slam|punch (shift -8, shift -4, scale 1.15, scale 1.08); 26.5 s: slam|punch (scale 1.15, scale 1.15, scale 1.08); shot 1 left out: the film opens finished (frame 0 already holds 90 % of the content its first arrival settles into, as an instant hook does), so it has no headline entrance to read). Inside a family the members are not distinguishable at this resolution; the kinetic member is used when it is one, else the first

## Defaulted (from styles/motion/kinetic.json, the high preset)

- transitions.policy: velocity-matched (whether a cut owns the exit is not measurable from frames)
- entrances.body, figure, plate: kinetic (only the headline family is read from frames)
- motion.easings: kinetic (curves are not measurable from frames; the enter and move curves were assumed to fit the durations)
- motion.spring: kinetic (spring constants are not measurable from frames)
- motion.travel, overshootMax, exitRatio, stagger: kinetic (not measured)
- sound: kinetic (frames only; the audio track is not read)

## Limits

- Cuts are read at 30 fps: a transition shorter than two source frames (0.07 s) reads as a hard cut, and a push that clears the picture within 0.1 s reads as a whip-pan.
- A fade to a flat colour that comes back within 0.1 s is a dip; one that stays flat longer is a fade into a shot that is still empty. A crossfade between two shots that both carry text (owns-exit) is drawn through the canvas like a color-dip, so the two can trade names.
- Arrivals that start within 0.15 s of each other, or in the region that is already moving, count as one; an arrival during a transition belongs to the cut, and one that runs on out of a gradual transition shows only its tail (its entrance is not read).
- A camera move that shifts the whole picture reads as a push. Fine grain or noise raises the activity floor and can hide small arrivals.
- Entrance families: slam or punch (lands from above or shrinks onto its place; a drop reads here too), rise or fade (rises from below or fades in place), blur-fade, pop (grows onto its place). Members of one family are not told apart, nor are body, figure and plate entrances; a family must hold three quarters of the shot openings read. A film that opens finished (frame 0 already holds half the content its first arrival settles into, as an instant hook does) has no headline entrance in its first shot, which is left out.
- A spring-driven arrival (a plate dropped on a spring and stopped at its first crossing) can land in a duration role's basin and pull that derived role, although the kit times it by its spring, not by the role.
- Durations assume the preset's enter and move curves (a spring-shaped arrival is tried against its text spring); a duration role takes the arrivals in its basin and the cuts whose pattern takes it. The hold the style sets is a floor; the rests measured are the story's.
- Thresholds are provisional (SPEC §12): activity floor median + 6·MAD, a cut replaces half the content cells, 0.4 s refractory window; energy anchors are calibrated on eight labelled films.
