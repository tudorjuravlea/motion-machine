# Contributing

Thank you for helping. Three documents explain how the repository thinks: [AXIOMS.md](AXIOMS.md)
holds the rules every change must keep (a change that breaks one is wrong even if every test
passes), [SPEC.md](SPEC.md) is the grammar, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) is a
ten-minute tour of the parts. [REGENERATE.md](REGENERATE.md) says how each unit is rebuilt from the
spec and the tests. Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md); security
problems go through [SECURITY.md](SECURITY.md), not a public issue.

## How a change gets in

1. Fork the repository and make a branch from `main` for one change.
2. Make the change with its tests (set up and test as below).
3. Before you open a pull request, run `npm run test:unit`, `node scripts/mm.mjs pattern lint` and
   `node scripts/mm.mjs release-check`, plus the browser tests for what you touched. There is no
   separate lint, typecheck or build step: the pattern lint and the release sweep are the checks.
4. Open a pull request against `main`. CI runs the whole suite. A pull request lands as one squashed
   commit whose message is the pull request's title and description, so write those for the history,
   and the branch is deleted after it merges. `main` cannot be force-pushed or deleted.

## Set up

```
npm ci
npx playwright install chromium
node scripts/mm.mjs doctor
```

`npm run mm -- <verb>` is the same as `node scripts/mm.mjs <verb>`.

`npm test` runs the whole suite. It renders pages in Chromium and takes a while, so CI runs it as
three groups side by side:

| Script | Runs |
|---|---|
| `npm run test:unit` | the tests that launch no browser |
| `npm run test:browser` | everything that launches Chromium, directly or through `mm check`, `export`, `stills` or `studio`, outside the golden pieces |
| `npm run test:golden` | `tests/golden/`: the shipped example pieces, built and gated end to end |
| `npm run test:groups` | proves the three groups cover every `tests/**/*.test.mjs` file exactly once; a new test file that fits no group fails it |

`MM_TEST_SHARD=2/3 npm run test:browser` runs the second of three slices of a group (also for
`test:unit` and `test:golden`); put the variable before the script, not a flag after it. Run the
files you touch while you work, for example `node --test tests/check/length.test.mjs`, or a folder
with `node --test --test-concurrency=1 "tests/kit/*.test.mjs"`. Browser tests can time out when many
run at once; run a file that timed out on its own before calling it broken, or slow the waits down
with `MM_TIMEOUT_SCALE=2`. Run the whole suite and `node scripts/mm.mjs release-check` before you
open a pull request.

These environment variables apply to the CLI and to the tests:

| Variable | Effect |
|---|---|
| `MM_TIMEOUT_SCALE` | multiplies the page-ready and slow-frame waits (default 1); raise it on a slow or busy machine |
| `MM_WORKERS` | caps the default number of `mm export` workers (a positive whole number); lower it when several exports run at once |
| `MM_NO_SANDBOX=1` | runs the Chromium of the network captures (`mm capture site`, `mm brand capture`) without its sandbox, for a container that runs as root |
| `MM_DEBUG=1` | prints the stack of a failure instead of the one-line `mm: <message>` |
| `MM_TEST_SHARD` | `i/n`: the slice of a test group to run, as above |

## Add a pattern

A pattern lives in `patterns/<group>/<name>/` and is complete or it does not exist (AXIOM 4).

1. Search first: `node scripts/mm.mjs pattern list` and
   [the patterns cheatsheet](skill/motion-machine/references/patterns-cheatsheet.md). Extend a
   close pattern rather than write a parallel one.
2. Create the files SPEC section 5 requires for the group (`pattern.js`, `pattern.html`,
   `pattern.css`, `demo/story.json`; a `sound` pattern takes `demo/cue.json` instead, and may be a `recipe.json` in place of `pattern.js`). CSS reads
   only `--mm-*` style variables and spring roles; no literal colour, family, size or duration
   (AXIOM 2, rules G-BRAND and W-LITERAL).
3. Write `PATTERN.md` with exactly the seven sections of
   [contracts/pattern-card.md](contracts/pattern-card.md), in order, none empty: Purpose; Use when /
   Do not use when; Params; Style variables consumed; Legibility and rest notes; Provenance; Known
   limits.
4. Lint it: `node scripts/mm.mjs pattern lint <group>/<name>` must pass (an incomplete folder is
   not listed).
5. Photograph it in every preset and look at the result:
   `node scripts/mm.mjs pattern stills <group>/<name> --style all`. Check each format you claim to
   support; say in Known limits which you do not.
6. Provenance: `original`, or one line per source in the card (name, licence, what was taken, what
   changed) plus a row in [PROVENANCE.md](PROVENANCE.md) (rule W-PROVENANCE, which warns in `mm check` and fails `mm pattern lint` and `release-check`). A source whose
   licence forbids reuse gives principles in your own words, never code or copy (AXIOM 11). Add a
   notice to [NOTICE](NOTICE) when permissive code lands.
7. Add a row for the pattern to
   [the patterns cheatsheet](skill/motion-machine/references/patterns-cheatsheet.md) (every pattern
   has one; `tests/golden/golden.test.mjs` checks each id), update the pattern count in the documents
   that state it (`tests/docs/claims.test.mjs` tells you where), and run `npm test`.

## Add a gate rule

1. **A negative first.** Build the smallest piece that violates the rule under
   `fixtures/negatives/<RULE-ID>/<case>/` and write `tests/check/<name>.test.mjs` asserting the gate
   fails it with that id and evidence. Watch it fail for the right reason before any rule exists
   (AXIOM 5). Also assert the base fixtures pass.
2. Implement the rule as `scripts/check/<RULE-ID>.mjs` (one rule per file) and register it as its
   neighbours are. A rule that cannot run reports `SKIP` with a reason, never `PASS` (AXIOM 8). A
   threshold with no measurement behind it is marked *provisional* in SPEC section 12 and says where
   its number came from (AXIOM 10).
3. **The ledger row.** Add the id, its test file and its negative fixtures to the table in SPEC
   section 14. `tests/docs/ledger.test.mjs` fails when a rule has no row.
4. **The SPEC row.** Add the rule's row to the table in SPEC section 7 and any threshold to
   section 12, in the same pull request. `mm check` stamps the SPEC version into `out/check.json`,
   so a rule that changes what an existing verdict means raises the minor version in the title of
   `SPEC.md` and in `SPEC_VERSION` (`scripts/lib/report.mjs`) together; a test fails if they differ.
5. Update the rule count in the documents that state it, and explain the evidence in the pull
   request. All of this lands in the same commit as the rule (AXIOM 13).

## Proposing a rule change

Open an issue, or a pull request, with the evidence: the piece or the measurement that shows the
current rule is wrong, and what the new rule should say. An accepted rule lands in `SPEC.md` in the
same pull request as the code and tests that enforce it. A reversal says which rule it replaces and
why; nothing is edited over silently. Code comments state why in their own words and cite the SPEC
section, not an external record.

## Commit style

Conventional-style subject, lowercase, no full stop: `type(scope): what and why in one line`. Types
in use: `feat`, `fix`, `docs`, `test`, `spec`, `chore`. Scopes in use: `gate`, `kit`, `cli`,
`patterns`, `skill`, `capture`, `studio`. Put the details in the body. Commit by path, so one commit
holds one concern. Keep the rule, the negative and the test in the commit with the fix (AXIOM 13).
Never commit renders, `out/` folders or videos. See [docs/RELEASING.md](docs/RELEASING.md) for
publication.
