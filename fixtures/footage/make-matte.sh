#!/bin/sh
# The synthetic matte fixture for mm footage matte and the cut-out layout: no person, no voice.
#   shape.mp4   640x360 at 30 fps, 4 s, H.264 + AAC mono 48 kHz (a wide recording, as a speaker is filmed)
#   masks/      f00001.png … f00120.png, 8-bit grey, 640x360: the supplied masks (--masks)
# Picture: a mid-grey field and a red disc of radius 60 px whose centre travels from (230, 110) to
# (410, 110) at 45 px a second (x = 230 + 45 t), near the top middle where a speaker's head sits.
# A red bar from x 260 to 380 and y 300 to the foot (360) stands in for the torso: the person leaves
# through the recording's bottom edge, as a seated speaker does. The disc and the bar are the person.
# Masks: the same disc and bar in white on black, frame for frame, except frame 40 (N = 39), where the
# disc is missing: a planted one-frame drop-out that the temporal median must fill.
# Sound: room tone and a speech-like tone from 0.2 s to 3.8 s with no pause in it, so mm footage cut
# keeps one clip and trims only the head and tail.
# Usage: sh make-matte.sh [out-dir] (default: this folder). Generated, never committed.
set -e
OUT="${1:-$(dirname "$0")}"
mkdir -p "$OUT/masks"
Q="-hide_banner -loglevel error -y"
DISC="lte(hypot(X-(230+45*N/30),Y-110),60)"
BAR="between(X,260,379)*gte(Y,300)"
IN="(${DISC}+${BAR})"
VOICE="between(t,0.2,3.8)*0.25*(0.75+0.25*sin(2*PI*5*t))*sin(2*PI*180*t+3*sin(2*PI*3*t))"
ROOM="0.003*(2*random(0)-1)"
ffmpeg $Q \
  -f lavfi -i "color=c=gray:s=640x360:r=30:d=4" \
  -f lavfi -i "aevalsrc=exprs='${VOICE}+${ROOM}':sample_rate=48000:duration=4:channel_layout=mono" \
  -vf "format=yuv444p,geq=lum='if(${IN},82,128)':cb='if(${IN},90,128)':cr='if(${IN},240,128)',format=yuv420p" \
  -c:v libx264 -preset slow -crf 20 -g 30 -c:a aac -b:a 64k -movflags +faststart "$OUT/shape.mp4"
ffmpeg $Q -f lavfi -i "color=c=black:s=640x360:r=30:d=4" \
  -vf "format=gray,geq=lum='255*gt(${DISC}*not(eq(N,39))+${BAR},0)'" -start_number 1 "$OUT/masks/f%05d.png"
