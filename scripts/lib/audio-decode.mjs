// Decodes any audio or video file ffmpeg reads to stereo 32-bit floats at a given rate: what the sound verbs
// measure and place. Library only; Node.
//
//   decodeStereo(file, sr = 48000)   [left, right] Float32Arrays (a mono file is duplicated)
import { spawn } from 'node:child_process';
import { bin, inputOf } from './ffmpeg.mjs';

export async function decodeStereo(file, sr = 48000) {
  const chunks = [];
  await new Promise((ok, fail) => {
    const p = spawn(bin('ffmpeg'), ['-hide_banner', '-nostdin', '-v', 'error', ...inputOf(file), '-vn', '-ac', '2', '-ar', String(sr), '-f', 'f32le', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (c) => chunks.push(c));
    p.on('error', (e) => fail(Object.assign(new Error(`ffmpeg is required: ${e.message}`), { setup: true })));
    p.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg could not decode ${file}`))));
  });
  const b = Buffer.concat(chunks), n = Math.floor(b.length / 8), L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = b.readFloatLE(i * 8); R[i] = b.readFloatLE(i * 8 + 4); }
  return [L, R];
}
