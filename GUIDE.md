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

ffmpeg and ffprobe are found on `PATH`; to use binaries kept elsewhere (a static build in a tool's own folder), set `MM_FFMPEG` and `MM_FFPROBE` to their paths.

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

The gate runs 59 rules and prints one line each: `PASS`, `FAIL`, `WARN` or `SKIP` (a rule that
could not run says so; it never passes silently). Fourteen rules are hard: they guard what breaks a
piece or the brand, a `FAIL` makes the check exit 1, and `mm export` refuses the piece. The other
45 advise on craft: a `WARN` never changes the exit code and never blocks an export. A report is
written to `tour/golden/out/check.json`. This piece exits 0 and prints two warnings:

```
WARN  W-PACE  reason=6 arrivals between 0s and 10s instant=0 measured=6 threshold=2–5 per 10 s
WARN  W-STAGGER  reason=first arrival -0.52s after the cut settles; leave 0.1s selector=[data-scene="problem"] [data-slot="headline"] instant=4 measured=-0.52 threshold=0.1
```

**Read a warning, then accept it or ask for a fix.** W-PACE says the opening has more arrivals
than calm's band allows, W-STAGGER that a headline arrives as the cut into its scene is still
settling. This film is worn by two motion styles, and the director kept both warnings because the
story needs the density: one line in the piece's `direction-log.md`, "accept on editorial: the
brief needs every line it has left, and kinetic (5–10) passes the same story". A warning you
want gone is a fix instead: cut a line, move an arrival. Either way the warning is read first.
[tests/golden/accepted-warnings.md](tests/golden/accepted-warnings.md) lists the ones the golden
pieces keep, with the reason for each.

Seven of the advisory rules read the picture and the story the way an editor would:

- W-ANCHOR: a beat with `anchor: "a spoken phrase"` arrives from 1.8 s before to 0.2 s after that word in the footage or voice words, and the warning names the `at` that fixes it.
- W-POP: one frame in the middle of a motion that differs from both its neighbours, which match each other.
- W-DEADSTOP: a motion that makes its whole change in one frame and then waits, or two motions of one element stitched with a stop between them.
- W-FOCUS: two beats lit in the accent at once at a rest, or a finished text left between 5 % and 50 % visible.
- W-TOKENS: more than 4 stroke widths, 5 font sizes or 3 corner radii across the rests: a few values reused read as designed.
- W-SEAM: an exit and the next scene's entrance that travel in opposed directions, or at speeds more than 5 % apart.
- W-LOOP: a story's declared `loops` (a question posed in one scene, answered in another): at most two open at once, each closed before the call to action.
- W-SAMEBOX: more than half of the scenes put their content in the same boxes (every scene the same card), or two neighbouring scenes of one layout differ in text only.
- W-PALETTE: with a `sound.profile` set, a cue the piece plays is off it in register, attack, length for its family, level or peak (recipes, samples and code cues are all measured).
- W-AUDIBLE: a cue the finished mix does not let you hear (masked by the music or the voice, silent, over speech with ducking off) or hears harshly (2-6 kHz far over the music); `mm sound` measures it, a beat's `params.cue.soundOk` acknowledges it.
- W-SAMPLE-LICENSE: a sound file mapped to a cue (`sound.samples`, `audio.samples`) is missing, or has no record beside it naming its source, licence and author; a sound found on Openverse (`mm sound fetch`) also warns when its licence is outside what the piece offers, its file is not the one hashed in its record, or one recording carries two licences.
- W-SOUND-SHAPE: the shape of a film's sound is off: no sound in its first 0.6 s (or at its first event), the cues all about as loud (under 8 dB from the quietest tenth to the loudest tenth, from six cues), or five of one cue in a row at 0.35 s gaps or less. Its evidence lists the five places to listen first.
- W-SOUND-ARTIFACT: a cue the piece plays has a click, a DC offset, clipping, a cut-off tail, a comb ring, a ghost in its tail, stacked attacks (a hit) or a rising glide; no sound profile is needed.
- W-SAY: a film's voice-over (a scene's `say`) holds a word a voice may get wrong that nothing marks: an acronym, a camelCase name, a file name, a web address, a number with a unit. Write `[API](ay pee eye)` to say how it is read (shown as API, spoken as written in the brackets), or put the word in the brand's `voice.lexicon` once. `<<slot>>` before a word puts the beat with that slot on it. `mm say-lint` is the same reading from the terminal, and `mm gen voice` runs it before it asks to spend anything.
- W-EASE: an ease the piece spells that the kit would not draw as written: a name or argument that does not parse (so the cascade or pattern that asked falls back to its default), a `curve(...)` that runs backwards in x or ends where it starts, `steps(n)` with a partial last step, `linear()` stops that do not run from 0 to 1.
- W-DECK-STEP: a deck beat is stepped but no press reaches it (a step past its scene's presses, an exit before or past them), or two beats of one scene drive the same slot.

One more advisory rule reads the assets, not the picture. W-ASSET-LICENSE warns for a still, recording, captured page, imported or generated clip or sound the story uses that has no `assets/<name>.licence.json` (where it came from and under what licence), or whose licence is outside own, generated, CC0, CC-BY and public domain; `mm gen` and `mm capture site` write the record, `licences.accepted` in the story is the person's yes, and `mm credits <piece>` lists the credits to put on an end card. `mm gen` also keeps a cache: the same request twice is one paid call, and a replay (`--again`) is planned first and needs a later `--yes`.

**Break 1: a colour the brand does not own.** The style file is the only look, so a piece's CSS
holds `--mm-*` variables and nothing else. Paint the scene's camera magenta:

```
echo '.mm-camera { background: #ff00ff; }' >> tour/golden/piece.css
node scripts/mm.mjs check tour/golden
```

```
FAIL  G-BRAND  reason=computed colour is not one of the style palette roles selector=[data-scene="hook"] > div.mm-camera:nth-child(1) instant=1.02 measured=background-color rgb(255, 0, 255)
```

G-BRAND measures what is drawn: it reads every computed colour and typeface and samples the
rendered pixels, so a colour set any other way fails too. Only a colour or face the brand does not
own fails; alpha, blends and glows built from the style's own roles pass. The same line of CSS
also earns two warnings, W-LITERAL (a literal hex in piece code) and W-CONTRAST (grey text on
magenta, 1.78:1), and they advise; the `FAIL` is what blocks. Undo it:
`cp pieces/golden-film-editorial/piece.css tour/golden/piece.css`.

**Break 2: a clock.** Every frame is a function of `t`: the kit draws each one from that number and nothing else.

```
echo 'setTimeout(() => {}, 100);' >> tour/golden/piece.js
node scripts/mm.mjs check tour/golden
```

```
FAIL  G-TIME  reason=forbidden in piece and pattern code: setTimeout measured=setTimeout file=piece.js line=10
```

The same rule installs a trap before the piece loads, so a timer, `Date`, `Math.random` or
`performance.now` called at run time fails as well. Undo it:
`cp pieces/golden-film-editorial/piece.js tour/golden/piece.js`.

**Break 3: a pattern that does not exist.** Open `tour/golden/story.json` and change the first
headline's `fx`, `style:headline`, to `entrances/boom`.

```
node scripts/mm.mjs check tour/golden
```

```
FAIL  G-PATTERN-REF  reason=no pattern entrances/boom under patterns selector=hook.headline.fx measured=entrances/boom
```

Now try to ship it:

```
node scripts/mm.mjs export tour/golden --formats 16x9 --fps 15
```

```
mm: export refused: mm check failed: G-PATTERN-REF (--force exports anyway and stamps UNCHECKED)
```

Export exits 1 while the gate fails. `--force` renders anyway and stamps the MP4's metadata
`UNCHECKED`, so a draft can never pass for a delivery. A piece that only warns exports without
`--force` and unstamped. Put the story back
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
curves, transitions, entrances). Shipped motion halves are `calm`, `kinetic`, `premium`, `grid`
(precise drafting on the beat), `stop-motion` (printed on threes) and `proof` (short-form evidence,
every cut hard); you can also capture one from a reference film (`mm motion capture --from fixtures/capture/reference/cuts.mp4
--out tour/capture/tempo.json` measures its shots, cuts and arrivals). Compose the brand with
`kinetic`, and scaffold a piece in the result:

