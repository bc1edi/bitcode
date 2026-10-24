// Generates every derived brand file from brand/tokens/tokens.json.
//   node brand/build.mjs          write
//   node brand/build.mjs --check  fail if generated files are out of date
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(join(root, 'tokens/tokens.json'), 'utf8'));
const check = process.argv.includes('--check');
const stale = [];

function emit(rel, text) {
  const file = join(root, rel);
  if (check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text) stale.push(rel);
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

// ---- pixel logo ------------------------------------------------------------
// The "b" is a 4x5 pixel grid: orange body, dark base. The wordmark continues the same grid.
const { accent, markBase } = tokens.color;
// Same rule as the site (orange body, ink base): on dark, ink is the dark theme's ink. No extra colors.
const onDarkBase = tokens.color.dark.ink;
const B_BODY = 'M0 0h1v4H0zM1 0h2v1H1zM2 1h1v1H2zM1 2h1v1H1zM3 2h1v2H3z';
const B_BASE = 'M0 4h2v1H0z';
const glyphs = JSON.parse(readFileSync(join(root, 'logo/glyphs.json'), 'utf8'));
// Lays outlined glyphs on a baseline. `scale` converts font units to SVG units, `track` is letter-spacing in em.
function setText(face, scale, x, baseline, track) {
  let d = '';
  for (const g of face.glyphs) {
    d += `<path transform="translate(${+x.toFixed(2)} ${baseline}) scale(${+scale.toFixed(5)})" d="${g.d}"/>`;
    x += (g.advance + track * face.upm) * scale;
  }
  return { svg: d, end: x };
}
// Pixel art stays crisp; outlined type needs normal antialiasing.
const svg = (w, h, body, crisp = true) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"${crisp ? ' shape-rendering="crispEdges"' : ''}>${body}</svg>\n`;
const path = (fill, d) => `<path fill="${fill}" d="${d}"/>`;

const markVariant = (body, base) => svg(4, 5, path(body, B_BODY) + path(base, B_BASE));

// Wordmark: the pixel "b" followed by the full word "bitcode" in Inter 600, the original site/OG lockup:
// mark 260 px tall, 48 px gap, text 150 px with -0.06em tracking, both centered on the same axis.
// Units: 100 per mark pixel, so the mark is 400x500 and every OG measure scales by 500/260.
const group = (fill, inner) => `<g fill="${fill}">${inner}</g>`;
function wordmarkVariant(body, base, text) {
  const mark = `<g transform="scale(100)" shape-rendering="crispEdges">${path(body, B_BODY) + path(base, B_BASE)}</g>`;
  const k = 500 / 260, f = glyphs.inter, size = 150 * k, scale = size / f.upm;
  const lineBox = (f.hheaAscent + f.hheaDescent + f.lineGap) * scale;
  const baseline = 250 - lineBox / 2 + f.hheaAscent * scale;  // line box centered on the mark, like flex align-items:center
  const t = setText(f, scale, 400 + 48 * k, +baseline.toFixed(2), -0.06);
  return svg(Math.round(t.end + 0.06 * size + 8), 500, mark + group(text, t.svg), false);
}
function terminalVariant(text, cursor) {
  const f = glyphs.mono, scale = 500 / f.ascender;
  const t = setText(f, scale, 0, 500, -0.04);
  const adv = f.glyphs[0].advance * scale;
  const cur = `<rect x="${Math.round(t.end + adv * 0.08)}" y="430" width="${Math.round(adv * 0.82)}" height="70" fill="${cursor}"/>`;
  return svg(Math.round(t.end + adv * 0.9), 512, group(text, t.svg) + cur, false);
}

emit('logo/mark.svg', markVariant(accent, markBase));
emit('logo/mark-ink.svg', markVariant(markBase, accent));
emit('logo/mark-on-dark.svg', markVariant(accent, onDarkBase));
emit('logo/mark-mono-black.svg', markVariant('#000', '#000'));
emit('logo/mark-mono-white.svg', markVariant('#fff', '#fff'));
emit('logo/wordmark.svg', wordmarkVariant(accent, markBase, tokens.color.light.ink));
emit('logo/wordmark-on-dark.svg', wordmarkVariant(accent, onDarkBase, tokens.color.dark.ink));
emit('logo/wordmark-mono-black.svg', wordmarkVariant('#000', '#000', '#000'));
emit('logo/wordmark-mono-white.svg', wordmarkVariant('#fff', '#fff', '#fff'));
emit('logo/terminal.svg', terminalVariant(tokens.color.light.ink, accent));
emit('logo/terminal-on-dark.svg', terminalVariant('#ffffff', accent));
emit('logo/terminal-mono-black.svg', terminalVariant('#000', '#000'));
emit('logo/terminal-mono-white.svg', terminalVariant('#fff', '#fff'));

// Half-block rendering of the same 4x5 grid, for terminals and READMEs.
emit('logo/ascii.txt', '█▀█ \n█▀ █\n▀▀  \n\nbitcode_\n');

// ---- css tokens ------------------------------------------------------------
const kebab = s => s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
const vars = (obj, indent) => Object.entries(obj).map(([k, v]) => `${indent}--${kebab(k)}: ${v};`).join('\n');
const shared = {
  accent: tokens.color.accent, accentActive: tokens.color.accentActive, onAccent: tokens.color.onAccent,
  ...tokens.color.tx,
  ...Object.fromEntries(Object.entries(tokens.color.sats).map(([k, v]) => [`sat-${k}`, v])),
  fontSans: tokens.font.sans, fontMono: tokens.font.mono, radius: tokens.shape.radius, pageWidth: tokens.shape.pageWidth
};
const css = `/* Generated by brand/build.mjs from tokens/tokens.json. Do not edit. */
:root {
${vars(shared, '  ')}
${vars(tokens.color.light, '  ')}
  color-scheme: light;
}
:root[data-theme="dark"] {
${vars(tokens.color.dark, '  ')}
  color-scheme: dark;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${vars(tokens.color.dark, '    ')}
    color-scheme: dark;
  }
}
`;
emit('tokens/tokens.css', css);

// ---- consumers: generated blocks inside the existing site, app and CLI files ---------------
// Each target holds a `brand:begin` / `brand:end` pair; only what is between them is generated.
const repo = join(root, '..');
function inject(rel, text) {
  const file = join(repo, rel);
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const b = lines.findIndex(l => l.includes('brand:begin')), e = lines.findIndex(l => l.includes('brand:end'));
  if (b < 0 || e < b) throw new Error(`${rel}: brand:begin/brand:end markers missing`);
  const out = [...lines.slice(0, b + 1), ...text.replace(/\n$/, '').split('\n'), ...lines.slice(e)].join('\n');
  if (check) { if (out !== src) stale.push(rel); } else writeFileSync(file, out);
}
const { light: L, dark: D, tx, sats } = tokens.color;
const decl = (obj, pad) => Object.entries(obj).map(([k, v]) => `${pad}${k}: ${v};`).join('\n');
const inline = (obj, pad) => {  // app style: several declarations per line
  const items = Object.entries(obj).map(([k, v]) => `${k}: ${v};`), rows = [];
  for (let i = 0; i < items.length; i += 4) rows.push(pad + items.slice(i, i + 4).join(' '));
  return rows.join('\n');
};

// site: the dark website keeps its own reading contrast (tokens.web) on the shared accent, tx and Sat colors
const W = tokens.web;
const site = {
  '--orange': tokens.color.accent, '--orange-active': tokens.color.accentActive, '--on-accent': W.color.onAccent,
  '--canvas': W.color.canvas, '--canvas-soft': W.color.canvasSoft, '--surface': W.color.surface, '--surface-strong': W.color.surfaceStrong,
  '--hairline': W.color.hairline, '--ink': W.color.ink, '--body': W.color.body, '--muted': W.color.muted, '--muted-soft': W.color.mutedSoft,
  '--success': W.color.success, '--pending': tx.pending, '--relayed': tx.relayed, '--mempool': tx.mempool,
  '--confirming': tx.confirming, '--confirmed': tx.confirmed,
  ...Object.fromEntries(Object.entries(sats).map(([k, v]) => [`--sat-${k}`, v])),
  '--mono': W.font.mono, '--radius': W.shape.radius, '--radius-lg': W.shape.radiusLg, '--page-width': W.shape.pageWidth
};
inject('site/public/assets/site/base.css', `:root {\n${decl(site, '  ')}\n}\n`);
const contractPath = join(repo, 'site/src/design-contract.json');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const hexes = Object.values(site).filter(v => /^#[0-9a-f]{3,8}$/i.test(v)).map(v => v.toLowerCase());
const nextContract = { ...contract, source: 'brand/tokens/tokens.json (generated by brand/build.mjs)', tokens: site, colors: [...new Set([...contract.colors, ...hexes])].sort() };
const contractText = JSON.stringify(nextContract, null, 2) + '\n';
if (check) { if (readFileSync(contractPath, 'utf8') !== contractText) stale.push('site/src/design-contract.json'); } else writeFileSync(contractPath, contractText);

// desktop app: reading text is `text`, secondary text is `body` (kept under the app's old name mutedStrong)
const appShared = {
  '--accent': tokens.color.accent, '--accentActive': tokens.color.accentActive, '--onAccent': tokens.color.onAccent,
  '--info': L.info, '--pending': tx.pending, '--relayed': tx.relayed, '--mempool': tx.mempool,
  '--confirming': tx.confirming, '--confirmed': tx.confirmed,
  ...Object.fromEntries(Object.entries(sats).map(([k, v]) => [`--sat-${k}`, v]))
};
const appTheme = t => ({
  '--canvas': t.canvas, '--surface': t.surface, '--card': t.card, '--elevated': t.elevated, '--hover': t.hover,
  '--ink': t.ink, '--body': t.text, '--muted': t.muted, '--mutedStrong': t.body,
  '--hairline': t.hairline, '--hairlineStrong': t.hairlineStrong, '--accentSoft': t.accentSoft,
  '--up': t.up, '--down': t.down, '--upSoft': t.upSoft, '--downSoft': t.downSoft, '--userBubble': t.elevated
});
inject('desktop/ui/styles.css', `:root, :root[data-theme="dark"] {
${inline({ ...appTheme(D), ...appShared }, '  ')}
  color-scheme: dark;
}
:root[data-theme="light"] {
${inline(appTheme(L), '  ')}
  color-scheme: light;
}
@media (prefers-color-scheme: light) {
  :root[data-theme="system"] {
${inline(appTheme(L), '    ')}
    color-scheme: light;
  }
}
`);

// /sats web UI: light only, camelCase names
inject('ui/sats/styles.css', `:root {
${decl({
  '--canvas': L.canvas, '--canvasSoft': L.surface, '--card': L.card, '--ink': L.ink, '--body': L.body, '--muted': L.muted,
  '--hairline': L.hairline, '--hairlineSoft': L.elevated, '--hairlineStrong': L.hairlineStrong,
  '--bitcoinOrange': tokens.color.accent, '--orangeActive': tokens.color.accentActive, '--success': L.up, '--error': L.down,
  '--pending': tx.pending, '--relayed': tx.relayed, '--mempool': tx.mempool, '--confirming': tx.confirming, '--confirmed': tx.confirmed
}, '  ')}
  color-scheme: light;
}
`);

// CLI: the same values as frozen JS objects
const js = obj => Object.entries(obj).map(([k, v]) => `  ${k}: "${v}",`).join('\n');
inject('src/design-tokens.mjs', `export const TOKEN = Object.freeze({
${js({
  bitcoinOrange: tokens.color.accent, orangeActive: tokens.color.accentActive, canvas: L.canvas, canvasSoft: L.surface, card: L.card,
  surfaceStrong: L.hairline, hairline: L.hairline, hairlineSoft: L.elevated, hairlineStrong: L.hairlineStrong, onPrimary: L.card,
  ink: L.ink, body: L.body, muted: L.muted, mutedSoft: L.mutedSoft, success: L.up, error: L.down
})}
});
export const STAGE = Object.freeze({
${js(tx)}
});
export const SAT = Object.freeze({
${js(sats)}
});
// Full light and dark themes plus the mark colors, for code that cannot read CSS variables
// (Electron window background, xterm, the LAN phone page, icon and asset generators).
export const BRAND = Object.freeze({
${js({ accent: tokens.color.accent, accentActive: tokens.color.accentActive, onAccent: tokens.color.onAccent, markBase: tokens.color.markBase })}
});
export const THEME = Object.freeze({
  light: Object.freeze({
${js(L).replace(/^/gm, '  ')}
  }),
  dark: Object.freeze({
${js(D).replace(/^/gm, '  ')}
  }),
});
`);

// web app manifest for the site (Vercel serves only site/public)
const manifest = {
  name: tokens.brand.name, short_name: tokens.brand.name, description: tokens.brand.taglines.en,
  start_url: '/', display: 'standalone', background_color: D.canvas, theme_color: L.canvas,
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/assets/site/bitcode.svg', sizes: 'any', type: 'image/svg+xml' }
  ]
};
const manifestPath = join(repo, 'site/public/site.webmanifest'), manifestText = JSON.stringify(manifest, null, 2) + '\n';
if (check) { if (!existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== manifestText) stale.push('site/public/site.webmanifest'); } else writeFileSync(manifestPath, manifestText);

// design system page: tokens and Sat profiles inlined so the page also works from file://
const profiles = ['node', 'script', 'hash', 'merkle'].map(id => JSON.parse(readFileSync(join(root, `mascots/profiles/${id}.json`), 'utf8')));
const pageData = { brand: tokens.brand, color: tokens.color, type: tokens.type, space: tokens.space, radii: tokens.radii };
inject('brand/design-system.html', `const TOKENS = ${JSON.stringify(pageData)};\nconst PROFILES = ${JSON.stringify(profiles)};\n`);

if (check) {
  if (stale.length) { console.error(`brand: out of date -> ${stale.join(', ')}. Run node brand/build.mjs`); process.exit(1); }
  console.log('brand: up to date');
} else console.log('brand: generated');
