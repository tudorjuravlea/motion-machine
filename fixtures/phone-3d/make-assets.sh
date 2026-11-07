#!/bin/sh
# Assets for the phone-3d piece (tests/golden/phone-3d.test.mjs): a phone capture of
# fixtures/site/demo.html and a prepared recording. Made by the capture and media CLIs; git-ignored.
set -e
cd "$(dirname "$0")/../.."
[ -f fixtures/media/clip-2s.mp4 ] || sh fixtures/media/make.sh
P=fixtures/phone-3d
node scripts/mm.mjs capture site --url "file://$(pwd)/fixtures/site/demo.html" --name site-phone --piece $P --device phone --mark "Pricing=#pricing" --mark "Start=.cta" > /dev/null
node scripts/mm.mjs media prep fixtures/media/clip-2s.mp4 --name rec --piece $P --fit phone > /dev/null
