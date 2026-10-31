# The pattern card (`PATTERN.md`) — the contract `scripts/pattern-lint.mjs` reads

A pattern folder `patterns/<group>/<name>/` is complete when it holds the files SPEC §5 lists for
its group and a `PATTERN.md` with exactly the sections below, in this order, each non-empty. The
lint reads the `## ` headings literally; a missing, renamed or empty section fails `mm pattern lint` (W-PATTERN-CARD; a piece with the same fault is warned).

```markdown
# <group>/<name>

## Purpose
One sentence: what this pattern does for a story.

## Use when / Do not use when
Two short lists.

## Params
| name | type | default | meaning |
|---|---|---|---|
(data-p-* attributes; types: number | string | boolean | enum(a|b|c); a default is a role name,
a plain number or a short string, never a colour, a family or a millisecond. A distance says its
unit in `meaning`: `px` is a pixel of the page, which is 1080 px on its short side in every
format; "multiple of ctx.unit" scales with the format's type size. See runtime/kit/README.md)

## Style variables consumed
A list of the `--mm-*` variables and spring roles the pattern reads. Nothing else may appear in
its CSS or JS (W-LITERAL).

## Legibility and rest notes
What the pattern guarantees at p = 1: nothing mid-motion, no text below the floor it is given,
boxes inside the measure it is given; any known edge case.

## Provenance
`original`, or one line per source: name, licence, what was taken, what changed. Every source
also has a row in `PROVENANCE.md` (W-PROVENANCE). A restricted or private source is credited in
the words `PROVENANCE.md` uses for it.

## Known limits
Honest list: formats it suits less, sizes it breaks at, things it cannot do.
```

Groups and required files (SPEC §5): `entrances`, `exits`, `emphasis`, `transitions`, `moves`,
`data`, `sound`, `screen` and `3d` need `pattern.js`; `layouts`, `text`, `data`, `devices` and `3d`
need `pattern.html`; every visual group needs `pattern.css` (may be empty for a pure-JS entrance)
and `demo/story.json`; `sound` needs no CSS, HTML or demo story and instead a `demo/cue.json`
naming `at` instants, and a `recipe.json` (a cue as data, `contracts/sound-recipe.schema.json`) may stand in for
`pattern.js`. A `screen` pattern's `pattern.js` exports `reduce`, not `at` (see
runtime/kit/README.md); a `3d` pattern builds its scene with `runtime/kit/device3d.js`.
