# A 15-minute tour

You will break a finished piece on purpose and watch the gate catch it, then capture a brand from
a web page and give it a motion style. Every command runs from the repository root and is written
`node scripts/mm.mjs <verb>` (`npm run mm -- <verb>` is the same); `<verb> --help` prints a verb's
flags. A *piece* is a folder holding a `story.json` and a `style.json`; the gate is `mm check`.
The [README](README.md) has the overview and [SPEC.md](SPEC.md) the full grammar.

You need Node 22 or newer, Playwright's Chromium and ffmpeg 6 or newer:

```
npm ci
npx playwright install chromium
node scripts/mm.mjs doctor
```

`doctor` prints `ok` for Node, Chromium, ffmpeg and ffprobe, and never installs anything. Run the
rest of this guide in a folder of your own, `tour/`, and delete it at the end.

## Part 1. Break a golden piece (6 minutes)

The four golden pieces in `pieces/` are finished films and decks that pass the gate. Copy one.
Keep the copy two folders deep (`tour/golden`, like `pieces/<id>`), because its `piece.js` imports
the kit by a relative path, and a piece that moves further from the repository root cannot open.

```
mkdir tour
cp -R pieces/golden-film-editorial tour/golden
rm -rf tour/golden/out
node scripts/mm.mjs check tour/golden
```

The gate runs 37 rules and prints one line each: `PASS`, `FAIL`, `WARN` or `SKIP` (a rule that
could not run says so; it never passes silently). Exit code 0 means no `FAIL`. Warnings that stay
are read, and either fixed or explained; [tests/golden/accepted-warnings.md](tests/golden/accepted-warnings.md)
lists the ones this piece may keep. A report is written to `tour/golden/out/check.json`.

**Break 1: a literal colour.** The style file is the only look, so a piece's CSS may hold
`--mm-*` variables and nothing else.

```
echo '.mm-scene { color: #ff00ff; }' >> tour/golden/piece.css
node scripts/mm.mjs check tour/golden
```

```
FAIL  G-LITERAL  reason=hex colour in CSS; use the --mm-* variables measured=color: #ff00ff file=piece.css line=…
```

G-LITERAL reads the file, and it also samples rendered pixels, so a colour set any other way
fails too. Undo it: `cp pieces/golden-film-editorial/piece.css tour/golden/piece.css`.

**Break 2: a clock.** Every frame is a function of `t`: the kit draws each one from that number and nothing else.

```
echo 'setTimeout(() => {}, 100);' >> tour/golden/piece.js
node scripts/mm.mjs check tour/golden
```

```
FAIL  G-TIME  reason=forbidden in piece and pattern code: setTimeout measured=setTimeout file=piece.js line=…
```

The same rule installs a trap before the piece loads, so a timer, `Date`, `Math.random` or
`performance.now` called at run time fails as well. Undo it:
`cp pieces/golden-film-editorial/piece.js tour/golden/piece.js`.

**Break 3: a pattern that does not exist.** Open `tour/golden/story.json` and change one `fx`
value to `entrances/boom`.

```
node scripts/mm.mjs check tour/golden
```

```
FAIL  G-PATTERN-REF  reason=no pattern entrances/boom under patterns selector=… measured=entrances/boom
```

Now try to ship it:

```
node scripts/mm.mjs export tour/golden --formats 16x9 --fps 15
```

```
mm: export refused: mm check failed: G-PATTERN-REF (--force exports anyway and stamps UNCHECKED)
```

Export exits 1 while the gate fails. `--force` renders anyway and stamps the MP4's metadata
`UNCHECKED`, so a draft can never pass for a delivery. Put the story back
(`cp pieces/golden-film-editorial/story.json tour/golden/story.json`), run `check` again and
see exit 0.

## Part 2. Capture a brand and compose it with a motion style (9 minutes)

