# fixtures/release

One folder per `mm release-check` sweep. Each is a small stand-in for a repository root that breaks
that sweep (and, where useful, holds a near miss the sweep must let through). Run one with

    node scripts/mm.mjs release-check --root fixtures/release/<name> --only <SWEEP>

`clean/` passes every sweep once an `out/check.json` is written beside `pieces/golden-ok/` (that file
is git-ignored with every `out/`, so the test writes it into a temporary copy).

| folder | sweep that must fail | the defect |
|---|---|---|
| `brand-word/` | R-BRAND | a word from the folder's own `contracts/brand-words.txt`, as a whole word; `zetabyte` must not match the short word `zeta` |
| `secret/` | R-SECRET | the documented AWS example key in a text file, and a `.env` file |
| `abs-path/` | R-PATH | an absolute home-folder path in a note (`notes.md`), and in the other spellings (`forms.md`): the dashed project-folder form, git-bash and WSL drive paths, JSON-escaped slashes, a tilde with an escaped slash; near misses beside them must pass |
| `email/` | R-EMAIL | two personal-looking addresses; example domains, no-reply addresses, non-addresses (`pkg@1.2.3`) and a `NOTICE` must pass |
| `cdn-url/` | R-URL | a CDN URL in `runtime/`; the SVG namespace beside it must pass |
| `no-licence/` | R-LICENSE | a LICENSE that is not Apache-2.0 |
| `font-no-licence/` | R-FONT-LICENSE | a font folder without an OFL licence; a licensed one beside it must pass |
| `bad-pattern/` | R-PATTERNS | a pattern folder with a card and nothing else |
| `golden-unchecked/` | R-GOLDEN | a golden piece with no `out/check.json`: SKIP, not a finding; the test writes a failing `out/check.json` into a copy to make R-GOLDEN fail |
| `strategy-file/` | R-STRATEGY | a `DECISIONS.md` and a file under `docs/evals/`; `docs/decisions-guide.md` must pass |
| `history/` | R-HISTORY | one file per kind of marker: a decision id, a finding id, a milestone or plan id, a dated note, a version narrative, a round narrative, a pointer to a private record, a philosophy framing; every marker is invented (ids in the 9 range), and the exact `file:line` of each is pinned in `tests/cli/release-check.test.mjs` |
| `history-names/` | R-HISTORY | file and folder names that carry a marker; `plain.md` must pass |
| `finder-dup/` | R-DUP | `notes copy.md`, `story 2.json` and a folder `rise 2/` named like Finder or iCloud duplicates; `chapter-2.md` and `notes-v2.md` must pass |

The sweeps never read `fixtures/release/` when run from the repository root, so these defects do not
fail the real release check. The key and the paths here are examples, not credentials.
