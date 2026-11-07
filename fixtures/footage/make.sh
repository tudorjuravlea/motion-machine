#!/bin/sh
# The synthetic talking-head fixture for mm footage cut and the footage layer: no person, no voice.
#   talk.mp4  360x640 at 30 fps, 12 s, H.264 + AAC mono 48 kHz
# Picture: a test pattern; the source frame index N in binary along the top (ten 36x40 cells, bit 0
# on the left, white = 1); a red marker on a white square centred at (50 %, 35 %) and a blue one at
# (20 %, 80 %), fixed in every frame.
# Sound: room tone (seeded noise near -55 dBFS) everywhere, and a speech-like tone (a wobbling
# 180 Hz carrier with a 5 Hz syllable envelope, about -18 dBFS) in four spans, leaving planted
# pauses: 0-0.4 s (head), 2.4-3.6 s (1.2 s), 5.6-5.9 s (0.3 s, under the default max pause),
# 7.4-9.4 s (2.0 s), 11.4-12 s (tail).
# SPEECH (env, an ffmpeg expression in t, 1 where the voice sounds) replaces the four spans: the cut
# tests use it for a take with no pause and for one with a single short line in long quiet.
# RED_X and RED_Y (env, px of the 360x640 picture) move the red marker's centre from its default
# (180, 224): the punch test puts it off-centre so every frame shape crops the recording around it.
# Usage: sh make.sh [out-dir] (default: this folder). Generated, never committed: the tests write it
# into their own scratch folder. words.json is written by hand to match the four spans.
set -e
OUT="${1:-$(dirname "$0")}"
mkdir -p "$OUT"
Q="-hide_banner -loglevel error -y"
RX="${RED_X:-180}"; RY="${RED_Y:-224}"
SPEECH="${SPEECH:-(between(t,0.4,2.4)+between(t,3.6,5.6)+between(t,5.9,7.4)+between(t,9.4,11.4))}"
VOICE="0.25*(0.75+0.25*sin(2*PI*5*t))*sin(2*PI*180*t+3*sin(2*PI*3*t))"
ROOM="0.003*(2*random(0)-1)"
BITS="255*mod(floor(N/pow(2,floor(X/36))),2)"
ffmpeg $Q \
  -f lavfi -i "testsrc2=size=360x640:rate=30:duration=12" \
  -f lavfi -i "aevalsrc=exprs='${SPEECH}*${VOICE}+${ROOM}':sample_rate=48000:duration=12:channel_layout=mono" \
  -vf "format=yuv444p,geq=lum='if(lt(Y,40),${BITS},lum(X,Y))':cb='if(lt(Y,40),128,cb(X,Y))':cr='if(lt(Y,40),128,cr(X,Y))',drawbox=x=$((RX - 20)):y=$((RY - 20)):w=40:h=40:color=white:t=fill,drawbox=x=$((RX - 8)):y=$((RY - 8)):w=16:h=16:color=red:t=fill,drawbox=x=52:y=492:w=40:h=40:color=white:t=fill,drawbox=x=64:y=504:w=16:h=16:color=blue:t=fill,format=yuv420p" \
  -c:v libx264 -preset slow -crf 30 -g 30 -c:a aac -b:a 64k -movflags +faststart "$OUT/talk.mp4"
