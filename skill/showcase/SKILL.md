---
name: showcase
description: Turns a screen recording or a still of an app, a prototype or a site into a finished device film (MP4) or a hero web page with one Motion Machine command, `mm showcase`. Use when the user says "showcase this", "make a video of <file>", asks for a device mockup video, an app preview or product demo video, a hero video or hero page, or a phone, tablet, laptop or browser around a recording, or drops a recording or a screenshot to present. For a film with a story, words and scenes, use the motion-machine skill instead.
license: Apache-2.0
compatibility: "Node 22+, Playwright Chromium, ffmpeg 6+"
metadata:
  version: 0.1.0
---

# Showcase: one recording, one device film

A thin route to `mm showcase` in the Motion Machine repository. The command holds the logic (the
plan, the piece, the gate and the export); this skill finds the file, settles the look and runs it.

## Steps

1. **The file.** Use the one the user names or drops. If none or several, ask which before going on.
   A video (`.mp4 .mov .m4v .webm .mkv .avi`) or a still (`.png .jpg .jpeg .webp .gif`).
2. **The repository.** Run from the Motion Machine clone (this skill sits in its `skill/showcase/`;
   if it was linked into the agent's skills folder, the clone is two folders above this file's real path).
   `npm ci` there once if `node_modules` is missing, and `node scripts/mm.mjs doctor` on a new machine.
3. **Dry run first:**
   ```
   node scripts/mm.mjs showcase "<file>" --check [flags]
   ```
   It prints the plan (content, device, look, length, format, style, piece, output) and renders
   nothing. Fix anything that does not match what the user asked for.
   The look comes from the brand: if the user has a Motion Machine style for it (a preset or a
   composed `style.json`), pass it with `--style`; otherwise ask once, in the same message as any
   question about the file. With none, the default style is used: say so. Never invent brand
   colours; `--background` takes only a colour the user or the brand gives.
4. **Run it** with the same flags, without `--check`. Map what the user asked for to the flags below
   and leave the rest to the defaults.
5. **Look before sending.** Open three frames of the MP4 (start, middle, end; ffmpeg `-ss` or
   `mm stills <piece>`), check the right device, the screen upright and not stretched, and fix the
   flags and run again if something is wrong.
6. **Send** the path the command prints (`mm showcase: wrote …`). Say which device, look and length
   were used if the user did not choose them, and offer another look or device. You saw frames, not
   playback: ask the user to watch it once before posting.

## Flags

`--device phone|tablet|laptop|browser` (default: phone for a portrait file, laptop for a landscape one)
`--look hero|turntable|still|showcase` (phone also `cross`, `drawn`; browser only `hero`, `still`; default `hero`)
`--zoom` `--duration N` `--fps N` `--format 9x16|4x5|1x1|16x9` `--style <preset|path>` `--background #hex`
`--contained` `--html` `--stills N|s1,s2` `--audio <file>` `--piece <dir>` `--out <file>` `--check`

- **No zooms unless asked.** Pass `--zoom` only when the user asks for zooms on taps, clicks or the
  action: it zooms on the clicks and taps of the recording's pointer track (a recording made with
  `mm capture site --script`, or one with a `.cursor.json` beside it), or, with no track, where the
  recording moves.
- `--contained` keeps the whole device inside the safe margin: for a slide, a deck or a column.
- `--html` also writes a hero page: one file that plays the film once, then floats and tilts toward
  the pointer.
- `--stills` writes a contact sheet instead of the film (a count, or seconds): use it to compare looks
  quickly.
- `--audio` lays a finished track the user gives under the MP4 (padded or trimmed, faded out). The
  recording's own sound does not carry over; to keep it, extract it and pass it back with `--audio`.
- The length is the whole recording (6 to 120 s; a still 10 s). Outside 20 to 60 s the gate warns
  W-LENGTH; that is advice, not a stop.

The piece lands in `pieces/showcase-<name>/` (git-ignored); to change it by hand later, copy it to a
new folder and follow the motion-machine skill, since a generated story is written again on each run.
