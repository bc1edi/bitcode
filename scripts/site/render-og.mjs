// Development-only screenshot renderer. No browser dependency is shipped to visitors.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.SITE_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.SITE_CHROMIUM,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
 for(const lang of ['en','it']) {
  const t=JSON.parse(await readFile(new URL(`../../i18n/${lang}.json`,import.meta.url),'utf8'));
  await page.goto((process.env.SITE_URL||'http://127.0.0.1:4173')+'/');
  await page.setContent(`<html lang="${lang}"><head><style>@font-face{font-family:Inter;src:url('/assets/site/inter-latin.woff2');font-weight:400 700}@font-face{font-family:Mono;src:url('/assets/site/jetbrains-mono-latin.woff2')}body{margin:0;background:#f7f7f4;color:#26251e;font-family:Inter,sans-serif;padding:96px;box-sizing:border-box;width:1200px;height:630px}.lockup{display:flex;align-items:center;gap:48px;height:260px}svg{height:260px;width:208px}.wordmark{font-size:150px;font-weight:600;letter-spacing:-.06em}.tagline{font-size:40px;color:#5a5852;margin-top:64px;letter-spacing:-.03em}.footer{border-top:1px solid #e6e5e0;margin-top:26px;padding-top:26px;font:18px Mono;color:#5a5852}.footer::before{content:'';display:inline-block;width:9px;height:9px;background:#f7931a;margin-right:14px}</style></head><body><div class="lockup"><svg viewBox="0 0 4 5" shape-rendering="crispEdges"><path fill="#f7931a" d="M0 0h1v4H0zM1 0h2v1H1zM2 1h1v1H2zM1 2h1v1H1zM3 2h1v2H3z"/><path fill="#0f0f0f" d="M0 4h2v1H0z"/></svg><span class="wordmark">bitcode</span></div><div class="tagline">${t['text.018']} ${t['text.019']} ${t['text.020']}</div><div class="footer">Bitcoin · Lightning · Liquid · Taproot Assets · RGB · Cashu</div></body></html>`);
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:new URL(`../../assets/og-image${lang==='it'?'-it':''}.png`,import.meta.url).pathname});
 }
}finally{await browser.close();}
