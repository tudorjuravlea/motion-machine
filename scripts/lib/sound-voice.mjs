// Whether a story's audio.track is a voice (SPEC §9, voice-safe ducking). Library only; Node.
//
//   voiceOf(dir, story)   { file, words, source } or null. The track is a voice when words are known for it (a `<track>.words.json`
//                         beside it, or the footage edit's words: the cut voice is what `audio.track` holds for a talking-head
//                         film), or when the story has footage; `words` is null when only the footage says so, and the duck is then
//                         keyed by the voice's own envelope.
import { resolve } from 'node:path';
import { wordsOf } from '../check/W-ANCHOR.mjs';

export function voiceOf(dir, story) {
  const track = story?.audio?.track;
  if (!track) return null;
  const found = wordsOf(dir, story);
  if (found.words?.length) return { file: resolve(dir, track), words: found.words, source: found.source };
  if (story.footage?.asset) return { file: resolve(dir, track), words: null, source: 'footage' };
  return null;
}
