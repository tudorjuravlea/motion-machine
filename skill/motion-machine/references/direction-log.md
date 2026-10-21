# The direction log

Read when: before the first entry in `pieces/<id>/direction-log.md`, and whenever `mm review`
shows "No director's note recorded for this round".

The log makes a piece's style traceable to decisions. Entries quote the director directly;
never replace a quotation with your own summary. `mm review` builds `out/review.html`
from it: every `## ` heading opens a round, the first `>` quote in a round is the director's note
and is shown first, and rounds are sorted newest first by the first number in the heading. The
newest round is photographed when `mm review` runs, so run it at the end of every round, not
only at the end of the piece.

## Format

```markdown
# Direction log · <piece id>

Director: <name>. Crew: <agent>. Brief: <path or one line>.

## Gate 1 · Brief

> "<the note the director gave this round, verbatim>"

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 1.1 | Formats | 9x16 + 1x1 (feed) · add 16x9 (site) | "all three, it goes on the README too" | 9x16, 1x1, 16x9 |

## Gate 2 · Treatment
…
```

Rules:
- One section per round, numbered 1 to 7. Each round closes at a gate, so `Gate N` heads round N's
  section; the headings are a file format that `mm review` and the golden tests read, so keep them
  as written. When two rounds share one message (allowed for 20 to 30 s pieces), keep two headings
  and say so in the second: "shared with round 2".
- One row per call. **Options shown** names what was rendered or offered, with a link when
  there is an image (`[option B](options/gate5-cut-b.png)`, relative to `out/`). A call with no
  options says why: "forced by G-EDGE", "arithmetic", "brief fixed it".
- **Director's words** is a quote. When the user delegated the call, write who decided and on
  what authority ("crew, standing in for the director by the brief's instruction").
- A gate-forced change records the rule id, the evidence (instant, selector, measured vs
  threshold) and the options for *how* it was met.
- Every WARN left at the cut gets a row with its reason; the same line goes into the handover.

## Example row set (gate 6)

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 6.1 | G-EDGE: "32 rules" crosses the 72 px margin in 9x16 (194.6 px) | A drop the suffix, put "rules" in the headline · B counter at h1 size · C shorter layout | "A, the figure should be the picture" | figure `32`, headline "rules, measured, not felt." |
| 6.2 | W-PACE editorial 6–8 arrivals per 10 s vs band 2–5 | A cut beats to 5 per window · B accept for this brief | "B: one story in two styles is the point" | accepted, reason in handover |
| 6.3 | Lock | export + check summary | "lock it" | locked at round 6 |
