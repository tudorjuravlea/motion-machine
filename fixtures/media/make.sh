#!/bin/sh
# Test clips for mm media prep (tests/cli/media-prep.test.mjs). Generated, never committed.
#   clip-2s.mp4    1170x2532 portrait, 2 s at 60 fps, H.264
#   clip-rot.mov   1280x720 HEVC stored landscape, displayed rotated 90 degrees, variable frame rate
#   clip-short.mp4 0.5 s
set -e
cd "$(dirname "$0")"
Q="-hide_banner -loglevel error -y"
ffmpeg $Q -f lavfi -i testsrc2=size=1170x2532:rate=60:duration=2 -c:v libx264 -pix_fmt yuv420p clip-2s.mp4
ffmpeg $Q -f lavfi -i testsrc2=size=1280x720:rate=30:duration=2 -vf "setpts='(N/30+0.008*sin(N))/TB'" -fps_mode vfr -c:v libx265 -tag:v hvc1 -pix_fmt yuv420p -x265-params log-level=error rot-raw.mov
ffmpeg $Q -display_rotation:v:0 90 -i rot-raw.mov -c copy clip-rot.mov
rm -f rot-raw.mov
ffmpeg $Q -f lavfi -i testsrc2=size=640x480:rate=30:duration=0.5 -c:v libx264 -pix_fmt yuv420p clip-short.mp4