`fixtures/capture/site/` is a small web page for a fictional boatyard. Capture its look. Capture
outputs belong in your own folder or a git-ignored one, never in the tracked `styles/` folders;
the notes land beside the output as `<out-name>.capture-notes.md`.

```
node scripts/mm.mjs brand capture --from fixtures/capture/site/index.html --out tour/capture/harbour-pine.json
```

It prints `wrote tour/capture/harbour-pine.json and tour/capture/harbour-pine.capture-notes.md`, a
note that the page's display face is on the banned-font list (advice, not a gate; the style uses
the bundled stand-in) and a warning:

```
warning: muted #6A7478 on canvas #F6F1E7 is 4.26:1, below the 4.5:1 that W-CONTRAST asks of video text; …
```

Open `tour/capture/harbour-pine.capture-notes.md`. Every colour and type role is a guess with its
evidence (how many pixels, how many characters), and every default that was copied rather than
measured is listed. Capture is best effort and says so; a person approves what it found.
Fix the warning in the half, before composing: in `tour/capture/harbour-pine.json` change the
`muted` colour `#6A7478` to `#566064`.

Now choose how it moves. A style is a brand half (the look) worn with a motion half (tempo,
curves, transitions, entrances). Shipped motion halves are `calm`, `kinetic` and `premium`; you
can also capture one from a reference film (`mm motion capture --from fixtures/capture/reference/cuts.mp4
--out tour/capture/tempo.json` measures its shots, cuts and arrivals). Compose the brand with
`kinetic`, and scaffold a piece in the result:

```
node scripts/mm.mjs style compose --brand tour/capture/harbour-pine.json --motion kinetic --out tour/capture/harbour-pine-kinetic.json
node scripts/mm.mjs new --kind film --style tour/capture/harbour-pine-kinetic.json --dir tour/harbour
```

`new` writes `tour/harbour/` (story, style, `piece.js`, `piece.css`, `assets/`) with the style
copied in, fonts included. The scaffold is a four-second placeholder, so `mm check tour/harbour`
fails G-LENGTH (a film is 20 to 60 s) and G-HOOK (the first frame must show the first headline
finished): the gate is telling you the story is not written. Replace `tour/harbour/story.json`
with a five-scene, twenty-second story. It uses **style roles** (`"fx": "style:headline"`), so
the motion half decides how everything arrives, and a scene `position` instead of a `cut`, so the
motion half decides the transitions. The first headline is `"at": 0` with `"instant": true`, which
is what makes frame 0 the hook. Every number carries a fact with a source.

```json
{
  "id": "harbour",
  "kind": "film",
  "formats": ["9x16", "1x1", "16x9"],
  "title": "Harbour & Pine, 20 seconds",
  "language": "en",
  "facts": [
    { "id": "f1", "text": "We take on four commissions a year and no more.", "source": "fixtures/capture/site/index.html" }
  ],
  "audio": { "track": null, "bpm": null, "beats": null },
  "scenes": [
    { "id": "hook", "layout": "layouts/title-stack", "duration": 4, "position": "opening", "move": null,
      "say": "The hook.",
      "beats": [
        { "at": 0, "slot": "headline", "fx": "style:headline", "text": "Boats that last a lifetime.", "params": { "instant": true } },
        { "at": 1.0, "slot": "sub", "fx": "style:body", "text": "Harbour & Pine" } ] },
    { "id": "hand", "layout": "layouts/statement", "duration": 4, "position": "topic", "move": null,
      "say": "How they are made.",
      "beats": [
        { "at": 0.4, "slot": "headline", "fx": "style:headline", "text": "Every hull laid by hand." },
        { "at": 1.0, "slot": "sub", "fx": "style:body", "text": "In our estuary yard." } ] },
    { "id": "four", "layout": "layouts/stat-hero", "duration": 4, "position": "related", "move": null,
      "say": "The number.",
      "beats": [
        { "at": 0.15, "slot": "figure", "fx": "style:figure", "value": 4, "text": "4", "fact": "f1" },
        { "at": 0.7, "slot": "headline", "fx": "style:headline", "text": "commissions a year" },
        { "at": 2.1, "slot": "body", "fx": "style:body", "text": "no more", "fact": "f1" } ] },
    { "id": "timber", "layout": "layouts/statement", "duration": 4, "position": "topic", "move": null,
      "say": "The timber.",
      "beats": [
        { "at": 0.4, "slot": "headline", "fx": "style:headline", "text": "Timber air-dried for three winters." },
        { "at": 1.3, "slot": "sub", "fx": "style:body", "text": "Larch, oak and iroko." } ] },
    { "id": "visit", "layout": "layouts/endcard", "duration": 4, "position": "outro", "move": null,
      "say": "The invitation.",
      "beats": [
        { "at": 0.15, "slot": "headline", "fx": "style:headline", "text": "Harbour & Pine" },
        { "at": 0.8, "slot": "body", "fx": "style:body", "text": "Arrange a visit" } ] }
  ],
  "cta": { "text": "Arrange a visit", "url": "" }
}
```

