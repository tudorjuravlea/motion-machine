// Writes pieces/demo-film/story.json (and the demo deck's). Kept as code so the beat sheet reads top to bottom
// and every scene's timing sits beside its copy; run: node pieces/demo-film/capture/build-story.mjs
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../../../scripts/lib/browser.mjs';
import { list } from '../../../scripts/pattern-lint.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// The numbers the copy states come from the tree: the rule files of the gate, the complete
// patterns by group, and the golden kinetic film's report (run `mm check pieces/golden-film-kinetic` first).
const ruleFiles = readdirSync(join(ROOT, 'scripts/check')).filter((f) => /^[GW]-.+\.mjs$/.test(f));
const errors = ruleFiles.filter((f) => f.startsWith('G-')).length, warnings = ruleFiles.length - errors;
const patterns = list();
const groups = [...new Set(patterns.map((p) => p.split('/')[0]))].map((g) => [g, patterns.filter((p) => p.startsWith(`${g}/`)).length]);
const reportFile = join(ROOT, 'pieces/golden-film-kinetic/out/check.json');
if (!existsSync(reportFile)) throw new Error('pieces/golden-film-kinetic/out/check.json is missing: run `node scripts/mm.mjs check pieces/golden-film-kinetic` first');
const report = JSON.parse(readFileSync(reportFile, 'utf8'));
if (report.rules.length !== ruleFiles.length) throw new Error(`the golden film's report has ${report.rules.length} rules, the gate ${ruleFiles.length}: run \`node scripts/mm.mjs check pieces/golden-film-kinetic\` again`);
const tally = (s) => report.rules.filter((r) => r.status === s).length;
const [pass, warn, skip] = ['PASS', 'WARN', 'SKIP'].map(tally);
const byGroup = groups.map(([g, n]) => `${g} ${n}`).join(', ');
const facts = [
  { id: 'f1', text: 'A piece is a story (story.json) worn by a style (style.json); the kit draws every frame from t alone. There is no timeline to edit.', source: 'SPEC.md §1-§2; skill/motion-machine/SKILL.md' },
  { id: 'f2', text: 'The same story renders as a film and as a clicker deck. This film ships in 16x9 and 9x16; pieces/demo-deck tells the same story in presses.', source: 'SPEC.md §1, §10; pieces/demo-film/story.json formats' },
  { id: 'f3', text: 'pieces/demo-swap-editorial, demo-swap-kinetic and demo-swap-calm-product are one story (only id differs) in the three shipped presets: editorial = paper x calm, kinetic = signal x kinetic, calm-product = linen x premium. The tiles are their frames at the rest of scene 2.', source: 'styles/presets/*.json field from; pieces/demo-swap-*/story.json; capture/assets.json swap-*' },
  { id: 'f4', text: 'The phone and laptop show pieces/golden-film-editorial at its first rest (the poster instant, 1.033 s) rendered in 9x16 and in 16x9 from the one story.', source: 'pieces/golden-film-editorial/story.json formats; capture/assets.json golden-editorial-*' },
  { id: 'f5', text: 'mm brand capture on fixtures/capture/site/index.html (the fictional Harbour & Pine) read seven colour roles; accent #D2491F, the most saturated colour on buttons, links and headings.', source: 'pieces/demo-film/capture/harbour-pine.json; harbour-pine.capture-notes.md' },
  { id: 'f6', text: 'Capture warned that Harbour & Pine\'s muted #6A7478 on canvas #F6F1E7 is 4.26:1, below the 4.5:1 W-CONTRAST asks of video text; it was darkened to #636C70 (4.77:1) before the skill was made.', source: 'pieces/demo-film/capture/harbour-pine.capture-notes.md; harbour-pine-fixed.json' },
  { id: 'f7', text: 'mm motion capture on pieces/golden-film-kinetic/out/golden-film-kinetic-16x9.mp4 read 900 frames and found 7 cuts, 18 arrivals, energy high.', source: 'pieces/demo-film/capture/kinetic-ref.capture-notes.md' },
  { id: 'f8', text: 'mm skill new --brand harbour-pine-fixed.json wrote the skill harbour-pine-motion: SKILL.md, style/ (brand, motion, style), fonts/ with licences, facts.md; 21 files.', source: 'pieces/demo-film/capture/harbour-pine-skill/' },
  { id: 'f9', text: 'pieces/golden-film-kinetic is 30 s at 30 fps: 900 frames, each drawn from t alone; mm export --prove rendered every one a second time in a fresh page and found them byte-identical. The sheet shows one frame a second, t = 0.5 to 29.5 s.', source: 'pieces/golden-film-kinetic/out/export.json; SPEC.md §2; capture/assets.json contact-golden-kinetic' },
  { id: 'f10', text: `The gate checks ${ruleFiles.length} rules: ${errors} errors (G-) and ${warnings} warnings (W-). On pieces/golden-film-kinetic: ${pass} PASS, ${warn} WARN, ${skip} SKIP.`, source: `SPEC.md §7; scripts/check/ (${errors} G-*.mjs, ${warnings} W-*.mjs); pieces/golden-film-kinetic/out/check.json` },
  { id: 'f11', text: `${patterns.length} patterns in ${groups.length} groups: ${byGroup}. None carries a brand. The wall shows each one's demo still in this film's style.`, source: 'node scripts/mm.mjs pattern list; node scripts/pattern-lint.mjs; capture/assets.json library-wall' },
  { id: 'f12', text: 'mm sound places synthesised cues on the beats and mixes to the style\'s loudness target, -14 LUFS.', source: 'styles/motion/kinetic.json sound.loudnessLufs; references/sound.md' },
  { id: 'f13', text: 'Motion Machine is licensed Apache-2.0.', source: 'README.md Status; LICENSE' },
];
const media = (f) => `assets/media/${f}`;
const scenes = [
  { id: 'hook', layout: 'layouts/statement', duration: 4, position: 'opening', move: null, beats: [
    { at: 0, slot: 'headline', fx: 'style:headline', text: 'Written, not edited.', params: { instant: true }, cue: 'hit' },
    { at: 1, slot: 'sub', fx: 'style:body', text: 'One story file, drawn from time.', fact: 'f1', cue: 'tick', emphasis: 'emphasis/indicate', params: { dur: 'slow' } },
  ], say: 'Hook. Nothing here was edited on a timeline: it was written as a story and drawn.' },
  { id: 'brands', layout: 'layouts/bento-3', duration: 5, cut: 'transitions/push', cutParams: { direction: 'right' }, move: 'moves/push-in', moveParams: { target: 'media' }, beats: [
    { at: 0.38, slot: 'headline', fx: 'style:headline', text: 'One story. Three brands.', fact: 'f3' },
    { at: 0.5, slot: 'tile-1', fx: 'style:plate', text: 'paper × calm', asset: media('swap-editorial.png'), fact: 'f3', cue: 'hit' },
    { at: 0.75, slot: 'tile-2', fx: 'style:plate', text: 'signal × kinetic', asset: media('swap-kinetic.png'), fact: 'f3' },
    { at: 1, slot: 'tile-3', fx: 'style:plate', text: 'linen × premium', asset: media('swap-calm-product.png'), fact: 'f3', cue: 'tick' },
  ], say: 'The same story file, worn by the three shipped presets: real frames from the three swap films.' },
  { id: 'phone', layout: 'layouts/caption-bar', duration: 4, cut: 'transitions/push', move: 'moves/push-in', moveParams: { target: 'media', to: 1.08 }, beats: [
    { at: 0.38, slot: 'stage', fx: 'devices/phone', asset: media('golden-editorial-9x16-screen.png'), params: { size: 'large' }, fact: 'f4' },
    { at: 1, slot: 'caption', fx: 'style:body', text: '9x16 for the feed.', fact: 'f2', cue: 'hit' },
  ], say: 'The golden film, portrait, at its poster instant.' },
  { id: 'laptop', layout: 'layouts/caption-bar', duration: 4, cut: 'transitions/hard-cut', move: 'moves/push-in', moveParams: { target: 'media', to: 1.08 }, beats: [
    { at: 0, slot: 'stage', fx: 'devices/laptop', asset: media('golden-editorial-16x9-screen.png'), params: { size: 'large' }, fact: 'f4', cue: 'hit' },
    { at: 0.5, slot: 'caption', fx: 'style:body', text: '16x9 for the screen. Same story.', fact: 'f2', cue: 'tick' },
  ], say: 'And the same instant, landscape: one story, every format.' },
  { id: 'site', layout: 'layouts/caption-bar', duration: 4.5, cut: 'transitions/push', cutParams: { direction: 'up' }, move: 'moves/pan', moveParams: { target: 'media', dir: 'down', d: 120 }, beats: [
    { at: 0.38, slot: 'stage', fx: 'devices/browser', asset: media('site-harbour-pine.png'), params: { size: 'large' }, fact: 'f5' },
    { at: 1, slot: 'caption', fx: 'style:body', text: 'Point it at a website: mm brand capture.', fact: 'f5', cue: 'hit' },
  ], say: 'Harbour and Pine is a fixture site. Capture reads its colours and type.' },
  { id: 'palette', layout: 'layouts/media', duration: 4.5, cut: 'transitions/push', cutParams: { direction: 'up' }, move: 'moves/push-in', moveParams: { target: 'media', to: 1.06 }, beats: [
    { at: 0.38, slot: 'headline', fx: 'style:headline', text: 'It read seven colours.', fact: 'f5' },
    { at: 0.5, slot: 'image', fx: 'entrances/mask-reveal', asset: media('palette-harbour-pine.png'), fact: 'f5', cue: 'hit' },
    { at: 1, slot: 'caption', fx: 'style:body', text: 'Accent #D2491F, from buttons and links.', fact: 'f5', cue: 'tick' },
  ], say: 'Seven colour roles, as captured.' },
  { id: 'catch', layout: 'layouts/quote', duration: 4, position: 'related', move: null, beats: [
    { at: 0, slot: 'headline', fx: 'style:headline', text: 'Its grey read 4.26:1. Video needs 4.5.', fact: 'f6', emphasis: 'emphasis/circumscribe', cue: 'hit' },
    { at: 1, slot: 'attribution', fx: 'style:body', text: 'Caught. Fixed.', fact: 'f6', cue: 'tick', emphasis: 'emphasis/shine', params: { dur: 'slow' } },
  ], say: 'And it flags what would fail on video before anyone builds on it.' },
  { id: 'film', layout: 'layouts/list-reveal', duration: 4, cut: 'transitions/push', cutParams: { direction: 'right' }, move: null, beats: [
    { at: 0.38, slot: 'headline', fx: 'style:headline', text: 'Show it a film.', fact: 'f7' },
    { at: 0.5, slot: 'item-1', fx: 'style:plate', text: '7 cuts', fact: 'f7', cue: 'hit' },
    { at: 0.75, slot: 'item-2', fx: 'style:plate', text: '18 arrivals', fact: 'f7' },
    { at: 1, slot: 'item-3', fx: 'style:plate', text: 'energy: high', fact: 'f7', cue: 'tick', emphasis: 'emphasis/indicate', params: { dur: 'slow' } },
  ], say: 'Motion capture reads a film\'s grammar: cuts, arrivals, energy. Never its content.' },
  { id: 'skill', layout: 'layouts/statement', duration: 4, cut: 'transitions/push', cutParams: { direction: 'right' }, move: null, beats: [
    { at: 0.38, slot: 'headline', fx: 'style:headline', text: 'Make the brand a skill.', fact: 'f8' },
    { at: 0.5, slot: 'sub', fx: 'entrances/typewriter', text: 'mm skill new --brand harbour-pine.json', fact: 'f8', cue: 'hit', emphasis: 'emphasis/indicate', params: { dur: 'hold' } },
  ], say: 'Brand and motion become a thin skill any agent can load.' },
  { id: 'time', layout: 'layouts/media', duration: 5.5, cut: 'transitions/push', cutParams: { direction: 'right' }, move: 'moves/pan', moveParams: { target: 'media', dir: 'right', d: 120 }, beats: [
    { at: 0.38, slot: 'headline', fx: 'style:headline', text: 'Drawn from time alone.', fact: 'f9' },
    { at: 0.5, slot: 'image', fx: 'entrances/mask-reveal', asset: media('contact-golden-kinetic.png'), fact: 'f9', cue: 'hit' },
    { at: 1.5, slot: 'caption', fx: 'style:body', text: '900 frames, rendered twice: byte-identical.', fact: 'f9', cue: 'tick' },
  ], say: 'A contact sheet of the golden film. Render it again and every frame is the same, byte for byte.' },
  { id: 'gate', layout: 'layouts/media', duration: 5, position: 'climax', move: 'moves/pan', moveParams: { target: 'media', dir: 'down', d: 160 }, beats: [
    { at: 0.25, slot: 'headline', fx: 'style:headline', text: `${ruleFiles.length} rules, measured.`, fact: 'f10' },
    { at: 0.5, slot: 'image', fx: 'entrances/mask-reveal', asset: media('check-golden-kinetic.png'), fact: 'f10', cue: 'hit' },
    { at: 1, slot: 'caption', fx: 'style:body', text: `The golden film: ${pass} pass, ${warn} warn, ${skip} skip.`, fact: 'f10', cue: 'tick' },
  ], say: 'The gate measures every cut. This is its real report on the golden film.' },
  { id: 'library', layout: 'layouts/media', duration: 4.5, cut: 'transitions/grid-dissolve', move: 'moves/ken-burns', moveParams: { target: 'media' }, beats: [
    { at: 0, slot: 'image', fx: 'entrances/fade', asset: media('library-wall.png'), params: { frame: 'bleed', instant: true }, fact: 'f11' },
    { at: 0.5, slot: 'headline', fx: 'style:headline', text: `${patterns.length} patterns. None branded.`, fact: 'f11', cue: 'hit' },
    { at: 1.5, slot: 'caption', fx: 'style:body', text: `${groups.length} groups, drawn in any brand.`, fact: 'f11', cue: 'tick' },
  ], say: `${patterns.length} patterns, every one in this film's brand because none carries its own.` },
  { id: 'cta', layout: 'layouts/endcard', duration: 4, position: 'outro', move: null, beats: [
    { at: 0, slot: 'headline', fx: 'style:headline', text: 'Motion Machine', cue: 'complete' },
    { at: 0.5, slot: 'line', fx: 'style:headline', text: 'One brief. Any style. Checked.' },
    { at: 1, slot: 'body', fx: 'style:body', text: 'Apache-2.0', fact: 'f13' },
  ], say: 'One brief. Any style. Checked.' },
];
const story = {
  id: 'demo-film', kind: 'film', generator: 'pieces/demo-film/capture/build-story.mjs', formats: ['16x9', '9x16'], title: 'Motion Machine: written, not edited', language: 'en', facts,
  audio: { track: null, bpm: 120, beats: 'assets/beats.json' },
  scenes, cta: { text: 'One brief. Any style. Checked.', url: '' },
};
writeFileSync(join(HERE, '..', 'story.json'), JSON.stringify(story, null, 2) + '\n');
const dur = scenes.reduce((a, s) => a + s.duration, 0);
const beats = { bpm: 120, beats: Array.from({ length: dur * 2 }, (_, i) => i / 2), downbeats: Array.from({ length: Math.ceil(dur / 2) }, (_, i) => i * 2), hits: [], offsetS: 0,
  method: 'declared 120 BPM, no track: grid written by arithmetic (k x 0.5 s), a stand-in grid (no track to measure)', durationS: dur };
