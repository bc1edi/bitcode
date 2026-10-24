# Changelog

## Unreleased

### Brand

- One brand source in `brand/`: tokens generate the site, desktop, `/sats` and
  CLI colors; official logo files, design system page, Sats profiles and the
  social kit. The pixel "b" replaces the lightning bolt in `/sats` and in the
  demo videos.
- The name is always lowercase: **bitcode**. The desktop product name follows,
  so new `.deb` installs go to `/opt/bitcode` instead of `/opt/Bitcode`;
  `bitcode desktop` still finds an existing 0.2 install.
- Site: `favicon.ico`, touch icon, 192/512 px icons and a web manifest.

### Repository

- Runtime Markdown moved to `content/` (agents, commands, Sats); the website
  lives in `site/` and Vercel serves `site/public/`; completed plans are in
  `docs/archive/`.

## CLI 0.3.0 · Desktop 0.2.0 — 2026-10-19

### Desktop (Linux)

- The `.deb` installs the terminal CLI as `/usr/bin/bitcode`, running on the
  Node.js runtime bundled with the app; an existing `/usr/bin/bitcode` from
  another installation is left untouched.
- Package scripts remove links and the AppArmor profile only on a real
  removal, not on upgrade, and refresh the hicolor icon cache.
- Icons for every hicolor size from 16 to 512 px; desktop entry with
  `StartupNotify` and search keywords.
- Start at login (XDG autostart) from Settings → System, starting hidden in
  the tray (`--hidden`).
- Window size, position and maximized state are restored when still on a
  display.
- A crashed window reloads by itself twice in a row, then asks before trying
  again.
- System suspension is blocked only while an agent run is active.
- Tray: a click shows or hides the window; pending requests are listed and
  open the Activity view (approval always happens in the window).
- Clicking a notification opens the related chat or the Activity view.
- `SIGTERM`, `SIGINT` and `SIGHUP` stop workers and terminals before exit.

### CLI

- `bitcode desktop` opens the installed desktop app.
- Full-auto checks that Bubblewrap can actually create its namespaces instead
  of only finding the binary; `bitcode doctor` reports the result, with a hint
  when AppArmor restricts unprivileged user namespaces.
