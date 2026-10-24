# bitcode CLI walkthroughs

The current gallery contains exactly three scenarios: `installation`,
`configuration`, and `features`. The hero reuses `features`. Commands type into
an xterm terminal; output, colors, prompts and command menus come from the actual
bitcode CLI running in a PTY. This replaces the earlier static event cards.

```bash
node site/scripts/demos/record-cli.mjs /tmp/bitcode-cli-recordings
node site/scripts/demos/render-cli.mjs /tmp/bitcode-cli-recordings
```

Capture needs Python 3 (POSIX PTY), Node.js 22+, npm and the local Ollama tag
`qwen3.8:27b`. It installs the working-tree snapshot in a temporary directory.
Only the feature scenario contacts the model and public mainnet fee endpoint.
Append `features` to the capture command to retry only that scenario.

Rendering needs FFmpeg, ffprobe, Playwright, `@xterm/xterm`, `@xterm/headless`
and JetBrains Mono regular/semibold TTFs in an external tooling directory.
`BITCODE_VIDEO_TOOLS` defaults to `/tmp/bitcode-video-tools`; its `node_modules`
contains those packages and its font files are `JetBrainsMono.ttf` and
`JetBrainsMono-SemiBold.ttf`. `BITCODE_CHROMIUM` optionally selects an installed
Chromium executable. Rendering also accepts a single scenario as its last arg.
No rendering packages are added to bitcode's runtime dependencies.

The renderer decodes ANSI at the original 92-column capture width before
recomposing cells for each export. This preserves terminal state through menu
redraws while wrapping content for the portrait viewport. Commands are animated,
waits shortened, and output progressively revealed. H.264 exports are 30 fps;
presentation is sampled at 15 fps. Both variants have burned-in instructional
captions, with WebVTT and a textual transcript for the web player.

Provenance is explicit: clone/cd are instructional command animations; install
and diagnostic output are real; login uses a fake example key and makes no API
request; the feature demo uses a real local model and a recorded mainnet snapshot.
Home paths are normalized. Login does not validate provider access.
Raw PTY captures stay outside the static site. The gallery markup lives in
`site/src/index.template.html`; rendering only replaces the media in
`site/public/assets/demos/`.

The approved captures are also retained locally under
`.demo-archive/2026-09-11-cli/captures/` (ignored by Git and excluded from the
deployment). To regenerate the same sessions without calling any model:

```bash
node site/scripts/demos/render-cli.mjs .demo-archive/2026-09-11-cli/captures
node site/scripts/demos/verify-cli.mjs
```

`verify-cli.mjs` checks media metadata and full decoding, responsive layouts,
playback, single-player behavior, captions, downloads, keyboard menu dismissal,
reduced motion, 200% text, no-JavaScript access and video-load errors.
The feature command includes `Reply in at most 50 words. No tables.` as a visible
argument, after an earlier verbose response hit the local model's output limit.
