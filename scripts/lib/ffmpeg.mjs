// ffmpeg and ffprobe as the verbs use them: tool detection, the one encode recipe (SPEC §2.10),
// probing, SSIM. The colour recipe is the lesson of the media pipeline of showcase (MIT, same author; see NOTICE):
// RGB to yuv420p left to swscale defaults uses BT.601 and tags nothing, which shifts reds.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissingToolError } from './cli.mjs';

/** { ok, version, major } for `ffmpeg` or `ffprobe`; ok is false when the binary cannot run. */
export function toolVersion(name) {
  const r = spawnSync(name, ['-version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return { ok: false, version: null, major: null };
  const m = /version\s+n?(\d+)(?:\.(\d+))?[^\s]*/.exec(r.stdout);
  // Distro and git builds ("N-12345-gabc", "git-2024-…") carry no semver: accept them as new enough.
  return { ok: true, version: m ? m[0].replace(/^version\s+/, '') : r.stdout.split('\n')[0], major: m ? Number(m[1]) : null };
}

/** Throws MissingToolError naming the first absent tool (or one older than ffmpeg 6). */
export function assertTools(names = ['ffmpeg', 'ffprobe']) {
  for (const n of names) {
    const v = toolVersion(n);
    if (!v.ok) throw new MissingToolError(n, 'install ffmpeg 6 or newer (macOS: brew install ffmpeg); mm never installs it');
    if (n === 'ffmpeg' && v.major != null && v.major < 6) throw new MissingToolError(n, `found ${v.version}, need 6 or newer`);
  }
}

/** The colour recipe: PNG (full range RGB) to yuv420p, explicit BT.709 matrix, tv range, even size; setparams tags the frames so all four colour fields reach the stream. */
export const COLOR_FILTER = 'scale=w=trunc(iw/2)*2:h=trunc(ih/2)*2:in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709';
export const COLOR_TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];

/** Filter that blends `sub` instants per frame and keeps the last of each group of `sub`. */
export const subFilter = (sub) => (sub > 1 ? `tmix=frames=${sub},select='not(mod(n+1,${sub}))',setpts=PTS-STARTPTS,` : '');

export function encodeArgs({ out, fps = 30, sub = 1, comment } = {}) {
  // a silent stereo AAC track, its handler named `silent`, so the apps accept the file before `mm sound`
  // muxes the real mix (which replaces it); G-PEAK and W-LOUDNESS do not take it for sound (sound.mjs hasAudio)
  return ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps * sub), '-c:v', 'png', '-i', '-',
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-metadata:s:a:0', 'handler_name=silent',
    '-vf', subFilter(sub) + COLOR_FILTER,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-tune', 'animation', ...COLOR_TAGS, '-movflags', '+faststart', '-r', String(fps),
    // the muxer waits for a packet of every stream before it writes, instead of flushing when the
    // silent audio runs 10 s ahead of x264's lookahead. Without it the mov chunk tables (stsc/stco)
    // follow when frames arrived, so the same frames gave different MP4 bytes. The streams are unchanged.
    '-max_interleave_delta', '0',
    ...(comment ? ['-metadata', `comment=${comment}`] : []), out];
}

function waitFor(proc, label) {
  let stderr = '';
  proc.stderr?.on('data', (c) => { stderr += c; });
  return new Promise((resolve, reject) => {
    proc.on('error', (e) => reject(e.code === 'ENOENT' ? new MissingToolError(label) : e));
    proc.on('close', (code) => (code === 0 ? resolve(stderr) : reject(new Error(`${label} exited with code ${code}\n${stderr.trim()}`))));
  });
}

/**
 * Starts an encoder reading PNGs on stdin: { pid, write(buf), end() → Promise, abort() → Promise
 * (kills it; the caller removes the file), kill() (the same, synchronously, for exit handlers) }.
 * Once ffmpeg has exited for any reason before end(), every write (including one waiting for
 * 'drain') and end() reject with its error and stderr: ffmpeg can die between two writes
 * (a full disk, an output it cannot open, the OOM killer), and a write to its destroyed stdin
 * would otherwise wait for a 'drain' that never comes.
 */