(`move` and `say` are required on every scene and `cta` needs both fields; an empty `url` is
fine for a film with no link. The figure carries `text` as well as `value` because kinetic
draws a figure with `entrances/punch`, which draws text.)

```
node scripts/mm.mjs check tour/harbour
node scripts/mm.mjs stills tour/harbour
```

`check` exits 0. Read what it still warns about (W-EMPTY near the push into scene 2, a few frames
with almost no ink, is typical): each warning gets a fix or a one-line reason. `stills` writes
`tour/harbour/out/contact.png`, every rest and mid-entrance on one sheet, and `out/phone.png`,
the same at phone width. Open the contact sheet: the headlines slam in and the sub words
arrive one after another, because that is what kinetic's roles say.

Wear the same story in a calmer motion and let the gate compare:

```
node scripts/mm.mjs style compose --brand tour/capture/harbour-pine.json --motion calm --out tour/capture/harbour-pine-calm.json
node scripts/mm.mjs new --kind film --style tour/capture/harbour-pine-calm.json --dir tour/harbour-calm
cp tour/harbour/story.json tour/harbour-calm/story.json
node scripts/mm.mjs check tour/harbour-calm
```

Same words, same scenes, different look and arrival, and the gate now warns W-PACE, W-HOLD,
W-STAGGER and W-EMPTY: tempo belongs to the piece, so a story tuned for kinetic's short cuts has
to be retimed for calm's longer ones (first arrival at the cut's length plus 0.1 s).

Render it, in one format at a low frame rate for a quick look:

```
node scripts/mm.mjs export tour/harbour --formats 9x16 --fps 15
```

`tour/harbour/out/harbour-9x16.mp4`, `poster.png` and `loop_check.mp4` appear (the loop check
joins the last frame to the first, and the `loop: SSIM` line says how alike they are). Exports run at
`--sub 1` by default; blending sub-frames (`--sub 4`) turns fast text into ghosts and the gate
warns about it.

One more thing: wrap a brand and its motion as a skill of its own.

```
node scripts/mm.mjs skill new --brand tour/capture/harbour-pine.json --motion kinetic --out tour/harbour-skill
```

`tour/harbour-skill/` holds a thin `SKILL.md` named `harbour-pine-motion` that loads the engine
skill first, the pinned `style/style.json`, the fonts and an empty `facts.md`. Start a new piece
from it with `mm new --kind film --style tour/harbour-skill/style/style.json --id <id>`.

## Clean up and go on

```
rm -rf tour
```

Direct a real piece with an agent: open the repository in Claude Code and ask for a film or a
deck; the skill in [skill/motion-machine](skill/motion-machine/SKILL.md) runs seven rounds and asks
you, the director, for every taste call. To drive the CLI by hand, the [README](README.md) has the
quick start and [SPEC.md](SPEC.md) the whole grammar; [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
explains how the parts fit.
