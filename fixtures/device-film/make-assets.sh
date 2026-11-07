#!/bin/sh
# Assets for the device-film piece (tests/golden/device-film.test.mjs): a phone and a laptop capture of
# fixtures/site/demo.html, a prepared recording of fixtures/media/clip-2s.mp4 and a still. Made by
# the capture and media CLIs. Output is git-ignored; the test regenerates it when missing, and
# `sh fixtures/device-film/make-assets.sh` rebuilds it by hand (needs Chromium and ffmpeg).
set -e
cd "$(dirname "$0")/../.."
[ -f fixtures/media/clip-2s.mp4 ] || sh fixtures/media/make.sh
URL="file://$(pwd)/fixtures/site/demo.html"
P=fixtures/device-film
node scripts/mm.mjs capture site --url "$URL" --name site-phone --piece $P --device phone --mark "Pricing=#pricing" --mark "Price=#pricing .price" --mark "Start=.cta" > /dev/null
node scripts/mm.mjs capture site --url "$URL" --name site-laptop --piece $P --device laptop --mark "Pricing=#pricing" --mark "Price=#pricing .price" --mark "Start=.cta" > /dev/null
node scripts/mm.mjs media prep fixtures/media/clip-2s.mp4 --name rec --piece $P --fit phone > /dev/null
cp patterns/layouts/media/demo/assets/grid.png $P/assets/next.png