export function startEncoder(opts) {
  const proc = spawn('ffmpeg', encodeArgs(opts), { stdio: ['pipe', 'ignore', 'pipe'] });
  const done = waitFor(proc, 'ffmpeg');
  let dead = null;
  // settles once ffmpeg is gone, with the error a write must throw
  const gone = done.then(() => new Error('ffmpeg exited before the last frame was written'), (e) => e).then((e) => { dead = e; return e; });
  proc.stdin.on('error', () => {});   // EPIPE once ffmpeg has died: reported through `dead`
  return {
    pid: proc.pid,
    async write(buf) {
      if (dead) throw dead;
      if (proc.stdin.write(buf)) return;
      let drained;
      const drain = new Promise((r) => { drained = () => r(null); proc.stdin.once('drain', drained); });
      const e = await Promise.race([drain, gone]);
      proc.stdin.off('drain', drained);
      if (e) throw e;
    },
    async end() { if (dead) throw dead; proc.stdin.end(); await done; },
    async abort() { proc.kill('SIGKILL'); await done.catch(() => {}); },
    kill() { if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL'); },
  };
}

/** Runs ffmpeg with `args`; resolves with stderr, rejects with a message that carries it. */
export function runFfmpeg(args) {
  const proc = spawn('ffmpeg', ['-y', '-hide_banner', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
  return waitFor(proc, 'ffmpeg');
}

/**
 * An ffmpeg input. A WAV is named as one: ffmpeg 9.0.2's prober takes a loud PCM WAV for MPEG-TS
 * (score 100 at 2 KB) and then fails with "End of file"; every WAV here is one we wrote.
 */
export const inputOf = (file) => (/\.wav$/i.test(file) ? ['-f', 'wav', '-i', file] : ['-i', file]);
const probeFormat = (file) => (/\.wav$/i.test(file) ? ['-f', 'wav'] : []);

/** ffprobe's JSON for a file: { streams, format }. */
export function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', ...probeFormat(file), file], { encoding: 'utf8', maxBuffer: 16 << 20 });
  if (r.error) throw r.error.code === 'ENOENT' ? new MissingToolError('ffprobe') : r.error;
  if (r.status !== 0) throw new Error(`ffprobe failed on ${file}: ${r.stderr.trim()}`);
  return JSON.parse(r.stdout);
}

/** SSIM (0..1, "All") between two PNG buffers of the same size. */
export async function ssim(a, b) {
  const dir = mkdtempSync(join(tmpdir(), 'mm-ssim-'));
  try {
    writeFileSync(join(dir, 'a.png'), a);
    writeFileSync(join(dir, 'b.png'), b);
    const err = await runFfmpeg(['-i', join(dir, 'a.png'), '-i', join(dir, 'b.png'), '-lavfi', 'ssim', '-f', 'null', '-']);
    const m = /All:([0-9.]+)/.exec(err);
    if (!m) throw new Error(`could not read SSIM from ffmpeg output: ${err.trim()}`);
    return Number(m[1]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** `loop_check.mp4`: the last `seconds` of a film followed by its first `seconds`: the seam, to be watched. */
export async function loopSeam(file, out, { seconds = 1, duration, comment } = {}) {
  const s = Math.min(seconds, duration / 2);
  await runFfmpeg(['-i', file, '-filter_complex',
    `[0:v]trim=start=${(duration - s).toFixed(3)},setpts=PTS-STARTPTS[a];[0:v]trim=end=${s.toFixed(3)},setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709[v]`,
    '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', ...COLOR_TAGS, '-movflags', '+faststart',
    ...(comment ? ['-metadata', `comment=${comment}`] : []), out]);
}
