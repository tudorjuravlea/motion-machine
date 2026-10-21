# motion-machine

```
░▒▓█  M0T10N::MΔCH1NΞ  █▓▒░
```

**An AI agent can now direct a short film or an animated deck for you, but only if something measures every frame before anyone sees it. This is that something.**

motion-machine turns one brief into a 20 to 60 second film (9x16, 4x5, 1x1 and 16x9) and a clicker deck, built from 120 brand-neutral patterns and worn in your style. Then a gate of 37 rules renders the result and measures it: time, colour, type, legibility, pace, rests, sound. Frame by frame. Press by press.

New here? Take the 15-minute [guided tour](GUIDE.md): you break a piece on purpose and watch the gate catch you. Want to see the parts? Read the [architecture tour](docs/ARCHITECTURE.md).

---

## Why this exists

Almost every motion tool with "AI" on the label chases the same prize: **more video, faster**. More reels, more variants, more cuts per prompt. Speed is a solved problem. What nobody solved is the question you ask before every one of those pieces goes out:

> *"Would I show this?"*

Motion without measurement is how a brand starts to wobble. A pipeline that makes ten films an afternoon makes ten afternoons of drift: an entrance that runs on its own clock, a headline that reads on a laptop and blurs on a phone, a hook that arrives at second three, a deck press that lands mid-animation, a colour that is almost the brand's. Each one plausible. Each one wrong. And the person who has to catch it is you, scrubbing a timeline at 6pm.

motion-machine inverts the priority. **Measured before shown.** Every frame is a pure function of time, so any instant can be rendered twice and compared. Every colour, face, size, space and duration comes from one style file, so anything else is an error with a file and a line. The machine renders the piece in a real browser, measures what it drew, and returns one of two verdicts.

**Green: it can be shown, with its numbers. Red: back to the bench, with the rule, the instant and the evidence.**

The taste stays yours: which story, which feel, which of two cuts. The arithmetic is the machine's.

## The pains this ends

**If you make motion for a brand (designer, marketer, founder):**

- **Scrubbing QA.** You check a film by playing it again and again, and the bad frame slips through anyway. Here the gate reads every rest, every arrival and every cut, at the size a phone shows them.
- **The almost-right problem.** The brand blue became a near blue. A 400 ms ease became 350. Nobody catches this in a review; the gate catches it in the CSS, in the computed styles and in the rendered pixels.
- **Illegible on a phone.** A caption that reads on your monitor is a smudge in a feed. Text is measured at its rendered size against a floor per format, for a phone and for the back row of a room.
- **The hook that comes too late.** In a muted feed the first frame decides. The gate fails a piece whose first frame is not its hook.
- **Four formats, four edits.** One story renders every format: 9x16, 4x5, 1x1 and 16x9, plus a deck with a handout and a walkthrough. End cards scale, safe areas hold.
- **Decks that stutter.** A press that lands mid-entrance looks broken on a big screen. Every rest is checked: nothing is still moving, and a press on the final pose does nothing.

**If you lead a team, or build with AI agents:**

- **Adoption without abdication.** You want an agent to make the first cut; you dread defending what it makes. The gate is the defence: nothing is exported that did not pass, and a forced render is stamped `UNCHECKED`.
- **A number instead of a feeling.** Every piece ships with `out/check.json`: each rule, its verdict and its evidence. "Is it on-brand?" becomes a report, not a meeting.
- **Any brand in any motion.** A style is a brand half (colour, type, space, composition) worn with a motion half (tempo, curves, transitions, entrances). Capture a brand from a web page, a `DESIGN.md` or a folder of stills, and a motion style from a reference film.
- **Reproducible to the frame.** `export --prove` renders the film twice, in different orders, and proves the frames identical. A rule that could not run says `SKIP`, never `PASS`.
- **A record of every call.** The agent works in seven rounds, one question at a time. Each answer is written in a direction log, each note in a defects ledger, each round on a review page.

## What this is, exactly

motion-machine is a **production pipeline and verification gate for short motion pieces made with an AI agent**: a library of patterns, a plain HTML, CSS and JavaScript runtime that draws every frame from time alone, a command-line tool (`mm`), a timeline studio, and a skill that directs the work.

