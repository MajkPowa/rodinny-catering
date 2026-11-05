(() => {
  'use strict';
  const $ = (s, parent = document) => parent.querySelector(s);
  const $$ = (s, parent = document) => [...parent.querySelectorAll(s)];
  const track = (event, detail = {}) => { window.dataLayer = window.dataLayer || []; window.dataLayer.push({ event, ...detail }); };
  const openDialog = dialog => { if (!dialog) return; if (window.RCMotion) window.RCMotion.openDialog(dialog); else dialog.showModal(); };
  const closeDialog = dialog => { if (!dialog) return Promise.resolve(); if (window.RCMotion) return window.RCMotion.closeDialog(dialog); dialog.close(); return Promise.resolve(); };
  const menu = $('#mobile-menu');
  const toggle = $('#menu-toggle');
  function closeMenu() { if (menu?.open) closeDialog(menu); }
  toggle?.addEventListener('click', () => { openDialog(menu); toggle.setAttribute('aria-expanded', 'true'); $('.menu-close', menu).focus(); });
  $('.menu-close', menu || document)?.addEventListener('click', closeMenu);
  menu?.addEventListener('cancel', event => { event.preventDefault(); closeMenu(); });
  menu?.addEventListener('close', () => { toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); });
  menu?.addEventListener('click', e => { if (e.target === menu) closeMenu(); });
  $$('a', menu || document).forEach(a => a.addEventListener('click', closeMenu));
  $$('a[href^="tel:"]').forEach(a => a.addEventListener('click', () => track('phone_click', { location: a.dataset.location || 'page' })));
  $$('a[href*="/kontakt/"]').forEach(a => a.addEventListener('click', () => track('enquiry_start', { source: location.pathname })));

  const heroVideo = $('#hero-video');
  if (heroVideo) {
    const control = $('.hero-video-toggle');
    const label = $('.sr-only', control);
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let started = false;

    function playHero() {
      started = true;
      if (!heroVideo.hasAttribute('src')) {
        const mobile = matchMedia('(max-width: 767px)').matches;
        heroVideo.src = mobile ? heroVideo.dataset.videoSmall : heroVideo.dataset.videoSrc;
      }
      heroVideo.muted = true;
      heroVideo.play().catch(() => {});
    }

    function updateVideoControl() {
      const playing = !heroVideo.paused && !heroVideo.ended;
      control.toggleAttribute('data-playing', playing);
      label.textContent = playing ? 'Pozastavit úvodní video' : 'Přehrát úvodní video';
    }

    control.hidden = false;
    control.addEventListener('click', () => heroVideo.paused ? playHero() : heroVideo.pause());
    ['play', 'pause', 'ended', 'error'].forEach(event => heroVideo.addEventListener(event, updateVideoControl));
    reducedMotion.addEventListener('change', event => { if (event.matches) heroVideo.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) heroVideo.pause(); });
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(([entry]) => {
        if (entry.intersectionRatio < 0.5) {
          heroVideo.pause();
        } else if (!started && !document.hidden && !reducedMotion.matches && !navigator.connection?.saveData) {
          playHero();
        }
      }, { threshold: 0.5 });
      observer.observe(heroVideo);
    }
  }

  const filters = $$('.gallery-filter');
  const photoCount = n => n === 1 ? 'Zobrazena 1 fotografie' : n >= 2 && n <= 4 ? `Zobrazeny ${n} fotografie` : `Zobrazeno ${n} fotografií`;
  filters.forEach(button => button.addEventListener('click', () => {
    filters.forEach(b => { b.classList.remove('is-active'); b.setAttribute('aria-pressed', 'false'); });
    button.classList.add('is-active'); button.setAttribute('aria-pressed', 'true');
    const active = button.dataset.filter;
    const cards = $$('.gallery-item');
    cards.forEach(c => { c.hidden = active !== 'all' && !c.dataset.category.split(' ').includes(active); });
    window.RCMotion?.galleryChange(cards.filter(card => !card.hidden), cards.filter(card => card.hidden));
    const n = cards.filter(c => !c.hidden).length;
    $('#gallery-count').textContent = photoCount(n);
  }));
  const lightbox = $('#lightbox');
  let lastPhoto;
  $$('.photo-open').forEach(button => button.addEventListener('click', () => {
    lastPhoto = button;
    const image = $('img', button);
    const enlarged = $('#lightbox-image');
    enlarged.src = button.dataset.full; enlarged.alt = image.alt;
    $('#lightbox-caption').textContent = button.dataset.caption || image.alt;
    openDialog(lightbox); $('#lightbox-close').focus();
  }));
  const closePhoto = () => closeDialog(lightbox);
  $('#lightbox-close')?.addEventListener('click', closePhoto);
  lightbox?.addEventListener('click', e => { if (e.target === lightbox) closePhoto(); });
  lightbox?.addEventListener('cancel', event => { event.preventDefault(); closePhoto(); });
  lightbox?.addEventListener('close', () => lastPhoto?.focus());

  const form = $('#enquiry-form');
  if (!form) return;
  const steps = $$('.form-step', form);
  const progress = $$('.form-progress li');
  let current = 0;
  let emailBody = '';
  let emailSubject = '';
  const event = $('#event-type');
  const unknownDate = $('#date-unknown');
  const date = $('#event-date');
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  date.min = today;
  const params = new URLSearchParams(location.search);
  const preset = params.get('typ');
  if (preset && [...event.options].some(o => o.value === preset)) event.value = preset;
  const place = $('#event-place', form);
  const presetPlace = params.get('misto');
  if (presetPlace && !place.value) place.value = presetPlace.trim().slice(0, place.maxLength);
  function updateConditional() {
    $$('.conditional', form).forEach(el => {
      const wasHidden = el.hidden;
      el.hidden = el.dataset.for !== event.value;
      if (wasHidden !== el.hidden) window.RCMotion?.conditional?.(el);
    });
  }
  event.addEventListener('change', updateConditional); updateConditional();
  const clearInvalid = inputEvent => {
    if (inputEvent.target.matches('input,select,textarea')) inputEvent.target.removeAttribute('aria-invalid');
  };
  form.addEventListener('input', clearInvalid);
  form.addEventListener('change', clearInvalid);
  unknownDate.addEventListener('change', () => { date.disabled = unknownDate.checked; date.required = !unknownDate.checked; date.setCustomValidity(''); date.removeAttribute('aria-invalid'); });
  date.addEventListener('change', () => date.setCustomValidity(date.value && date.value < today ? 'Vyberte dnešní nebo budoucí datum.' : ''));
  function showStep(index, focus = true) {
    current = index;
    steps.forEach((s,i) => s.hidden = i !== current);
    progress.forEach((p,i) => { p.classList.toggle('is-current', i===current); p.classList.toggle('is-complete', i<current); if(i===current) p.setAttribute('aria-current','step');else p.removeAttribute('aria-current'); });
    $('#form-status').textContent = `Krok ${index+1} ze 3`;
    if(focus) $('.step-heading', steps[index]).focus();
  }
  function validateStep() {
    const fields = $$('input,select,textarea', steps[current]).filter(x => !x.disabled);
    for (const field of fields) {
      if (!field.checkValidity()) { field.setAttribute('aria-invalid', 'true'); field.reportValidity(); window.RCMotion?.invalid?.(field); return false; }
    }
    return true;
  }
  $$('[data-next]',form).forEach(b => b.addEventListener('click', () => { if(validateStep()) showStep(current+1); }));
  $$('[data-back]',form).forEach(b => b.addEventListener('click', () => showStep(current-1)));
  $('#edit-enquiry')?.addEventListener('click', () => { $('#enquiry-result').hidden=true; form.hidden=false; showStep(0); });
  function makeSummary() {
    const data = new FormData(form);
    const values = name => data.getAll(name).filter(Boolean).join(', ');
    const lines = [
      'Dobrý den, mám zájem o nezávaznou nabídku cateringu.', '',
      `Typ akce: ${data.get('event')}`, `Datum: ${unknownDate.checked ? 'Termín zatím nevím' : data.get('date')}`,
      `Místo: ${data.get('place')}`, `Počet hostů: ${data.get('guests')}`,
      `Služby: ${values('services') || 'Prosím o doporučení'}`,
      `Rozpočet: ${data.get('budget') || 'Zatím nevím'}`,
      `Nápoje: ${data.get('drinks') || 'Domluvíme se'}`,
      `Dietní požadavky: ${data.get('diet') || 'Nespecifikováno'}`,
      `Zázemí / harmonogram: ${data.get('facilities') || 'Nespecifikováno'}`,
      `Další přání: ${data.get('notes') || '—'}`, '',
      `Jméno: ${data.get('name')}`, `Firma: ${data.get('company') || '—'}`,
      `E-mail: ${data.get('email')}`, `Telefon: ${data.get('phone') || '—'}`,
      '', 'Prosím o návrh dalšího postupu. Děkuji.'
    ];
    return { data, body: lines.join('\n') };
  }
  form.addEventListener('submit', e => {
    e.preventDefault(); if(!validateStep()) return;
    if(current < steps.length-1) { showStep(current+1); return; }
    const {data,body} = makeSummary(); emailBody=body;
    emailSubject=`Poptávka cateringu – ${data.get('event')} – ${data.get('place')}`;
    $('#email-draft').href=`mailto:info@rodinnycatering.cz?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    $('#enquiry-summary').textContent=emailBody;
    form.hidden=true; $('#enquiry-result').hidden=false;
    $('#result-heading').focus();
    track('enquiry_draft_created',{event_type:data.get('event'),source:location.pathname});
  });
  $('#copy-enquiry')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(emailBody); $('#copy-status').textContent='Text je zkopírovaný. Vložte jej do e-mailu.'; }
    catch { $('#copy-status').textContent='Kopírování není dostupné. Označte a zkopírujte text shrnutí níže.'; }
    window.RCMotion?.feedback?.($('#copy-status'));
  });
  $('#download-enquiry')?.addEventListener('click', () => {
    const encoded = btoa(unescape(encodeURIComponent(emailSubject)));
    const text=`To: info@rodinnycatering.cz\r\nSubject: =?UTF-8?B?${encoded}?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nX-Unsent: 1\r\n\r\n${emailBody.replace(/\n/g,'\r\n')}`;
    const url=URL.createObjectURL(new Blob([text],{type:'message/rfc822'}));
    const a=document.createElement('a');a.href=url;a.download='poptavka-rodinny-catering.eml';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  showStep(0,false);
})();
