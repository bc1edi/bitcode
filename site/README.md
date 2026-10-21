# bitcode site — EN/IT and motion

The public pages are committed static HTML: `/` in English and `/it/` in Italian. Vercel still serves the repository with `framework: null`, no install command and no build command. No framework, animation library or client dependency was added.

## Editing and generation

Use Node.js 22 or later. Edit `site/index.template.html`, `i18n/en.json`, `i18n/it.json` and the shared files in `assets/site/`; regenerate with:

```sh
npm run build:site
npm run test:site
python3 -m http.server 4173 --bind 127.0.0.1
```

The generator has no dependencies. Commit both generated HTML files, sitemap and robots with their source changes. The 358 catalog keys must match exactly; missing keys, extra keys and non-string values fail generation. Existing `text.NNN` keys are stable identifiers: do not renumber them. `ui.*` keys label interactions; `terminal.*.output` contains original recorded output, including in the Italian catalog.

The page is dark: `base.css` holds the tokens (canvas `#0b0e11`, cards `#14171c`, the Bitcoin orange for actions, the four Sat colours as light accents), taken from the dark theme of the Bitcode Instagram design system and the desktop app, plus layout and components. `motion.css` holds motion tokens, entrances, the Sats scene transitions and the pause rules. Inter and JetBrains Mono are served locally with `font-display: swap`; their SIL Open Font Licenses are included. `site/design-contract.json` records the tokens and every colour literal allowed in the site sources; `npm run test:site` fails when either drifts. Change the contract together with `base.css`.

## Hero loop

`scripts/site/hero/render-hero.py` renders the decorative 10-second loop from the original transparent PNGs in `assets/sats/sources/` (Python 3 with Pillow and NumPy, plus ffmpeg):

```sh
python3 scripts/site/hero/render-hero.py all      # desktop 1440×900 and mobile 960×1040: WebM, MP4, WebP poster
python3 scripts/site/hero/render-hero.py stage    # stills of the Sats scene
python3 scripts/site/hero/render-hero.py desktop --preview 0,3.4,7.9 --out /tmp/hero
```

Each Sat is articulated with 2D joints: a rotation about a pivot with a soft falloff, applied as one inverse warp, so limbs bend, antennae sway and bodies lean from the feet without inventing a part that is not in the picture. Choreography: Node leans (0.4–3.8 s), Script waves (2.3–5.7 s), Hash sways (4.4–8.0 s), Merkle answers with a wave (6.5–9.7 s); each Sat's light rises during its gesture. Every motion is either a whole number of cycles per loop or wrapped in an envelope that is zero at both ends, so the last frame joins the first. The videos have no audio and no text; the desktop WebM is about 0.9 MB, the MP4 about 2 MB (budget 5 MB, checked by `test:site`). The poster is the first frame.

## Motion and accessibility

Sections follow the brief: hero, demonstration, capabilities, Sats, how it works and desktop, installation. Scrolling is native. A single passive scroll listener and a single passive resize listener schedule one RAF; geometry is read before anything is written.

The hero shows the title, the "Install bitcode" CTA and the poster immediately; there is no intro sequence. After the `load` event the runtime creates a muted, looping, `aria-hidden` video (WebM, then MP4) for the current composition (mobile at 800 px and below) and fades it in once it is actually playing. It is never created with reduced motion, `Save-Data`, the global pause or a hidden tab, and it pauses when the hero leaves the viewport or the tab is hidden. Without JavaScript, or if the video fails, the poster stays. The decorative loop is not a demo player: the recorded demos keep their own players and the selector for them is `.recording-player video`.

Entrances run once per element (`[data-reveal]`): 640 ms, 24 px, nothing hidden without JavaScript, and elements already scrolled past are shown at once. Hovers last 180 ms. At 1024 px and above the Sats section is a sticky stage with four chapters: the chapter crossing the upper half of the viewport selects the Sat and the colour of the light; inactive chapters step back through colour only, so all text keeps AA contrast. Below 1024 px, and without JavaScript, the chapters are a vertical sequence, each with its own figure.

Desktop capabilities use one sticky terminal with 180 ms crossfades. At 1023 px and below, each card has an inline terminal, activated at IntersectionObserver threshold 0.18. Players preserve their position when paused offscreen or by a hidden tab, and each recording plays once. The footer control pauses every animation, the typing players and the hero loop; OS reduced motion always takes precedence.

Terminal allocations are fixed to prevent typing from shifting the document. Screen readers receive complete static output rather than partial animated text. The mobile navigation locks scroll, contains focus and closes with Escape. Installation tabs support arrows, Home, End and Space. Clipboard success is announced only after the write resolves; failure selects the command for manual copying. The logo context menu supports copy/download of the original SVG; Shift preserves the native menu. The dismissible `/genesis` message is historical content, separate from the recorded CLI output.

