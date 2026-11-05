(() => {
  'use strict';

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const tolerance = 1.5;

  document.querySelectorAll('[data-carousel]').forEach(root => {
    const track = root.querySelector('.carousel-track');
    const controls = root.querySelector('.carousel-controls');
    const previous = root.querySelector('[data-carousel-prev]');
    const next = root.querySelector('[data-carousel-next]');
    const status = root.querySelector('[data-carousel-status]');
    if (!track || !controls || !previous || !next || !status) return;
    const slides = Array.from(track.children).filter(slide => slide.classList.contains('carousel-slide'));
    if (slides.length < 2) return;

    const configuredInterval = Number(root.dataset.carouselInterval);
    const interval = Number.isFinite(configuredInterval) && configuredInterval >= 1000 ? configuredInterval : 6500;
    let stops = [];
    let displayedIndex = 0;
    let targetIndex = null;
    let visible = false;
    let hovered = false;
    let dragging = false;
    let autoTimer;
    let targetTimer;
    let counterFrame;

    const hasKeyboardFocus = () => root.querySelector(':focus-visible') !== null;
    const canAuto = () => visible && !hovered && !dragging && !hasKeyboardFocus() && !document.hidden && stops.length > 1;

    function nearestStop() {
      const left = track.scrollLeft;
      return stops.reduce((best, stop, i) => Math.abs(stop.left - left) < Math.abs(stops[best].left - left) ? i : best, 0);
    }

    function updateCounter() {
      counterFrame = undefined;
      if (!stops.length) return;
      displayedIndex = nearestStop();
      const { first, last } = stops[displayedIndex];
      const range = first === last ? `${first + 1}` : `${first + 1}–${last + 1}`;
      const text = `${range} / ${slides.length}`;
      if (status.textContent !== text) status.textContent = text;
    }

    function queueCounter() {
      if (counterFrame === undefined) counterFrame = requestAnimationFrame(updateCounter);
    }

    function clearTarget() {
      clearTimeout(targetTimer);
      targetIndex = null;
    }

    function goTo(index, jump = false) {
      clearTarget();
      targetIndex = index;
      const left = stops[index].left;
      track.scrollTo({ left, behavior: jump || reduceMotion.matches ? 'instant' : 'smooth' });
      if (Math.abs(track.scrollLeft - left) <= tolerance) clearTarget();
      else targetTimer = setTimeout(clearTarget, 1000);
      queueCounter();
    }

    function move(direction) {
      if (stops.length < 2) return;
      const destination = (targetIndex ?? nearestStop()) + direction;
      const wrap = destination < 0 || destination >= stops.length;
      // A wrap should jump between the two endpoints, rather than animate across every card.
      goTo((destination + stops.length) % stops.length, wrap);
    }

    function scheduleAuto() {
      clearTimeout(autoTimer);
      status.setAttribute('aria-live', hasKeyboardFocus() ? 'polite' : 'off');
      if (!canAuto()) return;
      autoTimer = setTimeout(() => {
        if (!canAuto()) return;
        move(1);
        scheduleAuto();
      }, interval);
    }

    function measure() {
      const width = track.clientWidth;
      if (!width) return;
      const leftEdge = track.getBoundingClientRect().left + track.clientLeft;
      const scrollLeft = track.scrollLeft;
      const maxLeft = Math.max(0, track.scrollWidth - width);
      const snapPadding = parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0;
      const boxes = slides.map(slide => {
        const box = slide.getBoundingClientRect();
        return { left: box.left - leftEdge + scrollLeft, right: box.right - leftEdge + scrollLeft };
      });

      // Several final cards can share the same reachable position on a wide screen.
      const offsets = [0];
      for (const box of boxes.slice(1)) {
        const left = Math.min(maxLeft, Math.max(0, box.left - snapPadding));
        if (left - offsets[offsets.length - 1] > tolerance) offsets.push(left);
      }
      const measured = offsets.map(left => {
        const end = left + width;
        const complete = boxes.map((box, i) => box.left >= left - tolerance && box.right <= end + tolerance ? i : -1).filter(i => i >= 0);
        const inView = complete.length ? complete : boxes.map((box, i) => box.right > left && box.left < end ? i : -1).filter(i => i >= 0);
        return { left, first: inView[0] ?? 0, last: inView[inView.length - 1] ?? 0 };
      });
      const changed = measured.length !== stops.length || measured.some((stop, i) =>
        Math.abs(stop.left - stops[i].left) > tolerance || stop.first !== stops[i].first || stop.last !== stops[i].last);
      if (!changed) return;

      const previousLead = stops[targetIndex ?? displayedIndex]?.first;
      stops = measured;
      controls.hidden = stops.length < 2;
      if (previousLead !== undefined) {
        // Keep the same leading item when the number of visible columns changes.
        const index = stops.reduce((best, stop, i) => stop.first <= previousLead ? i : best, 0);
        goTo(index, true);
      } else queueCounter();
      scheduleAuto();
    }

    previous.addEventListener('click', () => { move(-1); scheduleAuto(); });
    next.addEventListener('click', () => { move(1); scheduleAuto(); });
    root.addEventListener('focusin', scheduleAuto);
    root.addEventListener('focusout', () => queueMicrotask(scheduleAuto));
    root.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      hovered = true;
      scheduleAuto();
    });
    root.addEventListener('pointerleave', event => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      hovered = false;
      scheduleAuto();
    });

    track.addEventListener('pointerdown', () => {
      dragging = true;
      clearTarget();
      scheduleAuto();
    }, { passive: true });
    const finishDrag = () => {
      if (!dragging) return;
      dragging = false;
      scheduleAuto();
    };
    window.addEventListener('pointerup', finishDrag, { passive: true });
    window.addEventListener('pointercancel', finishDrag, { passive: true });
    window.addEventListener('blur', finishDrag);
    track.addEventListener('wheel', event => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || (event.shiftKey && event.deltaY)) {
        clearTarget();
        scheduleAuto();
      }
    }, { passive: true });
    track.addEventListener('scroll', () => {
      if (targetIndex !== null && Math.abs(track.scrollLeft - stops[targetIndex].left) <= tolerance) clearTarget();
      queueCounter();
      if (targetIndex === null) scheduleAuto();
    }, { passive: true });
    track.addEventListener('keydown', event => {
      if (event.target !== track || stops.length < 2 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home' || event.key === 'End') goTo(event.key === 'Home' ? 0 : stops.length - 1, true);
      else move(event.key === 'ArrowLeft' ? -1 : 1);
      scheduleAuto();
    });

    function onMotionChange() {
      if (reduceMotion.matches && targetIndex !== null) goTo(nearestStop(), true);
      scheduleAuto();
    }
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onMotionChange);
    else reduceMotion.addListener(onMotionChange);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting && entry.intersectionRatio >= .15;
        scheduleAuto();
      }, { threshold: [.15] }).observe(track);
    }
    if ('ResizeObserver' in window) new ResizeObserver(measure).observe(track);
    else window.addEventListener('resize', measure, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) dragging = false;
      scheduleAuto();
    });
    window.addEventListener('pagehide', () => {
      dragging = false;
      clearTimeout(autoTimer);
    });
    window.addEventListener('pageshow', scheduleAuto);

    measure();
    root.dataset.carouselReady = 'true';
  });
})();
