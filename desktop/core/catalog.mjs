// Curated MCP servers that can be added to the shared ~/.bitcode/config.json.
// Each entry is written verbatim under config.mcp.<id>; the CLI and the RGB
// profile start it, and tool access still goes through Bitcode's gates.
export const MCP_CATALOG = [
  { id: 'kaleido', name: 'KaleidoSwap RGB', category: 'bitcoin', description: 'RGB Lightning Node: balances, RGB invoices and transfers (Signet). Payments always need approval.',
    config: { command: 'kaleido-mcp', env: { KALEIDO_NETWORK: 'signet', RLN_NODE_URL: 'http://localhost:3001' }, timeoutMs: 60000,
      readOnlyTools: ['rln_get_balances', 'rln_list_assets'], financialTools: ['rln_send_asset', 'rln_send_btc', 'rln_pay_invoice', 'rln_create_utxos', 'kaleidoswap_lsp_create_order'] },
    setup: 'integrations/kaleido/README.md' },
  { id: 'github', name: 'GitHub', category: 'code', description: 'Repositories, issues and pull requests through the official remote GitHub MCP server.',
    config: { url: 'https://api.githubcopilot.com/mcp/', headerEnv: { Authorization: 'GITHUB_MCP_AUTHORIZATION' }, trustReadOnlyAnnotations: false },
    setup: 'Set GITHUB_MCP_AUTHORIZATION="Bearer <personal access token>" in the environment.' },
  { id: 'context7', name: 'Context7', category: 'code', description: 'Up-to-date library documentation for the model.',
    config: { command: 'npx', args: ['-y', '@upstash/context7-mcp'], timeoutMs: 60000 }, setup: 'Needs Node.js and npx on PATH.' },
  { id: 'playwright', name: 'Playwright', category: 'quality', description: 'Drive a browser to test local web apps.',
    config: { command: 'npx', args: ['-y', '@playwright/mcp'], timeoutMs: 60000 }, setup: 'Needs Node.js and npx on PATH; downloads a browser on first use.' },
  { id: 'memory', name: 'Memory', category: 'ai', description: 'A local knowledge graph the model can read and update.',
    config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'], timeoutMs: 30000 }, setup: 'Needs Node.js and npx on PATH.' },
  { id: 'sequential-thinking', name: 'Sequential thinking', category: 'ai', description: 'Step-by-step reasoning scratchpad tool.',
    config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'], timeoutMs: 30000 }, setup: 'Needs Node.js and npx on PATH.' }
];
