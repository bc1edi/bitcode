import { accessSync, constants, readFileSync } from "node:fs";
import path from "node:path";
import { cdkCliPath } from "./cashu/wallet.mjs";
import { wavedBinPath, wavecliBinPath } from "./wavelength/daemon.mjs";
import { bubblewrapStatus } from "./permissions.mjs";

export function executable(command) {
  const candidates = command.includes(path.sep) ? [command] : (process.env.PATH || "").split(path.delimiter).map(dir => path.join(dir, command));
  for (const file of candidates) { try { accessSync(file, constants.X_OK); return file; } catch { /* next */ } }
  return null;
}
export function dependencyReport(config = {}) {
  return [
    { name: "git", path: executable("git"), purpose: "Git tools" },
    { name: "bash", path: executable("/bin/bash"), purpose: "Shell tools on POSIX" },
    { name: "cdk-cli", path: executable(config.cashu?.cliPath || cdkCliPath()), purpose: "Cashu wallet; npm run build:cdk" },
    { name: "wavecli", path: executable(wavecliBinPath()), purpose: "Wavelength MCP; npm run build:wavelength" },
    { name: "waved", path: executable(wavedBinPath()), purpose: "Wavelength daemon; npm run build:wavelength" },
  ];
}

// Linux sandbox readiness for full-auto and the desktop worker. The sysctl only
// explains a failed probe; an AppArmor profile for bwrap can still allow it.
export function sandboxReport() {
  if (process.platform !== "linux") return { available: false, detail: "Bubblewrap sandbox is Linux-only" };
  const status = bubblewrapStatus();
  if (status.available) return status;
  let restricted = null;
  try { restricted = readFileSync("/proc/sys/kernel/apparmor_restrict_unprivileged_userns", "utf8").trim() === "1"; } catch { /* sysctl absent */ }
  return restricted ? { ...status, hint: "AppArmor restricts unprivileged user namespaces; install your distribution's bwrap AppArmor profile" } : status;
}
