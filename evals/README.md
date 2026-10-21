# Evals

Prompts for the `motion-machine` skill with the gate outcome each one should reach.
An eval is run by giving the prompt to an agent that has the skill installed, in a clean checkout,
with a person (or a second agent) answering as the director. It passes when the expected outcome
below holds on the artefacts, read from the piece folder, never from the transcript.

| Eval | Prompt | Expected outcome |
|---|---|---|
| [golden](golden.md) | the golden brief, film and deck in two styles | four pieces, `mm check` exit 0 each, only the [accepted warnings](../tests/golden/accepted-warnings.md), `--prove` ok |
| [lumen-ledger](lumen-ledger.md) | a two-paragraph brief for a fictional receipts app | one 20 s film in `calm-product`, `mm check` exit 0 |

What every eval also checks, whatever the prompt:

- The agent asked only for what the brief lacked (round 1) and waited for a yes at each round; when
  the director contradicted the brief it followed the director and logged the change.
- `story.json` was written from a beat-sheet table first (AXIOMS.md AXIOM 6); every pattern id and
  style role resolves; the first frame is the hook (G-HOOK).
- `direction-log.md` has a section for each round, 1 to 7; `defects.md` exists.
- Every WARN in `out/check.json` has a line in the log and in the handover.
- The handover's "Unverified" section is present and not empty.
- No threshold, pattern or kit file was edited to make a piece pass.

An eval passes or fails on the artefacts; record results wherever your project tracks them.