```
node scripts/mm.mjs style compose --brand tour/capture/harbour-pine.json --motion kinetic --out tour/capture/harbour-pine-kinetic.json
node scripts/mm.mjs new --kind film --style tour/capture/harbour-pine-kinetic.json --dir tour/harbour
```

`new` writes `tour/harbour/` (story, style, `piece.js`, `piece.css`, `assets/`) with the style
copied in, fonts included. The scaffold is a four-second placeholder, so `mm check tour/harbour`
exits 0 and warns W-LENGTH, W-HOOK (the first frame does not show the first headline finished)
and W-EMPTY:

```
WARN  W-LENGTH  reason=film is 4s, outside 20–60s measured=4 threshold=20–60s
```

Those are advice that the story is not written yet; a bumper of 4 s or a cold open can be the
right call, and the director's to make. Replace `tour/harbour/story.json`
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

`check` exits 0 and still warns once:

```
WARN  W-EMPTY  reason=8 frames (4.167–4.4 s) show under 0.5 % ink (at most 0.04 %) instant=4.167 measured=8 threshold=6 frames under 0.5 % ink
```

Read it. Eight frames, a quarter of a second, almost empty at the push into scene 2: in a kinetic
film that can be the breath between scenes, and you may keep it with one line in your log
(`W-EMPTY at 4.2 s: accepted, the breath between scenes is the rhythm`). To fix it instead, bring
scene 2's first arrival later or choose a cut that carries the old scene (a crossfade or a push).
Warnings do not block the export below either way. `stills` writes
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
from it with `mm new --kind film --style tour/harbour-skill/style/style.json --id <id>`. Its
`SKILL.md` ends with a section on the gate: a studio can tune the soft thresholds (the length band,
the dead-air window, the reading speed, the looks W-BAN lifts) with a `gate` block in its motion
half, and never the hard rules (SPEC.md §3).

