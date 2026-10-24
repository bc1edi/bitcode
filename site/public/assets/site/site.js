/* Original motion implementation. No runtime dependencies or network requests to other origins. */
(() => {
  'use strict';
  const root = document.documentElement;
  const data = JSON.parse(document.getElementById('site-data').textContent);
  const t = data.ui;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 1024px)');
  const compact = matchMedia('(max-width: 800px)');
  const saveData = navigator.connection?.saveData === true;
  const readPreference = (storage, key) => { try { return window[storage].getItem(key); } catch { return null; } };
  const savePreference = (storage, key, value) => { try { window[storage].setItem(key, value); } catch { /* Privacy mode keeps the default. */ } };
  let paused = reduced.matches || readPreference('localStorage', 'bitcode-motion') === 'paused';
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
        (mode === 'hero' ? true : mode === 'sticky' ? desktop.matches && this.element.dataset.session === activeStory : !desktop.matches);
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

  const cards = [...document.querySelectorAll('[data-story]')];
  const headings = cards.map(card => card.querySelector('h3'));
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
    const headingTops = headings.map(el => el.getBoundingClientRect().top);
    const navTops = navSections.map(el => el.getBoundingClientRect().top);
    const tabRect = selectedTab.getBoundingClientRect();
    const listRect = tabList.getBoundingClientRect();
    let nextStory = 0;
    headingTops.forEach((top,i) => { if (top <= vh * .5) nextStory = i; });
    root.toggleAttribute('data-scrolled', scrollY > 8);
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
    navTops.forEach((top,i) => { if (top < vh * .45 && (activeNav < 0 || top > navTops[activeNav])) activeNav = i; });
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

  // Entrances run once per element. Anything already scrolled past is shown at once.
  const reveals = [...document.querySelectorAll('[data-reveal]')];
  const revealAll = () => reveals.forEach(el => el.classList.add('is-revealed'));
  let revealObserver = null;
  if ('IntersectionObserver' in window && !paused) {
    root.classList.add('reveal');
    revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting || entry.boundingClientRect.top < 0) { entry.target.classList.add('is-revealed'); revealObserver.unobserve(entry.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(el => revealObserver.observe(el));
  } else revealAll();

  // Decorative loops (hero, desktop workspace), separate from the recorded demo players.
  // Each video is created only after the page has loaded, never with reduced motion,
  // data saving or the global pause, and it stops when it leaves the viewport or the tab is hidden.
  let pageLoaded = document.readyState === 'complete';
  const loops = [...document.querySelectorAll('[data-loop-video]')].map(figure => ({ figure, video: null, visible: false }));
  const loopAllowed = loop => pageLoaded && !paused && !saveData && !document.hidden && loop.visible;
  function createLoopVideo(loop) {
    const base = compact.matches && loop.figure.dataset.srcMobile ? loop.figure.dataset.srcMobile : loop.figure.dataset.src;
    const video = document.createElement('video');
    video.className = 'loop-video';
    video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto';
    video.disablePictureInPicture = true; video.tabIndex = -1;
    video.setAttribute('aria-hidden', 'true'); video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
    video.poster = base + '.webp' + (loop.figure.dataset.v ? '?v=' + loop.figure.dataset.v : '');
    [['webm', 'video/webm'], ['mp4', 'video/mp4']].forEach(([extension, type]) => {
      const source = document.createElement('source'); source.src = base + '.' + extension + (loop.figure.dataset.v ? '?v=' + loop.figure.dataset.v : ''); source.type = type; video.appendChild(source);
    });
    video.addEventListener('playing', () => { loop.figure.dataset.video = 'playing'; });
    video.addEventListener('pause', () => { if (loop.figure.dataset.video === 'playing') loop.figure.dataset.video = 'paused'; });
    video.querySelector('source:last-child').addEventListener('error', () => removeLoopVideo(loop));
    loop.figure.appendChild(video);
    return video;
  }
  function removeLoopVideo(loop) {
    if (!loop.video) return;
    loop.video.pause(); loop.video.remove(); loop.video = null; delete loop.figure.dataset.video;
  }
  function updateLoop(loop) {
    if (!loopAllowed(loop)) { loop.video?.pause(); return; }
    loop.video ??= createLoopVideo(loop);
    loop.video.play().catch(() => { /* Autoplay refused: the poster stays. */ });
  }
  const updateLoops = () => loops.forEach(updateLoop);
  if ('IntersectionObserver' in window) {
    const loopObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      const loop = loops.find(item => item.figure === entry.target); loop.visible = entry.isIntersecting; updateLoop(loop);
    }));
    loops.forEach(loop => loopObserver.observe(loop.figure));
  }
  if (!pageLoaded) addEventListener('load', () => { pageLoaded = true; updateLoops(); }, { once: true });
  compact.addEventListener('change', () => loops.forEach(loop => { removeLoopVideo(loop); updateLoop(loop); }));

  // A different Sat greets each visit beside the recording (decorative; the page reads the same without it).
  const heroSat=document.querySelector('[data-hero-sat]');
  if(heroSat){
   const last=readPreference('localStorage','bitcode-hero-sat');
   const choices=data.heroSats.filter(sat=>sat.id!==last);
   const sat=choices[Math.floor(Math.random()*choices.length)];
   savePreference('localStorage','bitcode-hero-sat',sat.id);
   heroSat.dataset.sat=sat.id;heroSat.querySelector('img').src=sat.src;heroSat.querySelector('.hero-sat-line').textContent=sat.line;
   heroSat.querySelector('img').addEventListener('load',()=>{heroSat.hidden=false;},{once:true});
  }

  // The recording sits in a tilted frame that leans a few degrees toward the pointer; its light
  // turns from orange (the card waits) to green once the loop reaches the approval.
  const stage=document.querySelector('[data-hero-stage]');
  const heroLoop=loops.find(loop=>stage?.contains(loop.figure));
  const APPROVED_AT=5.6;
  if(stage&&matchMedia('(pointer: fine)').matches){
   stage.addEventListener('pointermove',event=>{
    if(paused)return;const r=stage.getBoundingClientRect();
    stage.style.setProperty('--lean-x',((event.clientX-r.left)/r.width-.5).toFixed(3));stage.style.setProperty('--lean-y',((event.clientY-r.top)/r.height-.5).toFixed(3));
   },{passive:true});
   stage.addEventListener('pointerleave',()=>{stage.style.setProperty('--lean-x','0');stage.style.setProperty('--lean-y','0');});
  }
  if(heroLoop)heroLoop.figure.addEventListener('timeupdate',event=>{stage.dataset.phase=event.target.currentTime>=APPROVED_AT?'approved':'card';},true);

  let onMotionChange=()=>{};
  function setMotion(value) {
    paused = value || reduced.matches;
    root.dataset.motion = paused ? 'paused' : 'playing';
    if(paused){players.forEach(p=>p.finish());revealAll();}
    motionToggle.textContent = paused ? t.motionResume : t.motionPause;
    motionToggle.setAttribute('aria-pressed',String(paused));
    refreshPlayers();updateLoops();onMotionChange();queueFrame();
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

  // Walkthroughs play muted on their own once half of one is in view (one at a time), and stop when it
  // leaves, when the tab is hidden or on the global pause; never with reduced motion or data saving.
  // A pause by the viewer is respected until they press play again. Native controls stay available.
  const videos=[...document.querySelectorAll('.recording-player video')];
  const autoplayAllowed=()=>!paused&&!saveData&&!document.hidden;
  const visibility=new Map();
  const userPaused=new WeakSet();
  let autoPausing=false;
  const autoPause=video=>{autoPausing=true;video.pause();autoPausing=false;};
  function updateAutoplay(){
    const candidate=videos.filter(video=>(visibility.get(video)||0)>=.5&&!userPaused.has(video)&&!video.ended&&video.getClientRects().length).sort((a,b)=>visibility.get(b)-visibility.get(a))[0];
    videos.forEach(video=>{if(video!==candidate&&!video.paused&&video.muted)autoPause(video);});
    if(!candidate||!autoplayAllowed()||!candidate.paused&&!candidate.muted)return;
    if(videos.some(video=>!video.paused&&!video.muted))return;
    candidate.muted=true;candidate.controls=true;candidate.preload='auto';
    candidate.play().catch(()=>{});
  }
  videos.forEach(video=>{
    const message=video.parentElement.querySelector('.video-message');
    const start=document.createElement('button');start.type='button';start.className='video-start';
    start.setAttribute('aria-label',t.play+': '+video.getAttribute('aria-label'));
    const label=document.createElement('span');label.textContent='▶  '+t.play;start.appendChild(label);video.parentElement.appendChild(start);
    video.controls=false;
    const failed=()=>{message.textContent=t.videoFail;start.hidden=false;video.controls=true;};
    start.addEventListener('click',async()=>{userPaused.delete(video);video.muted=false;video.controls=true;try{await video.play();video.focus();}catch{failed();}});
    video.addEventListener('playing',()=>{start.hidden=true;message.textContent='';video.closest('[data-tilt]')?.setAttribute('data-playing','');});
    video.addEventListener('play',()=>{userPaused.delete(video);videos.forEach(other=>{if(other!==video&&!other.paused)autoPause(other);});});
    video.addEventListener('pause',()=>{if(!autoPausing&&!video.ended)userPaused.add(video);video.closest('[data-tilt]')?.removeAttribute('data-playing');});
    video.addEventListener('waiting',()=>{message.textContent=t.loading;});
    ['canplay','pause'].forEach(name=>video.addEventListener(name,()=>{message.textContent='';}));
    video.addEventListener('ended',()=>{start.hidden=false;label.textContent='↻  '+t.replay;message.textContent='';video.closest('[data-tilt]')?.removeAttribute('data-playing');});
    video.addEventListener('error',failed);video.querySelectorAll('source').forEach(source=>source.addEventListener('error',failed));
  });
  onMotionChange=()=>{if(paused)videos.forEach(video=>{if(!video.paused&&video.muted)autoPause(video);});else updateAutoplay();};
  if('IntersectionObserver' in window){
    // Metadata only as a clip approaches; the full file once it actually plays.
    const near=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting&&entry.target.preload==='none'){entry.target.preload='metadata';near.unobserve(entry.target);}}),{rootMargin:'300px 0px'});
    const half=new IntersectionObserver(entries=>{entries.forEach(entry=>visibility.set(entry.target,entry.intersectionRatio));updateAutoplay();},{threshold:[0,.25,.5,.75,1]});
    videos.forEach(video=>{near.observe(video);half.observe(video);});
  }

  // Video frames share the hero's lean: a few degrees toward a fine pointer, flat on touch screens.
  if(matchMedia('(pointer: fine)').matches)document.querySelectorAll('[data-tilt]').forEach(frame=>{
    frame.addEventListener('pointermove',event=>{
      if(paused)return;const r=frame.getBoundingClientRect();
      frame.style.setProperty('--lean-x',((event.clientX-r.left)/r.width-.5).toFixed(3));frame.style.setProperty('--lean-y',((event.clientY-r.top)/r.height-.5).toFixed(3));
    },{passive:true});
    frame.addEventListener('pointerleave',()=>{frame.style.setProperty('--lean-x','0');frame.style.setProperty('--lean-y','0');});
  });

  // Desktop/CLI recordings: one choice for the whole page, remembered in this browser.
  // Without JavaScript both views stay visible, each labelled.
  const views = [...document.querySelectorAll('[data-view]')];
  const viewButtons = [...document.querySelectorAll('[data-view-tab]')];
  function showView(name) {
    views.forEach(view => { view.hidden = view.dataset.view !== name && !!view.closest('[data-views]')?.querySelector('[data-view-tab]'); });
    viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.viewTab === name)));
    views.filter(view => view.hidden).forEach(view => view.querySelectorAll('video').forEach(video => video.pause()));
    queueFrame();updateAutoplay();
  }
  document.querySelectorAll('.view-switch').forEach(group => { group.hidden = false; });
  viewButtons.forEach(button => button.addEventListener('click', () => { showView(button.dataset.viewTab); savePreference('localStorage', 'bitcode-view', button.dataset.viewTab); }));
  showView(readPreference('localStorage', 'bitcode-view') === 'cli' ? 'cli' : 'desktop');

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
  const genesis=document.getElementById('genesis-dialog');let genesisReturn=null;
  const openGenesis=()=>{if(!genesis.open){genesisReturn=document.activeElement;genesis.showModal();savePreference('sessionStorage','bitcode-genesis','open');}};
  function closeGenesis(){genesis.close();savePreference('sessionStorage','bitcode-genesis','dismissed');}
  genesis.querySelector('[data-genesis-close]').addEventListener('click',closeGenesis);
  genesis.addEventListener('cancel',()=>savePreference('sessionStorage','bitcode-genesis','dismissed'));
  genesis.addEventListener('close',()=>genesisReturn?.focus?.({preventScroll:true}));
  genesis.addEventListener('click',event=>{if(event.target===genesis){const r=genesis.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeGenesis();}});
  let typed='';
  document.addEventListener('keydown',event=>{if(event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,textarea,[contenteditable],dialog'))return;if(event.key.length===1){typed=(typed+event.key).slice(-8);if(typed==='/genesis'){openGenesis();typed='';}}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)videos.forEach(v=>autoPause(v));else updateAutoplay();refreshPlayers();updateLoops();});
  queueFrame();
})();
