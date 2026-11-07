#!/bin/sh
# Assets for the screen pattern demos (patterns/screen/*/demo/assets), made with the capture and media CLIs from
# fixtures/site/demo.html, fixtures/media/clip-2s.mp4 and the media layout's grid. Committed, so
# `mm pattern stills` needs no network and no ffmpeg run; re-run after changing demo.html.
set -e
cd "$(dirname "$0")/../.."
[ -f fixtures/media/clip-2s.mp4 ] || sh fixtures/media/make.sh
URL="file://$(pwd)/fixtures/site/demo.html"
for n in screen/scroll screen/tap screen/swap screen/zoom-to screen/callout 3d/phone 3d/laptop; do
  node scripts/mm.mjs capture site --url "$URL" --name app --piece "patterns/$n/demo" --quality 72 \
    --mark "Pricing=#pricing" --mark "Price=#pricing .price" --mark "Start=.cta" > /dev/null
  # media.json records the page it came from; keep it repository-relative, never a local path
  sed -i.bak "s|\"url\": \"file://[^\"]*fixtures/site/demo.html\"|\"url\": \"fixtures/site/demo.html\"|" "patterns/$n/demo/assets/app/media.json"
  rm -f "patterns/$n/demo/assets/app/media.json.bak"
done
cp patterns/layouts/media/demo/assets/grid.png patterns/screen/swap/demo/assets/next.png
node scripts/mm.mjs media prep fixtures/media/clip-2s.mp4 --name rec --piece patterns/screen/play/demo --fit 240x520 --quality 55 > /dev/null
