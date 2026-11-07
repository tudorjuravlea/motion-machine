// What a cue does to the picture, for placing it (SPEC §9): each role names the point of the sound that
// meets its beat (`anchor`: its onset, its apex, its loudest 5 ms, or its end), how far that point sits
// from the picture event (`offsetMs`, sound minus picture: a tap leads, a thump lags), and how soon the
// same role may sound again (`minGapMs`). Offsets and gaps restated from Earshot's kit mix (MIT);
// roles without a measured value carry a provisional one. A `drop` (a sting, a sub drop) builds before
// its weight lands, so its loudest moment meets the beat. No Node built-in, so the studio can load it.

export const ROLES = {
  tap:    { anchor: 'onset', offsetMs: -60, minGapMs: 85 },
  knock:  { anchor: 'onset', offsetMs: -40, minGapMs: 100 },
  click:  { anchor: 'onset', offsetMs: -11, minGapMs: 85 },
  tick:   { anchor: 'onset', offsetMs: 0, minGapMs: 66 },
  key:    { anchor: 'onset', offsetMs: 8, minGapMs: 87 },
  pop:    { anchor: 'onset', offsetMs: 4, minGapMs: 114 },
  popin:  { anchor: 'onset', offsetMs: 30, minGapMs: 114 },
  whoosh: { anchor: 'apex', offsetMs: 37, minGapMs: 250 },
  riser:  { anchor: 'end', offsetMs: -23, minGapMs: 1000 },
  hit:    { anchor: 'onset', offsetMs: 0, minGapMs: 400 },
  drop:   { anchor: 'apex', offsetMs: 0, minGapMs: 1000 },
  tone:   { anchor: 'onset', offsetMs: 0, minGapMs: 150 },
};

// The role of each shipped cue; a cue not listed plays as a `tone`.
export const CUE_ROLE = {
  tap: 'tap', press: 'click', 'toggle-on': 'click', 'toggle-off': 'click', step: 'click', click: 'click',
  tick: 'tick', counter: 'tick', key: 'key', open: 'pop', close: 'pop', 'pop-in': 'popin',
  swipe: 'whoosh', whoosh: 'whoosh', riser: 'riser', hit: 'hit', 'cut-hit': 'hit', 'sub-drop': 'drop', sting: 'drop',
};

export const roleOf = (cue) => ROLES[CUE_ROLE[String(cue).replace(/^sound\//, '')] ?? 'tone'];

/** The name of a cue's role ('tap', 'whoosh', 'hit', …); a cue not listed plays as a `tone`. */
export const roleNameOf = (cue) => CUE_ROLE[String(cue).replace(/^sound\//, '')] ?? 'tone';
