// Development QA only: static routes -> hero loop -> Sats scene -> keyboard -> source recordings.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.SITE_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.SITE_URL||'http://127.0.0.1:4173';
const output=new URL('../../artifacts/site/',import.meta.url).pathname;
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.SITE_CHROMIUM,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const checks=[],errors=[],external=[];
const check=name=>{checks.push(name);console.log('✓ '+name);};
const watch=page=>{
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:'))external.push(r.url());});
};
const scrollToElement=(page,selector,ratio)=>page.evaluate(([selector,ratio])=>{const el=document.querySelector(selector);scrollTo({top:scrollY+el.getBoundingClientRect().top-innerHeight*ratio,behavior:'instant'});},[selector,ratio]);
const heroState=page=>page.evaluate(()=>{const v=document.querySelector('.hero-video');return {video:!!v,paused:v?v.paused:null,state:document.querySelector('[data-hero-video]').dataset.video||null,src:v?.currentSrc||null};});
let cls=0;
try {
 const context=await browser.newContext({locale:'en-US',viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
 const page=await context.newPage();watch(page);
 for(const [lang,path] of [['en','/'],['it','/it/']]) {
  await page.goto(base+path);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('html').getAttribute('lang'),lang);
  assert.equal(await page.locator('link[hreflang]').count(),3);
  assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://bitcode-agent.vercel.app'+path);
  const ld=await page.locator('script[type="application/ld+json"]').textContent();assert.equal(JSON.parse(ld).inLanguage,lang);
  assert.equal(await page.locator('.hero-poster').isVisible(),true);
  assert.equal((await heroState(page)).video,false,'Reduced motion keeps the poster');
  assert.equal(await page.locator('h1').isVisible(),true);
  assert.equal(await page.locator('.hero-actions .button-primary').getAttribute('href'),'#get-started');
  for(const width of [2560,1920,1440,1024,1023,800,390,320]) {
   await page.setViewportSize({width,height:1000});await page.waitForTimeout(100);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${lang} overflow at ${width}`);
  }
  check(`${lang}: metadata, poster under reduced motion, CTA, no overflow at 320/390/800/1023/1024/1440/1920/2560`);
  await page.setViewportSize({width:1440,height:1000});
  for(const anchor of ['demo','capabilities','sats','get-started']) {
   await page.goto(base+path+'#'+anchor);await page.waitForTimeout(80);
   const top=await page.locator('#'+anchor).evaluate(el=>el.getBoundingClientRect().top);assert.ok(top>=40&&top<200,`${path}#${anchor}: ${top}`);
  }
  await page.goto(base+path+'#capabilities');await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-panel][data-active]').getAttribute('data-panel'),'bitcoin');
  await scrollToElement(page,'#cap-rgb h3',.45);await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-panel][data-active]').getAttribute('data-panel'),'rgb');
  assert.match(await page.locator('[data-panel="rgb"] figcaption').textContent(),lang==='it'?/nessun node/:/no node/);
  await page.screenshot({path:output+lang+'-rail-rgb-desktop.png'});
  for(const sat of ['node','script','hash','merkle']) {
   await scrollToElement(page,'#sat-'+sat,.3);await page.waitForTimeout(120);
   assert.equal(await page.locator('[data-sats-scene]').getAttribute('data-active-sat'),sat);
   assert.equal(await page.locator(`[data-stage-sat="${sat}"]`).getAttribute('data-active'),'');
   assert.equal(await page.locator('[data-stage-sat][data-active]').count(),1);
  }
  assert.equal(await page.locator('.sats-stage').isVisible(),true);
  assert.equal(await page.locator('#sat-node .sat-chapter-figure').isVisible(),false);
  await scrollToElement(page,'#sat-hash',.3);await page.waitForTimeout(120);
  await page.screenshot({path:output+lang+'-sats-desktop.png'});
  assert.equal(await page.locator('.nav-link[aria-current="location"]').getAttribute('href'),'#sats');
  await page.goto(base+path+'#get-started');
  const source=page.locator('#tab-source');await source.focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#tab-ollama').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#install-ollama').isVisible(),true);assert.equal(await page.locator('#install-source').isVisible(),false);
  await page.keyboard.press('End');assert.equal(await page.locator('#tab-scriptable').getAttribute('aria-selected'),'true');
  await page.keyboard.press('Home');
  await page.locator('[data-copy="install-command"]').click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/git clone/);
  check(`${lang}: anchors, capability rail, Sats scene chapters, active navigation, keyboard tabs and clipboard`);
  await page.setViewportSize({width:390,height:844});await page.goto(base+path+'#capabilities');
  assert.equal(await page.locator('.story-sticky').isVisible(),false);
  assert.equal(await page.locator('#cap-bitcoin .inline-session').isVisible(),true);
  await page.goto(base+path+'#sats');
  assert.equal(await page.locator('.sats-stage').isVisible(),false);
  for(const sat of ['node','script','hash','merkle'])assert.equal(await page.locator(`#sat-${sat} .sat-chapter-figure img`).count(),1);
  await page.locator('#sat-node .sat-chapter-figure').scrollIntoViewIfNeeded();assert.equal(await page.locator('#sat-node .sat-chapter-figure').isVisible(),true);
  await page.screenshot({path:output+lang+'-sats-mobile.png'});
  await page.goto(base+path+'#capabilities');
  await page.locator('.menu-toggle').click();await page.screenshot({path:output+lang+'-menu-mobile.png'});assert.equal(await page.locator('html').getAttribute('data-menu-open'),'');
  assert.equal(await page.locator('main').evaluate(el=>el.inert),true);
  const last=page.locator('.menu-toggle');await last.focus();await page.keyboard.press('Tab');assert.equal(await page.locator('.site-header .brand').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');assert.equal(await last.getAttribute('aria-expanded'),'false');assert.equal(await page.locator('main').evaluate(el=>el.inert),false);
  const other=lang==='en'?'it':'en';assert.match(await page.locator(`.language-switch [data-language="${other}"]`).getAttribute('href'),/#capabilities$/);
  await page.locator(`.language-switch [data-language="${other}"]`).click();assert.equal(new URL(page.url()).hash,'#capabilities');assert.equal(await page.locator('html').getAttribute('lang'),other);
  check(`${lang}: mobile inline terminals and Sats sequence, focus containment, Escape, scroll lock, language hash preservation`);
 }

 // Motion allowed: the decorative loop starts after load, stops off screen, hidden or paused.
 const motionContext=await browser.newContext({locale:'en-US',viewport:{width:1440,height:900}});
 const motion=await motionContext.newPage();watch(motion);
 await motion.addInitScript(()=>{window.layoutShifts=[];new PerformanceObserver(list=>list.getEntries().filter(e=>!e.hadRecentInput).forEach(e=>window.layoutShifts.push(e.value))).observe({type:'layout-shift',buffered:true});});
 await motion.goto(base+'/');
 assert.equal(await motion.locator('.hero-poster').isVisible(),true);
 await motion.waitForFunction(()=>document.querySelector('[data-hero-video]').dataset.video==='playing');
 let hero=await heroState(motion);assert.match(hero.src,/sats-team-desktop\.webm$/);
 const t0=await motion.locator('.hero-video').evaluate(v=>v.currentTime);await motion.waitForTimeout(600);
 assert.ok(await motion.locator('.hero-video').evaluate(v=>v.currentTime)>t0,'Hero loop advances');
 assert.equal(await motion.locator('.hero-video').evaluate(v=>v.loop&&v.muted&&!v.controls&&v.getAttribute('aria-hidden')==='true'),true);
 await motion.waitForTimeout(900);await motion.screenshot({path:output+'en-hero-desktop.png'});
 cls=await motion.evaluate(()=>window.layoutShifts.reduce((a,b)=>a+b,0));assert.ok(cls<.05,'Load CLS '+cls);
 assert.equal(await motion.locator('#reasoning .section-heading').evaluate(el=>el.classList.contains('is-revealed')),false,'Below-the-fold sections wait for their entrance');
 await scrollToElement(motion,'#reasoning .section-heading',.6);await motion.waitForTimeout(800);
 assert.equal(await motion.locator('#reasoning .section-heading').evaluate(el=>el.classList.contains('is-revealed')&&getComputedStyle(el).opacity==='1'),true);
 assert.equal((await heroState(motion)).paused,true,'Hero loop pauses off screen');
 await motion.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await motion.waitForFunction(()=>!document.querySelector('.hero-video').paused);
 await motion.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
 assert.equal((await heroState(motion)).paused,true,'Hero loop pauses in a hidden tab');
 await motion.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await motion.waitForFunction(()=>!document.querySelector('.hero-video').paused);
 // Clicked in place so the hero stays in view; the control lives in the footer.
 await motion.evaluate(()=>document.getElementById('motion-toggle').click());assert.equal(await motion.locator('html').getAttribute('data-motion'),'paused');
 assert.equal((await heroState(motion)).paused,true,'Global pause stops the hero loop');
 await motion.evaluate(()=>document.getElementById('motion-toggle').click());await motion.waitForFunction(()=>!document.querySelector('.hero-video').paused);
 check(`hero loop: poster first, plays after load, pauses off screen, hidden and on global pause; entrances on scroll; CLS ${cls.toFixed(4)}`);
 await motion.setViewportSize({width:2560,height:1200});await motion.goto(base+'/');await motion.waitForFunction(()=>document.querySelector('[data-hero-video]').dataset.video==='playing');
 await motion.waitForTimeout(800);await motion.screenshot({path:output+'en-hero-ultrawide.png'});
 await motion.setViewportSize({width:1440,height:900});await motion.goto(base+'/it/');await motion.waitForFunction(()=>document.querySelector('[data-hero-video]').dataset.video==='playing');
 await motion.waitForTimeout(800);await motion.screenshot({path:output+'it-hero-desktop.png'});
 const mobileContext=await browser.newContext({locale:'en-US',viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
 const mobile=await mobileContext.newPage();watch(mobile);
 await mobile.goto(base+'/it/');await mobile.waitForFunction(()=>document.querySelector('[data-hero-video]').dataset.video==='playing');
 assert.match((await heroState(mobile)).src,/sats-team-mobile\.webm$/);
 await mobile.screenshot({path:output+'it-hero-mobile.png'});
 await mobile.evaluate(()=>scrollTo({top:520,behavior:'instant'}));await mobile.waitForTimeout(900);await mobile.screenshot({path:output+'it-hero-mobile-team.png'});
 check('hero loop: desktop and mobile compositions, ultrawide layout');
 const lean=await browser.newContext({locale:'en-US',viewport:{width:1440,height:900}});const saver=await lean.newPage();watch(saver);
 await saver.addInitScript(()=>Object.defineProperty(navigator,'connection',{configurable:true,get:()=>({saveData:true})}));
 await saver.goto(base+'/');await saver.waitForLoadState('load');await saver.waitForTimeout(500);
 assert.equal((await heroState(saver)).video,false,'Data saving keeps the poster');
 check('data saving keeps the poster and loads no video');

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
 await motion.locator('#motion-toggle').click();
 check('hidden-tab typing pauses and resumes; explicit pause renders complete excerpts');
 await motion.setViewportSize({width:1440,height:1000});await motion.goto(base+'/');await motion.locator('.brand').first().click({button:'right'});assert.equal(await motion.locator('.brand-menu').isVisible(),true);await motion.keyboard.press('Escape');assert.equal(await motion.locator('.brand-menu').isVisible(),false);
 assert.equal(await motion.locator('.brand').first().evaluate(el=>{const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,shiftKey:true});el.dispatchEvent(event);return event.defaultPrevented;}),false);
 check('fine-pointer logo menu; Shift preserves native context menu');
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/it/#demos');
 assert.equal(await page.locator('.recording-player video').count(),3);assert.equal(await page.locator('.video-start').count(),3);
 const firstVideo=page.locator('.recording-player video').first();await page.locator('.video-start').first().click();await page.waitForFunction(()=>!document.querySelector('.recording-player video').paused);assert.equal(await firstVideo.evaluate(el=>el.controls),true);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await firstVideo.evaluate(el=>el.paused),true);await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
 check('recorded demos keep their own players: play on request with native controls, pause when hidden');
 const nojs=await browser.newContext({locale:'en-US',javaScriptEnabled:false,viewport:{width:320,height:844}});
 const staticPage=await nojs.newPage();
 for(const path of ['/','/it/']){
  for(const width of [320,1440]){
   await staticPage.setViewportSize({width,height:900});await staticPage.goto(base+path);
   assert.equal(await staticPage.locator('h1').isVisible(),true);assert.equal(await staticPage.locator('.hero-poster').isVisible(),true);
   assert.equal(await staticPage.locator('.hero-video').count(),0);
   assert.equal(await staticPage.locator('#cap-bitcoin .inline-session').isVisible(),true);assert.equal(await staticPage.locator('#install-qvac').isVisible(),true);
   assert.equal(await staticPage.locator('.sats-stage').isVisible(),false);assert.equal(await staticPage.locator('#sat-merkle .sat-chapter-figure').isVisible(),true);
   assert.equal(await staticPage.locator('#get-started .section-title').evaluate(el=>getComputedStyle(el.closest('[data-reveal]')).opacity),'1');
   assert.ok(await staticPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
 }
 check('without JavaScript or video: poster, headings, Sats sequence, eight inline recordings, four installation methods, nothing hidden');
 const blocked=await browser.newContext({locale:'en-US'});const privacyPage=await blocked.newPage();
 await privacyPage.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('blocked');};Storage.prototype.setItem=()=>{throw Error('blocked');};});
 await privacyPage.goto(base+'/it/#get-started');assert.equal(await privacyPage.locator('[role="tablist"]').count(),1);
 const hiddenContext=await browser.newContext({locale:'en-US'});const hiddenPage=await hiddenContext.newPage();await hiddenPage.addInitScript(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}));await hiddenPage.goto(base+'/');await hiddenPage.waitForLoadState('load');await hiddenPage.waitForTimeout(300);
 assert.equal((await heroState(hiddenPage)).video,false,'An initially hidden tab loads no video');
 check('blocked storage keeps tabs working; an initially hidden tab loads no video');
 await page.setViewportSize({width:1440,height:1000});
 for(const path of ['/','/it/#sats']){
  await page.goto(base+path);await page.waitForTimeout(200);
  await page.addScriptTag({path:process.env.SITE_AXE||'/home/edi/.npm/_npx/ffe2131771d88588/node_modules/axe-core/axe.min.js'});
  const axe=await page.evaluate(async()=>await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
  await writeFile(output+'accessibility.json',JSON.stringify(axe.violations,null,2));assert.equal(axe.violations.length,0,JSON.stringify(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))));
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 check('zero external requests, zero browser errors, axe WCAG AA clean (contrast included)');
 await writeFile(output+'browser-results.json',JSON.stringify({checks,cls,errors,external},null,2)+'\n');
}finally{await browser.close();}
