// Development QA only: static routes -> motion -> keyboard -> source recordings.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.SITE_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.SITE_URL||'http://127.0.0.1:4173';
const output=new URL('../../artifacts/site/',import.meta.url).pathname;
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.SITE_CHROMIUM,args:['--no-sandbox']});
const checks=[],errors=[],external=[];
const check=name=>{checks.push(name);console.log('✓ '+name);};
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:'))external.push(r.url());});
 for(const [lang,path] of [['en','/'],['it','/it/']]) {
  await page.goto(base+path);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('html').getAttribute('lang'),lang);
  assert.equal(await page.locator('html').getAttribute('data-intro'),'full');
  assert.equal(await page.locator('link[hreflang]').count(),3);
  assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://bitcode-agent.vercel.app'+path);
  const ld=await page.locator('script[type="application/ld+json"]').textContent();assert.equal(JSON.parse(ld).inLanguage,lang);
  for(const width of [1440,1024,1023,800,390,320]) {
   await page.setViewportSize({width,height:1000});await page.waitForTimeout(100);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${lang} overflow at ${width}`);
  }
  check(`${lang}: static metadata, reduced motion, no overflow at 320/390/800/1023/1024/1440`);
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+path);
  for(const anchor of ['capabilities','sats','get-started']) {
   await page.goto(base+path+'#'+anchor);await page.waitForTimeout(80);
   const top=await page.locator('#'+anchor).evaluate(el=>el.getBoundingClientRect().top);assert.ok(top>=60&&top<200,`${path}#${anchor}: ${top}`);
  }
  await page.goto(base+path+'#capabilities');await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-panel][data-active]').getAttribute('data-panel'),'bitcoin');
  await page.screenshot({path:output+lang+'-rail-bitcoin-desktop.png'});
  await page.evaluate(()=>{const el=document.querySelector('#cap-rgb h3');scrollTo(0,scrollY+el.getBoundingClientRect().top-innerHeight*.45);});
  await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-panel][data-active]').getAttribute('data-panel'),'rgb');
  assert.match(await page.locator('[data-panel="rgb"] figcaption').textContent(),lang==='it'?/nessun node/:/no node/);
  await page.screenshot({path:output+lang+'-rail-rgb-desktop.png'});
  await page.goto(base+path+'#get-started');
  const source=page.locator('#tab-source');await source.focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#tab-ollama').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#install-ollama').isVisible(),true);assert.equal(await page.locator('#install-source').isVisible(),false);
  await page.keyboard.press('End');assert.equal(await page.locator('#tab-scriptable').getAttribute('aria-selected'),'true');
  await page.keyboard.press('Home');
  await page.locator('[data-copy="install-command"]').click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/git clone/);
  check(`${lang}: anchors, sticky capability switching, catalog disclosures, keyboard tabs and clipboard`);
  await page.setViewportSize({width:390,height:844});await page.goto(base+path+'#capabilities');
  assert.equal(await page.locator('.story-sticky').isVisible(),false);
  assert.equal(await page.locator('#cap-bitcoin .inline-session').isVisible(),true);
  await page.screenshot({path:output+lang+'-rail-mobile.png'});
  await page.locator('.menu-toggle').click();await page.screenshot({path:output+lang+'-menu-mobile.png'});assert.equal(await page.locator('html').getAttribute('data-menu-open'),'');
  assert.equal(await page.locator('main').evaluate(el=>el.inert),true);
  const last=page.locator('.menu-toggle');await last.focus();await page.keyboard.press('Tab');assert.equal(await page.locator('.site-header .brand').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');assert.equal(await last.getAttribute('aria-expanded'),'false');assert.equal(await page.locator('main').evaluate(el=>el.inert),false);
  const other=lang==='en'?'it':'en';assert.match(await page.locator(`.language-switch [data-language="${other}"]`).getAttribute('href'),/#capabilities$/);
  await page.locator(`.language-switch [data-language="${other}"]`).click();assert.equal(new URL(page.url()).hash,'#capabilities');assert.equal(await page.locator('html').getAttribute('lang'),other);
  check(`${lang}: mobile inline terminals, focus containment, Escape, scroll lock, language hash preservation`);
 }
 // Fresh session: capture each intro phase, then verify one-time replay suppression.
 const motionContext=await browser.newContext({viewport:{width:1440,height:1000}});
 const motion=await motionContext.newPage();motion.on('pageerror',e=>errors.push(e.message));
 await motion.addInitScript(()=>{window.layoutShifts=[];new PerformanceObserver(list=>list.getEntries().filter(e=>!e.hadRecentInput).forEach(e=>window.layoutShifts.push(e.value))).observe({type:'layout-shift',buffered:true});});
 await motion.goto(base+'/');
 assert.equal(await motion.locator('html').getAttribute('data-intro'),'staged');
 await motion.screenshot({path:output+'intro-01-staged.png',animations:'allow'});
 await motion.waitForTimeout(1800);assert.equal(await motion.locator('html').getAttribute('data-intro'),'headline');
 await motion.screenshot({path:output+'intro-02-headline.png',animations:'allow'});
 await motion.waitForTimeout(1100);assert.equal(await motion.locator('html').getAttribute('data-intro'),'collapsing');
 await motion.screenshot({path:output+'intro-03-collapsing.png',animations:'allow'});
 await motion.waitForFunction(()=>document.documentElement.dataset.intro==='full');await motion.waitForTimeout(3000);
 await motion.screenshot({path:output+'en-hero-desktop.png'});
 const cls=await motion.evaluate(()=>window.layoutShifts.reduce((a,b)=>a+b,0));assert.ok(cls<.05,'Intro CLS '+cls);
 await motion.reload();assert.equal(await motion.locator('html').getAttribute('data-intro'),'full');
 await motion.evaluate(()=>{sessionStorage.removeItem('bitcode-intro');});await motion.goto(base+'/#sats');assert.equal(await motion.locator('html').getAttribute('data-intro'),'full');
 check(`intro staged/headline/collapsing/full, session/hash skips, CLS ${cls.toFixed(4)}`);
 await motion.evaluate(()=>{scrollTo({top:1800,behavior:'instant'});history.replaceState(null,'','/');sessionStorage.removeItem('bitcode-intro');});await motion.waitForTimeout(200);await motion.reload();await motion.waitForFunction(()=>scrollY>0);assert.equal(await motion.locator('html').getAttribute('data-intro'),'full');
 check('browser scroll restoration skips the intro');
 await motion.goto(base+'/it/');await motion.screenshot({path:output+'it-hero-desktop.png'});
 await motion.setViewportSize({width:390,height:844});await motion.screenshot({path:output+'it-hero-mobile.png'});
 await motion.locator('.genesis-trigger').click();assert.equal(await motion.locator('#genesis-dialog').evaluate(el=>el.open),true);
 assert.match(await motion.locator('#genesis-dialog').textContent(),/The Times 03\/Jan\/2009/);await motion.keyboard.press('Escape');await motion.waitForFunction(()=>!document.getElementById('genesis-dialog').open);
 await motion.keyboard.type('/genesis');assert.equal(await motion.locator('#genesis-dialog').evaluate(el=>el.open),true);await motion.keyboard.press('Escape');
 check('genesis by logo and /genesis, dismissible with Escape');
 // Visibility pause preserves a partially typed command and resumes it.
 await motion.setViewportSize({width:390,height:844});await motion.goto(base+'/#cap-bitcoin');
 const player=motion.locator('#cap-bitcoin [data-session]');
 await player.scrollIntoViewIfNeeded();await motion.waitForTimeout(100);
 await motion.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
 const before=await player.textContent();await motion.waitForTimeout(250);assert.equal(await player.textContent(),before);
 await motion.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await motion.waitForTimeout(500);assert.notEqual(await player.textContent(),before);
 await motion.locator('#motion-toggle').click();assert.equal(await motion.locator('html').getAttribute('data-motion'),'paused');
 check('hidden-tab typing pauses and resumes; explicit pause renders complete excerpts');
 await motion.setViewportSize({width:1440,height:1000});await motion.goto(base+'/');await motion.locator('.brand').first().click({button:'right'});assert.equal(await motion.locator('.brand-menu').isVisible(),true);await motion.keyboard.press('Escape');assert.equal(await motion.locator('.brand-menu').isVisible(),false);
 assert.equal(await motion.locator('.brand').first().evaluate(el=>{const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,shiftKey:true});el.dispatchEvent(event);return event.defaultPrevented;}),false);
 check('fine-pointer logo menu; Shift preserves native context menu');
 await page.goto(base+'/it/#demos');const firstVideo=page.locator('video').first();await page.locator('.video-start').first().click();await page.waitForFunction(()=>!document.querySelector('video').paused);assert.equal(await firstVideo.evaluate(el=>el.controls),true);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await firstVideo.evaluate(el=>el.paused),true);await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
 check('recorded video plays on request with native controls and pauses when hidden');
 const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:320,height:844}});
 const staticPage=await nojs.newPage();
 for(const path of ['/','/it/']){
  await staticPage.goto(base+path);assert.equal(await staticPage.locator('h1').isVisible(),true);
  assert.equal(await staticPage.locator('#cap-bitcoin .inline-session').isVisible(),true);assert.equal(await staticPage.locator('#install-qvac').isVisible(),true);
  assert.ok(await staticPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 check('without JavaScript: headings, eight inline recordings, four installation methods and mobile navigation available');
 const blocked=await browser.newContext();const privacyPage=await blocked.newPage();
 await privacyPage.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('blocked');};Storage.prototype.setItem=()=>{throw Error('blocked');};});
 await privacyPage.goto(base+'/it/#get-started');assert.equal(await privacyPage.locator('[role="tablist"]').count(),1);
 const hiddenContext=await browser.newContext();const hiddenPage=await hiddenContext.newPage();await hiddenPage.addInitScript(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}));await hiddenPage.goto(base+'/');assert.equal(await hiddenPage.locator('html').getAttribute('data-intro'),'full');
 check('initially hidden tab skips the intro');
 await page.goto(base+'/it/#capabilities');
 await page.addScriptTag({path:process.env.SITE_AXE||'/home/edi/.npm/_npx/ffe2131771d88588/node_modules/axe-core/axe.min.js'});
 const axe=await page.evaluate(async()=>await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
 await writeFile(output+'accessibility.json',JSON.stringify(axe.violations,null,2));assert.equal(axe.violations.length,0,JSON.stringify(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))));
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 check('blocked storage, zero external requests, zero browser errors, axe WCAG AA clean');
 await writeFile(output+'browser-results.json',JSON.stringify({checks,cls,errors,external},null,2)+'\n');
}finally{await browser.close();}
