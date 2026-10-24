/* Original motion implementation. No runtime dependencies or network requests. */
(() => {
  'use strict';
  const root = document.documentElement;
  const data = JSON.parse(document.getElementById('site-data').textContent);
  const t = data.ui;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 1024px)');
  const readPreference = (storage, key) => { try { return window[storage].getItem(key); } catch { return null; } };
  const savePreference = (storage, key, value) => { try { window[storage].setItem(key, value); } catch { /* Privacy mode keeps the default. */ } };
  let paused = reduced.matches || readPreference('localStorage', 'bitcode-motion') === 'paused';
  let introTimers = [];
  let introFull = true;
  let activeStory = 'bitcoin';
  let frame = 0;
  const players = [];
  root.classList.add('js');
  if (paused) root.dataset.motion = 'paused';

  // A player retains the exact character/line position across visibility changes.
  // Screen readers receive the complete static excerpt, never partial typing.
  class SessionPlayer {
    constructor(element) {
      this.element = element;
      this.lines = data.sessions[element.dataset.session].lines;
      this.line = 0; this.character = 0; this.timer = 0; this.row = null;
      this.started = false; this.finished = false; this.visible = false;
    }
    allowed() {
      const mode = this.element.dataset.player;
      return !paused && !document.hidden && this.visible &&
        (mode === 'hero' ? introFull : mode === 'sticky' ? desktop.matches && this.element.dataset.session === activeStory : !desktop.matches);
    }
    update() {
      clearTimeout(this.timer);
      if (!this.allowed() || this.finished) return;
      if (!this.started) { this.element.replaceChildren(); this.started = true; }
      this.tick();
    }
    tick() {
      if (!this.allowed()) return;
      if (this.line >= this.lines.length) { this.finished = true; return; }
      const source = this.lines[this.line];
      if (!this.row) {
        this.row = document.createElement('div');
        this.row.className = 'hero-cli-line' + (source.className ? ' hero-cli-line--' + source.className : '');
        this.element.appendChild(this.row);
      }
      if (source.type && this.character < source.text.length) {
        this.character += 1;
        this.row.textContent = source.text.slice(0, this.character);
        const cursor = document.createElement('span'); cursor.className = 'hero-cli-cursor'; this.row.appendChild(cursor);
        this.timer = setTimeout(() => this.tick(), 22);
      } else {
        this.row.textContent = source.text || '\u00a0';
        this.line += 1; this.character = 0; this.row = null;
        this.timer = setTimeout(() => this.tick(), source.wait || 200);
      }
    }
    finish() {
      clearTimeout(this.timer);
      this.element.replaceChildren(...this.lines.map(source => {
        const row = document.createElement('div'); row.className = 'hero-cli-line'; row.textContent = source.text || '\u00a0'; return row;
      }));
      this.started = true; this.finished = true;
    }
  }
  document.querySelectorAll('[data-session]').forEach(element => players.push(new SessionPlayer(element)));
  const refreshPlayers = () => players.forEach(player => player.update());

  function completeIntro() {
    introTimers.forEach(clearTimeout); introTimers = [];
    root.dataset.intro = 'full'; introFull = true;
    savePreference('sessionStorage', 'bitcode-intro', 'seen');
    refreshPlayers(); queueFrame();
  }
  const skipIntro = paused || scrollY > 0 || location.hash || document.hidden || readPreference('sessionStorage','bitcode-intro');
  if (!skipIntro) {
    introFull = false; root.dataset.intro = 'staged';
    introTimers.push(setTimeout(() => { root.dataset.intro = 'headline'; }, 1660));
    introTimers.push(setTimeout(() => { root.dataset.intro = 'collapsing'; }, 2780));
    introTimers.push(setTimeout(completeIntro, 3550));
    introTimers.push(setTimeout(completeIntro, 10000));
  } else completeIntro();
  document.querySelector('.site-header').addEventListener('pointerenter', () => { root.dataset.navVisible = ''; });
  document.addEventListener('pointermove', event => { if (event.clientY <= 96) root.dataset.navVisible = ''; }, { passive: true });
  document.addEventListener('focusin', () => { if (!introFull) completeIntro(); });
  document.addEventListener('pointerdown', () => { if (!introFull) completeIntro(); }, { passive: true, once: true });
  addEventListener('hashchange', () => { if (!introFull) completeIntro(); queueFrame(); });

  const cards = [...document.querySelectorAll('[data-story]')];
  const headings = cards.map(card => card.querySelector('h3'));
  const fades = [...document.querySelectorAll('[data-fade]')];
  const stages = [...document.querySelectorAll('[data-stage]')];
  const terminal = document.getElementById('terminal');
  const rail = document.querySelector('.story-sticky');
  const navLinks = [...document.querySelectorAll('.nav-link[href^="#"]')];
  const navSections = navLinks.map(link => document.querySelector(link.hash));
  const tabs = [...document.querySelectorAll('[data-install-tab]')];
  let selectedTab = tabs[0];
  const tabList = document.querySelector('.install-tabs');
  const clamp = value => Math.max(0, Math.min(1,value));

  // One scroll listener and one resize listener feed one RAF. Read geometry first.
  // Scroll/resize style writes are exclusively CSS custom properties.
  function updateFrame() {
    frame = 0;
    const vh = innerHeight;
    if (!introFull && scrollY > 0) completeIntro();
    const progress = paused ? 1 : clamp(scrollY / (desktop.matches ? 300 : 220));
    const fadeValues = fades.map(el => {
      const r = el.getBoundingClientRect();
      // Use each section's opening viewport-sized block so long sections remain readable.
      const center = r.top + Math.min(r.height,vh) / 2;
      return paused ? 1 : clamp((1.4 * vh - center) / (.85 * vh));
    });
    const headingTops = headings.map(el => el.getBoundingClientRect().top);
    const stageTops = stages.map(el => el.getBoundingClientRect().top);
    const navTops = navSections.map(el => el.getBoundingClientRect().top);
    const tabRect = selectedTab.getBoundingClientRect();
    const listRect = tabList.getBoundingClientRect();
    let nextStory = 0;
    headingTops.forEach((top,i) => { if (top <= vh * .5) nextStory = i; });
    root.style.setProperty('--intro-progress',String(progress));
    root.style.setProperty('--sections-opacity',String(paused ? 1 : clamp((progress - .8)/.2)));
    terminal.style.setProperty('--hero-x', (desktop.matches ? -40 : 0) + 'px');
    terminal.style.setProperty('--hero-scale',desktop.matches ? '.08' : '.04');
    fades.forEach((el,i) => el.style.setProperty('--fade',String(fadeValues[i])));
    stages.forEach((el,i) => el.style.setProperty('--stage-progress',String(paused ? 1 : clamp((vh * .9 - stageTops[i])/(vh * .35) - i * .1))));
    rail.style.setProperty('--rail-release',Math.min(0,headingTops[headingTops.length-1] - vh*.2)+'px');
    tabList.style.setProperty('--tab-x',Math.round(tabRect.left-listRect.left)+'px');
    tabList.style.setProperty('--tab-width',Math.round(tabRect.width)+'px');
    const nextId = cards[nextStory].dataset.story;
    if (nextId !== activeStory || !document.querySelector('[data-panel][data-active]')) {
      activeStory = nextId;
      cards.forEach(card => card.classList.toggle('is-active',card.dataset.story===activeStory));
      document.querySelectorAll('[data-panel]').forEach(panel => {
        const active=panel.dataset.panel===activeStory; panel.toggleAttribute('data-active',active); panel.inert=!active;
      });
      refreshPlayers();
    }
    let activeNav = -1;
    navTops.forEach((top,i) => { if (top < vh * .45) activeNav = i; });
    navLinks.forEach((link,i) => i === activeNav ? link.setAttribute('aria-current','location') : link.removeAttribute('aria-current'));
  }
  function queueFrame() { if (!frame) frame = requestAnimationFrame(updateFrame); }
  addEventListener('scroll', queueFrame, { passive: true });
  addEventListener('resize', queueFrame, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(queueFrame).observe(tabList);
  document.fonts.ready.then(queueFrame);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { const p=players.find(p=>p.element===entry.target); if(p){p.visible=entry.isIntersecting;p.update();} });
    },{threshold:.18});
    players.forEach(player => observer.observe(player.element));
  } else players.forEach(player => player.finish());
  desktop.addEventListener('change', () => { closeMenu(); refreshPlayers(); queueFrame(); });

  function setMotion(value) {
    paused = value || reduced.matches;
    root.dataset.motion = paused ? 'paused' : 'playing';
    if(paused){completeIntro();players.forEach(p=>p.finish());}
    motionToggle.textContent = paused ? t.motionResume : t.motionPause;
    motionToggle.setAttribute('aria-pressed',String(paused));
    refreshPlayers();queueFrame();
  }
  const motionToggle=document.getElementById('motion-toggle');motionToggle.hidden=false;
  motionToggle.addEventListener('click',()=>{setMotion(!paused);savePreference('localStorage','bitcode-motion',paused?'paused':'playing');});
  reduced.addEventListener('change',()=>setMotion(reduced.matches||readPreference('localStorage','bitcode-motion')==='paused'));
  setMotion(paused);

  // Accessible tab enhancement. With no JS all four panels remain readable.
  tabList.setAttribute('role','tablist');
  const panels=[...document.querySelectorAll('[data-install-panel]')];
  panels.forEach(panel=>{panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','tab-'+panel.id.replace('install-',''));panel.tabIndex=0;});
  function selectTab(tab,focus=false) {
    selectedTab=tab;
    tabs.forEach(item=>{const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;});
    panels.forEach(panel=>{panel.hidden=panel.id!=='install-'+tab.dataset.installTab;});
    if(focus)tab.focus();queueFrame();
  }
  tabs.forEach((tab,i)=>{
    tab.setAttribute('role','tab');tab.setAttribute('aria-controls','install-'+tab.dataset.installTab);
    tab.addEventListener('click',event=>{event.preventDefault();selectTab(tab);});
    tab.addEventListener('keydown',event=>{
      const next=event.key==='ArrowRight'?(i+1)%tabs.length:event.key==='ArrowLeft'?(i+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;
      if(next>=0){event.preventDefault();selectTab(tabs[next],true);}
      else if(event.key===' '){event.preventDefault();selectTab(tab);}
    });
  });
  selectTab(selectedTab);

  // Mobile sheet, focus containment, Escape, and scroll lock.
  const menu=document.getElementById('site-nav');
  const menuButton=document.querySelector('.menu-toggle');
  const inertTargets=[document.querySelector('main'),document.querySelector('footer'),document.querySelector('.site-preferences')];
  function closeMenu(returnFocus=false) {
    menu.classList.remove('is-open');root.removeAttribute('data-menu-open');
    menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label',t.openNav);
    inertTargets.forEach(el=>{el.inert=false;});
    if(returnFocus)menuButton.focus();
  }
  menuButton.addEventListener('click',()=>{
    if(menuButton.getAttribute('aria-expanded')==='true')return closeMenu(true);
    menu.classList.add('is-open');root.dataset.menuOpen='';menuButton.setAttribute('aria-expanded','true');menuButton.setAttribute('aria-label',t.closeNav);inertTargets.forEach(el=>{el.inert=true;});menu.querySelector('a').focus();
  });
  document.addEventListener('keydown',event=>{
    if(menuButton.getAttribute('aria-expanded')!=='true')return;
    if(event.key==='Escape'){event.preventDefault();closeMenu(true);}
    if(event.key==='Tab'){
      const focusable=[...document.querySelectorAll('.site-header a,.site-header button')].filter(el=>el.getClientRects().length);
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  document.querySelectorAll('.site-header a').forEach(link=>link.addEventListener('click',()=>closeMenu()));
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.site-header'))closeMenu();},{passive:true});

  // Preserve section hashes when switching to the other static language page.
  function languageLinks(){document.querySelectorAll('[data-language]').forEach(link=>{link.href=(link.dataset.language==='it'?'/it/':'/')+location.hash;if(link.dataset.language===data.lang&&link.closest('.language-switch'))link.setAttribute('aria-current','page');});}
  languageLinks();addEventListener('hashchange',languageLinks);
  const banner=document.querySelector('.language-banner');
  if(data.lang==='en'&&navigator.language.toLowerCase().startsWith('it')&&!readPreference('localStorage','bitcode-language-dismissed'))banner.hidden=false;
  banner.querySelector('button').addEventListener('click',()=>{banner.hidden=true;savePreference('localStorage','bitcode-language-dismissed','yes');});

  const status=document.getElementById('copy-status');let toastTimer;
  function announce(message){clearTimeout(toastTimer);status.textContent=message;toastTimer=setTimeout(()=>{status.textContent='';},4500);}
  const copyTimers=new WeakMap();
  document.querySelectorAll('[data-copy]').forEach(button=>{
    button.hidden=false;button.addEventListener('click',async()=>{
      const source=document.getElementById(button.dataset.copy);button.disabled=true;
      try{
        if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
        await navigator.clipboard.writeText(source.textContent);clearTimeout(copyTimers.get(button));
        button.dataset.copied='true';button.querySelector('use').setAttribute('href','#i-check');announce(t.copied);
        copyTimers.set(button,setTimeout(()=>{delete button.dataset.copied;button.querySelector('use').setAttribute('href','#i-copy');},2200));
      }catch{
        const range=document.createRange();range.selectNodeContents(source);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);announce(t.copyFail);
      }finally{button.disabled=false;}
    });
  });

  // Native playback is retained. Video bytes are requested only on user action.
  const videos=[...document.querySelectorAll('video')];
  videos.forEach(video=>{
    const message=video.parentElement.querySelector('.video-message');
    const start=document.createElement('button');start.type='button';start.className='video-start';
    start.setAttribute('aria-label',t.play+': '+video.getAttribute('aria-label'));
    const label=document.createElement('span');label.textContent='▶  '+t.play;start.appendChild(label);video.parentElement.appendChild(start);
    video.controls=false;
    const failed=()=>{message.textContent=t.videoFail;start.hidden=false;video.controls=true;};
    start.addEventListener('click',async()=>{video.controls=true;try{await video.play();video.focus();}catch{failed();}});
    video.addEventListener('playing',()=>{start.hidden=true;message.textContent='';});
    video.addEventListener('play',()=>videos.forEach(other=>{if(other!==video)other.pause();}));
    video.addEventListener('waiting',()=>{message.textContent=t.loading;});
    ['canplay','pause'].forEach(name=>video.addEventListener(name,()=>{message.textContent='';}));
    video.addEventListener('ended',()=>{start.hidden=false;label.textContent='↻  '+t.replay;message.textContent='';});
    video.addEventListener('error',failed);video.querySelectorAll('source').forEach(source=>source.addEventListener('error',failed));
  });

  // A fine-pointer-only logo menu; Shift keeps the browser's native menu.
  const brandMenu=document.querySelector('.brand-menu');let menuOrigin=null;
  function hideBrand(){brandMenu.hidden=true;}
  document.querySelectorAll('.brand,.genesis-trigger').forEach(brand=>brand.addEventListener('contextmenu',event=>{
    if(event.shiftKey||!matchMedia('(pointer: fine)').matches)return;
    event.preventDefault();menuOrigin=brand;brandMenu.style.setProperty('--menu-x',Math.min(event.clientX,innerWidth-190)+'px');brandMenu.style.setProperty('--menu-y',Math.min(event.clientY,innerHeight-156)+'px');brandMenu.hidden=false;brandMenu.querySelector('button').focus();
  }));
  brandMenu.querySelector('[data-logo-copy]').addEventListener('click',async()=>{
    try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');const svg=document.getElementById('pixel-b');await navigator.clipboard.writeText('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 5" shape-rendering="crispEdges">'+svg.innerHTML+'</svg>');announce(t.svgCopied);}catch{announce(t.svgFailed);}hideBrand();menuOrigin?.focus();
  });
  document.addEventListener('pointerdown',event=>{if(!brandMenu.contains(event.target))hideBrand();},{passive:true});
  brandMenu.addEventListener('keydown',event=>{if(event.key==='Escape'){hideBrand();menuOrigin?.focus();}if(event.key==='Tab')hideBrand();});

  // Explicitly historical, separate from the recorded agent session.
  const genesis=document.getElementById('genesis-dialog');const trigger=document.querySelector('.genesis-trigger');
  trigger.hidden=false;
  const openGenesis=()=>{if(!genesis.open){genesis.showModal();savePreference('sessionStorage','bitcode-genesis','open');}};
  trigger.addEventListener('click',openGenesis);
  function closeGenesis(){genesis.close();savePreference('sessionStorage','bitcode-genesis','dismissed');}
  genesis.querySelector('[data-genesis-close]').addEventListener('click',closeGenesis);
  genesis.addEventListener('cancel',()=>savePreference('sessionStorage','bitcode-genesis','dismissed'));
  genesis.addEventListener('close',()=>trigger.focus({preventScroll:true}));
  genesis.addEventListener('click',event=>{if(event.target===genesis){const r=genesis.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeGenesis();}});
  let typed='';
  document.addEventListener('keydown',event=>{if(event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,textarea,[contenteditable],dialog'))return;if(event.key.length===1){typed=(typed+event.key).slice(-8);if(typed==='/genesis'){openGenesis();typed='';}}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){completeIntro();videos.forEach(v=>v.pause());}refreshPlayers();});
  queueFrame();
})();