## Recording provenance and deliberate limits

See [recordings.json](../assets/site/recordings.json) for timestamps, source commits and transcript paths. Every output line is checked against its original transcript. Commands and original output are preserved in both languages; surrounding labels and explanations are translated.

| Capability | Evidence displayed |
| --- | --- |
| Bitcoin | Original `/btc:fees` excerpt, recorded 2026-09-11 with `ollama/qwen3.8:27b`; explicitly historical, not live estimates. |
| Lightning, Liquid, Cashu, Code | Matching entries from a real `node bitcode.mjs commands --json` run. Clearly labeled **command catalog — command not executed**. |
| RGB | Actual `--profile rgb tools --json` output in a disposable configuration: `[]`, with the missing node stated. |
| Local | Actual read-only Ollama `gpt-oss:20b` inference returning `4` for `2 + 2`; this does not claim a QVAC inference run. |
| Extensions | Actual `node bitcode.mjs mcp` output in a disposable configuration: `[]`, with the absence of configured servers stated. |

No wallet was connected and no financial operation was performed. Full recordings of node/wallet commands are still outside this delivery; the public catalog previews do not claim those operations succeeded. The three existing videos keep their original provenance and now include Italian VTT captions and transcript links.

The optional live-chain ticker is omitted entirely, including its request code. No analytics or third-party requests are made during page viewing; the browser tests assert that. External links are normal links. Browser storage contains only language dismissal, motion preference, intro-seen and genesis state. There is no automatic language redirect.

## Verification — 2026-10-21 (immersive redesign)

All checks passed on localhost using Chromium and Lighthouse 13.4.1. Scores describe the local static server, not a production deployment.

| Page | Device | Performance | Accessibility | Best Practices | SEO | CLS | LCP |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| EN `/` | Mobile | 96 | 100 | 100 | 100 | 0 | 2.55 s |
| EN `/` | Desktop | 100 | 100 | 100 | 100 | 0 | 0.60 s |
| IT `/it/` | Mobile | 97 | 100 | 100 | 100 | 0 | 2.40 s |
| IT `/it/` | Desktop | 100 | 100 | 100 | 100 | 0 | 0.60 s |

[Score summary](../artifacts/site/lighthouse-summary.json). The [browser results](../artifacts/site/browser-results.json) cover both languages at 320/390/800/1023/1024/1440/1920/2560 px; anchors; the capability rail; all four Sats chapters and the active navigation; keyboard tabs and clipboard; mobile focus and scroll locking; language hash preservation; the hero loop (poster first, playback after load, desktop/mobile sources, pause off screen, in a hidden tab and on the global pause, no video with reduced motion, Save-Data or an initially hidden tab); entrances; load CLS 0; separate demo players; blocked storage; no JavaScript; zero page errors and zero external requests. The axe WCAG A/AA scan of `/` and `/it/#sats` has [zero violations](../artifacts/site/accessibility.json). The loop seam was checked on the rendered frames: the step from the last frame to the first equals an ordinary frame step.

Screenshots: [EN hero](../artifacts/site/en-hero-desktop.png), [ultrawide](../artifacts/site/en-hero-ultrawide.png), [IT hero](../artifacts/site/it-hero-desktop.png), [IT mobile](../artifacts/site/it-hero-mobile.png) and [its team composition](../artifacts/site/it-hero-mobile-team.png), [Sats scene](../artifacts/site/en-sats-desktop.png), [Sats on mobile](../artifacts/site/it-sats-mobile.png), [capability rail](../artifacts/site/it-rail-rgb-desktop.png), [mobile navigation](../artifacts/site/it-menu-mobile.png). The OG images are unchanged (light theme).

The optional browser tools are development-only. Point `SITE_PLAYWRIGHT_MODULE` to an installed Playwright module and `SITE_CHROMIUM` to Chromium; use `SITE_AXE` for a different axe-core path, and `SITE_URL` for a different local server. Run:

```sh
npm run test:site:browser
node scripts/site/render-og.mjs
```

To reproduce the four Lighthouse runs, set `SITE_LIGHTHOUSE_CLI` to an installed `lighthouse/cli/index.js` and `CHROME_PATH` to Chromium, then run `node scripts/site/lighthouse.mjs`. The runner executes audits sequentially and fails if any category is below 95. No test tooling is imported by the website.

References: the requested motion inspiration is [pi.dev](https://pi.dev/), with an independent implementation; lazy video/poster loading follows the [HTML media standard](https://html.spec.whatwg.org/dev/media.html). No pi.dev source, text, branding or assets were reused.
