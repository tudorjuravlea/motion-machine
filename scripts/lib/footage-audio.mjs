// The sound of a recording, for the footage commands: decoded by ffmpeg, never by anything else.
import { spawn, spawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { MissingToolError } from './cli.mjs';
import { bin } from './ffmpeg.mjs';
import { ANALYSIS_RATE, analyse } from './footage-acoustic.mjs';

const fail = (message, exitCode) => Object.assign(new Error(message), { exitCode });

/** The first audio stream (stream 0 of the audio streams, never a second spatial track) as mono float samples at `rate`. */
export function decodeAudio(file, rate) {
  return new Promise((ok, no) => {
    const p = spawn(bin('ffmpeg'), ['-v', 'error', '-nostdin', '-i', file, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = []; let err = '';
    p.stdout.on('data', (c) => chunks.push(c));
    p.stderr.on('data', (c) => { err += c; });
    p.on('error', (e) => no(fail(`ffmpeg is required: ${e.message}`, 2)));
    p.on('close', (code) => {
      if (code !== 0) return no(fail(`ffmpeg could not decode the sound of ${basename(file)}: ${err.trim().split('\n').pop()}`, 1));
      const buf = Buffer.concat(chunks);
      ok(new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 4))));
    });
  });
}

/**
 * What the ear makes of a recording: `analyse` of its first audio stream (seconds of the sound, as a
 * transcriber counts them), or { class: 'no-audio' } when the file holds none.
 */
export async function soundOf(file) {
  // only the stream list: probe() would count every frame of the picture
  const r = spawnSync(bin('ffprobe'), ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', file], { encoding: 'utf8', maxBuffer: 16 << 20 });
  if (r.error) throw r.error.code === 'ENOENT' ? new MissingToolError('ffprobe') : r.error;
  if (r.status !== 0) throw fail(`ffmpeg could not read ${basename(file)}: ${r.stderr.trim().split('\n').pop()}`, 2);
  if (!JSON.parse(r.stdout).streams?.some((s) => s.codec_type === 'audio')) return { class: 'no-audio' };
  return analyse(await decodeAudio(file, ANALYSIS_RATE), ANALYSIS_RATE);
}
