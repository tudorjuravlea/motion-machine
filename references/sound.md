# Sound

Sound is a set of short cues named by the visible event they mark, an optional quiet bed, and an optional music track supplied by the user. A cue that marks no visible event does not exist.

## The nine cues

| cue | marks | duration |
|---|---|---|
| tick | a small arrival: a chip, a word, a bar landing | 40-90 ms |
| press | a deck press or a button | about 60-120 ms (proposed) |
| swipe | a transition between scenes; its length follows the cut | about 0.2-0.6 s (proposed) |
| step | progress advancing: a counter step, a list item, a stage | about 80-150 ms (proposed) |
| hit | a slam or a figure landing | about 0.15-0.4 s (proposed) |
| riser | the second before a climax | about 1 s (proposed) |
| success | a positive outcome | about 0.3-0.6 s (proposed) |
| complete | the end card | about 0.6 s |
| bed | a quiet loop under a held rest | loop of 1-1.6 s |

- Every cue is a one-shot under 1.5 s, except the bed, which loops
- Ranges marked proposed are starting points for the sound pipeline to tune, not measured figures
- Cues are named by the event, not by the sound, so the vocabulary stays neutral across brands
- An error differs from a success by contour (falling against rising), not by level: `error` is a low falling tenth, `success` a rising spread triad
- Meme-style effects and spectrum or equaliser visuals are banned looks, not cues

## Cues as data: recipes, the first palette, profiles

A cue can be a `recipe.json` (SPEC §9, `contracts/sound-recipe.schema.json`) instead of code: layers of sine partials and filtered noise, each with its attack, T60, glide, offset and the emphasis rank it joins at. The 19 cues are the nine above and ten recipes: `ready` (presence), `attention` (a rising pair), `success` (also a recipe), `warning` (a level fifth), `error` (a low falling tenth), `loading` (a swell), and the input and surface cues `tap`, `toggle-on`, `toggle-off`, `open`, `close`.

- Material marks the family: glass bars (1 : 2.76 : 5.4) for presence and attention, mallets (1 : 3.99) for outcomes, air and wood knocks for input and surface
- Contour carries the meaning: success and attention rise, error falls, warning and ready stay level; a switch on rises and a switch off falls
- A length ladder: input up to 0.06 s, surface up to 0.3 s, outcome up to 0.65 s, then a swell (`loading`)
- One shared seeded stereo room for the palette (`ready` and `success` send twice as much into it); both sides carry the same power
- Levels are matched on the loudest 100 ms, K-weighted: -30 LUFS as written, within the profile's tolerance in a profile
- Three arrangements per cue, set by a beat as `params: { cue: { emphasis: "subtle" | "normal" | "strong" } }`: subtle drops the ornament, strong adds a layer
- Input cues vary a little each time (pitch and force together); outcome cues are identical every time
- Never per word, per token, per call or on a hover; the gate counts cues per 10 s

A **sound profile** (`styles/sound/glass.json`, `soft-ui.json`; a style names one with `sound.profile`, a brand with its own `sound.profile`, which wins) is a style's sound look: register, key, attack and T60 ranges, material, the level every cue is matched to, room and width. `glass` is the reference (bars and mallets, a small bright room); `soft-ui` is fitted to the soft-ui palette (pure sines, shorter notes, a darker room, 2 dB quieter). Pick one once for a brand. To make a new sound, write a `recipe.json`, run `mm sound-listen --calibrate --cues <name>` to set its level and read the numbers and the players it writes to `out/sound-listen/listen.html`. The recipes and levels were set by measurement; a person should listen before a brand adopts them.

## The feels

- soft-ui: rounded, low-brightness taps and gentle air; suits calm and premium products
- percussive: short, dry, punchy hits with fast decay; suits medium and high energy
- cinematic: low impacts, longer swells and whooshes; suits climaxes and trailers
- none: the piece is silent and the sound gates report a skip [SPEC §9]
- A feel comes from the style's sound palette; the default cue gain is about 0.35
- A style (`sound.samples`) or a story (`audio.samples`) may instead point a cue at a sound file shipped inside the piece (see Samples, mining and cloning below)

## Mixing rules (SPEC §9)

