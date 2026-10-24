import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { desktopExecutable, launchDesktop } from "../src/desktop-launch.mjs";

test("bitcode desktop starts the app without the CLI's Electron-as-Node mode", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "bc-desktop-launch-"));
  const bin = path.join(dir, "bitcode-desktop"), seen = path.join(dir, "env.txt");
  writeFileSync(bin, `#!/bin/sh\nenv > "${seen}"\n`); chmodSync(bin, 0o755);
  const env = { PATH: "/usr/bin:/bin", BITCODE_DESKTOP_BIN: bin, ELECTRON_RUN_AS_NODE: "1" };
  assert.equal(desktopExecutable(env), bin);
  assert.equal(launchDesktop({ env, cwd: dir }).executable, bin);
  const end = Date.now() + 5000;
  while (!existsSync(seen) || !readFileSync(seen, "utf8").includes("PATH=")) { if (Date.now() > end) throw new Error("launcher did not run"); await new Promise(r => setTimeout(r, 20)); }
  assert.doesNotMatch(readFileSync(seen, "utf8"), /ELECTRON_RUN_AS_NODE/);
});

test("bitcode desktop explains a missing installation", () => {
  if (["/opt/bitcode", "/opt/Bitcode"].some(dir => existsSync(`${dir}/bitcode-desktop`))) return; // installed here, current or 0.2 path
  assert.throws(() => launchDesktop({ env: { PATH: mkdtempSync(path.join(os.tmpdir(), "bc-empty-path-")) } }), /not installed/);
});
