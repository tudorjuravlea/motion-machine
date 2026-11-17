// What to do about a finding (SPEC §7): every rule's usual fix, in one sentence, and where to read the
// rule. The gate copies them onto each FAIL and WARN row as `fix` and `see`; a rule that knows a better,
// more specific fix for one finding puts it in its evidence as `fix`, which wins. A rule with no line
// here gets none: tests/check/fixes.test.mjs fails until it has one.

export const FIXES = {
  'G-TIME': 'Draw from t alone: remove the wall clock, CSS animation, timer or unseeded random the evidence names, and use ctx.random or a value of t',
  'G-DETERMINISM': 'Make the frame depend on t only: find what differs between the two loads (state kept between seeks, an unawaited asset, unseeded randomness) and derive it from t',
  'G-LOCAL': 'Copy the file into the piece (assets/) and point to it with a relative path; run mm media prep again if a prepared frame or layer is missing',
  'G-BRAND': 'Paint only palette roles: replace the colour or face the evidence names with a role from style.json, or declare the picture as media in its pattern',
  'G-PLACEHOLDER': 'Replace the placeholder text the evidence quotes with the real words',
  'G-LEGIBLE': 'Raise the text to its floor for the format: a larger size role, fewer words, or a layout with more room; never shrink a fact or the call to action into data-micro',
  'G-REST': 'Let every entrance finish before its rest: start the beat earlier, shorten its entrance, or give the scene (deck: the press) more time',
  'G-EDGE': 'Move or shorten the text so it stays inside the safe margin (and out of the platform\'s interface zones), or mark a deliberate bleed with data-bleed',
  'G-OVERLAP': 'Separate the two text boxes the evidence names: another slot, a later beat, or fewer words; mark a deliberate overlay with data-over',
  'G-LOOP': 'End the loop on its first frame: set autoReturn: true, or make the last scene return every element to where the first frame shows it',
  'G-END': 'Make the deck\'s last press final: nothing may change after it, so remove beats stepped past the last press',
  'G-PATTERN-REF': 'Name a pattern, cue or mark that exists (mm pattern list); a particle emitter needs the brand\'s particles block',
  'G-FACT-REF': 'Cite a fact the story lists (facts[].id), or add the fact with its source',
  'G-PEAK': 'Lower the mix: run mm sound again (it limits to -1 dBTP), or turn down the track or the loudest cue',
  'W-PATTERN-CARD': 'Complete the pattern\'s card and demo (mm pattern lint <group>/<name> lists what is missing)',
  'W-PROVENANCE': 'Add a row for the card\'s source to PROVENANCE.md, or write `original` in its Provenance',
  'W-LITERAL': 'Replace the literal in the piece\'s CSS with the style variable for that role (--mm-color-*, --mm-size-*, --mm-space-*, a duration or easing role)',
  'W-LOUDNESS': 'Run mm sound again so the mix is normalised to the style\'s loudness, or change sound.loudnessLufs on purpose',
  'W-SCENE-END': 'Let motion settle before the cut, or keep it if the cut is a match cut or a whip on purpose',
  'W-HOOK': 'Show the first scene\'s headline finished on frame 0: give its beat at: 0 and params.instant: true',
  'W-DEAD': 'Put an arrival, a departure, a cut or a move in the quiet window, or shorten the scene',
  'W-QUIET': 'Leave about 2 s between the last arrival and the end (film); let the last press add one element (deck)',
  'W-LENGTH': 'Bring the piece into its band (film 20 to 60 s, loop 4 to 15 s, deck 6 to 20 presses) by adding or cutting scenes',
  'W-FADE-ONLY': 'Give some entrances a movement of their own (rise, slide, mask, draw) instead of a plain fade',
  'W-READ': 'Give the scene more time, or fewer words, so each line can be read before it leaves',
  'W-CUE': 'Move the cue onto its beat or its picture event (run mm sound again after fixing timing)',
  'W-DUR-LITERAL': 'Replace the numeric data-dur with a duration role',
  'W-BAN': 'Change the look the brand bans (the evidence names it), or lift it on purpose with liftBans in the style\'s gate block',
  'W-SUB': 'Export with --sub 1, or slow the travelling text so it moves under 4 px a frame',
  'W-CONTRAST': 'Raise the contrast: another ink role for the text, a plate behind it, or a calmer ground under it',
  'W-PACE': 'Bring the arrivals per 10 s into the style\'s band: merge or split beats, or change the scene lengths',
  'W-HOLD': 'Let each rest hold at least the style\'s holdMinS: fewer arrivals, or more time between them',
  'W-EMPTY': 'Put something on screen sooner: start the first beat earlier or make it instant',
  'W-ENTRANCE': 'Give the element an entrance, or mark it data-keep if it carries over from the scene before',
  'W-STAGGER': 'Shorten the cascade (fewer items or a smaller step), and start the scene\'s first arrival at least 0.1 s after its cut',
  'W-AMBIENT': 'Calm the idle move: a smaller amplitude, and no text scaling beyond plus or minus 5 %',
  'W-CAPTION': 'Show one caption group at a time, within the style\'s words per group',
  'W-OVERSHOOT': 'Use a spring role that overshoots less (or none on type), within motion.overshootMax',
  'W-MIX': 'Space the cues (two at most at once, 45 ms apart) and run mm sound again so cues sit 6 to 8 dB over the bed',
  'W-ASK': 'Answer the style\'s ask list (mm brand set, or edit the brand), then compose the style again',
  'W-FACE': 'Move the text off the speaker\'s face: another slot, a smaller box, or a plate placed beside the face',
  'W-GEN-BRAND': 'Generate the asset again with the current brand: mm gen <kind> --again <name>',
  'W-ANCHOR': 'Move the beat so it arrives with the spoken word it illustrates (from 1.8 s before to 0.2 s after)',
  'W-POP': 'Find the single wrong frame the evidence names and make the motion continuous through it',
  'W-DEADSTOP': 'Use an ease that spreads the change (move or settle roles) instead of one that does it all in a frame and stops',
  'W-FOCUS': 'Give the accent to one beat per rest, and finish text fully visible or fully gone',
  'W-TOKENS': 'Use fewer distinct strokes, sizes and radii: take them from the style\'s roles',
  'W-SEAM': 'Match the exit and the next entrance across the cut: the same direction and nearly the same speed',
  'W-ASSET-LICENSE': 'Write assets/<name>.licence.json with the asset\'s source and licence (mm credits lists what is owed), or accept it in the story\'s licences.accepted',
  'W-LOOP': 'Close each open loop in a later scene, and keep at most two open at once',
  'W-SAMEBOX': 'Vary the composition: give some scenes another layout, or another place and size for what is read',
  'W-PALETTE': 'Voice the cue in the style\'s sound profile: another recipe or sample, or turn its params toward the profile',
  'W-SAMPLE-LICENSE': 'Put the sample\'s record beside it (assets/sounds/<x>.json: source, licence, author), or map the cue to a sample that has one',
  'W-AUDIBLE': 'Make the cue heard: raise it, move it off the music\'s loudest moment, or let the bed duck under it',
  'W-SOUND-SHAPE': 'Shape the sound: no cue in the first moment, quiet before the payoff, and the loudest moment on the payoff',
  'W-SOUND-ARTIFACT': 'Remove the defect from the cue: another seed or recipe, a trimmed sample, or a softer attack',
  'W-SAY': 'Mark how the word is said: add it to the brand\'s voice lexicon, or write it out in the say text',
  'W-EASE': 'Spell the ease the way the kit reads it (a role name, a cubic-bezier, or a spring), as the evidence shows',
  'W-DECK-STEP': 'Give every stepped beat a press that reaches it, and a unique step id',
  'W-RHYTHM': 'Vary the scene lengths so the longest is at least 1.5 times the shortest',
  'W-READS': 'Spread the arrivals: at most 5 inside any 1.3 s',
  'W-DEVICES': 'Spend the hero device fewer times: another emphasis or transition for some of those scenes',
  'W-SCREEN-IDLE': 'Make the screen work: a screen action (tap, scroll, type) or a playing recording during the scene',
  'W-NUMBER': 'Show the number the cited fact states, at the precision it states it',
  'W-CASE': 'Set that text in capitals by hand, or drop text-transform: uppercase where the evidence names the character',
  'W-VOICE-SCRIPT': 'Generate the voice again (or fix the script) until its transcript says the script; the evidence lists the missing, extra and changed words',
  'W-LOOP-SEAM': 'Make the loop\'s last frames move as its first frames do, so the seam does not jump',
};

/** Where to read the rule: its row in SPEC §7, and the file that measures it. */
export function seeOf(id) {
  return `SPEC.md §7 (${id}), scripts/check/${id}.mjs`;
}

/** A FAIL or WARN row with its fix and its see pointer; any other row unchanged. */
export function withFix(row) {
  if (row.status !== 'FAIL' && row.status !== 'WARN') return row;
  const fix = row.evidence?.fix ?? FIXES[row.id];
  return { ...row, ...(fix ? { fix } : {}), see: seeOf(row.id) };
}