## A brand's own folder

A real brand does not belong in this repository. Give it a folder of its own, anywhere:

```
node scripts/mm.mjs brand init ~/Brands/MyBrand --from paper
```

```
MyBrand/
  brand.json    the brand half: colour roles, type, scale, ground, bans
  fonts/        every font brand.json names, a folder per family with its LICENSE.txt
  ground/       the ground mark, when the brand has one
  logo/         an SVG logo goes here
  sources/      what the brand was read from: site URLs, DESIGN.md, a Figma export, stills
  notes.md      what the folder is and the commands that use it
  facts.md      every number and claim a piece may show, with its source
  projects/     the films and decks made for this brand
```

`mm brand sheet <folder>` renders the folder's review sheet (`sheets/review.html` and `review.png`): the
palette with its evidence, every text pair's contrast, the type, the look in three patterns and the logo,
the motion's tempo, and the questions left for a person, each with the command that answers it. Open it
before the brand's first piece.

`--from` takes a shipped brand name, a captured half in the private brands folder, or the path to a
`brand.json`; the copy is marked not fictional and named after the folder (or `--name`). Edit
`brand.json` there. Then make a project in it and render it:

```
node scripts/mm.mjs project new launch --brand ~/Brands/MyBrand --kind film
node scripts/mm.mjs project make ~/Brands/MyBrand/projects/launch
```

A bare project name goes under `<brand>/projects/`; any other path works too. The project holds
`project.json`, `story.json` (edit this one), `assets/` (pictures, recordings and audio the story
uses), `inputs/sources.md` (where each line came from) and `out/`. `project make` composes the
brand with a motion half (`calm` unless `--motion` says otherwise), checks the story, exports it
and puts the results in `out/`: a film's `<id>-<format>.mp4` and `poster.png`, a deck's `slides/`,
`handout.pdf` and `walkthrough.mp4`, and always `check.json`. A failing check stops there and says
where its report is. `--to <dir>` also copies the deliverables to another folder, and
`--check-only` stops after the check. The engine renders through a hidden work piece in its own
git-ignored folder, so the brand and project folders hold only your files and the results;
`project path <folder>` prints that work folder when you want to open it with `studio` or `serve`.
Delete it and the next `make` rebuilds it.

### Bring a brand in

