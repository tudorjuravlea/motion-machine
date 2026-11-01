// Small shared pieces of the verb scripts: piece resolution, usage errors, exit codes (SPEC §7:
// 0 pass, 1 a gate failed, 2 setup or usage).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT } from './browser.mjs';

/** The git-ignored folder for real-brand material and runtime work, relative to the repository root. */
export const PRIVATE_DIR = join('docs', 'private');

/** Setup or usage problem: printed without a stack, exit code 2. */
export class UsageError extends Error {
  constructor(message, code = 2) { super(message); this.name = 'UsageError'; this.exitCode = code; }
}

/** A required tool is absent; the message names it. */
export class MissingToolError extends UsageError {
  constructor(tool, hint = '') { super(`${tool} not found on PATH${hint ? `: ${hint}` : ''}`); this.tool = tool; }
}

/**
 * One usage line (plus what the verb does) per command, as typed after `mm`. `mm <cmd> --help`
 * prints exactly this and exits 0; a usage mistake (unknown flag, missing value) prints it after
 * the message and exits 2, never a stack.
 */
export const USAGE = {
  doctor: ['mm doctor', 'verify Node, Chromium, ffmpeg and ffprobe; never installs anything'],
  new: ['mm new --kind film|deck --style <preset|path> (--id <id> | --dir <folder>)', 'scaffold a piece in pieces/<id>/ or in --dir <folder> (under the repo root; the story id is the folder name unless --id is given); piece.js gets the right path to the kit'],
  serve: ['mm serve [piece] [--port N] [--format 16x9|9x16|1x1|4x5] [--t S] [--press N]', 'local preview with a play clock'],
  stills: ['mm stills [piece] [--format F]', 'rests, mid-entrances, strips, out/contact.png, out/phone.png'],
  check: ['mm check <piece> [--format F] [--sub N] [--quiet] [--json] [--progress]', 'the gate; writes out/check.json; --quiet prints only a failing verdict, as one line'],
  export: ['mm export [piece] [--fps 30] [--sub 1] [--formats a,b] [--force] [--prove] [--gif] [--gif-width 540] [--workers N] [--encoder auto|software|videotoolbox] [--sprite wav|mp3|aac] [--alpha] [--alpha-mov]', 'films: MP4 per format, drawn by N pages in parallel (default half the cores, 1 to 4; at most 16); decks: standalone deck, handout.pdf, walkthrough.mp4 (--sub above 1 blends instants and is warned about); then the finished MP4s are read back (out/export-qa.json, out/export-qa-seams-*.png) and a failed check exits 1; --encoder software (the default) is the bit-exact x264 encode, auto and videotoolbox use the Mac\'s hardware H.264 when ffmpeg has it (never with --prove); --alpha draws a transparent canvas into VP9 WebM with alpha instead of an MP4 (--alpha-mov adds ProRes 4444 for editors; films only, software encoder, no GIF) and the read-back reads the alpha channel; --fps takes 23.976, 29.97 and 59.94 as their exact fractions'],
  'verify-export': ['mm verify-export <mp4> [--piece <dir>]', 'read a finished MP4 back: a video stream, the story\'s duration, size and frame rate, sound where the piece has sound, no black frames, no frozen span while the schedule moves, no long silence, true peak and loudness of the encoded file against the style, and a black, duplicated or offset frame at any cut; writes out/export-qa.json and the seam sheet beside it; exit 1 when a check fails'],
  'say-lint': ['mm say-lint [piece] [--text "…" | --script <file>] [--scene <id>] [--json]', 'read a film\'s voice-over (each scene\'s say, or one text) for the words a voice may get wrong before a paid voice reads it: acronyms, camelCase names, identifiers, file names, web addresses, numbers with units, and product words the brand lexicon (voice.lexicon) does not know; a [display](spoken) marker or a lexicon entry clears a word, and a <<slot>> cue marker must name a beat of its scene; exit 1 when a word or a cue is flagged'],
  studio: ['mm studio <piece> [--port N] [--open]', 'the studio: the piece as a timeline on 127.0.0.1; drags and the inspector write story.json as the smallest change, journalled in out/studio/; Export renders the MP4s; --open opens the page in the default browser'],
  timeline: ['mm timeline <piece> [--format F] [--json] [--plan] [--who NAME] [move|trim|out|set|apply|undo|check|selection …]', 'the timeline for agents: no verb prints it; move <ref> <time>, move <scene> before|after <scene>, trim <scene> <time>, out <ref> <time|none>, set <ref> k=v, apply <edits.json>, undo [receipt|last], check, selection; refusals exit 2 with a hint'],
  gen: ['mm gen <kind> --piece <dir> --name <asset-name> [--provider kie|elevenlabs|higgsfield] [--model <id>] [--prompt "…"] [--ref <img>]… [--image <img>] [--video <clip>] [--audio <file>] [--character <img>] [--aspect 16:9] [--duration <s>] [--instrumental on|off] [--text "…"] [--script <file>] [--scene <id>] [--say-ok] [--voice <id>] [--language <code>] [--file <path>] [--url <https-url>] [--job <id>] [--brand on|off] [--again <name>] [--raw] [--fresh] [--plan] [--yes] [--json]', 'generate an asset through Kie.ai, ElevenLabs or Higgsfield, steered by the style\'s brand, into <piece>/assets/gen/<name>.* with a record <name>.gen.json; <kind> is image, video, replace, music, sfx, voice, transcribe, import or credit (credit needs no --piece or --name); without --yes it prints the plan (provider, model, the prompt as sent, every file that would leave the machine with its sha256, the cost when quoted) and exits 3; --plan prints it and exits 0; --again <name> generates a recorded asset again with the current brand (planned first: --yes only counts on a later run); the same request twice is one call, --fresh sends it again; a record assets/gen/<name>.licence.json is written beside the asset; a video is prepared like mm media prep unless --raw; import brings in a result made elsewhere (--file or --url) and needs no --yes'],
  review: ['mm review [piece] [--no-stills]', 'out/review.html from direction-log.md'],
  beats: ['mm beats <track.wav> [--bpm N] [--out assets/beats.json]', 'detect the beat grid of a track'],
  sound: ['mm sound [piece] [--formats 16x9,9x16] [--patterns dir] [--trace] [--sprite wav|mp3|aac]', 'render the piece\'s sound mix and cue list (--trace also writes out/sound-trace.json: every add and gain curve, with the rule that placed it); a deck is not mixed: its cues become one sprite, out/deck-sound.<wav|mp3|m4a> with out/deck-sound.json (--sprite picks the codec, wav by default), which the standalone deck plays'],
  'sound mine': ['mm sound mine <folder-or-file> --out <dir> [--name <profile>] [--licence <terms>] [--own] [--source <text>] [--author <name>]', 'cut a folder of audio or video (or one file) into its sounds by onset, measure each (duration, peak, loudest-100 ms and integrated K-weighted loudness, attack, T60, centroid and roll-off, flatness, side/mid, partials as ratios, pitch if tonal), and write <dir>/records/<id>.json per sound with its source, licence and author, <dir>/sounds/<id>.wav, <dir>/<name>.profile.json (the fitted sound profile: register, key, envelope ranges, material, loudness, room, width, and every source) and <dir>/mine.html (a player and the numbers for each); --licence is required unless --own says the recordings are yours (a file with a record beside it keeps its own)'],
  'sound clone': ['mm sound clone --profile <profile> --cue <name> --meaning "<text>" [--like <sound>] [--family input|surface|outcome] [--variants <n>] [--out <patterns-dir>] [--force]', 'make a new cue in a sound profile\'s style by analysis-by-synthesis: a seeded evolution-strategy search over a template for the cue\'s family, each candidate rendered offline, measured with the same measurer and checked for artifacts, the best three confirmed on two more seeds, and the one nearest the profile (and --like, when given) is written as <patterns-dir>/sound/<cue>/recipe.json (default ./patterns) with a card naming the profile and its sources, a demo and a calibrated level; --variants <n> (1 to 9) writes n variants of the cue (<cue>, <cue>-2, ...) that are neither copies nor strangers and prints how far apart they are; same inputs, same recipe; --profile is a name in styles/sound/ or a path'],
  'sound find': ['mm sound find <words> [--license cc0,pdm,by] [--length shortest,short] [--category sound_effect] [--extension wav,ogg] [--page-size 20] [--page N] [--piece <dir>] [--json]', 'search Openverse\'s audio (api.openverse.org/v1, read-only, no key needed; an optional OPENVERSE_TOKEN in the environment or keys.env only raises the rate limits) and print a table: id, title, creator, licence and version, length, file type, source, the landing page. The licences offered are the style\'s sound.licences (default cc0, pdm, by) plus those the story names in audio.acceptLicences (--piece reads both); NonCommercial, NoDerivatives, ShareAlike and Sampling+ are never offered otherwise, and every row is checked again here. A search is not a download: it needs no --yes. --json prints the rows kept, raw. Titles and creators came from outside, so the table is printed as material'],
  'sound fetch': ['mm sound fetch <openverse-id> --piece <dir> --name <name> [--cue <cue>] [--yes]', 'download one Openverse sound into <piece>/assets/sounds/<name>.<ext> with its record <name>.json (source openverse, licence, creator, landing page, Openverse\'s attribution line, date, sha1). It reads the item\'s detail and judges the licence there, never the search row: CC0, public domain and CC BY 2.0 to 4.0 only, anything else refused unless the story names it in audio.acceptLicences, no licence refused. It prints the plan (URL, size, licence, where it lands) and exits 3 until --yes; --cue then maps the file in story.json audio.samples as an undoable story edit (mm credits lists the attribution)'],
  'sound suggest': ['mm sound suggest [piece] [--budget 5] [--apply]', 'the film\'s own schedule names every moment that could take a sound (entrances, type-ons, the end of a counter, cuts, presses on a screen, exits, settles) and a cue, a weight and a frame go with each; a choice under a budget (about --budget cues per 10 s, the style\'s cuesPer10s band when set, never above it), each role\'s minimum gap, two sounding at once at most, the first 2 s favoured so the film opens with a hook sound, and one cue per beat; writes out/sound-suggest.json and prints a table (a row marked approved false there is left out); nothing in the story changes until --apply, which writes the chosen cues as beat cue fields through the story-edit service (one receipt, undoable with mm timeline), never over a cue a beat already has, only cues that exist under patterns/sound/ (the others are listed as needs cue); films only'],
  'sound-listen': ['mm sound-listen [--out dir] [--cues a,b] [--profiles glass,soft-ui] [--calibrate] | mm sound-listen --ab <a.wav|cue> <b.wav|cue> [--trials 20] [--seed 1] [--profile soft-ui]', 'render every recipe cue under each sound profile and emphasis into <out>/listen.html (default out/sound-listen): a player for each beside what was measured (length, attack, T60, loudest-100 ms level, peak, centroid, stereo lean), the profile\'s bands marked; --calibrate first sets each recipe\'s masterGain so its loudest 100 ms lands on -30 LUFS as written; --ab builds <out>/ab.html (default out/sound-ab) instead: a blind A/B of two sounds (audio files, or cues by name), matched on the K-weighted loudest 100 ms (400 ms from 1 s) with one common gain keeping the true peak at -1 dBTP or under and trimmed alike with a 4 ms fade-in, refused with the reason (exit 1) when they differ by more than 0.5 LU, one has more than 5 ms of pre-roll or sits under 6 dB above its own floor; A holds the first sound on exactly half of --trials, each verdict (A or B, with ok, loud, masked, harsh, extra or missing) is kept in the page\'s local storage and exported as verdicts.json, and the results say the score and its p-value (15 of 20 is p = 0.021)'],
  'release-check': ['mm release-check [--root <dir>] [--only R-BRAND,R-SECRET,...] [--json]', 'the pre-publication sweep: brand words, secrets, absolute paths, e-mail addresses, URLs, licences, pattern lint, golden checks; exit 0 clean, 1 findings, 2 setup'],
  'pattern list': ['mm pattern list', 'the complete patterns, as pattern-lint judges them'],
  'pattern lint': ['mm pattern lint [<group>/<name> | <name>] [--json]', 'lint every pattern, or the one named'],
  'pattern stills': ['mm pattern stills <group>/<name> [--style preset|path|all] [--format F] [--patterns dir]', 'photograph a pattern\'s demo in a style (--patterns: a patterns folder other than the repo\'s)'],
  'brand init': ['mm brand init <folder> [--from <shipped-brand-name|path-to-brand.json>] [--name <name>]', 'make a brand\'s own folder at any path (new or empty): brand.json, the fonts it names with their licences in fonts/, its ground mark in ground/, logo/, sources/, notes.md, facts.md and projects/; --from takes a shipped brand name, a captured half in the git-ignored private brands folder, or a path (default paper, renamed and marked not fictional); --name defaults to the folder name'],
  'brand onboard': ['mm brand onboard <folder> --from <source> [--from <source>…] [--color role=#hex]…', 'bring a brand into its folder (made with brand init when missing or empty) from one or more sources: a URL, an .html file or a folder with an index.html (read in Chromium), a Figma export .json, a DESIGN.md, or a folder of stills; sources are merged by trust (tokens and DESIGN.md over a site over stills), the role rules fix what they can (a muted colour that cannot be read, the text colour on the accent) and ask about the rest, and the result goes to brand.json, sources/onboard.json and notes.md; a --color always wins and is never changed'],
  'brand set': ['mm brand set <folder> <role>=#hex [<role>=#hex…]', 'set colour roles (canvas, ink, muted, surface, line, accent, accentInk, surfaceInk) by hand and run the role rules again; rewrites brand.json and sources/onboard.json and appends to notes.md; a value that is not a hex colour, or a role that is not one of these, exits 2 and writes nothing'],
  'brand font': ['mm brand font <folder> <file> --family "<Name>" --role display|text|mono|both [--weight 400] [--license <file>]', 'take a brand font (.woff2, .woff, .ttf or .otf, checked by its first bytes) into fonts/<family>/ with its licence as LICENSE.txt, and make it the face of the role; SIL OFL and Apache licences are recognised, anything else or none is private-use'],
  'brand logo': ['mm brand logo <folder> <file.svg>', 'keep a brand logo as logo/logo.svg, cleaned (no script, foreign content, event handlers or references outside the file; a viewBox in place of a fixed size), with logo/logo-mono.svg in currentColor, and record which palette role each colour is closest to; a file that is not an SVG exits 2'],
  'brand capture': ['mm brand capture --from <url|index.html|figma-export.json|DESIGN.md|folder of stills> [--name <name>] [--color role=#hex]… [--out <path>.json]', 'capture a brand half; --out defaults to brands/<name>.json in the git-ignored private folder of the repo; --name defaults to the --out basename; a typed --color always wins'],
  'brand mascot': ['mm brand mascot <file.svg> --brand <path> [--as <name>] [--out <path>] [--json]', 'import a mascot drawn in any vector tool into a brand half, by its layer names (body, face, eye-left, eye-right, mouth, arm-*, leg-*, shadow; any other name an extra part), normalised into the mascot box with colours mapped to palette roles; --as adds it to the brand\'s cast under that name; --out writes elsewhere than --brand'],
  'brand sheet': ['mm brand sheet <folder> [--motion <name|path>]', 'render the brand folder\'s review sheet in one browser session into <folder>/sheets/: review.html (self-contained, its fonts beside it), review.png (1440 px wide) and frames/; the palette with each role\'s evidence and confidence, every text pair\'s contrast, the type, the look in three patterns and the logo, the motion half\'s tempo, and the questions left for a person with the command that answers each; reads sources/onboard.json when there is one, else brand.json; --motion defaults to calm'],
  'motion capture': ['mm motion capture --from <video> --out <path>.json [--name <name>] [--fps 10]', 'capture a motion half from a reference video; --name defaults to the --out basename'],
  'style compose': ['mm style compose --brand <name|path> --motion <name|path> --out <path> [--name <style-name>]', 'merge a brand half and a motion half into a style'],
  'style export-designmd': ['mm style export-designmd --style <style.json> --out DESIGN.md', 'write a style as a DESIGN.md'],
  'style export-motion': ['mm style export-motion --style <style.json> --out <motion.css|motion.json>', 'write a style\'s eases and springs as tokens a developer can paste: CSS custom properties (a spring is a duration and a sampled linear()) or JSON (with the Motion API form and the physics)'],
  'skill new': ['mm skill new --brand <name|path-to-brand.json> [--motion <name|path>] --out <dir> [--license <spdx>] [--force]', 'scaffold a thin per-brand skill; --brand takes a shipped name or the path to a captured brand half'],
  'project new': ['mm project new <folder> --brand <brand-folder> --kind film|deck [--motion <name|path>] [--formats a,b]', 'a film or deck project at any path (a bare name goes under <brand-folder>/projects/; the folder must be new or empty): project.json, the skeleton story.json, assets/, inputs/sources.md and out/; --motion defaults to calm; a deck keeps one format; needs no browser'],
  'project make': ['mm project make <folder> [--to <dir>] [--check-only]', 'compose the brand folder with the motion half, refresh the project\'s hidden work piece inside the engine, run mm check (a FAIL stops here), then mm export, and copy the results into <folder>/out/ (film: <id>-<format>.mp4, poster.png, any .gif; deck: slides/, handout.pdf, walkthrough.mp4; always check.json); --to also copies the deliverables to <dir> as <id>-<format>.mp4, <id>-slides/, <id>-handout.pdf and <id>-walkthrough.mp4; --check-only stops after the check'],
  'project path': ['mm project path <folder>', 'print the work folder behind a project, which mm studio and mm serve can open'],
  'media frame': ['mm media frame <png> --name <n> [--piece <dir>] [--key]', 'a device frame image you own (transparent screen, or a flat screen colour with --key) to <piece>/assets/frames/<n>.png, its screen hole measured into <n>.json'],
  'media prep': ['mm media prep <file> --name <n> [--piece <dir>] [--fps 30] [--fit phone|laptop|<W>x<H>] [--trim <a>-<b>] [--quality 90]', 'a screen recording to a frame sequence in <piece>/assets/<n>/ (frames plus media.json), seekable frame by frame'],
  'media layers': ['mm media layers <picture> --name <n> [--piece <dir>] [--mask <name>=<png>]… [--poly <json>]… [--key <#rrggbb|auto>] [--min-area <px>] [--plate <png>] [--depth <png>] [--depths <d,d,…>]', 'one still picture to a layer pack in <piece>/assets/<n>/: a plate with its holes filled, parts cropped to their boxes with stacking order and depth, media.json (kind: layers) and a recompose check; masks, polygons or a colour key, offline; a colour key drops pieces under --min-area pixels (a thousandth of the picture by default) and refuses a backdrop that is not flat; byte-identical on one machine'],
  'footage cut': ['mm footage cut <video> --name <n> [--piece <dir>] [--words <words.json>] [--fillers] [--max-pause 0.5] [--cuts <cuts.approved.json>] [--scenes <scenes.json>]', 'a talking-head recording, already prepared with mm media prep --name <n>, to an edit in <piece>/assets/<n>/: cuts in measured quiet (edit.json) and the cut voice at the piece\'s loudness (voice.wav); --words maps a supplied word list ([{text,start,end}] or WhisperX output) onto the edit; --fillers (with --words) also cuts the stretches between words longer than --max-pause, whatever sound they hold; --cuts <cuts.approved.json> (from mm footage review) replaces the pause finder: the recording minus exactly the cuts marked approved true, in the words\' seconds (an empty list keeps the whole take; a cut outside the recording exits 2); --scenes <scenes.json> (from mm footage scenes) moves a join that would leave a sliver of the other shot onto the scene change, never into a word; a words file that is mostly music marks exits 2, another language than the story\'s is warned; a take with no pause gives one clip and a note; byte-identical on one machine (another machine\'s decoder may differ by a few samples in voice.wav)'],
  'footage review': ['mm footage review <words.json> [--out <dir>] [--piece <dir>] [--language <code>] [--max-pause 0.5] [--audio <video|audio>] [--scenes <scenes.json>]', 'a transcript ([{text,start,end}], {words} or WhisperX output) to <dir>/cuts.proposed.json (default the current folder): retakes, false starts, stutters, hesitations and long pauses, each with source seconds, the words removed, a reason and a confidence; nothing is cut (copy it to cuts.approved.json, mark each cut approved true or false, then mm footage cut --cuts); also reports this speaker\'s sentence gaps far tighter than their median, the breath kept after a cut, and the head and tail pads next to the cut\'s; the language is the story\'s (--piece) or --language, and a transcript that is mostly music marks exits 2; --audio <the recording> hears the sound too: a long pause is proposed only where the transcript has no word and the sound is not speech (silence or noise, not a voice the transcript missed), 0.5 s at least with 0.15 s of padding, the clip is classed no-audio, silent, noise or speech, and a clip with no speech in it proposes no cut; --scenes <scenes.json> (from mm footage scenes) moves a cut edge that would leave a sliver of the other shot onto the scene change, never into a word'],
  'footage scenes': ['mm footage scenes <video> [--out <dir>] [--spike 1.8] [--min-scene 0.5]', 'the scene cuts of a recording from its picture alone: a small copy of every frame (at most 30 a second) is compared with the one before in hue, saturation and value, and a cut is a frame whose difference stands at least --spike times above its neighbours\' (a handheld shake is no cut) with no scene shorter than --min-scene seconds; writes <dir>/scenes.json (default the current folder) with the cuts, the scenes, and the sound\'s offset from the picture; a dissolve is not found'],
  'footage audit': ['mm footage audit <dir> [--source <video>] [--edit <video>] [--style <style.json>]', 'writes <dir>/audit.html from cuts.approved.json (else cuts.proposed.json): kept time (canvas) and cut time (accent) on one timeline over the source, the source and the edit side by side, a click on a cut playing the removed span with a second of context either side, and the 20 largest removals with their reasons; self-contained and local (videos linked by relative path, never copied); --style takes the palette roles of a style.json'],
  'footage verify': ['mm footage verify <edit.mp4> --words <edit.json> [--heard <words.json>] [--out <dir>]', 'the round trip: the words heard in the finished edit (--heard: its transcript from the tool the piece used; mm gen transcribe when this build has it) against the plan\'s words around every cut (the edit.json words and cuts); reports clipped, missing and leftover words per cut, and writes <dir>/verify.json (default verify/ beside the edit) with a strip-NN.png of 10 frames either side of each cut; exit 0 every cut clean, 1 a word clipped or missing'],
  'footage matte': ['mm footage matte --name <n> [--piece <dir>] [--masks <dir>] [--quality accurate|balanced] [--feather 3]', 'a person matte for a footage asset already prepared with mm media prep --name <n>: one grey mask per frame (white = person) in <piece>/assets/<n>/matte/, recorded in media.json; by default the macOS Vision framework segments the frames on the device (macOS 12+ with swiftc; the helper is compiled into <piece>/out/ on first use); elsewhere supply masks from any tool with --masks <dir> (the frames\' names, .png or .jpg); every mask then takes a 3-frame temporal median and a --feather px soft edge; the same input on one machine writes the same bytes'],
  credits: ['mm credits <piece> [--json]', 'the credits the asset licence ledger asks the piece to carry (assets/<name>.licence.json: CC-BY assets and any record with a credit line), for an end card or a credits scene; assets with no record are named on stderr; the words are fenced as material, --json prints plain data'],
  'capture site': ['mm capture site --url <url> --name <n> [--piece <dir>] [--device phone|laptop|browser] [--mark "<Label>=<selector>"]… [--hide <selector>]… [--wait <selector>] [--quality 90] [--max-height 24000] [--script <steps.json>]', 'capture a web page once, at a device viewport, as tall tiles plus media.json (marks for scroll, tap and callout targets); with --script (steps: goto, wait, move, click, hover, type, scroll) the page is played and recorded instead: assets/<name>.webm, its pointer track assets/<name>.cursor.json beside it (the pointer\'s samples and the boxes of what it clicked, as fractions of the viewport), and the frame sequence assets/<name>/ cut from the moment the page had loaded, which screen/pointer and screen/zoom-to mode auto read'],
  share: ['mm share [piece] [--out <dir>] [--format F] [--url <https://…>] [--index]', 'a watch folder for a finished film or deck, ready for any static host (nothing is uploaded): index.html with the MP4 or the standalone deck, a poster, Open Graph and Twitter card tags, ?t= and ?press= deep links and a chapter list; transcript.json, context.md, captions.vtt (when the film has captions) and share-block.md, a poster that links to the page between marker lines a second run replaces; --url is where the folder will be published (card tags and the block need an absolute address); the page is unlisted unless --index (refused while a used asset has no free licence on record); defaults to <piece>/out/share/, and refuses a folder that is not empty'],
  showcase: ['mm showcase <file> [--device phone|tablet|laptop|browser] [--look hero|turntable|still|showcase|cross|drawn] [--zoom] [--duration N] [--fps N] [--format F] [--style <preset|path>] [--background #hex] [--contained] [--html] [--stills N|s1,s2] [--audio <file>] [--piece <dir>] [--out <file>] [--check]', 'one command from a screen recording or a still to a finished device film: plans it (--check prints the plan), writes a generated piece, runs the gate and exports the MP4; nothing zooms unless --zoom (on clicks and taps, or where it moves); --html adds a hero page, --stills a contact sheet'],
};
/** The groups: `mm <group>` names its subcommands. */
export const GROUP_USAGE = { pattern: ['list', 'lint', 'stills'], brand: ['init', 'onboard', 'sheet', 'set', 'font', 'logo', 'capture', 'mascot'], motion: ['capture'], style: ['compose', 'export-designmd', 'export-motion'], skill: ['new'], media: ['prep', 'frame', 'layers'], footage: ['cut', 'review', 'scenes', 'audit', 'verify', 'matte'], capture: ['site'], project: ['new', 'make', 'path'] };

