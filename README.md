# bitcode

Your code. Your Bitcoin. Your agents.

A coding and Bitcoin agent for the terminal, with a Linux desktop app in
preview. Written in Node.js ESM. Works with seven model providers (OpenAI,
Anthropic, OpenRouter, Groq, Ollama, LM Studio, QVAC), MCP, local skills and
custom commands. Four Sats (Node, Script, Hash, Merkle) each run with their own
role and code-enforced limits. Bitcoin and RGB payment tools are test-network
only and always need your explicit approval.

## Quick start

Requires Node.js **22+** and Bash. No build step.

```bash
npm ci --ignore-scripts
node bitcode.mjs login            # choose a provider and enter your API key
node bitcode.mjs                  # interactive session
node bitcode.mjs -p "fix the failing test"   # one-shot
node bitcode.mjs doctor           # check your setup
```

Local models need no key: `node bitcode.mjs -m ollama/gpt-oss:20b`.

## Local inference with QVAC

```bash
npm --prefix integrations/qvac ci
npm --prefix integrations/qvac start          # server on 127.0.0.1:11435
node bitcode.mjs -m qvac/bitcode-local
```

`/models` lists QVAC's configured aliases. See
[setup and model configuration](integrations/qvac/README.md).

## RGB assets

The `rgb` profile operates an RGB Lightning Node through `kaleido-mcp`: check
balances, create invoices and send RGB assets in plain language. Every change
to the node's state goes through the payment gate. Signet (Mutinynet) test
funds only.

```bash
node bitcode.mjs -m qvac/bitcode-rgb-4b --profile rgb
```

Switch inside a session with `/profile rgb`. See
[node setup and configuration](integrations/kaleido/README.md).

## Sats

```text
/sats              list the Sats
/sat merkle        use a Sat for the next messages
node bitcode.mjs --sats   open the animated companion
```

See [docs/sats.md](docs/sats.md).

## Desktop (preview)

The same agent and Sats in an Electron workspace: projects, editor, Git,
terminal, a bubblewrap-isolated agent worker, a Bitcoin test wallet and RGB
wallet sessions with payment approvals. See [desktop/](desktop/) and the
[plan](docs/desktop-plan.md).

```bash
npm run dist:desktop              # builds desktop/release/bitcode-desktop_<version>_amd64.deb
sudo apt install ./desktop/release/bitcode-desktop_*_amd64.deb
bitcode-desktop                   # or: bitcode desktop
```

The package (Linux, amd64) also installs the terminal CLI as `/usr/bin/bitcode`
on the bundled Node.js runtime, unless another `bitcode` already owns that path.
The app stays in the tray, can start at login (Settings → System), restores its
window and blocks system suspension only while an agent run is active.
`bitcode doctor` checks that Bubblewrap can create its namespaces.

## What's inside

| Folder | Content |
|---|---|
| `src/` | agent, providers, MCP, tools, Bitcoin and RGB integrations |
| `commands/` | custom slash commands |
| `agents/`, `sats/` | subagent personas and the Sats companion |
| `desktop/` | Electron desktop app (preview) |
| `integrations/` | QVAC local inference and the KaleidoSwap RGB kit |
| `docs/` | [full reference](docs/reference.md), [Sats](docs/sats.md), [architecture](ARCHITECTURE.md), [plans](docs/plans/) |
| `design/system/` | design system the terminal theme is based on |

## Development

```bash
npm run check    # lint + tests
```

CI runs on Node 22 and 24. See [docs/reference.md](docs/reference.md) for every
command, the approval policy, providers, plugins and the Bitcoin integrations.

## License

MIT
