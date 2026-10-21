# Eval: golden

## Prompt

> Use the motion-machine skill. Here is the brief: `fixtures/golden/brief.md`. Build it as a 30 s
> film in all three formats and as a clicker deck in 16x9, each in both `editorial` and `kinetic`,
> from the stories in `fixtures/golden/story.film.json` and `story.deck.json`. Cues on a declared
> 120 BPM grid. I am the director; I want to see options for anything that is a matter of taste.

## Expected gate outcome

| Piece | `mm check` | Warnings that may stand (with a reason in the handover) | Exports |
|---|---|---|---|
| film, editorial | exit 0 | W-PACE (6 arrivals per 10 s against calm's 2–5) and W-STAGGER (arrivals that enter with the cut) | 3 MP4 with sound, poster, loop check, review page; `--prove` ok |
| film, kinetic | exit 0 | W-STAGGER (one arrival 0.02 s after its cut settles) | as above |
| deck, editorial | exit 0 | none (G-PEAK, W-LOUDNESS, W-CUE, W-MIX, W-PACE, W-HOLD, W-READ, W-DEAD, W-AMBIENT and W-SUB report SKIP) | `out/deck/`, `handout.pdf`, `walkthrough.mp4`, review page; `--prove` ok |
| deck, kinetic | exit 0 | none | as above |

The warnings that may stand, with their evidence and reasons, are listed in
[tests/golden/accepted-warnings.md](../tests/golden/accepted-warnings.md); any other WARN needs a
fix or a reason of its own.

The pieces must also meet these requirements: stories use style roles and a scene `position`, so
editorial and kinetic differ in entrances and cuts, not only in durations; the first frame (film)
and rest 0 (deck) show the first headline finished (W-HOOK); no run of more than 6 near-empty
frames (W-EMPTY); exports run at `--sub 1`.

Pass also requires: the two films share one story (only `id` differs), so every cut, arrival and
cue instant is identical while more than 30 % of pixels differ at matched instants
(`tests/golden/golden.test.mjs`); the handover follows
[skill/motion-machine/references/handover.md](../skill/motion-machine/references/handover.md).

The finished pieces are `pieces/golden-*`; each passes the gate as cloned.
