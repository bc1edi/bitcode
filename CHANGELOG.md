# Changelog

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