writeFileSync(join(HERE, '..', 'assets', 'beats.json'), JSON.stringify(beats, null, 2) + '\n');
console.log(`${scenes.length} scenes, ${dur} s`);

// ---- the deck: the same scenes, one press each (the gate and the end card take two), with notes.
const notes = {
  hook: 'Everything you are about to see was written, not edited. There is no timeline and no keyframes: a story file says what appears and when, a style file says how it looks and moves, and the kit draws every frame from the time alone. Click for the line under it.',
  brands: 'Here is the proof that the look is a file. These three tiles are real frames from three films made from one story file; only the style changed: paper with calm motion, signal with kinetic, linen with premium. Same scene, same instant, three brands.',
  phone: 'Formats come from the same story too. This is the golden editorial film at its poster instant, rendered portrait for the feed. Click, and you get the same instant in landscape.',
  laptop: 'Same story, same instant, laid out for a screen. Nobody re-edited it: the layouts answer the format, the content stays the same.',
  site: 'Now the style modes. Point the machine at a website, here a fictional fixture called Harbour and Pine, and mm brand capture reads its computed styles.',
  palette: 'It read seven colour roles. The accent, D2491F, is the most saturated colour on its buttons, links and headings. Click once and we look at what it flagged.',
  catch: 'This is what a person misses. That grey looks fine on a web page, but capture measured it at 4.26 to 1 against its canvas, under the 4.5 that video text needs. It was darkened before anything was built on it.',
  film: 'Capture also reads motion. Given the kinetic golden film, mm motion capture read all 900 frames and wrote down its grammar: seven cuts, eighteen arrivals, high energy. It keeps the grammar, never the content.',
  skill: 'And a captured brand becomes a skill of its own with one command: a SKILL file, the composed style, the fonts with their licences and an empty facts file. Any agent can load it and stay on brand.',
  time: 'Why can it be checked at all? Because only time moves things. This sheet is the golden kinetic film, one frame a second. Export renders every one of its 900 frames twice, in fresh pages, and they match byte for byte.',
  gate: `So the gate can measure instead of judge. ${ruleFiles.length} rules: ${errors} errors that stop an export, ${warnings} warnings that must each be explained. This is its real report on the golden film. Click for the totals.`,
  library: `Underneath sits a library of ${patterns.length} patterns in ${groups.length} groups. Every still on this wall is drawn in this deck's brand, because no pattern carries one of its own.`,
  cta: 'One brief, any style, checked before anyone sees it. Click once more for the licence line. Motion Machine is Apache-2.0.',
};
const twoPress = { gate: ['caption'], cta: ['body'] };   // slots that wait for a second press
const deckScenes = scenes.map((sc, i) => {
  const later = twoPress[sc.id] ?? [];
  const beats = sc.beats.map((b) => {
    const { cue, ...rest } = b;
    const step = i === 0 && b.params?.instant ? 0 : later.includes(b.slot) ? 2 : 1;
    const params = rest.params ? Object.fromEntries(Object.entries(rest.params).filter(([k]) => k !== 'instant')) : undefined;
    const at = step === 2 ? 0 : Math.round(Math.max(0, b.at - (sc.cut && sc.cut !== 'transitions/hard-cut' ? 0 : 0)) * 0.6 * 100) / 100;
    return { ...rest, step, at, ...(params && Object.keys(params).length ? { params } : { params: undefined }), ...(cue ? { cue: 'tick' } : {}) };
  }).map((b) => JSON.parse(JSON.stringify(b)));
  const { duration, ...rest } = sc;
  // A deck rest shows a move's end pose: a pan would leave the picture off-centre, so the deck
  // pushes in a little instead.
  if (rest.move === 'moves/pan') { rest.move = 'moves/push-in'; rest.moveParams = { target: 'media', to: 1.04 }; }
  return { ...rest, presses: later.length ? 2 : 1, beats, say: notes[sc.id] };
});
const presses = deckScenes.reduce((a, s) => a + s.presses, 0);
const deckFacts = facts.map((f) => (f.id === 'f2' ? { ...f, text: `The same story renders as a film and as a clicker deck. The film (pieces/demo-film) ships in 16x9 and 9x16; this deck has ${presses} presses.`, source: 'SPEC.md §1, §10; pieces/demo-deck/story.json' } : f));
const deck = { id: 'demo-deck', kind: 'deck', generator: 'pieces/demo-film/capture/build-story.mjs', formats: ['16x9'], title: 'Motion Machine: written, not edited (deck)', language: 'en', facts: deckFacts,
  audio: { track: null, bpm: 120, beats: null }, scenes: deckScenes, cta: story.cta };
writeFileSync(join(HERE, '../../demo-deck/story.json'), JSON.stringify(deck, null, 2) + '\n');
console.log(`deck: ${deckScenes.length} scenes, ${presses} presses`);
