(() => {
  'use strict';

  // Motion direction: one lead gesture, steady reading, immediate controls.
  // No element is hidden by a baseline style, an observer, or a pending queue.
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const ease = 'cubic-bezier(.4,0,.2,1)';
  const exitEase = 'cubic-bezier(.4,0,1,1)';
  const owners = new WeakMap();
  const active = new Set();
  const visualEffects = new Set();
  const revealed = new WeakSet();
  const pending = new Set();
  const dialogs = new WeakMap();
  const gallerySets = new WeakMap();
  let observer;

  function cancel(element) {
    const animation = owners.get(element);
    if (!animation) return;
    owners.delete(element);
    active.delete(animation);
    visualEffects.delete(animation);
    animation.cancel();
  }

  function effect(element, frames, options = {}) {
    if (!element?.isConnected || typeof element.animate !== 'function') return null;
    const { spatial = false, visual = false, resume = true, ...timing } = options;
    const previous = owners.get(element);
    const current = previous && previous.playState !== 'finished' ? getComputedStyle(element) : null;
    const sampled = current ? { opacity: current.opacity, transform: current.transform } : null;
    cancel(element);
    if (spatial && preference.matches) return null;
    frames = typeof frames === 'function' ? frames() : frames;
    if (sampled && resume) {
      const end = frames.at(-1);
      const start = {};
      if ('opacity' in end) start.opacity = sampled.opacity;
      if ('transform' in end) start.transform = sampled.transform;
      if (Object.keys(start).length) frames = [start, end];
    }
    let animation;
    try { animation = element.animate(frames, { duration: 180, easing: ease, fill: 'none', ...timing }); }
    catch { return null; }
    owners.set(element, animation);
    active.add(animation);
    if (visual) visualEffects.add(animation);
    animation.finished.catch(() => {}).finally(() => {
      active.delete(animation);
      visualEffects.delete(animation);
      if (owners.get(element) === animation) owners.delete(element);
    });
    return animation;
  }

  const visible = element => element && !element.hidden && element.getClientRects().length;
  function settle(element) {
    revealed.add(element);
    pending.delete(element);
    observer?.unobserve(element);
  }

  function rise(element, distance = 12, duration = 400) {
    settle(element);
    if (!visible(element) || preference.matches || element.contains(document.activeElement) || visualEffects.size >= 2) return;
    const amount = (window.innerWidth || 1024) <= 600 ? distance * .5 : distance;
    effect(element, () => {
      const rest = getComputedStyle(element).transform;
      const suffix = rest === 'none' ? '' : ` ${rest}`;
      return [{ opacity: 1, transform: `translate3d(0,${amount}px,0)${suffix}` }, { opacity: 1, transform: rest }];
    }, { duration, spatial: true, visual: true });
  }

  function cue(element) {
    settle(element);
    if (!visible(element) || preference.matches || visualEffects.size >= 2) return;
    effect(element, [
      { transform: 'none', offset: 0 },
      { transform: 'translate3d(3px,-3px,0)', offset: .45 },
      { transform: 'none', offset: 1 }
    ], { duration: 400, spatial: true, visual: true, resume: false });
  }

  function openDialog(dialog) {
    if (!dialog) return;
    const state = dialogs.get(dialog) || { token: 0, closing: null };
    state.token += 1;
    state.closing = null;
    dialogs.set(dialog, state);
    if (!dialog.open) dialog.showModal();
    const menu = dialog.id === 'mobile-menu';
    const frames = preference.matches ? [{ opacity: .85 }, { opacity: 1 }] : menu
      ? [{ opacity: 1, transform: 'translate3d(20px,0,0)' }, { opacity: 1, transform: 'none' }]
      : [{ opacity: .9, transform: 'scale(.99)' }, { opacity: 1, transform: 'none' }];
    effect(dialog, frames, { duration: preference.matches ? 120 : menu ? 240 : 220 });
    if (!state.bound) {
      state.bound = true;
      dialog.addEventListener('close', () => {
        state.token += 1;
        state.closing = null;
        cancel(dialog);
      });
    }
  }

  function closeDialog(dialog) {
    if (!dialog?.open) return Promise.resolve();
    const state = dialogs.get(dialog) || { token: 0, closing: null };
    if (state.closing) return state.closing;
    const token = ++state.token;
    dialogs.set(dialog, state);
    const menu = dialog.id === 'mobile-menu';
    const frames = preference.matches ? [{ opacity: 1 }, { opacity: .85 }] : [
      { opacity: 1, transform: 'none' },
      { opacity: menu ? 1 : .9, transform: menu ? 'translate3d(20px,0,0)' : 'scale(.99)' }
    ];
    const animation = effect(dialog, frames, { duration: preference.matches ? 120 : 160, easing: exitEase });
    const finished = animation ? animation.finished.catch(() => {}) : Promise.resolve();
    state.closing = finished.then(() => {
      if (state.token !== token) return;
      state.closing = null;
      if (dialog.open) dialog.close();
    });
    return state.closing;
  }

  function galleryChange(cards, hidden = []) {
    hidden.forEach(cancel);
    const gallery = cards[0]?.closest('.gallery');
    if (!gallery) return;
    const before = gallerySets.get(gallery);
    const next = new Set(cards);
    if (before && before.size === next.size && cards.every(card => before.has(card))) return;
    gallerySets.set(gallery, next);
    // The browser lays out real cards immediately. One short fade, no flying/reordered layers.
    effect(gallery, [{ opacity: .85 }, { opacity: 1 }], { duration: preference.matches ? 120 : 160 });
  }

  function conditional(element) {
    if (!visible(element)) { if (element) cancel(element); return; }
    effect(element, [{ opacity: .8 }, { opacity: 1 }], { duration: 120 });
  }
  function feedback(element) {
    if (visible(element)) effect(element, [{ opacity: .65 }, { opacity: 1 }], { duration: 120 });
  }
  function invalid(element) {
    if (!visible(element)) return;
    effect(element, [{ backgroundColor: '#fff0eb' }, { backgroundColor: getComputedStyle(element).backgroundColor }], { duration: 180, resume: false });
  }

  window.RCMotion = Object.freeze({ openDialog, closeDialog, galleryChange, conditional, feedback, invalid });

  function boot() {
    // These are whole visual beats, not a scanner of reading text or controls.
    const visuals = [...document.querySelectorAll('.service-pair,.story-photo,.photo-grid,.service-hero-photo')];
    const cues = [...document.querySelectorAll('.cta-section .btn .arrow')];
    const targets = [...visuals, ...cues];
    const cueSet = new Set(cues);
    observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || revealed.has(entry.target)) continue;
        if (cueSet.has(entry.target)) cue(entry.target);
        else rise(entry.target);
      }
    }, { threshold: .12, rootMargin: '0px' }) : null;
    targets.forEach(element => {
      if (!observer || preference.matches) { settle(element); return; }
      pending.add(element);
      observer.observe(element);
    });
    // Initial headline only. Brand, body copy, background photo and CTAs are steady anchors.
    const hero = document.querySelector('.hero-inner h1');
    if (hero) {
      const rect = hero.getBoundingClientRect();
      if (rect.top < (window.innerHeight || 900) && rect.bottom > 0) rise(hero, 16, 500);
    }
    document.querySelectorAll('.gallery').forEach(gallery => {
      gallerySets.set(gallery, new Set([...gallery.querySelectorAll('.gallery-item')].filter(card => !card.hidden)));
    });
    const preserveControl = event => {
      for (const element of pending) if (element.contains(event.target)) settle(element);
      for (const animation of [...active]) {
        const element = animation.effect?.target;
        if (element instanceof Element && element.tagName !== 'DIALOG' && element.contains(event.target)) cancel(element);
      }
    };
    document.addEventListener('focusin', preserveControl);
    document.addEventListener('pointerdown', preserveControl);
  }

  function updatePreference() {
    if (!preference.matches) return;
    for (const animation of [...active]) animation.cancel();
    active.clear();
    visualEffects.clear();
    observer?.disconnect();
    for (const element of pending) settle(element);
  }
  if (typeof preference.addEventListener === 'function') preference.addEventListener('change', updatePreference);
  else preference.addListener(updatePreference);
  window.addEventListener('pagehide', () => {
    for (const animation of [...active]) animation.cancel();
    active.clear();
    visualEffects.clear();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
