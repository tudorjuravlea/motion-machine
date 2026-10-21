# Security

## Reporting a vulnerability

Please report it privately through GitHub: open the repository's **Security** tab and choose
**Report a vulnerability** (GitHub's private vulnerability reporting). Do not open a public issue
for it. Say which version or commit you tested, what you did, what you expected and what happened;
a short reproduction is the most useful thing you can send. You will get an answer, and a fix or a
plan, as soon as the maintainer can manage; this is a small project, so please be patient.

## How Motion Machine runs

Motion Machine runs on your machine and has no hosted service. Three facts shape everything below.

- **A piece is code.** Running the gate (`mm check`), the studio, `mm sound` or `mm timeline` on a
  piece loads that piece's pattern code in Node, and every verb that renders it runs the piece's
  own `piece.js` in Chromium. Open pieces and pattern libraries you trust, as you would run a
  script you trust. The pattern base a piece names (`patternsBase`) must stay inside the
  repository; a piece that makes `mm` import code from outside it is a vulnerability.
- **Rendering Chromium has no OS sandbox.** `mm check`, `mm export`, `mm stills`, `mm review`,
  `mm sound`, `mm pattern stills` and the studio launch Chromium without Chromium's own sandbox
  (Playwright's default), because they only open your own pieces from the local server. Network
  captures (`mm capture site`, `mm brand capture --from <url>`) are the exception and run with the
  sandbox on. Set `MM_NO_SANDBOX=1` to turn that off, for a container that runs as root where the
  sandbox cannot start; do not set it when you capture a page you do not trust.
- **The local servers serve the repository.** `mm serve`, `mm studio` and the servers behind the
  other verbs listen on `127.0.0.1` only and answer only to a `Host` of their own (`localhost`,
  `127.0.0.1`, `[::1]`, with their port). They refuse a foreign `Origin` on writes and on `/api/`,
  a path that leaves the repository root or enters `.git`, a link that points out of the root or
  into `.git`, and a write larger than 1 MB. Any other file under the root is served to a
  same-origin page, including files git ignores and dotfiles, so keep secrets out of the clone.

## What is in scope

- **The local servers.** A way around the refusals above, or any way for a web page in your
  browser to read or change files through a server, is in scope.
- **Captures that load pages.** `mm capture site` and `mm brand capture` open the one address or
  local HTML file you give, in a sandboxed Chromium, hide banners and scroll once. A hostile page
  still runs in a browser on your machine. A way for a captured page to reach your files, to make
  the tool open another address, or to write outside the piece's folder is in scope.
- **Code outside the intended folders.** A piece, story, style or capture that makes `mm` run
  code or read files outside the folders it is meant to use, for instance a `patternsBase` that
  points outside the repository.
- **File handling by the CLI.** Path traversal, writes outside the piece or `out/` folders, and
  unsafe handling of file names from a story or a capture.

## What is not in scope

- Running a piece or a pattern library you chose to open and getting what its code does, inside
  the folders it is meant to use. That is the model above, not a flaw in it.
- `mm release-check` is a pre-publication sweep for brand words, key shapes and the like, not a
  security scanner; a secret it misses is not a vulnerability in Motion Machine.
- Problems in a dependency (Playwright, Chromium, ffmpeg, Ajv, three.js) that are already reported
  upstream; tell us if Motion Machine makes them worse.
- Denial of service against your own machine through an enormous piece or recording.

## Supported versions

Fixes land on the latest release and on the default branch.
