# Principles

The heuristics the skill applies and the reviewer checks, with the reasoning behind each, followed by ten mechanical rules and where the gate covers each. Credits for the ideas behind them are in `PROVENANCE.md`.

## H-HOOK: strongest image first, never a logo

- The first two seconds carry the piece's strongest thing, because a viewer decides before they understand
- A logo says who, not why: it can close the piece but must not open it
- Storyboard with the sound off first, because many viewers watch muted
- Before describing a reference's opening, measure it: count its frames and timing rather than trusting adjectives

## H-ONE: one idea per press, a figure alone in its press

- One idea per scene in a film and one per press in a deck, so the viewer never reads two things at once
- A figure gets a press to itself so the number is the whole picture and the reading time is spent on it
- Reading time is 0.3 s per word plus the arrival, which is why two ideas do not fit in one scene
- When a piece gets shorter, beats go; the time a line needs to be read does not

## H-INFO: every movement carries information

- Every moving element needs a reason you can state; if you cannot name it, remove the movement
- When a piece feels like too much, halve distance, turn and bounce before adding or removing content
- Ambient motion stays a fraction of the primary: at most 20 % of its travel
- Review each scene at its opening state, its key transition and its final hold

## H-STILL: stillness after a big moment

- After the slam, the count-up or the reveal, hold so the moment lands before anything else moves
- Hold two to three seconds after a new figure appears, and a fraction of a second before a key result
- Asymmetric timing: a deliberate build is slow and linear, a resolution is fast and eased-out

## H-FILL: use the frame

- Centre content under the header row and slightly above the middle; never pool it low like a poster
- Every frame must pass as a legal still, because the viewer pauses and the stills are what the reviewer sees
- Brand guidelines specify still pages; time, scale and camera movement are left open, which leaves a film to decide those for itself

## H-FACTS: every number cites a story fact with a source

- Facts come from the source material; placeholder copy never ships
- Never fabricate a statistic, quote or name; a missing fact is asked for, not invented
- The handover lists what could not be verified: frames watched instead of playback, no listening, names, dates, faces and bent brand rules

## H-FACES: no face without consent

- A face appears in a piece only with the person's consent
- Generated footage never draws type or logos; real fonts and marks are composited in code, with the area reserved for type kept blank in the plate

## H-LAST: the final rest is the line to remember

- After the last arrival the picture stays unchanged for two seconds or more
- The last frame holds; a habitual fade-out ending is a banned look unless the style names it [SPEC §15]
- A deck's last press adds at most one element, and the press after it changes nothing

## H-REF: take a reference's grammar, never its content

- Measure a reference (shot lengths, cut kinds, arrival tempo) and carry the numbers into a motion style; leave its pictures and words behind
- Offer two or three genuinely different directions together and record the choice as a quotation from the director
- Keep a ledger of every note raised, and check each new cut against all of it

## Three habits of prompt-written film that the grammar corrects

- UI rules applied to film (sub-300 ms caps, no ease-in): the grammar uses per-role budgets and allows ease-in on exits and wind-ups [SPEC §15]
- No numbers: "feels premium" is not a spec; every pattern carries tokens, a minimum hold and a minimum legible size (G-LITERAL, G-LEGIBLE) [SPEC §7]
- Wall-clock logic: every value is computed from time alone and springs are at rest before the clip ends (G-TIME, G-DETERMINISM, G-REST) [SPEC §7]

## Ten mechanical rules and where they live

| rule | now covered by |
|---|---|
| 1. every element has an entrance | W-ENTRANCE (`data-keep` exempts) |
| 2. outgoing content stays visible and unfaded at a cut unless cuts are velocity-matched | not yet a rule |
| 3. text contrast 4.5:1 (3:1 for large text) at ten sampled times | W-CONTRAST, sampled at rests rather than ten fixed times |
| 4. 1080p minimum sizes of 60, 20 and 16 px | G-LEGIBLE with the stricter SPEC §12 floors |
| 5. stagger span at most 0.5 s; first tween at least 0.1 s after the cut | W-STAGGER |
| 6. at most two tweens per scene share an ease; at least three distinct eases | not yet a rule |
| 7. ambient amplitude at most 20 % of primary; text scale within 5 % | W-AMBIENT |
| 8. dead zone over 1 s, overlap over 30 %, off-frame element | G-DEAD (4 s window), G-OVERLAP (any overlap), G-EDGE |
| 9. one caption group at a time, within the style's words-per-group range | W-CAPTION |
| 10. effect peaks 6-8 dB over the bed, cues per 10 s in range, at most two at once, fades present | not yet a rule in the ledger; W-CUE and G-LOUD cover beat drift and loudness only |
