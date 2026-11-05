(() => {
  'use strict';

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const compactScreen = matchMedia('(max-width: 600px)');

  document.querySelectorAll('[data-client-marquee], [data-review-marquee]').forEach(root => {
    const isReview = root.hasAttribute('data-review-marquee');
    const track = root.querySelector('.client-marquee-track, .review-marquee-track');
    const group = track?.querySelector('.client-marquee-group, .review-marquee-group');
    if (!group || !track.animate) return;

    let animation;
    let distance = 0;
    let duration = 0;
    let visible = !('IntersectionObserver' in window);
    let suspended = false;
    let hovered = false;
    let pointer = null;
    let resizeFrame;
    let readingUntil = 0;
    let readingTimer;
    const modulo = (value, size) => ((value % size) + size) % size;
    const hasKeyboardFocus = () => root.matches(':focus-visible') || root.querySelector(':focus-visible') !== null;

    function syncPlayback() {
      if (!animation) return;
      const canPlay = visible && !suspended && !document.hidden && pointer === null &&
        !hovered && !hasKeyboardFocus() && Date.now() >= readingUntil;
      if (canPlay) animation.play();
      else animation.pause();
    }

    function pauseForReading(milliseconds) {
      readingUntil = Date.now() + milliseconds;
      clearTimeout(readingTimer);
      readingTimer = setTimeout(syncPlayback, milliseconds);
      syncPlayback();
    }

    function alignFocusedReview(target) {
      if (!isReview || !animation || !group.contains(target)) return;
      const card = target.closest('.review-marquee-slide');
      if (!card) return;
      const index = Array.from(group.children).indexOf(card);
      animation.currentTime = index / group.children.length * duration;
      // Browsers may scroll the clipping viewport when focusing an off-screen source link.
      root.scrollLeft = 0;
    }

    function measure() {
      resizeFrame = undefined;
      const width = group.getBoundingClientRect().width;
      if (!width || !root.clientWidth) return;
      const phase = duration ? modulo(Number(animation?.currentTime) || 0, duration) / duration : 0;
      animation?.cancel();
      track.querySelectorAll('[data-marquee-copy]').forEach(copy => copy.remove());
      // Every group includes its trailing gap. Repeating exactly this width makes the seam invisible.
      for (let i = 0; i < Math.ceil(root.clientWidth / width); i++) {
        const copy = group.cloneNode(true);
        copy.dataset.marqueeCopy = '';
        copy.setAttribute('aria-hidden', 'true');
        copy.removeAttribute('id');
        copy.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
        if (isReview) {
          // Keep visible source links clickable, without duplicating keyboard or screen-reader content.
          copy.querySelectorAll('a, button, input, select, textarea, [tabindex]').forEach(element => {
            element.tabIndex = -1;
          });
        } else copy.inert = true;
        track.append(copy);
      }
      track.querySelectorAll('img').forEach(image => { image.loading = 'eager'; });
      distance = width;
      // Reviews have more reading time; the mobile strip travels more slowly again.
      const speed = isReview
        ? (reduceMotion.matches ? (compactScreen.matches ? 3 : 4) : (compactScreen.matches ? 6 : 9))
        : (reduceMotion.matches ? 12 : 28);
      duration = distance / speed * 1000;
      root.scrollLeft = 0;
      animation = track.animate([
        { transform: 'translate3d(0,0,0)' },
        { transform: `translate3d(${-distance}px,0,0)` }
      ], { duration, iterations: Infinity, easing: 'linear' });
      animation.currentTime = phase * duration;
      root.dataset.marqueeReady = 'true';
      if (hasKeyboardFocus()) alignFocusedReview(document.activeElement);
      syncPlayback();
    }

    function requestMeasure() {
      if (resizeFrame === undefined) resizeFrame = requestAnimationFrame(measure);
    }

    function advance(pixels) {
      if (!animation || !distance) return;
      animation.currentTime = modulo((Number(animation.currentTime) || 0) + pixels / distance * duration, duration);
    }

    root.addEventListener('keydown', event => {
      if (event.target !== root || !animation || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const step = distance / group.children.length;
      if (event.key === 'Home') animation.currentTime = 0;
      else if (event.key === 'End') animation.currentTime = (distance - step) / distance * duration;
      else advance(event.key === 'ArrowLeft' ? -step : step);
      syncPlayback();
    });
    root.addEventListener('focusin', event => {
      if (hasKeyboardFocus()) alignFocusedReview(event.target);
      syncPlayback();
    });
    root.addEventListener('focusout', () => queueMicrotask(syncPlayback));
    root.addEventListener('pointerenter', event => {
      if (!isReview || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
      hovered = true;
      syncPlayback();
    });
    root.addEventListener('pointerleave', event => {
      if (!isReview || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
      hovered = false;
      syncPlayback();
    });
    root.addEventListener('pointerdown', event => {
      if (!animation || !event.isPrimary || event.button !== 0) return;
      if (event.target.closest('a, button, input, select, textarea')) {
        // Do not capture links: their normal click, new-tab and context-menu behavior must survive.
        if (event.target.closest('[data-marquee-copy]')) event.preventDefault();
        if (isReview && event.pointerType === 'touch') pauseForReading(25000);
        return;
      }
      pointer = { id: event.pointerId, x: event.clientX, startX: event.clientX,
        startY: event.clientY, type: event.pointerType, dragged: false };
      root.setPointerCapture(event.pointerId);
      syncPlayback();
    });
    root.addEventListener('pointermove', event => {
      if (pointer?.id !== event.pointerId) return;
      if (!pointer.dragged) {
        const horizontal = Math.abs(event.clientX - pointer.startX);
        if (horizontal < 5 || horizontal < Math.abs(event.clientY - pointer.startY)) return;
        pointer.dragged = true;
      }
      advance(pointer.x - event.clientX);
      pointer.x = event.clientX;
    });
    function finishDrag(event) {
      if (pointer === null) return;
      const finished = pointer;
      pointer = null;
      if (root.hasPointerCapture(finished.id)) root.releasePointerCapture(finished.id);
      if (isReview && finished.type === 'touch' && event?.type === 'pointerup') {
        pauseForReading(finished.dragged ? 4000 : 25000);
      } else syncPlayback();
    }
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => root.addEventListener(type, finishDrag));
    window.addEventListener('blur', finishDrag);
    document.addEventListener('visibilitychange', () => { finishDrag(); syncPlayback(); });
    window.addEventListener('pagehide', () => { suspended = true; finishDrag(); syncPlayback(); });
    window.addEventListener('pageshow', () => { suspended = false; syncPlayback(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        syncPlayback();
      }).observe(root);
    }
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(requestMeasure);
      observer.observe(root);
      observer.observe(group);
    } else window.addEventListener('resize', requestMeasure, { passive: true });
    [reduceMotion, compactScreen].forEach(preference => {
      if (preference.addEventListener) preference.addEventListener('change', requestMeasure);
      else preference.addListener(requestMeasure);
    });
    measure();
  });
})();
