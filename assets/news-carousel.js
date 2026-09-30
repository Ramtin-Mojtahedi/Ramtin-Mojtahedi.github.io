/* Original LinkedIn content only. Discovery and display are separate. */
(() => {
  'use strict';
  const section = document.querySelector('#news');
  const deck = section?.querySelector('.news-grid');
  if (!section || !deck || section.dataset.carouselReady) return;
  section.dataset.carouselReady = 'true';
  section.classList.add('news-is-carousel', 'linkedin-only');
  const profile = 'https://www.linkedin.com/in/ramtin-mojtahedi/';
  const activity = profile + 'recent-activity/all/';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const delay = 8000;
  let posts = [], index = 0, timer, paused = motion.matches, hovered = false;
  let visible = false, loading = false, signature = '', pending = null;
  function make(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function secureURL(value, hosts) {
    if (typeof value !== 'string' || value.length > 2500) return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password &&
        !url.port && hosts.includes(url.hostname) ? url : null;
    } catch { return null; }
  }
  function isOriginal(post) {
    if (!post || post.kind !== 'linkedin-embed' || post.archived ||
        post.author_profile !== profile || post.source_verified !== true ||
        post.embed_verified !== true || post.embed_full !== true ||
        typeof post.id !== 'string' || !post.id || !post.published_at) return false;
    const date = Date.parse(post.published_at);
    if (!Number.isFinite(date) || date > Date.now()) return false;
    const source = secureURL(post.source_url, ['www.linkedin.com']);
    const embed = secureURL(post.embed_url, ['www.linkedin.com']);
    if (!source || !embed || !/^\/(posts\/|feed\/update\/)/.test(source.pathname)) return false;
    if (!/^\/embed\/feed\/update\/urn:li:(share|ugcPost|activity):\d+\/?$/.test(decodeURIComponent(embed.pathname))) return false;
    if (embed.searchParams.has('collapsed') && embed.searchParams.get('collapsed') !== '0') return false;
    return true;
  }
  function connectedWidget(widget) {
    if (!widget || widget.provider !== 'sociablekit' || widget.verified !== true ||
        widget.author_profile !== profile || widget.original_content !== true) return null;
    const url = secureURL(widget.embed_url, ['widgets.sociablekit.com']);
    if (!url || !url.pathname.startsWith('/linkedin-profile-posts/')) return null;
    return url.href;
  }
  function link(url, text) {
    const a = make('a', 'linkedin-source-link', text);
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    return a;
  }
  function control(text, label) {
    const button = make('button', 'news-control', text);
    button.type = 'button'; button.setAttribute('aria-label', label);
    return button;
  }
  const box = make('div', 'news-window');
  deck.before(box); box.append(deck);
  box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'LinkedIn posts');
  const toolbar = make('div', 'news-toolbar');
  const play = control('Pause', 'Pause news rotation');
  const prev = control('←', 'Previous news item');
  const next = control('→', 'Next news item');
  const counter = make('span', 'news-counter');
  const nav = make('div', 'news-navigation'); nav.append(prev, counter, next);
  toolbar.append(play, nav); toolbar.hidden = true; box.append(toolbar);
  const footer = section.querySelector('.news-updated');
  function schedule() {
    clearTimeout(timer);
    if (paused || hovered || !visible || document.hidden || posts.length < 2) return;
    timer = setTimeout(() => show(index + 1, false), delay);
  }
  function sync() {
    play.textContent = paused ? 'Play' : 'Pause';
    play.setAttribute('aria-label', paused ? 'Start news rotation' : 'Pause news rotation');
    play.disabled = prev.disabled = next.disabled = posts.length < 2;
    schedule();
  }
  function frame(url, title) {
    const iframe = make('iframe', 'linkedin-native-frame');
    iframe.title = title; iframe.src = url; iframe.loading = 'lazy';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.setAttribute('allowfullscreen', '');
    // This is an external, cross-origin embed. Never inject scraped HTML or scripts.
    return iframe;
  }
  function empty() {
    posts = []; index = 0; clearTimeout(timer); toolbar.hidden = true;
    deck.replaceChildren(make('div', 'linkedin-empty', 'Read my latest posts on LinkedIn.'));
    deck.firstElementChild.append(link(activity, 'View LinkedIn posts ↗'));
    section.dataset.feedStatus = 'connection_required';
    if (footer) footer.textContent = 'Original posts are available on LinkedIn.';
  }
  function show(target, manual) {
    if (!posts.length) return;
    if (manual) paused = true;
    index = (target + posts.length) % posts.length;
    const post = posts[index];
    const article = make('article', 'linkedin-post');
    article.dataset.newsId = post.id;
    article.setAttribute('aria-label', `LinkedIn post ${index + 1} of ${posts.length}`);
    // LinkedIn renders its own full text and original media; no summaries or fallback photos.
    article.append(frame(post.embed_url, `Original LinkedIn post by Ramtin Mojtahedi (${post.published_at.slice(0, 10)})`));
    article.append(link(post.source_url, 'Open original post on LinkedIn ↗'));
    deck.replaceChildren(article);
    counter.textContent = `${index + 1} / ${posts.length}`;
    toolbar.hidden = false; sync();
  }
  function apply(feed) {
    if (!feed || feed.feed_mode !== 'linkedin-originals' || !Array.isArray(feed.items) || feed.items.length > 100) return;
    if (box.contains(document.activeElement)) { pending = feed; return; }
    const fingerprint = JSON.stringify([feed.items, feed.widget]);
    if (fingerprint === signature) return;
    const widgetURL = connectedWidget(feed.widget);
    if (widgetURL) {
      posts = []; clearTimeout(timer); toolbar.hidden = true;
      deck.replaceChildren(frame(widgetURL, 'Ramtin Mojtahedi — original LinkedIn feed'));
      section.dataset.feedStatus = 'provider_configured';
      if (footer) footer.textContent = 'Content supplied by the connected LinkedIn feed. Open any post to view it on LinkedIn.';
      signature = fingerprint; return;
    }
    const ids = new Set(), urls = new Set();
    const valid = feed.items.filter(post => {
      if (!isOriginal(post) || ids.has(post.id) || urls.has(post.source_url)) return false;
      ids.add(post.id); urls.add(post.source_url); return true;
    }).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at)).slice(0, 12);
    const oldId = posts[index]?.id;
    posts = valid;
    const preserved = signature ? posts.findIndex(post => post.id === oldId) : -1;
    signature = fingerprint;
    if (!posts.length) { empty(); return; }
    section.dataset.feedStatus = 'original_embeds';
    if (footer) footer.textContent = 'Original LinkedIn posts · Full posts and media supplied by LinkedIn.';
    show(preserved >= 0 ? preserved : 0, false);
  }
  play.addEventListener('click', () => { paused = !paused; sync(); });
  prev.addEventListener('click', () => show(index - 1, true));
  next.addEventListener('click', () => show(index + 1, true));
  box.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') { hovered = true; schedule(); } });
  box.addEventListener('pointerleave', () => { hovered = false; schedule(); });
  box.addEventListener('focusin', e => { if (e.target !== play) { paused = true; sync(); } });
  // Clicking into a cross-origin post can blur this window; do not rotate away from it.
  window.addEventListener('blur', () => setTimeout(() => {
    if (document.activeElement?.tagName === 'IFRAME' && box.contains(document.activeElement)) { paused = true; sync(); }
  }, 0));
  box.addEventListener('focusout', () => setTimeout(() => {
    if (pending && !box.contains(document.activeElement)) { const update = pending; pending = null; apply(update); }
  }, 0));
  toolbar.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const targets = {ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: posts.length - 1};
    if (Object.hasOwn(targets, e.key)) { e.preventDefault(); show(targets[e.key], true); }
  });
  motion.addEventListener('change', () => { if (motion.matches) paused = true; sync(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; schedule(); }, {threshold: 0.1}).observe(box);
  } else visible = true;
  async function refresh() {
    if (loading || document.hidden) return;
    loading = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/news.json', {cache: 'no-cache', credentials: 'same-origin', signal: controller.signal});
      if (response.ok) {
        const text = await response.text();
        if (text.length <= 200000) apply(JSON.parse(text));
      }
    } catch { /* Keep an existing original embed or the honest LinkedIn link. */ }
    finally { clearTimeout(timeout); loading = false; section.dataset.feedReady = 'true'; }
  }
  empty();
  document.addEventListener('visibilitychange', () => { schedule(); if (!document.hidden) refresh(); });
  setInterval(refresh, 300000);
  refresh();
})();