It is **not** a video editor. There is no free canvas; the studio shows the piece as a timeline and writes each drag back into the story file, which stays the only place the film lives. It is **not** a video generator; it does not call image or video models. It does **not** compose music; bring a track and `mm beats` finds its grid. It is built for [Claude Code](https://claude.com/claude-code); the CLI and the gate work with any agent ([AGENTS.md](AGENTS.md)) or by hand.

What it produces: **films** (MP4 in every format, a looping GIF, a poster), **clicker decks** (a standalone folder, a handout PDF, a walkthrough video), **device films** (your app or website on a phone or laptop screen, flat or in 3D, from a screen recording or a captured page), contact sheets, review pages and a share caption.

The two-layer design keeps your brand private while the engine stays public:

```
motion-machine/          <- this repository: the brand-neutral engine (public)
your-brand skill/        <- your style, fonts, facts and assets (yours)
```

A release gate inside the engine (`release-check`) proves the public layer carries no brand traces: it scans for brand words, credential shapes, home-folder paths, e-mail addresses and leftover planning notes on every run.

## How this is different

Most tools in the "AI + video" space are not competitors of this machine. They sit at other points of the workflow, and several of them combine well with it.

| Category | What it does well | What it does not do |
|---|---|---|
| **Timeline video editors** | Cut and finish footage by hand, with total control | Measure. A frame is right because someone looked at it, once |
| **Code-based video frameworks** | Render video from code, frame by frame, reproducibly | Hold a style or judge the result. They render what you wrote, legible or not |
| **Prompt-to-video generators** | Make footage from a sentence | Keep your brand, your copy or your facts. Every frame is a new guess |
| **Slide tools with animation** | Present a story one press at a time | Promise that a press lands on a finished picture, or turn the same story into a film |
| **motion-machine** | Builds the film and the deck from one story, in your style, and measures every frame against 37 rules | Shoot footage, compose music or generate imagery |

The relationship with the others is the one worth underlining: **bring a recording, a still or a track from anywhere. This is the stage it plays on and the gate the piece must pass.**

## How it works

1. **Brief:** the agent asks only for what the brief lacks: the channel (which fixes the formats), the one thing to remember, three words for the feeling, the facts with their sources.
2. **Style:** the agent captures your brand (`mm brand capture`) and a motion style from a reference film (`mm motion capture`), or starts from a shipped preset, and composes them into one `style.json`. Every guess is written down with its evidence.
3. **Story:** a beat sheet comes first, one row per scene or press, then `story.json`: scenes, beats and cuts named by pattern or by style role. Every frame is a function of the time `t`.
4. **Verify:** `mm check` renders the piece in Chromium and measures it: time (the same instant rendered twice gives the same pixels; a trap fails any clock), style (CSS, computed styles and rendered pixels against the palette), legibility, pace, deck rests and sound. Thresholds are law: a stubborn piece gets diagnosed, never a loosened gate.
5. **Deliver:** `mm export` refuses a piece whose check failed or is out of date, renders every format from the one piece, and the handover lists what nobody verified. You decide each round; the machine never decides for you that something is good enough.

---

## Installation

The instructions below use short, direct sentences (ASD-STE100 style). Do the steps in order. Each step shows you how to make sure it worked.

### What you need

- A computer with macOS or Linux. Windows is not tested.
- Node.js version 22 or later. To check, type `node --version`.
- ffmpeg version 6 or later. To check, type `ffmpeg -version`. To install it, type `brew install ffmpeg` (macOS) or `sudo apt install ffmpeg` (Debian and Ubuntu).
- Git. To check, type `git --version`.
- Approximately 1 GB of free disk space. The browser download uses most of it.
- For the directed workflow: [Claude Code](https://claude.com/claude-code) or another coding agent. This is optional for the first test.

### Step 1: Get the code

Open a terminal. Type these commands:

```bash
git clone https://github.com/tudorjuravlea/motion-machine.git
cd motion-machine
```

Use the clone. No npm package is published. Run every command below from the root of the clone.

### Step 2: Install the dependencies

Type this command:

```bash
npm ci
```

Wait for the command to complete. Then install the browser that draws the frames:

```bash
npx playwright install chromium
```

**Note:** The machine uses one exact browser build for all frames. This makes each frame identical between runs. Do not use a different browser.

### Step 3: Make sure the installation is correct

Type this command:

```bash
node scripts/mm.mjs doctor
```

Read the output. Make sure the last line shows `All tools present.` If a tool is missing, the output names it. Install it. Then do this step again. The command never installs anything by itself.

### Step 4: Run the unit tests

Type this command:

```bash
npm run test:unit
```

The tests take approximately one minute. Make sure the summary shows `fail 0`. If it does, your installation is correct. (`npm test` runs every test, including the browser and golden tests. It takes much longer.)

### Step 5: Make your first piece

Type these commands. Replace `hello` with a name for your piece, in lowercase, with hyphens:

```bash
node scripts/mm.mjs new --kind film --style editorial --id hello
node scripts/mm.mjs serve pieces/hello
```

`new` makes the folder `pieces/hello/`. `serve` prints a local address. Open it in a browser to see the piece play. Use `--kind deck` for a clicker deck.

### Step 6: Check the piece

Type this command:

```bash
node scripts/mm.mjs check pieces/hello
```

The check fails, and this is correct. The new piece is a four-second placeholder, so `G-LENGTH` and `G-HOOK` report it. Write a real story of 20 to 60 seconds: the [guided tour](GUIDE.md) shows you how, in fifteen minutes. Then do this step again until the check passes.

### Step 7: Use the skill with your agent

Type this command, from the root of the clone:

```bash
mkdir -p .claude/skills && ln -s ../../skill/motion-machine .claude/skills/motion-machine
```

Open the clone in Claude Code. Ask for a reel, an explainer film, an animated deck, or "the same story as a film and a deck". The agent works in seven rounds and asks you at the end of each one. The repository is also a Claude Code plugin (`.claude-plugin/plugin.json`). Other agents start from [AGENTS.md](AGENTS.md).

### Step 8: Export the piece

When the check passes, type this command:

```bash
node scripts/mm.mjs export pieces/hello
```

The files go into `pieces/hello/out/`. The export refuses a piece that failed its check or changed after it. Do not use `--force` for a piece you deliver: it stamps the file `UNCHECKED`.

### Command reference

| Task | Command |
|---|---|
| Check the installation | `node scripts/mm.mjs doctor` |
| List every verb, or the flags of one | `node scripts/mm.mjs --help`, `node scripts/mm.mjs <verb> --help` |
| Start a film or a clicker deck | `node scripts/mm.mjs new --kind film\|deck --style <preset> --id <id>` |
| Preview a piece | `node scripts/mm.mjs serve pieces/<id>` |
| Gate a piece | `node scripts/mm.mjs check pieces/<id>` |
| Export, and prove the frames reproducible | `node scripts/mm.mjs export pieces/<id> --prove` |
| Contact sheets and a review page | `node scripts/mm.mjs stills pieces/<id>`, `node scripts/mm.mjs review pieces/<id>` |
| A beat grid, cues and a loudness-normalised mix | `node scripts/mm.mjs beats <track.wav>`, `node scripts/mm.mjs sound pieces/<id>` |
| Edit on a timeline, with the gate live | `node scripts/mm.mjs studio pieces/<id>` |
| The same edits from the command line | `node scripts/mm.mjs timeline pieces/<id> move <scene>/<slot> +0.3 --plan` |
| Put a screen recording on a device | `node scripts/mm.mjs media prep <recording> --name app --piece pieces/<id> --fit phone` |
| Put a web page on a device | `node scripts/mm.mjs capture site --url <url> --name site --piece pieces/<id>` |
| Capture a brand, or a motion style | `node scripts/mm.mjs brand capture --from <page> --out <brand>.json`, `node scripts/mm.mjs motion capture --from <video> --out <motion>.json` |
| Wear a brand in a motion style | `node scripts/mm.mjs style compose --brand <brand> --motion <motion> --out <style>.json` |
| A thin skill for one brand | `node scripts/mm.mjs skill new --brand <brand> --out <folder>` |
| List and lint the patterns | `node scripts/mm.mjs pattern list`, `node scripts/mm.mjs pattern lint` |
| Check the tree before a release | `node scripts/mm.mjs release-check` |

`npm run mm -- <verb>` is the same as `node scripts/mm.mjs <verb>`. All verbs use the same exit codes: `0` = pass, `1` = a real finding, `2` = a setup or usage error. The full grammar, every rule and every threshold are in [SPEC.md](SPEC.md); the rules every change keeps are in [AXIOMS.md](AXIOMS.md); the index of the documentation is [docs/README.md](docs/README.md).

---

## The fine print, honestly

- **You need an agent for the directed workflow.** The machine renders and measures; the agent drafts. Without an agent you write `story.json` by hand, which works ([GUIDE.md](GUIDE.md) does it), but slowly.
- **Your fonts stay yours.** Brand fonts live in your piece or your brand skill, never in this repository. The gate fails a piece whose text is painted by a system font instead of the piece's own faces.
- **The gate does not watch or listen.** It measures loudness, peaks, cue timing and motion read from rendered frames. Whether the music is good and the motion feels right is your call, at full speed, before you post.
- **A piece is code.** Checking, rendering or opening a piece runs its pattern code. Open only pieces you trust ([SECURITY.md](SECURITY.md)).
- **Chromium is the only browser the renderer drives.** The known limits of decks (a press can jump content instead of moving it) and of motion capture (calibrated on films this kit renders) are written down in [SPEC.md](SPEC.md), not hidden.

## License

Apache-2.0: see [LICENSE](LICENSE) and [NOTICE](NOTICE); borrowed ideas and their sources are credited in [PROVENANCE.md](PROVENANCE.md). Contributions welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first: a change keeps the [axioms](AXIOMS.md), every rule arrives with a negative that proves it can fail, and the engine stays brand-neutral. Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

**Where to write:** bugs, questions and ideas all go to [Issues](https://github.com/tudorjuravlea/motion-machine/issues). For a failure, paste the command and its full output; the gate's report is built to be pasted. Security problems go through [SECURITY.md](SECURITY.md), not a public issue.

Not to be confused with [HyperFrames](https://github.com/heygen-com/hyperframes), a separate open-source project for rendering video from HTML (Motion Machine takes ideas from it, credited in [PROVENANCE.md](PROVENANCE.md)), or [MotionMachine](https://github.com/poetmountain/MotionMachine), a Swift animation library.