`brand onboard` fills the folder from what the brand already has, in one pass. Name every source;
the folder is made first when it is missing or empty:

```
node scripts/mm.mjs brand onboard ~/Brands/MyBrand --from https://example.com --from DESIGN.md --from ./stills
```

A source is a page (a URL, an `.html` file, or a folder with an `index.html`), a Figma export
`.json`, a `DESIGN.md`, or a folder of stills. Sources are merged by trust: tokens and `DESIGN.md`
name their roles, so they win; a page is measured; stills are only sampled. Each role keeps its
value, how sure the engine is (`exact`, `measured`, `rule`, `guess` or `set`) and the evidence. The
role rules then run over the palette. A muted colour too faint to read, or text on the accent that
does not read, is fixed and the fix is written down. A colour the brand named is never changed; a
rule that would change it becomes a question. `--color accent=#E9573F` types a role yourself and
wins over every source.

The result goes to three places: `brand.json` (what the engine reads), `sources/onboard.json`
(every role with its confidence, the contrast of each text pair, the warnings, the questions and
the fonts) and `notes.md` (the same in words, with a dated section for each run). Each question
comes with its options, and every option is a command:

```
node scripts/mm.mjs brand sheet ~/Brands/MyBrand                  # the review sheet: look, then decide
node scripts/mm.mjs brand set ~/Brands/MyBrand accent=#E9573F     # answer a question, or retype any role
```

`brand set` takes `role=#hex` for the seven roles and `surfaceInk`, then runs the rules again, so a
new canvas shows at once what it breaks. A value that is not a hex colour, or a role that does not
exist, exits 2 and changes nothing.

Without a brand font, the nearest bundled family stands in, and `onboard.json` says so. To use the
brand's own, add the file with its licence; the licence decides what may be done with the font later:

```
node scripts/mm.mjs brand font ~/Brands/MyBrand Sans-Regular.woff2 --family "Brand Sans" --role text --license OFL.txt
node scripts/mm.mjs brand logo ~/Brands/MyBrand logo.svg
```

A font is `.woff2`, `.woff`, `.ttf` or `.otf` and is checked by its first bytes. SIL OFL and Apache
licences are recognised; a font with any other licence, or none, is recorded as `private-use`. `brand
logo` keeps a cleaned copy of an SVG (no script, no foreign content, no event handlers, nothing
that reaches outside the file, a `viewBox` in place of a fixed size) as `logo/logo.svg`, a one-colour
copy as `logo/logo-mono.svg`, and records which palette role each of its colours is closest to.

Real brands live in folders like this one, outside the engine. The brands shipped in
`styles/brands/` stay fictional.

## Record a product demo from a real session

A demo of a product is a recording of someone using it, with a cursor that moves like a person's and a camera that
goes where the click is. `mm capture site --script` plays a list of steps on a page, records it, and writes the
pointer's journey beside the video:

```
node scripts/mm.mjs capture site --url file://$PWD/fixtures/site/demo-session.html --name plan --piece tour/harbour \
  --device laptop --script fixtures/site/demo-session.steps.json
```

It prints where the duration came from, how the video's clock was set (the page flashes red five times before the
script starts, and the video says when each reached it), whether the first frame is black, and writes
`tour/harbour/assets/plan.webm`, `plan.cursor.json` (the pointer's samples and the box of everything it clicked) and
`plan/`, the frames. In the story, give a beat the folder as its `asset` on `devices/demo-frame` and three actions over
the same span: `screen/play`, `screen/zoom-to` with `"mode": "auto"` (it zooms where the pointer clicked) and
`screen/pointer` (the cursor, drawn in the palette's colours). Everything is a brand's to set once: the cursor's
roles, size and weight, the camera's depth and tilt, the frame's padding and shadow, in `style.patterns`.

## Clean up and go on

```
rm -rf tour
```

Direct a real piece with an agent: open the repository in Claude Code and ask for a film or a
deck; the skill in [skill/motion-machine](skill/motion-machine/SKILL.md) runs seven rounds and asks
you, the director, for every taste call. To drive the CLI by hand, the [README](README.md) has the
quick start and [SPEC.md](SPEC.md) the whole grammar; [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
explains how the parts fit.