- At most two cues sound at once
- A cue retriggers no sooner than 45 ms after itself
- Cue peaks sit 6-8 dB above the bed
- Cues per 10 s stay in the motion style's band; the usable range is 0-9, and quiet styles sit at the low end
- Keep the bed below roughly 4 kHz and the effects above roughly 800 Hz so they do not mask one another
- A cue is placed by its role: the point of the rendered sound the role names (onset, apex or end, measured on the sound) meets its picture event plus the role's offset (a tap leads by 60 ms, a click by 11, a whoosh's apex lags by 37, a riser's end leads by 23); a beat moves it with `params.cue.offsetMs`, a style with `sound.roles.<role>.offsetMs`. With a beat map the picture event is snapped to the nearest beat first, and the drift before snapping is reported by W-CUE (more than 40 ms); a grid from `mm beats` with `usable: false` (under half its beats on a kick) is not snapped to [SPEC §9]
- `out/cues.json` holds each cue's sync lock (measured onset, peak, apex and end against the picture); W-CUE warns when a sound leads by more than 45 ms, a struck peak lands more than 75 ms late, a whoosh apex is more than 45 ms from its cut, or a riser ends outside 250 ms before to 30 ms after its hit. A deviation one role offset explains is deliberate and named; `params.cue.soundOk: "reason"` acknowledges any other
- Place each cue with its own delay and sum with normalisation off, so adding a cue never changes the others' level
- The bed sits at -6 dB under a user track; the track itself is used unchanged [SPEC §9]
- Before a hit (or a whoosh marked `params.cue.big`) the bed dips 9 dB for 0.4 s and is back on the hit (`sound.stopDown`: `db`, `lengthS`, `on`)
- With a voice track (a `.words.json` beside `audio.track`, or footage) the bed and the cues duck under speech: `sound.duck` light -4 dB, normal -9 (default), deep -14, off; keyed by the words, or by the voice's envelope
- `sound.tonalFit` (off by default) moves a tonal cue up to 2 semitones onto a note of the track's key; a track with no tonal centre is skipped. A cue with no bed in the second before it plays at the profile's fixed level. `sound.cueOverBedDb` (0.5 to 30) stages cue and bed together that many dB over the bed
- W-AUDIBLE reads the margin of each cue over the music and the voice in the finished mix (clear, ok, barely, masked), silence under -70 dBFS, a cue over speech with ducking off, and 2-6 kHz harshness against the music; `mm sound --trace` writes `out/sound-trace.json` so each warning can be traced to the rule that placed the cue
- Resample everything to 48 kHz, pad or trim to the exact picture length, and compare stream durations afterwards
- Loudness uses two passes: measure, then normalise in linear mode to the style's integrated target (default -14 LUFS) with true peak at -1 dBTP; W-LOUDNESS warns outside one LUFS either side and G-PEAK fails a true peak above -1 dBTP [SPEC §9]
- A fade-in of about 0.3 s and a fade-out of about 1.5 s on the full mix are usual

## Levels and timing seen in short-form (provisional)

Seen in finished short films; data to start from, not rules the gate reads.

