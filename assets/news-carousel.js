/* Progressive news carousel. All content comes from the same-origin news feed. */
(() => {
  'use strict';
  const section = document.querySelector('#news');
  const deck = section?.querySelector('.news-grid');
  if (!section || !deck || section.dataset.carouselReady) return;
  let slides = Array.from(deck.querySelectorAll('.news-card'));
  if (!slides.length) return;
  section.dataset.carouselReady = 'true';
  const delay = 8000;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0, timer, paused = motion.matches, hovered = false, visible = false;
  let loading = false, fingerprint = '', pending = null;
  function make(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, label, cls = 'news-control') {
    const node = make('button', cls, text);
    node.type = 'button';
    node.setAttribute('aria-label', label);
    return node;
  }
  function safeURL(value) {
    if (typeof value !== 'string' || !value || value.length > 2500) return null;
    if (!value.startsWith('https://') && !(value.startsWith('/') && !value.startsWith('//'))) return null;
    try {
      const url = new URL(value, location.origin);
      if (url.username || url.password) return null;
      return url.protocol === 'https:' || url.origin === location.origin ? url.href : null;
    } catch { return null; }
  }
  function excerpt(value, limit) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= limit) return text;
    const head = text.slice(0, limit - 1);
    return head.slice(0, Math.max(head.lastIndexOf(' '), limit - 30)).trim() + '…';
  }
  const box = make('div', 'news-window');
  deck.before(box);
  box.append(deck);
  deck.id = 'news-slides';
  section.classList.add('news-is-carousel');
  box.setAttribute('role', 'region');
  box.setAttribute('aria-roledescription', 'carousel');
  box.setAttribute('aria-label', 'Latest research and community news');
  const toolbar = make('div', 'news-toolbar');
  const toggle = button('', 'Pause news rotation');
  const prev = button('←', 'Previous news item');
  const next = button('→', 'Next news item');
  [prev, next].forEach(node => node.setAttribute('aria-controls', deck.id));
  const counter = make('span', 'news-counter');
  const dots = make('div', 'news-dots');
  dots.setAttribute('role', 'group');
  dots.setAttribute('aria-label', 'Choose a news item');
  const nav = make('div', 'news-navigation');
  nav.append(prev, counter, next);
  toolbar.append(toggle, dots, nav);
  const announce = make('span', 'news-sr-only');
  announce.setAttribute('aria-live', 'polite');
  announce.setAttribute('aria-atomic', 'true');
  box.append(toolbar, announce);
  const progress = make('div', 'news-progress');
  progress.setAttribute('aria-hidden', 'true');
  const bar = make('span');
  bar.style.setProperty('--news-delay', delay + 'ms');
  progress.append(bar);
  box.append(progress);
  const footer = section.querySelector('.news-updated');
  const dateText = make('span', '', footer?.textContent.trim() || 'Selected updates');
  const rss = make('a', 'news-rss', 'RSS feed');
  rss.href = '/news.xml';
  rss.type = 'application/rss+xml';
  if (footer) footer.replaceChildren(dateText, document.createTextNode(' · '), rss);
  function schedule() {
    clearTimeout(timer);
    bar.classList.remove('news-progress-running');
    if (paused || hovered || !visible || document.hidden || slides.length < 2) return;
    void bar.offsetWidth;
    bar.classList.add('news-progress-running');
    timer = setTimeout(() => show(index + 1, false), delay);
  }
  function syncToggle() {
    toggle.textContent = paused ? 'Play' : 'Pause';
    toggle.setAttribute('aria-label', paused ? 'Start news rotation' : 'Pause news rotation');
    toggle.disabled = slides.length < 2;
  }
  function show(target, manual) {
    index = ((target % slides.length) + slides.length) % slides.length;
    if (manual) paused = true;
    slides.forEach((slide, i) => {
      const current = i === index;
      slide.classList.toggle('news-current', current);
      slide.setAttribute('aria-hidden', String(!current));
      slide.inert = !current;
      dots.children[i]?.setAttribute('aria-pressed', String(current));
    });
    counter.textContent = `${index + 1} / ${slides.length}`;
    if (manual) announce.textContent = `News ${index + 1} of ${slides.length}: ${slides[index].querySelector('h3')?.textContent || ''}`;
    syncToggle();
    schedule();
  }
  function decorate() {
    dots.replaceChildren();
    slides.forEach((slide, i) => {
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-roledescription', 'slide');
      slide.setAttribute('aria-label', `${i + 1} of ${slides.length}`);
      const dot = button('', `Show news item ${i + 1}`, 'news-dot');
      dot.setAttribute('aria-controls', deck.id);
      dot.addEventListener('click', () => show(i, true));
      dots.append(dot);
    });
    prev.disabled = next.disabled = slides.length < 2;
  }
  toggle.addEventListener('click', () => { paused = !paused; syncToggle(); schedule(); });
  prev.addEventListener('click', () => show(index - 1, true));
  next.addEventListener('click', () => show(index + 1, true));
  box.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') { hovered = true; schedule(); }
  });
  box.addEventListener('pointerleave', () => { hovered = false; schedule(); });
  box.addEventListener('focusin', event => {
    if (event.target !== toggle) { paused = true; syncToggle(); schedule(); }
  });
  box.addEventListener('focusout', () => setTimeout(() => {
    if (pending && !box.contains(document.activeElement)) { const feed = pending; pending = null; applyFeed(feed); }
  }, 0));
  box.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const targets = {ArrowLeft:index-1, ArrowRight:index+1, Home:0, End:slides.length-1};
    if (Object.prototype.hasOwnProperty.call(targets, event.key)) {
      event.preventDefault();
      if (deck.contains(document.activeElement)) next.focus();
      show(targets[event.key], true);
    }
  });
  let touchStart;
  deck.addEventListener('pointerdown', e => { touchStart = e.pointerType === 'touch' ? [e.clientX,e.clientY] : null; });
  deck.addEventListener('pointercancel', () => { touchStart = null; });
  deck.addEventListener('pointerup', e => {
    if (!touchStart || e.pointerType !== 'touch') return;
    const [x,y] = touchStart;
    touchStart = null;
    const dx = e.clientX-x;
    if (Math.abs(dx)>60 && Math.abs(dx)>Math.abs(e.clientY-y)*1.5) show(index+(dx<0?1:-1),true);
  });
  motion.addEventListener('change', () => { if (motion.matches) paused = true; syncToggle(); schedule(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; schedule(); }, {threshold:0.15}).observe(box);
  } else visible = true;
  decorate();
  show(0, false);
  function cardFor(item) {
    const card = make('article','news-card'+(item.featured?' news-featured':''));
    card.dataset.newsId = item.id;
    const meta = make('div','news-meta');
    meta.append(make('span','news-category',excerpt(item.category || 'Update',70)));
    const date = /^\d{4}-\d{2}-\d{2}$/.test(item.date || '') ? item.date : null;
    const stamp = make(date?'time':'span','',excerpt(item.date_label || date || 'Selected highlight',80));
    if (date) stamp.dateTime = date;
    meta.append(stamp);
    const body = make('div','news-card-body');
    body.append(meta,make('h3','',excerpt(item.title,180)),make('p','',excerpt(item.summary,420)));
    const links = make('div','news-card-links');
    const choices = Array.isArray(item.links) ? item.links.slice(0,3) : [];
    if (!choices.length && item.source_url) choices.push({url:item.source_url,label:'Read update'});
    choices.forEach(choice => {
      const href = safeURL(choice?.url);
      if (!href) return;
      const link = make('a','',excerpt(choice.label || 'Read update',65)+' ↗');
      link.href = href;
      if (new URL(href).origin !== location.origin) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      links.append(link);
    });
    body.append(links);
    const image = item.image && typeof item.image === 'object' ? item.image : {};
    const imageURL = safeURL(image.src) || new URL('/assets/ramtin-graduation.svg',location.origin).href;
    const sourceURL = safeURL(image.source_url) || new URL('/about/',location.origin).href;
    const figure = make('figure','news-picture');
    const imageLink = make('a','news-picture-link');
    imageLink.href = sourceURL;
    imageLink.target = '_blank'; imageLink.rel = 'noopener noreferrer';
    imageLink.setAttribute('aria-label','Open image source');
    const img = make('img');
    img.alt = excerpt(image.alt || 'Portfolio portrait of Ramtin Mojtahedi',240);
    img.width = 640; img.height = 440; img.decoding = 'async'; img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    const caption = make('figcaption');
    const credit = make('a','',excerpt(image.credit || 'Author portrait from this portfolio',120));
    credit.href = sourceURL; credit.target = '_blank'; credit.rel = 'noopener noreferrer';
    caption.append(credit);
    const licenceURL = safeURL(image.license_url);
    if (licenceURL) {
      const licence = make('a','','Licence');
      licence.href = licenceURL; licence.target = '_blank'; licence.rel = 'noopener noreferrer';
      caption.append(document.createTextNode(' · '),licence);
    }
    img.addEventListener('error',()=>{
      if (img.dataset.fallback) {
        figure.replaceChildren(make('span','news-picture-unavailable','Image unavailable'));
        return;
      }
      img.dataset.fallback = 'true';
      img.alt = 'Portfolio portrait of Ramtin Mojtahedi';
      imageLink.href = new URL('/about/',location.origin).href;
      caption.textContent = 'Author portrait · original image unavailable';
      img.src = '/assets/ramtin-graduation.svg';
    });
    img.src = imageURL;
    imageLink.append(img); figure.append(imageLink,caption);
    card.classList.add('news-has-image');
    card.append(figure,body);
    return card;
  }
  function applyFeed(feed) {
    if (!feed || !Array.isArray(feed.items) || !feed.items.length || feed.items.length>100) return;
    const ids = new Set();
    const valid = feed.items.filter(item => {
      if (!item || item.archived === true || typeof item.id !== 'string' || ids.has(item.id) || typeof item.title !== 'string' || !item.title.trim() || typeof item.summary !== 'string') return false;
      ids.add(item.id);
      return true;
    }).sort((a,b)=>String(b.date || b.publication_month || '').localeCompare(String(a.date || a.publication_month || ''))).slice(0,12);
    if (!valid.length) return;
    const signature = JSON.stringify([feed.updated_at,valid]);
    if (signature === fingerprint) return;
    if (box.contains(document.activeElement)) { pending = feed; return; }
    const oldId = slides[index]?.dataset.newsId;
    const oldTitle = slides[index]?.querySelector('h3')?.textContent;
    const cards = valid.map(cardFor);
    // Initial load starts at the newest dated item; later refreshes preserve reading.
    const preserved = fingerprint ? cards.findIndex(card => card.dataset.newsId === oldId || card.querySelector('h3').textContent === oldTitle) : -1;
    deck.replaceChildren(...cards);
    slides = cards;
    fingerprint = signature;
    if (/^\d{4}-\d{2}-\d{2}$/.test(feed.updated_at || '')) {
      const date = new Date(feed.updated_at+'T12:00:00Z');
      if (!Number.isNaN(date.getTime())) dateText.textContent = 'Selected updates · Updated '+new Intl.DateTimeFormat('en-CA',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(date);
    }
    decorate();
    show(preserved>=0?preserved:0,false);
  }
  async function refresh() {
    if (loading || document.hidden) return;
    loading = true;
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),10000);
    try {
      const response = await fetch('/news.json',{cache:'no-cache',credentials:'same-origin',signal:controller.signal});
      if (!response.ok) return;
      const text = await response.text();
      if (text.length<=200000) applyFeed(JSON.parse(text));
    } catch { /* Preserve usable cards if the feed is unavailable. */ }
    finally { clearTimeout(timeout); loading = false; }
  }
  document.addEventListener('visibilitychange',()=>{schedule();if(!document.hidden)refresh();});
  setInterval(refresh,300000);
  refresh();
})();
