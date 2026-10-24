// Renders every platform asset from the logo and tokens. Development-only: needs Playwright.
//   SITE_PLAYWRIGHT_MODULE=/path/to/playwright node brand/social/build.mjs [platform]
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const brand = join(here, '..');
const site = join(brand, '..', 'site/public');  // Vercel serves only this folder
const tokens = JSON.parse(readFileSync(join(brand, 'tokens/tokens.json'), 'utf8'));
const { chromium } = createRequire(import.meta.url)(process.env.SITE_PLAYWRIGHT_MODULE || 'playwright');
const logo = n => readFileSync(join(brand, 'logo', n), 'utf8');
const font = n => pathToFileURL(join(brand, '..', 'site/public/assets/site', n)).href;
const dark = tokens.color.dark, light = tokens.color.light;
const [, , vw, vh] = logo('wordmark.svg').match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
const wordRatio = vw / vh;

// kind: avatar = mark only (circle-safe); lockup = wordmark + tagline (kept inside a centered safe box)
const SPECS = {
  // web icons go straight to site/public; the site's OG image is site/scripts/render-og.mjs
  icons: [['apple-touch-icon', 180, 180, 'avatar'], ['icon-192', 192, 192, 'avatar'], ['icon-512', 512, 512, 'avatar']],
  // one mark-only avatar serves every profile picture (circle-safe); 800 for YouTube, 400 elsewhere
  avatars: [['avatar-400', 400, 400, 'avatar'], ['avatar-800', 800, 800, 'avatar']],
  linkedin: [['banner', 1584, 396, 'lockup'], ['post', 1200, 627, 'lockup']],
  x: [['header', 1500, 500, 'lockup'], ['card', 1200, 675, 'lockup']],
  instagram: [['post-square', 1080, 1080, 'lockup'], ['post-portrait', 1080, 1350, 'lockup'], ['story', 1080, 1920, 'lockup']],
  github: [['social-preview', 1280, 640, 'lockup']],
  youtube: [['banner', 2560, 1440, 'lockup'], ['thumbnail', 1280, 720, 'lockup']]
};

function html(w, h, kind, lang, theme) {
  const t = theme === 'dark' ? dark : light;
  const mark = logo(theme === 'dark' ? 'mark-on-dark.svg' : 'mark.svg');
  const word = logo(theme === 'dark' ? 'wordmark-on-dark.svg' : 'wordmark.svg');
  const unit = Math.min(w, h);
  const css = `@font-face{font-family:Inter;src:url('${font('inter-latin.woff2')}');font-weight:400 700}
body{margin:0;width:${w}px;height:${h}px;background:${t.canvas};color:${t.ink};font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center}
.box{display:flex;flex-direction:column;align-items:center;text-align:center;gap:${unit * 0.05}px;max-width:${w * 0.8}px}
.mark svg{height:${kind === 'avatar' ? unit * 0.5 : unit * 0.2}px;display:block}
.word svg{height:${Math.min(h * 0.24, w * 0.7 / wordRatio)}px;display:block}
.tag{font-size:${Math.min(h * 0.075, w * 0.032)}px;color:${t.body};letter-spacing:-.03em}
.dot{width:${unit * 0.015}px;height:${unit * 0.015}px;background:${tokens.color.accent};display:inline-block;margin-right:.6em}`;
  const body = kind === 'avatar'
    ? `<div class="mark">${mark}</div>`
    : `<div class="box"><div class="word">${word}</div><div class="tag">${tokens.brand.taglines[lang]}</div></div>`;
  return `<html><head><style>${css}</style></head><body>${body}</body></html>`;
}

const only = process.argv[2];
const browser = await chromium.launch({ headless: true, executablePath: process.env.SITE_CHROMIUM, args: ['--no-sandbox'] });
try {
  for (const [platform, items] of Object.entries(SPECS)) {
    if (only && only !== platform) continue;
    for (const [name, w, h, kind] of items) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      for (const lang of kind === 'avatar' ? ['en'] : ['en', 'it']) {
        const theme = 'dark';  // social feeds and app icons sit on dark
        await page.setContent(html(w, h, kind, lang, theme));
        await page.evaluate(() => document.fonts.ready);
        const dir = platform === 'icons' ? site : join(here, 'export', platform);
        mkdirSync(dir, { recursive: true });
        const file = join(dir, kind === 'avatar' ? `${name}.png` : `${name}-${lang}.png`);
        await page.screenshot({ path: file });
        console.log(file.replace(join(brand, '..') + '/', ''), `${w}x${h}`);
      }
      await page.close();
    }
  }
  if (!only || only === 'icons') {
    // favicon.ico: the original transparent mark (orange body, near-black base) at 16, 32 and 48 px, PNG-in-ICO
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const pngs = [];
    for (const size of [16, 32, 48]) {
      await page.setViewportSize({ width: size, height: size });
      const cell = Math.floor(size / 5);  // whole device pixels per mark pixel keeps the edges crisp
      await page.setContent(`<html><body style="margin:0;background:transparent;height:${size}px;display:flex;align-items:center;justify-content:center">${logo('mark.svg').replace('<svg', `<svg style="width:${cell * 4}px;height:${cell * 5}px;display:block"`)}</body></html>`);
      pngs.push([size, await page.screenshot({ omitBackground: true })]);
    }
    await page.close();
    writeFileSync(join(site, 'favicon.ico'), ico(pngs));
    console.log('site/public/favicon.ico', '16+32+48');
  }
} finally { await browser.close(); }

// ICONDIR + one ICONDIRENTRY per image, followed by the PNG bytes (supported by every current browser).
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(([size, png], i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size % 256, e); head.writeUInt8(size % 256, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map(([, png]) => png)]);
}