/** The usage text for a command key (`new`, `pattern lint`) or a group (`pattern`). */
export function usageText(key) {
  if (USAGE[key]) return `usage: ${USAGE[key][0]}\n  ${USAGE[key][1]}`;
  if (GROUP_USAGE[key]) return GROUP_USAGE[key].map((s) => `usage: ${USAGE[`${key} ${s}`][0]}\n  ${USAGE[`${key} ${s}`][1]}`).join('\n');
  return `usage: mm ${key}`;
}

/** A `--port` value as a number (0 picks a free port); anything but whole digits within 0 to 65535 is a usage error. */
export function portOf(value) {
  if (value === undefined) return 0;
  const n = /^\d{1,5}$/.test(value) ? Number(value) : NaN;
  if (!(n <= 65535)) throw new UsageError(`--port takes a port number (0 to 65535, digits only), not "${value}"`);
  return n;
}

/** A parseArgs mistake (unknown option, missing value): a usage problem, not a crash. */
export const isArgsError = (e) => typeof e?.code === 'string' && e.code.startsWith('ERR_PARSE_ARGS');

/** `mm <verb> [piece]`: a directory, an id under pieces/, or the current directory when it holds a story. */
export function resolvePiece(arg) {
  const cands = arg
    ? [...new Set([isAbsolute(arg) ? arg : resolve(process.cwd(), arg), ...(arg.startsWith('pieces/') ? [] : [join(ROOT, 'pieces', arg)]), join(ROOT, arg)])]
    : [process.cwd()];
  for (const c of cands) if (existsSync(join(c, 'story.json')) && statSync(c).isDirectory()) { assertKitReachable(c); return c; }
  throw new UsageError(arg ? `no piece at "${arg}" (looked for story.json in ${cands.join(', ')})` : 'no piece given and the current directory holds no story.json');
}

