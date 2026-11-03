(() => {
  'use strict';

  // Enhancement only: HTML stays readable if this file never loads.
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const ease = 'cubic-bezier(.16,1,.3,1)';
  const exitEase = 'cubic-bezier(.4,0,1,1)';
  const owners = new WeakMap();
  const active = new Set();
  const revealed = new WeakSet();
  const pending = new Set();
  const groups = new WeakMap();
  const profiles = new WeakMap();
  const dialogStates = new WeakMap();
  const disclosureStates = new WeakMap();
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
    let current;
    if (previous && previous.playState !== 'finished') {
      const style = getComputedStyle(element);
      current = { opacity: style.opacity, transform: style.transform };
    }
    cancel(element);
    if (preference.matches) return null;
    keyframes = typeof keyframes === 'function' ? keyframes() : keyframes;
    const { resume = true, ...timing } = options;
    if (current && resume) keyframes = [current, keyframes.at(-1)];
    let animation;
    try {
      animation = element.animate(keyframes, { duration: 480, easing: ease, fill: 'none', ...timing });
    } catch { return null; }
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

  function visible(element) {
    return element && !element.hidden && element.getClientRects().length;
  }

  function enter(element, { x = 0, y = 18, delay = 0, duration = 480, opacity = 0, scale = 1 } = {}) {
    if (!element) return null;
    markRevealed(element);
    if (!visible(element)) { cancel(element); return null; }
    return animate(element, () => {
      const baseline = getComputedStyle(element).transform;
      const transform = baseline === 'none' ? '' : ` ${baseline}`;
      return [
        { opacity, transform: `translate3d(${x}px,${y}px,0) scale(${scale})${transform}` },
        { opacity: 1, transform: baseline }
      ];
    }, { duration, delay: Math.min(Math.max(delay, 0), 180), fill: 'backwards' });
  }

  function stagger(elements, options = {}) {
    elements.forEach((element, index) => enter(element, { delay: Math.min(index * 55, 180), ...options }));
  }

  function openDialog(dialog, source) {
    if (!dialog) return;
    const state = dialogStates.get(dialog) || { token: 0, closing: null };
    state.token += 1;
    state.closing = null;
    state.source = source || state.source;
    dialogStates.set(dialog, state);
    if (!dialog.open) dialog.showModal();
    const menu = dialog.id === 'mobile-menu';
    enter(dialog, { x: menu ? 36 : 0, y: menu ? 0 : 12, scale: menu ? 1 : .985, duration: 340 });
    if (menu) {
      stagger([...dialog.querySelectorAll('.mobile-nav a,.menu-contact')], { x: 16, y: 0, duration: 300 });
    } else {
      const image = dialog.querySelector('img');
      const from = state.source?.getBoundingClientRect();
      const to = image?.getBoundingClientRect();
      const near = from && to && from.width > 0 && to.width > 0;
      const x = near ? Math.max(-45, Math.min(45, (from.left + from.width / 2 - to.left - to.width / 2) * .12)) : 0;
      const y = near ? Math.max(-28, Math.min(28, (from.top + from.height / 2 - to.top - to.height / 2) * .08)) : 10;
      enter(image, { x, y, scale: .96, duration: 420 });
      enter(dialog.querySelector('p'), { y: 8, duration: 260, delay: 90 });
    }
    if (!state.bound) {
      state.bound = true;
      dialog.addEventListener('close', () => {
        state.token += 1;
        state.closing = null;
        cancel(dialog);
        dialog.querySelectorAll('*').forEach(cancel);
      });
    }
  }

  function closeDialog(dialog) {
    if (!dialog?.open) return Promise.resolve();
    const state = dialogStates.get(dialog) || { token: 0, closing: null };
    if (state.closing) return state.closing;
    const token = ++state.token;
    dialogStates.set(dialog, state);
    const menu = dialog.id === 'mobile-menu';
    const animation = animate(dialog, [
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: menu ? 'translate3d(36px,0,0)' : 'translate3d(0,12px,0) scale(.985)' }
    ], { duration: 200, easing: exitEase });
    const finished = animation ? animation.finished.catch(() => {}) : Promise.resolve();
    state.closing = finished.then(() => {
      if (state.token === token) {
        state.closing = null;
        if (dialog.open) dialog.close();
      }
    });
    return state.closing;
  }

  function gallerySnapshot(cards) {
    return new Map(cards.filter(visible).map(card => [card, card.getBoundingClientRect()]));
  }

  function galleryChange(entering, hidden, before = new Map(), retained = []) {
    hidden.forEach(cancel);
    // Batch reads before effects; retain the cards' painted positions during rapid filtering.
    const movements = retained.filter(card => !entering.includes(card) && before.has(card)).map(card => {
      const old = before.get(card);
      cancel(card);
      const next = card.getBoundingClientRect();
      return { card, x: old.left - next.left, y: old.top - next.top };
    });
    movements.forEach(({ card, x, y }) => {
      markRevealed(card);
      if (Math.abs(x) + Math.abs(y) < 1) return;
      animate(card, [
        { opacity: 1, transform: `translate3d(${x}px,${y}px,0)` },
        { opacity: 1, transform: 'none' }
      ], { duration: 360, resume: false });
    });
    stagger(entering, { y: 16, duration: 380 });
  }

  function focusedEntrance(element, direction = 0) {
    if (!element) return;
    if (element.contains(document.activeElement)) {
      // The focused heading stays fixed while new fields explain the change below it.
      markRevealed(element);
      cancel(element);
      const children = [...element.querySelectorAll('.field-grid,.checks,.form-actions,.result-actions,.step-description,.privacy-note,.email-note')];
      stagger(children.filter(child => !child.contains(document.activeElement)), { x: direction * 12, y: direction ? 0 : 10, duration: 290 });
      return;
    }
    enter(element, { x: direction * 16, y: direction ? 0 : 12, duration: 320 });
  }

  const formStep = (element, direction) => focusedEntrance(element, direction < 0 ? -1 : 1);
  const summary = element => focusedEntrance(element);
  function conditional(element) {
    if (visible(element)) enter(element, { y: 8, duration: 260 });
    else if (element) cancel(element);
  }
  function feedback(element) { if (visible(element)) enter(element, { y: 0, opacity: .45, duration: 220 }); }
  function invalid(element) {
    if (!visible(element)) return;
    // A steady cue at the invalid field, never shaking or moving its text.
    animate(element, [
      { outlineColor: 'rgba(244,41,2,.65)', outlineOffset: '4px', outlineWidth: '3px', outlineStyle: 'solid' },
      { outlineColor: 'rgba(244,41,2,0)', outlineOffset: '7px', outlineWidth: '3px', outlineStyle: 'solid' }
    ], { duration: 480, resume: false });
  }

  window.RCMotion = Object.freeze({ openDialog, closeDialog, gallerySnapshot, galleryChange, formStep, summary, conditional, feedback, invalid });

  function toggleDisclosure(details) {
    const state = disclosureStates.get(details) || { token: 0, target: details.open, overflow: details.style.overflow };
    const opening = !(state.animating ? state.target : details.open);
    const start = details.getBoundingClientRect().height;
    const token = ++state.token;
    state.target = opening;
    state.animating = true;
    disclosureStates.set(details, state);
    cancel(details);
    details.open = opening;
    const end = details.getBoundingClientRect().height;
    details.open = true;
    details.style.overflow = 'hidden';
    const animation = animate(details, [{ height: `${start}px` }, { height: `${end}px` }], { duration: opening ? 300 : 220, easing: opening ? ease : exitEase, resume: false });
    const finished = animation ? animation.finished.catch(() => {}) : Promise.resolve();
    finished.then(() => {
      if (state.token !== token) return;
      details.style.overflow = state.overflow;
      details.open = opening;
      state.animating = false;
    });
    if (opening) stagger([...details.children].filter(child => child.tagName !== 'SUMMARY'), { y: 8, duration: 240 });
  }

  function profile(element) {
    if (element.closest('.localities,.locality-copy,.legal,.footer')) return { y: 10, duration: 320, opacity: .3 };
    if (element.matches('h1,h2')) return { y: 26, duration: 620 };
    if (element.matches('.label,.breadcrumb')) return { y: 8, duration: 320 };
    if (element.matches('.btn,.text-link')) return { y: 12, duration: 400, scale: .985 };
    if (element.matches('.story-photo,.service-hero-photo,.photo-grid figure,.person')) return { y: 28, duration: 650, opacity: .2 };
    if (element.matches('.service-visual,.quote,.process-item')) return { y: 24, duration: 560 };
    if (element.closest('.client-names')) return { y: 10, duration: 370 };
    return { y: 14, duration: 420 };
  }

  function boot() {
    // Reserve the opening sequence for the promise, explanation and primary action.
    const opening = [...document.querySelectorAll('.hero-inner h1,.hero-copy > p,.hero-copy .buttons > a,.hero-scroll,.hero-note,.page-head > .label,.page-head > h1,.page-head > p,.page-head > .btn,.service-hero > div:first-child > h1,.service-hero > div:first-child > p,.service-hero > div:first-child > .btn')];
    const openingSet = new Set(opening);
    const blockSelector = [
      '.service-pair > .service-visual', '.service-rows > .service-row', '.photo-grid > figure',
      '.gallery > .gallery-item', '.quote-grid > .quote', '.process > .process-item', '.faq > details',
      '.localities > a', '.footer-main > div', '.footer-bottom > *', '.related > a',
      '.about-people > .person', '.story-photo', '.values > div', '.service-hero-photo',
      '.check-list > li', '.menu-example', '.contact-info > .contact-person', '.contact-primary', '.form-panel',
      '.client-names > *', '.gallery-filters', '.breadcrumb'
    ].join(',');
    const blocks = [...document.querySelectorAll(blockSelector)];
    const candidates = new Set(blocks);
    document.querySelectorAll('main h1, main h2, main h3, main p, main .label, main .text-link, main .btn').forEach(element => {
      if (element.closest('dialog,.form-panel')) return;
      if (element.tagName !== 'P' && element.closest('p')) return;
      if (blocks.some(parent => parent !== element && parent.contains(element))) return;
      if (element.parentElement?.closest('h1,h2,h3')) return;
      candidates.add(element);
    });
    const groupSelector = '.service-pair,.service-rows,.photo-grid,.gallery,.quote-grid,.process,.faq,.localities,.footer-main,.footer-bottom,.related,.about-people,.values,.client-names,.check-list,.hero-copy,.intro-grid,.story-copy,.service-text,.locality-copy,.legal,.contact-grid,.cta-grid,section,.wrap';
    observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      const ranks = new Map();
      entries.filter(entry => entry.isIntersecting).sort((a, b) => {
        const role = element => element.matches('.label') ? 0 : element.matches('h1,h2') ? 1 : 2;
        return role(a.target) - role(b.target);
      }).forEach(entry => {
        const element = entry.target;
        if (revealed.has(element)) return;
        if (element.contains(document.activeElement)) { markRevealed(element); return; }
        const group = groups.get(element);
        const rank = ranks.get(group) || 0;
        ranks.set(group, rank + 1);
        enter(element, { ...profiles.get(element), delay: rank * 55 });
      });
    }, { threshold: .08, rootMargin: '0px 0px -24px 0px' }) : null;
    candidates.forEach(element => {
      if (openingSet.has(element)) return;
      groups.set(element, element.closest(groupSelector) || document.body);
      profiles.set(element, profile(element));
      if (preference.matches || !observer) { markRevealed(element); return; }
      pending.add(element);
      observer.observe(element);
    });
    stagger([...document.querySelectorAll('.topbar .brand,.topbar .nav,.topbar .header-actions')], { y: 8, duration: 360 });
    opening.forEach((element, index) => {
      const rect = element.getBoundingClientRect();
      if (rect.top < (window.innerHeight || 900) && rect.bottom > 0) enter(element, { ...profile(element), delay: index * 60 });
      else if (observer && !preference.matches) {
        profiles.set(element, profile(element));
        groups.set(element, element.closest(groupSelector) || document.body);
        pending.add(element);
        observer.observe(element);
      } else markRevealed(element);
    });
    const heroImage = document.querySelector('.hero-picture img');
    if (heroImage && !preference.matches) animate(heroImage, [{ transform: 'scale(1.045)' }, { transform: 'scale(1)' }], { duration: 1200 });
    const mobileBar = document.querySelector('.mobile-bar');
    if (mobileBar) enter(mobileBar, { y: 14, duration: 380, delay: 120 });
    document.querySelectorAll('.faq details').forEach(details => {
      const summaryElement = details.querySelector('summary');
      summaryElement?.addEventListener('click', event => {
        if (preference.matches || typeof details.animate !== 'function') return;
        event.preventDefault();
        toggleDisclosure(details);
      });
      details.addEventListener('toggle', () => {
        const state = disclosureStates.get(details);
        if (state?.animating) return;
        if (state) state.target = details.open;
        if (details.open) stagger([...details.children].filter(child => child.tagName !== 'SUMMARY'), { y: 8, duration: 240 });
        else [...details.children].forEach(cancel);
      });
    });
    document.addEventListener('focusin', event => {
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
    // Content stays settled when motion is enabled again; new interactions can animate.
  }
  if (typeof preference.addEventListener === 'function') preference.addEventListener('change', updatePreference);
  else preference.addListener(updatePreference);
  window.addEventListener('pagehide', () => { for (const animation of active) animation.cancel(); active.clear(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
