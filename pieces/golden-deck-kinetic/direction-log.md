# Direction log · golden-deck-kinetic

For this example the crew stood in for the director; rows marked *stand-in* are crew calls with their reasons, not quotes from a person. Brief: `fixtures/golden/brief.md` (deck: ten presses across the same eight scenes, 16x9). Sibling with the identical story: `golden-deck-editorial`.

## Gate 1 · Brief

> *stand-in:* "A talk opener, about five minutes, English with one Romanian line, a presenter on a clicker. Rest 0 is the finished hook, no text over text in the cuts, every rest a finished picture, two brands rather than one recoloured, the hook the largest type."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 1.1 | Audience, running time, language | from the brief | *stand-in:* "a meetup audience, five minutes, English" | 16x9 deck, ten presses |
| 1.2 | Facts | f1, f2, f3; f2 is the gate's rule count (20 G- and 17 W- rule files) | *stand-in:* "900 and 37 cite f1 and f2; the screen says what the gate checks" | f2 "The gate checks 37 rules: 20 errors and 17 warnings.", SPEC §7 |
| 1.3 | Findings | known layout and kit issues, written into `defects.md` before the story changed | *stand-in:* "every finding gets a ledger row first" | D5 to D17 |

## Gate 2 · Treatment

> *stand-in:* "Same eight scenes as the film, written in the style's roles; presses, not seconds, so reading time is the presenter's. Keep the ten presses. Change a press only where a frame inside it is not a legal still."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 2.1 | Presses | hook 1, problem 1, time 1, style 1, patterns 1, gate 2, both 1, cta 2 = 10, 11 rests; G-LENGTH 6–20 | *stand-in:* "merge the half-finished rests; the figure keeps a press of its own (H-ONE)" | 10 presses, 11 rests |
| 2.2 | Rest 0 | hook headline `step: 0` (G-HOOK) | *stand-in:* "the first rest is the hook, finished" | G-HOOK PASS |
| 2.3 | Roles and positions | every beat `style:<role>`; positions opening, related, topic, related, topic, climax, related, outro; here: entrances slam, words, punch, drop; cuts hard-cut, push, hard-cut, push, whip-pan (blur off), hard-cut, hard-cut | *stand-in:* "the style decides" | no explicit entrance or cut |
| 2.4 | Overrides | gate `cutParams: { amount: 0 }` (kinetic whip-pan blur off) | *stand-in:* "logged" | applied |
| 2.5 | Text over text in the climax cut | figure at 0 s · at 0.5 s (after the outgoing scene has faded) | *stand-in:* "0.5: nothing lands on the dissolving tiles; shared with the editorial deck" | figure at 0.5 s on its press |
| 2.6 | G-QUIET: the last press brings two elements (headline and URL) | end card over two presses · drop the URL · URL in the headline | *stand-in:* "the URL is the call to action, and the name lands alone first" | cta `presses: 2`, URL on step 2; G-QUIET PASS |
| 2.7 | Mid-press reflow (found by a 1/40-press sweep of the page) | a slot that arrives later in a press re-centres what is on screen: the style headline jumped 173 px when its plates arrived 0.4 s after it; the time, gate and "both" presses jumped 34 to 55 px. A every beat of those presses at `at: 0` · B keep the stagger | *stand-in:* "A: a stagger that ends in a snap is not a move" | time, style, gate (step 2) and both: every beat at 0; the sweep finds no mid-press jump; the jump at the press instant stays (D17) |
| 2.8 | Press 1 only adds the hook subtitle; handout stubs | A fold the subtitle into press 0 (9 presses) · B keep 10 presses | *stand-in:* "B: the ten presses are pinned by `tests/contracts/schemas.test.mjs`, and the stubs on the gate and CTA presses come from `scripts/export.mjs` either way" | kept (D14) |
| 2.9 | The count passes through "1 rules" | kinetic draws the figure with `entrances/punch` from its `text`, so no count passes through it | *stand-in:* "nothing to change in the story" | verified (D15) |

## Gate 3 · Style

> *stand-in:* "Kinetic preset: signal over kinetic. The brand owns the grid, so the preset is copied with its composition. A deck has no picture clock, so no grid; cues ride the presses in `mm serve` and are not mixed."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 3.1 | `style.json` | `mm new --kind deck --style kinetic --id golden-deck-kinetic`, copied from `styles/presets/kinetic.json`; composition center, 1.2, compact | *stand-in:* "as composed" | applied |
| 3.2 | Cues | tick (sub, problem, 900, plates, tiles), riser (37), hit (Povești), complete (end card) | *stand-in:* "the film's cue logic on presses" | heard only in `mm serve` |

## Gate 4 · Style frames

> *stand-in:* "Signed: eleven finished rests, and the two decks share no picture."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 4.1 | Rests | both decks' eleven rests, `out/contact.png` | *stand-in:* "1 the hook finished at rest 0; 2 one idea per rest, 37 alone at rest 6; 3 content in the upper middle; 4 the subtitle, the rule families and the address stay small at 16x9 (open); 5 no banned look; 6 900 and 37 cite f1 and f2; 7 the last rest is the line and the address" | signed |
| 4.2 | Type and alignment, measured in the page | centred at every rest; hook 169 px against 135 px (lead) and 101 px (content) | *stand-in:* "the hook leads; the editorial deck reads as another brand" | hook leads; alignment comes from the brand |
| 4.3 | Slots that arrive later take no room on a deck rest, so a press reflows the rest (rest 6 → 7: the figure moves up as the headline lands) | layout behaviour | *stand-in:* "keep: every rest is centred and finished" | kept (D17) |

## Gate 5 · Animatic

> *stand-in:* "Judged from a 1/40-press sweep of the page and the walkthrough."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 5.1 | Presses in motion | 401 instants: text of two scenes over each other, slots overlapping, jumps; `out/walkthrough.mp4` records the transitions | *stand-in:* "kinetic's climax is a whip-pan; at 1/40-press steps no frame shows text from two scenes over each other. The gate headline's slam starts with its box touching the figure's box for 8/40 of a press; the ink does not cross" | approved |

## Gate 6 · Cut

> *stand-in:* "Lock."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 6.1 | Gate | `mm check --sub 1` exit 0 → `mm export --prove` → `mm sound` (decks are not mixed) → `mm check --sub 1` exit 0 → `mm review` | *stand-in:* "green" | PASS · WARN · SKIP 25 · 0 · 10; prove ok |
| 6.2 | Ledger re-check | `defects.md` against the new rests and `out/check.json` | crew: "no regressions" | — |
| 6.3 | Lock | review page | *stand-in:* "lock" | locked |

## Gate 7 · Deliver

> *stand-in:* "Signed off: deck, handout, walkthrough, review page."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 7.1 | Deliverables | `out/deck/`, `out/handout.pdf` (11 pages, brand faces embedded), `out/walkthrough.mp4` (10 transitions) | *stand-in:* "all three" | exported |
