/* Local presentation only. No dependencies, tracking or network services. */
(() => {
  'use strict';
  const root = document.documentElement;
  const scenes = [...document.querySelectorAll('.sat-scene')];
  const nav = document.querySelector('.scene-nav');
  const links = [...nav.querySelectorAll('a')];
  const toggle = document.querySelector('.motion-toggle');
  const label = toggle.querySelector('.motion-label');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 761px)');
  let storedPause = false;
  try { storedPause = localStorage.getItem('sats-scenes-motion') === 'paused'; } catch { /* Storage is optional. */ }
  let paused = storedPause || reduced.matches;
  let frame = 0;
  let active = null;
  const visible = new Set();
  const poses = new Map(scenes.map(scene => [scene, { x: 0, y: 0, targetX: 0, targetY: 0 }]));
  root.classList.add('js');
  toggle.hidden = false;

  function updateToggle() {
    root.classList.toggle('motion-paused', paused);
    toggle.setAttribute('aria-pressed', String(paused));
    const text = paused ? 'Riprendi movimento' : 'Pausa movimento';
    label.textContent = text;
    toggle.setAttribute('aria-label', text);
    toggle.firstElementChild.textContent = paused ? '▷' : 'Ⅱ';
    toggle.disabled = reduced.matches;
    if (reduced.matches) toggle.setAttribute('aria-label', 'Movimento ridotto dalle preferenze di sistema');
    if (paused) {
      poses.forEach(pose => { pose.x = pose.y = pose.targetX = pose.targetY = 0; });
      scenes.forEach(scene => {
        ['--rx','--ry','--px','--py','--scroll-y','--travel'].forEach(key => scene.style.removeProperty(key));
      });
    }
    schedule();
  }

  function schedule() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(render);
  }

  function render() {
    frame = 0;
    if (document.hidden) return;
    const height = innerHeight;
    let nearest = null;
    let distance = Infinity;
    let moving = false;
    visible.forEach(scene => {
      const rect = scene.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const delta = Math.abs(center - height / 2);
      if (delta < distance) { distance = delta; nearest = scene; }
      if (paused) return;
      const travel = Math.max(-1, Math.min(1, (center - height / 2) / height));
      scene.style.setProperty('--scroll-y', `${(travel * (pointer.matches ? 24 : 9)).toFixed(2)}px`);
      scene.style.setProperty('--travel', `${(-travel * 36).toFixed(2)}px`);
      const pose = poses.get(scene);
      pose.x += (pose.targetX - pose.x) * .09;
      pose.y += (pose.targetY - pose.y) * .09;
      scene.style.setProperty('--ry', `${(pose.x * 6).toFixed(3)}deg`);
      scene.style.setProperty('--rx', `${(-pose.y * 4).toFixed(3)}deg`);
      scene.style.setProperty('--px', `${(pose.x * 10).toFixed(2)}px`);
      scene.style.setProperty('--py', `${(pose.y * 7).toFixed(2)}px`);
      if (Math.abs(pose.targetX - pose.x) > .001 || Math.abs(pose.targetY - pose.y) > .001) moving = true;
    });
    nav.classList.toggle('visible', !!nearest);
    if (nearest !== active) {
      active = nearest;
      links.forEach(link => {
        if (active && link.hash === `#${active.id}`) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    }
    if (moving) schedule();
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) {
        visible.add(target);
        target.classList.add('entered');
      } else {
        visible.delete(target);
        const pose = poses.get(target);
        pose.targetX = pose.targetY = 0;
      }
      target.classList.toggle('in-view', isIntersecting && !document.hidden);
    });
    schedule();
  }, { threshold: 0 });
  scenes.forEach(scene => {
    observer.observe(scene);
    scene.addEventListener('pointermove', event => {
      if (paused || !pointer.matches) return;
      const rect = scene.getBoundingClientRect();
      const pose = poses.get(scene);
      pose.targetX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - .5) * 2));
      pose.targetY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - .5) * 2));
      schedule();
    }, { passive: true });
    scene.addEventListener('pointerleave', () => {
      const pose = poses.get(scene);
      pose.targetX = pose.targetY = 0;
      schedule();
    });
  });
  toggle.addEventListener('click', () => {
    paused = !paused;
    storedPause = paused;
    try { localStorage.setItem('sats-scenes-motion', paused ? 'paused' : 'playing'); } catch { /* Storage is optional. */ }
    updateToggle();
  });
  reduced.addEventListener('change', () => { paused = reduced.matches || storedPause; updateToggle(); });
  pointer.addEventListener('change', () => {
    poses.forEach(pose => { pose.targetX = pose.targetY = 0; });
    schedule();
  });
  document.addEventListener('visibilitychange', () => {
    visible.forEach(scene => scene.classList.toggle('in-view', !document.hidden));
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else schedule();
  });
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  updateToggle();
})();
