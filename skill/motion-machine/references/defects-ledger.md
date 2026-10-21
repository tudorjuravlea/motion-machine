# The defects ledger

Read when: the director gives a note, a gate fails on something that was fine before, or a
re-check is due after a new cut.

`pieces/<id>/defects.md` holds every note with a timecode (film) or a press (deck), written
**before** anything is changed, so that a fix can be checked against what was actually asked
and so that each new cut is re-checked against every earlier note (regressions are the reason it
exists). `mm review` appends it to `out/review.html`.

## Format

```markdown
# Defects · <piece id>

| # | Where | Note | Raised by | Status | Fix |
|---|---|---|---|---|---|
| D1 | 19.0–23.0 s · 9x16 · gate | figure "32 rules" runs off the right edge | gate G-EDGE | fixed | suffix moved to the headline (story) |
| D2 | press 10 · cta | last press brings headline and URL together | gate G-QUIET | fixed | end card split over two presses |
| D3 | all · stat-hero 16x9 | figure box overlaps the headline by 9.8 px | gate G-OVERLAP | accepted | layout defect, logged in the piece folder's `gaps.md`; worked around in the story |
```

- **Where:** `mm:ss.s` or seconds for a film, with the format when it is format-specific;
  `press N` for a deck; `all` when it is the whole piece.
- **Raised by:** the director (quote the note), the crew, or the gate (rule id).
- **Status:** `open` (not yet touched) · `fixed` (the change landed and the re-check passed) ·
  `regressed` (a later cut brought it back: reopen, do not add a new row) · `accepted` (the
  director chose to keep it; the reason is in the Fix column and in the handover).
- **Fix:** what changed and where (story, style, pattern, kit). A fix in a pattern or the kit is
  never made inside a piece: log it, report it, and work around it in the story if an honest
  story change exists.

## Re-check

After every cut: walk the ledger top to bottom against the new stills and the new
`out/check.json`. A `fixed` row that is wrong again becomes `regressed`. Say in the round's log
entry that the re-check ran and how many rows changed status.
