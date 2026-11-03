(() => {
  'use strict';

  // The page is readable without this file. No layout or persistent visibility is controlled here.
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const ease = 'cubic-bezier(.16,1,.3,1)';
  const owners = new WeakMap();
  const active = new Set();
  const revealed = new WeakSet();
  const pending = new Set();
  const groups = new WeakMap();
  const dialogStates = new WeakMap();
  let observer;

  function cancel(element) {
    const animation = owners.get(element);
    if (!animation) return;
    animation.cancel();
    active.delete(animation);
    owners.delete(element);
  }

  function animate(element, keyframes, options = {}) {
    if (!element || !element.isConnected || typeof element.animate !== 'function') return null;
    const previous = owners.get(element);
    // Read before cancelling so an interrupted interaction continues from the visible value.
    let current;
    if (previous && previous.playState !== 'finished') {
      const style = getComputedStyle(element);
      current = { opacity: style.opacity, transform: style.transform };
    }
    cancel(element);
    if (preference.matches) return null;
    // A factory reads the CSS rest transform after cancel, never a previous animated midpoint.
    keyframes = typeof keyframes === 'function' ? keyframes() : keyframes;
    if (current) keyframes = [current, keyframes.at(-1)];
    let animation;
    try {
      animation = element.animate(keyframes, { duration: 650, easing: ease, fill: 'none', ...options });
    } catch {
      return null;
    }
    owners.set(element, animation);
    active.add(animation);
    animation.finished.catch(() => {}).finally(() => {
      active.delete(animation);
      if (owners.get(element) === animation) owners.delete(element);
    });
    return animation;
  }

  function markRevealed(element) {
    revealed.add(element);
    pending.delete(element);
    observer?.unobserve(element);
  }

  function enter(element, { x = 0, y = 24, delay = 0, duration = 650 } = {}) {
    if (!element) return null;
    markRevealed(element);
    if (element.hidden || !element.getClientRects().length) { cancel(element); return null; }
    return animate(element, () => {
      const baseline = getComputedStyle(element).transform;
      const transform = baseline === 'none' ? '' : ` ${baseline}`;
      return [
        { opacity: 0, transform: `translate3d(${x}px,${y}px,0)${transform}` },
        { opacity: 1, transform: baseline }
      ];
    }, { duration, delay: Math.min(Math.max(delay, 0), 240), fill: 'backwards' });
  }

  function stagger(elements, options = {}) {
    elements.forEach((element, index) => enter(element, { ...options, delay: Math.min(index * 60, 240) }));
  }

  function openDialog(dialog) {
    if (!dialog) return;
    const state = dialogStates.get(dialog) || { token: 0, closing: null };
    state.token += 1;
    state.closing = null;
    dialogStates.set(dialog, state);
    if (!dialog.open) dialog.showModal();
    enter(dialog, { x: dialog.id === 'mobile-menu' ? 24 : 0, y: dialog.id === 'mobile-menu' ? 0 : 14, duration: 300 });
  }

  function closeDialog(dialog) {
    if (!dialog?.open) return Promise.resolve();
    const state = dialogStates.get(dialog) || { token: 0, closing: null };
    if (state.closing) return state.closing;
    const token = ++state.token;
    dialogStates.set(dialog, state);
    const horizontal = dialog.id === 'mobile-menu';
    const animation = animate(dialog, [
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: horizontal ? 'translate3d(18px,0,0)' : 'translate3d(0,10px,0)' }
    ], { duration: 190 });
    const finished = animation ? animation.finished.catch(() => {}) : Promise.resolve();
    state.closing = finished.then(() => {
      if (state.token === token) {
        if (dialog.open) dialog.close();
        state.closing = null;
      }
    });
    return state.closing;
  }

  function galleryChange(entering, hidden) {
    hidden.forEach(cancel);
    // Existing visible cards remain untouched when selecting the same or a narrower filter.
    stagger(entering, { y: 20, duration: 480 });
  }

  function formStep(element, direction) {
    enter(element, { x: direction < 0 ? -18 : 18, y: 0, duration: 360 });
  }

  function summary(element) {
    enter(element, { y: 18, duration: 430 });
  }

  window.RCMotion = Object.freeze({ openDialog, closeDialog, galleryChange, formStep, summary });

  function boot() {
    const blockSelector = [
      '.service-pair > .service-visual', '.service-rows > .service-row', '.photo-grid > figure',
      '.gallery > .gallery-item', '.quote-grid > .quote', '.process > .process-item', '.faq > details',
      '.localities > a', '.footer-main > div', '.footer-bottom > *', '.related > a',
      '.about-people > .person', '.story-photo', '.values > div', '.service-hero-photo',
      '.check-list', '.menu-example', '.contact-info > .contact-person', '.form-panel', '.hero-note'
    ].join(',');
    const blocks = [...document.querySelectorAll(blockSelector)];
    const groupSelector = '.service-pair,.service-rows,.photo-grid,.gallery,.quote-grid,.process,.faq,.localities,.footer-main,.footer-bottom,.related,.about-people,.values,.hero-copy,.intro-grid,.story-copy,.service-text,.service-body,.contact-grid,.cta-grid,section,.wrap';
    const candidates = new Set(blocks);
    document.querySelectorAll('main h1, main h2, main h3, main p, main .label, main .text-link, main .btn').forEach(element => {
      if (element.closest('dialog, .form-panel')) return;
      if (blocks.some(parent => parent !== element && parent.contains(element))) return;
      if (element.parentElement?.closest('h1,h2,h3')) return;
      candidates.add(element);
    });

    observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      const ranks = new Map();
      entries.filter(entry => entry.isIntersecting).forEach(entry => {
        const element = entry.target;
        if (revealed.has(element)) return;
        if (element.contains(document.activeElement)) { markRevealed(element); return; }
        const group = groups.get(element);
        const rank = ranks.get(group) || 0;
        ranks.set(group, rank + 1);
        enter(element, { delay: rank * 60 });
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }) : null;

    candidates.forEach(element => {
      groups.set(element, element.closest(groupSelector) || document.body);
      if (preference.matches || !observer) { markRevealed(element); return; }
      pending.add(element);
      observer.observe(element);
    });

    // Headings stay whole blocks: accents and Czech glyphs never pass through a clipping mask.
    const header = [...document.querySelectorAll('.topbar .brand,.topbar .nav,.topbar .header-actions')];
    stagger(header, { y: 12, duration: 430 });
    const hero = [...document.querySelectorAll('.hero-inner h1,.hero-copy > p,.hero-copy .buttons > a,.hero-scroll,.hero-note')];
    stagger(hero, { y: 26 });
    const mobileBar = document.querySelector('.mobile-bar');
    if (mobileBar) enter(mobileBar, { y: 18, duration: 420 });

    document.querySelectorAll('.faq details').forEach(details => details.addEventListener('toggle', () => {
      if (details.open) stagger([...details.children].filter(child => child.tagName !== 'SUMMARY'), { y: 12, duration: 300 });
      else [...details.children].forEach(cancel);
    }));

    document.addEventListener('focusin', event => {
      // Keyboard navigation is immediate and never waits for an entrance animation.
      for (const element of pending) if (element.contains(event.target)) { cancel(element); markRevealed(element); }
      for (const animation of [...active]) {
        const element = animation.effect?.target;
        if (element instanceof Element && element.tagName !== 'DIALOG' && element.contains(event.target)) cancel(element);
      }
    });
  }

  function updatePreference() {
    if (!preference.matches) return;
    for (const animation of active) animation.cancel();
    active.clear();
    observer?.disconnect();
    for (const element of pending) markRevealed(element);
  }
  if (typeof preference.addEventListener === 'function') preference.addEventListener('change', updatePreference);
  else preference.addListener(updatePreference);
  window.addEventListener('pagehide', () => { for (const animation of active) animation.cancel(); active.clear(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
