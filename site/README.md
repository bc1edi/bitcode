# bitcode site — EN/IT and motion

The public pages are committed static HTML: `/` in English and `/it/` in Italian. Vercel still serves the repository with `framework: null`, no install command and no build command. No framework, animation library or client dependency was added.

## Editing and generation

Use Node.js 22 or later. Edit `site/index.template.html`, `i18n/en.json`, `i18n/it.json` and the shared files in `assets/site/`; regenerate with:

```sh
npm run build:site
npm run test:site
python3 -m http.server 4173 --bind 127.0.0.1
```

The generator has no dependencies. Commit both generated HTML files, sitemap and robots with their source changes. The 349 catalog keys must match exactly; missing keys, extra keys and non-string values fail generation. Existing `text.NNN` keys are stable identifiers: do not renumber them. `ui.*` keys label interactions; `terminal.*.output` contains original recorded output, including in the Italian catalog.

`base.css` preserves the original design tokens. `motion.css` adds only motion tokens, derived opacity and layout rules. Inter and JetBrains Mono are served locally with `font-display: swap`; their SIL Open Font Licenses are included. `site/design-contract.json` records the original tokens and color literals for regression checking.

## Motion and accessibility

A single passive scroll listener and a single passive resize listener schedule one RAF. Geometry is read before CSS variables are written. Intro states are `staged`, `headline`, `collapsing`, `full`; reduced motion, hashes, restored scroll, hidden tabs and session history skip the sequence. Interacting with the page finishes the intro immediately. A 10-second timer is a fallback.

The six existing pixel B pieces animate through transaction state colors, then return to their original SVG fills. Headline lines enter 105 ms apart; the hero settles in 770 ms. Desktop capabilities use one sticky terminal with 180 ms crossfades and 220 ms captions. At 1023 px and below, each card has an inline terminal, activated at IntersectionObserver threshold 0.18. Players preserve their position when paused offscreen or by a hidden tab. Each recording plays once rather than looping indefinitely. The footer motion control can stop the animation; OS reduced motion always takes precedence.

Terminal allocations are fixed to prevent typing from shifting the document. Screen readers receive complete static output rather than partial animated text. Without JavaScript, navigation, capability recordings, all four installation methods, videos and captions remain available. The mobile navigation locks scroll, contains focus and closes with Escape. Installation tabs support arrows, Home, End and Space. Clipboard success is announced only after the write resolves; failure selects the command for manual copying.

The logo context menu supports copy/download of the original SVG; Shift preserves the native menu. The dismissible `/genesis` message is historical content, separate from the recorded CLI output.

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

To preserve the existing two-column hero without obscuring the headline, its scroll movement is a **40 px shift toward the center** plus scale, settling over 300 px (220 px on mobile), rather than moving the terminal all the way to the viewport center. Fades use the first viewport-sized part of a long section as its center; this prevents long sections from hiding their own headings. Both are adaptations of the supplied choreography.

The optional live-chain ticker is omitted entirely, including its request code. No analytics or third-party requests are made during page viewing; the browser tests assert that. External links are normal links. Browser storage contains only language dismissal, motion preference, intro-seen and genesis state. There is no automatic language redirect.

## Verification — 2026-10-19

Implementation commit: `21069a9` (`feat(site): add bilingual Bitcoin motion experience`). The following local verification and evidence are committed separately. No push or deployment was performed.

All checks passed on localhost using Chromium and Lighthouse 13.4.1. Scores describe the local static server, not a production deployment or a guarantee across all browsers and networks.

| Page | Device | Performance | Accessibility | Best Practices | SEO | CLS | LCP |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| EN `/` | Mobile | 98 | 100 | 100 | 100 | 0 | 2.03 s |
| EN `/` | Desktop | 100 | 100 | 100 | 100 | 0 | 0.48 s |
| IT `/it/` | Mobile | 98 | 100 | 100 | 100 | 0 | 2.03 s |
| IT `/it/` | Desktop | 100 | 100 | 100 | 100 | 0 | 0.48 s |

[Score summary](../artifacts/site/lighthouse-summary.json) · [EN mobile](../artifacts/site/lighthouse-en-mobile.json) · [EN desktop](../artifacts/site/lighthouse-en-desktop.json) · [IT mobile](../artifacts/site/lighthouse-it-mobile.json) · [IT desktop](../artifacts/site/lighthouse-it-desktop.json).

The [browser results](../artifacts/site/browser-results.json) cover both languages, anchors `#capabilities`, `#sats`, `#get-started`, 320/390/800/1023/1024/1440 px, sticky switching, inline terminals, keyboard tabs, clipboard, mobile focus/scroll locking, hash preservation, all intro states, session/hash/reduced-motion/hidden-tab/restored-scroll skips, typing pause/resume, context menu, native video playback, blocked storage, no JavaScript, zero page errors and zero external requests. The axe WCAG A/AA scan has [zero violations](../artifacts/site/accessibility.json). Intro layout shifts measured separately also total 0.

The static check validates deterministic generation, rejection of missing/extra i18n keys, original output in both catalogs, anchors and unique IDs, JSON-LD, hreflang, canonical metadata, caption timing, asset paths, unchanged palette/tokens and empty Vercel build configuration. JavaScript syntax and `git diff --check` also pass.

Screenshot evidence, inspected visually:

- [EN desktop hero](../artifacts/site/en-hero-desktop.png), [IT desktop hero](../artifacts/site/it-hero-desktop.png), [IT mobile hero](../artifacts/site/it-hero-mobile.png).
- Intro: [staged](../artifacts/site/intro-01-staged.png), [headline](../artifacts/site/intro-02-headline.png), [collapsing](../artifacts/site/intro-03-collapsing.png).
- Story rail: [desktop Bitcoin](../artifacts/site/en-rail-bitcoin-desktop.png), [desktop RGB disclosure](../artifacts/site/it-rail-rgb-desktop.png), [mobile inline](../artifacts/site/it-rail-mobile.png).
- [Mobile navigation sheet](../artifacts/site/it-menu-mobile.png), [Italian OG image](../assets/og-image-it.png).

The optional browser tools are development-only. Point `SITE_PLAYWRIGHT_MODULE` to an installed Playwright module and `SITE_CHROMIUM` to Chromium; use `SITE_AXE` for a different axe-core path, and `SITE_URL` for a different local server. Run:

```sh
npm run test:site:browser
node scripts/site/render-og.mjs
```

To reproduce the four Lighthouse runs, set `SITE_LIGHTHOUSE_CLI` to an installed `lighthouse/cli/index.js` and `CHROME_PATH` to Chromium, then run `node scripts/site/lighthouse.mjs`. The runner executes audits sequentially and fails if any category is below 95. No test tooling is imported by the website.

References: the requested motion inspiration is [pi.dev](https://pi.dev/), with an independent implementation; lazy video/poster loading follows the [HTML media standard](https://html.spec.whatwg.org/dev/media.html). No pi.dev source, text, branding or assets were reused.