/**
 * The first relative import of the piece's entry module that points at a file which is not there,
 * as { from, spec, url } (url = the path the browser would request, repo-relative), or null.
 * A piece moved out of pieces/<id>/ keeps its old `../../runtime/kit/kit.js` and silently fails to
 * open; this names the import instead.
 */
export function brokenImport(dir) {
  const html = join(dir, 'index.html');
  if (!existsSync(html)) return null;
  const text = readFileSync(html, 'utf8');
  const tag = /<script\b([^>]*\btype=["']module["'][^>]*)>([\s\S]*?)<\/script>/i.exec(text);
  if (!tag) return null;
  const src = /\bsrc=["']([^"']+)["']/.exec(tag[1]);
  const entry = src ? resolve(dir, src[1]) : html;
  if (!existsSync(entry)) return null;
  const code = src ? readFileSync(entry, 'utf8') : tag[2];
  const re = /\bimport\s*(?:[^'"()]*?\bfrom\s*)?["'](\.{1,2}\/[^"']+)["']|\bimport\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;
  for (const m of code.matchAll(re)) {
    const spec = m[1] ?? m[2];
    const abs = resolve(dirname(entry), spec);
    if (!existsSync(abs)) return { from: entry, spec, url: relative(ROOT, abs).split(sep).join('/') };
  }
  return null;
}

/** Throws a one-line UsageError naming the import that failed. */
export function assertKitReachable(dir) {
  const b = brokenImport(dir);
  if (b) throw new UsageError(`piece failed to load: ${relative(ROOT, b.from) || b.from} imports "${b.spec}", which resolves to ${b.url} and is not there (moved piece? \`mm new --dir <folder>\` writes the right path)`);
}

/** Runs `main()` when `meta` is the entry script; maps errors to exit codes. */
export function runMain(meta, main) {
  if (!process.argv[1] || meta.url !== pathToFileURL(process.argv[1]).href) return;
  main().then((code) => { process.exitCode = typeof code === 'number' ? code : 0; }, (e) => {
    if (e instanceof UsageError) console.error(`mm: ${e.message}`);
    else if (isArgsError(e)) {
      const key = SCRIPT_COMMAND[basename(fileURLToPath(meta.url), '.mjs')];
      console.error(`mm: ${e.message}${key ? `\n${usageText(key)}` : ''}`);
    } else console.error(process.env.MM_DEBUG === '1' ? (e?.stack ?? e) : `mm: ${e?.message ?? e}`);
    process.exitCode = e?.exitCode ?? 2;
  });
}

/** Script basename -> the command key whose usage a usage mistake prints. */
const SCRIPT_COMMAND = { showcase: 'showcase', 'sound-suggest': 'sound suggest', 'sound-mine': 'sound mine', 'sound-clone': 'sound clone', 'sound-find': 'sound find', 'sound-fetch': 'sound fetch', doctor: 'doctor', new: 'new', serve: 'serve', stills: 'stills', export: 'export', review: 'review', 'pattern-stills': 'pattern stills', 'mascot-import': 'brand mascot', 'brand-init': 'brand init', 'brand-sheet': 'brand sheet', check: 'check', 'verify-export': 'verify-export', 'say-lint': 'say-lint', 'release-check': 'release-check', share: 'share' };

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Resolves a preset name (`editorial`), or a repo-relative or absolute path, to a style file. */
export function resolveStyle(arg) {
  const cands = isAbsolute(arg) ? [arg] : [resolve(process.cwd(), arg), join(ROOT, arg), join(ROOT, 'styles/presets', arg.endsWith('.json') ? arg : `${arg}.json`)];
  const file = cands.find((c) => existsSync(c) && statSync(c).isFile());
  if (!file) throw new UsageError(`style not found: ${arg}`);
  return file;
}

/** Every font file entry of a style: [{ family, file }] (file objects are live references). */
export function fontFiles(style) {
  return Object.values(style.type ?? {}).flatMap((face) => (face.files ?? []).map((file) => ({ family: face.family, file })));
}

/** Candidate absolute paths of a font `src`: relative to the style file's own folder first, then to the repo root (the shipped presets write `styles/fonts/...`). */
export const fontSrcCandidates = (src, styleFile) => [resolve(dirname(styleFile), src), resolve(ROOT, src)];

/** Absolute path of a font `src` as written in a style file, or null. */
export const findFontSrc = (src, styleFile) => fontSrcCandidates(src, styleFile).find((c) => existsSync(c)) ?? null;

/** Absolute path of a font `src`; throws naming where it looked. */
export function resolveFontSrc(src, styleFile) {
  const hit = findFontSrc(src, styleFile);
  if (!hit) throw new UsageError(`font file missing: ${src} (looked in ${fontSrcCandidates(src, styleFile).join(', ')})`);
  return hit;
}

/** Absolute path of a ground mark `src` as written in a style file: relative to the style file's own folder first
 *  (a skill's `../ground/x.svg`), then, when it begins `styles/`, from the repo root; null when neither exists. */
export function findMarkSrc(src, styleFile, root = ROOT) {
  const own = resolve(dirname(styleFile), src);
  if (existsSync(own)) return own;
  const repo = join(root, src);
  return src.startsWith('styles/') && existsSync(repo) ? repo : null;
}

/** A copy of a style with every font `src`, and a ground mark found beside the style file or by its repo path (`styles/…`), rewritten to a
 *  path relative to `pieceDir`, so a page scaffolded anywhere in the repo still finds them. */
export function relativiseFonts(style, styleFile, pieceDir) {
  const out = structuredClone(style);
  for (const { file } of fontFiles(out)) file.src = relative(pieceDir, resolveFontSrc(file.src, styleFile)).split(sep).join('/');
  const mark = out.ground?.mark;
  const found = mark?.src ? findMarkSrc(mark.src, styleFile) : null;
  if (found) mark.src = relative(pieceDir, found).split(sep).join('/');
  return out;
}