- With a spoken voice: the bed or music under it sits 14 to 20 dB below the voice. Measure it after
  the voice is normalised, not on the raw files, or the number means nothing. (The -6 dB above is the bed under
  a user's music track, a different pair)
- Duck the bed under dense beats (many arrivals, a speaker's key line), and let it back up on the rests
- Effects follow visible actions and are sparse; a whoosh starts about 0.2 s before the cut
  it marks (`sound/swipe` is placed to end on the cut, so check its length)
- To phase a beat grid against a track, take the onsets from the kick band (around 120 Hz). Onsets
  from the whole band lock to the hats and land half a beat late. `mm beats` measures onsets across all bins, so
  if a grid sits half a beat off, move it by half a beat and check the cues again (W-CUE)

## The CC0 sample option

- The `romainsimon/uisfx` pack is under CC0 for audio and MIT for its code, so its samples may be copied into a piece and shipped
- Its thirteen categories collapse into our nine cues; its one-shot-under-1.5 s and 45 ms cooldown rules are the same as ours
- Samples must travel inside the piece folder; a render never reaches the network [SPEC §9]. A sound is brought in once, by `mm sound fetch`, on a yes (see Finding a sound below)
- Samples are optional: synthesis is the default and keeps the repo licence-clean

## Finding a sound

- **Search.** `mm sound find <words> [--license cc0,pdm,by] [--length shortest,short] [--category sound_effect] [--piece <dir>]` searches Openverse (public, anonymous; an optional `OPENVERSE_TOKEN` only raises rate limits) and prints id, title, creator, licence, length, type, source and landing page. A search needs no `--yes`
- **Which licences.** CC0, public domain and CC BY 2.0 to 4.0 by default. NonCommercial, NoDerivatives, ShareAlike and Sampling+ are never offered unless the story names them in `audio.acceptLicences`; a brand can narrow the default once in the style (`sound.licences`: cc0, pdm, by). When in doubt, leave it out
- **Fetch.** `mm sound fetch <id> --piece <dir> --name <name> [--cue <cue>]` reads the item's own detail (never trusts the search row), refuses what is not allowed or has no licence, prints the plan and exits 3; show it to the person, then run it again with `--yes`. The file lands in `assets/sounds/` with its record (licence, creator, landing page, Openverse's attribution line, date, sha1); `--cue` maps it in the story
- **Credit it.** `mm credits <piece>` prints Openverse's attribution line for each found sound; put the CC BY ones on the end card. W-SAMPLE-LICENSE keeps judging the record (licence, sha1, one licence per recording)

## Samples, mining and cloning

- **Map a cue to a file.** `style.sound.samples` or `story.audio.samples` (the story wins): `{ "success": "assets/sounds/chime.wav" }`. The cue must exist under `patterns/sound/`; `mm sound` mixes the file in its place, trimmed and matched to the profile's level. Put the file in the piece and a record beside it, `assets/sounds/chime.json`: `{ "source": "…", "licence": "CC0-1.0", "author": "…" }`. W-SAMPLE-LICENSE warns when a file or a field is missing
- **Mine a set.** `mm sound mine <folder-or-video> --out <dir> --licence "<terms>"` (or `--own` for your own recordings) cuts the recording into its sounds, measures each, and writes `<dir>/<name>.profile.json` plus `<dir>/mine.html` to listen to them beside their numbers. A mined profile is a sound profile like `glass`: set it as `sound.profile`. The licence of every source travels in its records and in the profile Mining also fits each tonal sound's modes (`modal`: the partials as `[ratio, dB]` with each one's own T60, from a damped-sinusoid fit) and keeps the third-octave balance of the set in the profile (`balance`). From a recording with music under it each sound is measured with the bed taken away (`exposedDb`, the bands the music masks, the decay shape, any stutter): a sound under 12 dB over the bed gets `exposed: false` and no family, and does not set the profile.
- **Clone a style.** `mm sound clone --profile <dir>/<name>.profile.json --cue <name> --meaning "<what it marks>" [--like <sound.wav>] --out <patterns folder>` writes a new recipe in that style (a seeded search, measured, the same every time) with a card naming the profile and its sources. Run `mm sound-listen --cues <name>` and listen before it ships. `--out` is a patterns folder (default `./patterns`, which in this repository is the library: a cue written there also needs its row in `skill/motion-machine/references/patterns-cheatsheet.md`); a piece whose patterns base is that folder finds the cue like any other The search is an evolution strategy scored model-free (log-mel, envelope, onset, tone, excess and missing energy against `--like`, else the profile's balance), the best three are confirmed on two more seeds, and a clone is checked for the defects W-SOUND-ARTIFACT warns for. `--variants N` (1 to 9) writes `<cue>`, `<cue>-2`, … that are neither copies nor strangers and prints how far apart each pair is.
- **The palette rule.** With a profile set, W-PALETTE measures every cue the piece plays against it (register, attack, length for its family, level, peak) and warns on each miss; W-SOUND-ARTIFACT is its twin for defects (a click, a DC offset, clipping, a cut-off tail, a comb ring, a ghost in the tail, stacked attacks of a hit, a rising glide) and needs no profile.
- **Let the film propose its sounds.** `mm sound suggest [piece] [--budget 5]` lists every moment of the schedule that could take a sound (entrances, type-ons, the end of a counter, cuts, presses, exits, settles) with a cue, a weight and a frame, chosen under a budget of cues per 10 s, each role's minimum gap, two at once at most and a hook in the first 2 s, and writes `out/sound-suggest.json`. Nothing changes in the story until `--apply`, which writes the cues that exist as beat `cue` fields (one receipt, `mm timeline <piece> undo` takes it back) and never over a cue a beat has; the rest are `needs cue` or `needs beat`. A brand sets the cue of each kind of moment once in `style.sound.suggest` (`cues`, `hitShare`, `repeatGapMs`).
- **Hear the shape.** W-SOUND-SHAPE warns when the film has no hook sound in its first 0.6 s, when the cues are all about as loud, or when one cue is repeated like a machine gun, and lists five places to listen first, each a question for the ear.
- **Blind A/B.** `mm sound-listen --ab <a.wav|cue> <b.wav|cue> [--trials 20]` builds a page that plays the two sounds in random order, equally loud and trimmed alike, keeps each verdict in the browser and exports `verdicts.json`; it says the score and its p-value. A pair it refuses (a steady tone, a silent sound) comes with the reason.
- Measurements are not ears. The mined numbers and the clone's search are set by measurement; a person listens before a brand adopts a sound

## What "no music composition" means for a brief

- Motion Machine does not compose a score. A brief may supply a track (used unchanged, with an optional bpm), or choose cues plus a bed, or choose silence [SPEC §9]
- A brief that asks for original music is answered by naming the gap and offering those three options
- When a track exists, scenes are sized to whole beats and edits join on downbeats with a 12 ms crossfade
- Without a track, no beat map exists and cue snapping is skipped [SPEC §9]
- Tempo, beat times and first downbeat are measured from the supplied file in Node, not guessed
