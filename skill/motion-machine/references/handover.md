# The handover

Read when: at gate 7, after the director has called lock and every format is exported.

The handover is the last message of a piece and a file beside it. It says what was made, where it
is, what rules it obeys and, above all, what nobody verified (AXIOMS.md AXIOM 8). Fill every section; write
"none" rather than leaving one out.

## Template

```markdown
# Handover · <piece id>

**Location:** pieces/<id>/ (exports in out/)
**Kind and length:** film, 30.0 s at 30 fps · or · deck, N presses (N+1 rests)
**Formats and sizes:** 9x16 1080×1920 (x MB) · 1x1 1080×1080 (x MB) · 16x9 1920×1080 (x MB)
**Style:** <preset or composed: brand + motion, `from` paths>
**Audio:** <track | none>; bpm <n> (<declared | measured>); cues: <list>; loudness <LUFS> / <dBTP>

## Scenes
| # | Scene | s / press | One line |
|---|---|---|---|

## Gate result
`mm check` exit <0>, journal <last receipt id | none>, story version <16 hex>; G- all PASS; SKIP: <rule: reason>. `--prove`: <ok, n frames per format>. `mm verify-export` per format: <ok, or the failed QA- check>; its SKIPs with their reasons.

## Warnings and why they stand
| Rule | Evidence | Why it stands | Decided by |
|---|---|---|---|

## Changes the gates asked for
| Rule | Change | Logged as |
|---|---|---|

## H- rules applied
H-HOOK … H-REF: one line each on how it was applied, or "not applicable" with the reason.

## Named gaps
<what no pattern could do, the stand-in used, where it is recorded (the piece folder's `gaps.md`)>

## Unverified
- Playback was not watched by a human at full speed; pacing was judged from stills and numbers.
- Audio was not heard; loudness and cue placement were measured, not listened to.
- Names, dates, URLs and figures need a second read by a person: <list them>.
- Faces: <none | who, consent status>.
- Bans lifted: <none | which, why>.
- Anything else not run: <e.g. the deck was not presented on a projector>.

## Sign-off
Director: <name>, <date> · or · pending
```

## Rules

- Do not write the handover while the last edit is newer than the last check: the `journal` in `out/check.json`
  must be the id of the last receipt in `out/studio/journal.jsonl` (none in both when the story was never edited
  through the journal). Otherwise run `mm check` again first. State the check's `journal` and the story `version`
  in "Gate result".
- "Assets" are in the handover: for every asset the piece uses that MM did not draw, its `assets/<name>.licence.json`
  (source, licence); W-ASSET-LICENSE rows are warnings like any other. `mm credits <piece>` lists the credits to
  show; put them on the end card or a credits scene.

- Every WARN in the last `out/check.json` appears in "Warnings and why they stand"; a WARN with no
  row means the handover is not finished. A row says that the director accepted it, in a line.
- "Unverified" is never empty: a machine cannot watch or listen for you.
- Sizes and durations come from `ffprobe` and `out/export.json`, not from memory.
- The handover names the commit or the date of the round it describes.
