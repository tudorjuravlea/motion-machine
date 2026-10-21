# Releasing

## Pre-publication checklist

Run on a clean working tree, from the repository root.

- [ ] `npm test` is green.
- [ ] `node scripts/mm.mjs release-check` exits `0`. It sweeps the tracked files for brand words,
      secrets, home-folder paths, remote URLs in runtime code, licences, incomplete patterns, failing
      golden reports, strategy files, duplicate files and history markers (SPEC §8).
- [ ] Optional: a git-ignored `docs/private/brand-words.txt` extends the brand-word sweep with
      words you never want to ship (client or product names, for instance). When it is present the
      first note of the report reads "private list read"; when it is absent the report says only the
      shipped generic patterns were swept. CI runs without it, so a release run with the list
      present is the stronger check.
- [ ] The golden pieces are checked: `node scripts/mm.mjs check <dir>` on every `pieces/golden-*`,
      each with an `out/check.json` and no FAIL (the R-GOLDEN sweep reads those files). Their `out/`
      folders are not tracked; CI regenerates them.
- [ ] `LICENSE` holds the Apache-2.0 text and `NOTICE` lists every adapted source that has code in
      the repository; `PROVENANCE.md` matches.
- [ ] `package.json`, `.claude-plugin/plugin.json` and `skill/motion-machine/SKILL.md`
      (`metadata.version`) agree on the version.
- [ ] The version in the title of `SPEC.md` equals `SPEC_VERSION` in `scripts/lib/report.mjs`.
- [ ] `npm pack --dry-run` lists only the folders and documents named in `package.json` `files`.
- [ ] `claude plugin validate .` passes.
- [ ] A fresh clone in a temporary folder passes `npm ci`, `npx playwright install chromium` and
      `npm test`.
