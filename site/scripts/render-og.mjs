// Development-only screenshot renderer. No browser dependency is shipped to visitors.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require=createRequire(import.meta.url);
// Logo and colors come from brand/: the official wordmark (pixel b + "bitcode") and the light tokens.
const tokens=JSON.parse(await readFile(new URL('../../brand/tokens/tokens.json',import.meta.url),'utf8')),L=tokens.color.light;
const wordmark=await readFile(new URL('../../brand/logo/wordmark.svg',import.meta.url),'utf8');
const {chromium}=require(process.env.SITE_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.SITE_CHROMIUM,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
 for(const lang of ['en','it']) {
  const t=JSON.parse(await readFile(new URL(`../src/i18n/${lang}.json`,import.meta.url),'utf8'));
  await page.goto((process.env.SITE_URL||'http://127.0.0.1:4173')+'/');
  await page.setContent(`<html lang="${lang}"><head><style>@font-face{font-family:Inter;src:url('/assets/site/inter-latin.woff2');font-weight:400 700}@font-face{font-family:Mono;src:url('/assets/site/jetbrains-mono-latin.woff2')}body{margin:0;background:${L.canvas};color:${L.ink};font-family:Inter,sans-serif;padding:96px;box-sizing:border-box;width:1200px;height:630px}.lockup{display:flex;align-items:center;height:260px}.lockup svg{height:260px;width:auto;display:block}.tagline{font-size:40px;color:${L.body};margin-top:64px;letter-spacing:-.03em}.footer{border-top:1px solid ${L.hairline};margin-top:26px;padding-top:26px;font:18px Mono;color:${L.body}}.footer::before{content:'';display:inline-block;width:9px;height:9px;background:${tokens.color.accent};margin-right:14px}</style></head><body><div class="lockup">${wordmark}</div><div class="tagline">${t['text.018']} ${t['text.019']}</div><div class="footer">Bitcoin · Lightning · Liquid · Taproot Assets · RGB · Cashu</div></body></html>`);
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:new URL(`../public/assets/og-image${lang==='it'?'-it':''}.png`,import.meta.url).pathname});
 }
}finally{await browser.close();}
