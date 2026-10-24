# bitcode Desktop walkthroughs

Screen recordings of the real desktop app for the site: the paired Desktop views
of `#demo` and `#demos`, the RGB walkthrough, and the two silent loops (hero and
desktop section). Everything on screen is the app built in `desktop/dist`, its
controller, its bubblewrap worker, a local model served by Ollama and, for RGB,
the local RGB Lightning Nodes on a test network.

```bash
npm --prefix desktop run build
SITE_PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
  node site/scripts/demos/desktop/record.mjs /tmp/bitcode-desktop-captures features configuration first-run
node site/scripts/demos/desktop/render.mjs /tmp/bitcode-desktop-captures/features site/public/assets/demos/desktop features
node site/scripts/demos/desktop/render.mjs /tmp/bitcode-desktop-captures/workspace site/public/assets/demos/desktop workspace --loop
```

`record.mjs` launches Electron through Playwright with a disposable
`BITCODE_HOME`, a private Electron profile and a fresh copy of the fixture
project in `fixtures/` (committed with a fixed author and date). The window is
1280×720 CSS pixels painted at 1.5×, captured as 1920×1080 JPEG frames through
the DevTools screencast. Storyboards live in `scenarios.mjs`; raw frames stay
outside the repository.

What is added, and nothing else:

- Input is scripted: clicks, typing and the folder picker (the native dialog
  returns the fixture path).
- A pointer overlay travels to each target before the click.
- While the model works, the capture can be marked to play back faster; the
  page then shows a `▶▶ N×` badge for the whole segment, and the transcript says so.
- Captions are WebVTT tracks (English and Italian), not burned into the video.

Each storyboard checks its own outcome before captioning it: the features
walkthrough runs `node --test` on the recorded project copy and fails the
recording if a test fails, and approval captions follow the card actually shown.
`render.mjs` re-times frames without editing them and writes the MP4 (WebM too
for loops), the WebP poster, captions, transcript and an entry in
`site/public/assets/demos/desktop/manifest.json` with model, date, source commit
and provenance. `npm run build:site` turns the manifest into the players.
