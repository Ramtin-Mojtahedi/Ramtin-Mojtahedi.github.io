#!/usr/bin/env python3
"""One-time migration to original LinkedIn embeds, without fetching private posts.

All prior news is preserved in an archive. No post, widget id, connection,
subscription, source verification, or sync success is fabricated.
"""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
PROFILE = 'https://www.linkedin.com/in/ramtin-mojtahedi/'

JS = r'''/* Original LinkedIn content only. Discovery and display are separate. */
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
'''

CSS = '''/* Original LinkedIn embeds; no reconstructed cards or substitute images. */
#news.linkedin-only{padding-block:clamp(1.5rem,3vw,2.5rem);scroll-margin-top:6rem}
#news.linkedin-only>.wrap{max-width:780px}
#news.linkedin-only+.statsSec .impact-intro{margin-top:0}
#news.linkedin-only .news-heading{align-items:center;gap:1rem;margin-bottom:1rem}
#news.linkedin-only .news-heading h2{font-size:clamp(1.35rem,2.2vw,1.8rem);margin:.3rem 0 0;line-height:1.25}
#news.linkedin-only .news-linkedin{font-size:.85rem}
#news.linkedin-only .news-window{border:1px solid var(--news-border);border-radius:1rem;background:var(--news-card);overflow:hidden;min-width:0}
#news.linkedin-only .news-grid{display:block;min-width:0}
#news.linkedin-only .linkedin-empty{padding:1.65rem;color:var(--news-muted);font-size:.96rem;line-height:1.7}
#news.linkedin-only .linkedin-source-link{display:block;width:fit-content;margin:.7rem 1rem 1rem;color:var(--news-ink);font-size:.85rem;font-weight:650;text-underline-offset:.2em;overflow-wrap:anywhere}
#news.linkedin-only .linkedin-empty .linkedin-source-link{margin:1rem 0 0}
#news.linkedin-only .linkedin-post{min-width:0;background:var(--news-card)}
#news.linkedin-only .linkedin-native-frame{display:block;border:0;width:100%;height:540px;background:#fff}
#news.linkedin-only .news-toolbar{display:flex;align-items:center;justify-content:space-between;gap:1rem;border-top:1px solid var(--news-border);padding:.6rem .85rem;background:var(--news-feature);color:var(--news-ink)}
#news.linkedin-only .news-toolbar[hidden]{display:none}
#news.linkedin-only .news-navigation{display:flex;align-items:center;gap:.4rem}
#news.linkedin-only .news-counter{font-size:.8rem;min-width:3rem;text-align:center;font-variant-numeric:tabular-nums}
#news.linkedin-only .news-control{font:inherit;font-size:.82rem;min-height:40px;min-width:40px;border:1px solid var(--news-border);border-radius:.5rem;background:var(--news-card);color:var(--news-ink);cursor:pointer;padding:.4rem .65rem}
#news.linkedin-only .news-control:disabled{opacity:.5;cursor:default}
#news.linkedin-only .news-control:focus-visible,#news.linkedin-only a:focus-visible{outline:2px solid var(--news-ink);outline-offset:3px}
#news.linkedin-only .news-updated{font-size:.74rem;line-height:1.5;margin:.7rem 0 0;color:var(--news-muted)}
@media(max-width:600px){#news.linkedin-only .news-heading{align-items:flex-start;flex-direction:column;gap:.6rem}#news.linkedin-only .linkedin-native-frame{height:520px}#news.linkedin-only .linkedin-empty{padding:1.25rem}}
'''

HTML = '''<!-- verified-news:start -->
<section id="news" class="surface news-section linkedin-only" aria-labelledby="news-title">
  <div class="wrap">
    <div class="news-heading">
      <div><p class="kicker">LinkedIn</p><h2 id="news-title">Posts from LinkedIn.</h2></div>
      <a class="news-linkedin" href="https://www.linkedin.com/in/ramtin-mojtahedi/recent-activity/all/" target="_blank" rel="noopener noreferrer">View my latest posts ↗</a>
    </div>
    <div class="news-grid"><div class="linkedin-empty">Read my latest posts on LinkedIn.<a class="linkedin-source-link" href="https://www.linkedin.com/in/ramtin-mojtahedi/recent-activity/all/" target="_blank" rel="noopener noreferrer">View LinkedIn posts ↗</a></div></div>
    <p class="news-updated">Original posts are available on LinkedIn.</p>
  </div>
</section>
<!-- verified-news:end -->'''

README = '''# LinkedIn feed: connection and operating boundary

The website now accepts original LinkedIn embeds or a connected personal-profile
feed widget. It no longer renders rewritten research headlines, summaries, or
profile-photo substitutes as news. Existing publication records are untouched.

## Current state

- The public personal LinkedIn activity feed could not be accessed.
- No original post or widget connection has been verified or imported.
- `items` is empty; the website displays a direct LinkedIn link, not a fake feed.
- Previous curated news is preserved verbatim in `_data/news_archive.json`.
- A five-minute browser refresh only refreshes `/news.json`; it does NOT discover
  new LinkedIn posts. Eight-second rotation only rotates verified native embeds.

## One-time automatic-feed connection (not per-post maintenance)

SociableKIT documents a **LinkedIn Profile Posts** widget with carousel layout,
automatic syncing on paid plans, and manual syncing on its free plan:
https://www.sociablekit.com/linkedin-profile-posts-widget/

The owner must create or authorize their own widget. No account, subscription,
trial, payment, or private authentication has been created by this change.
Use the existing profile https://www.linkedin.com/in/ramtin-mojtahedi/ as the only
source, choose a single-column carousel with original media and full post text,
disable character limits/rewriting, and review its actual preview against LinkedIn.
Set newest-first ordering and enable automatic sync in the service. Confirm its
current price and sync cadence before purchasing; do not promise real-time sync.

Provide the service's actual generated **iframe embed code** once. Do not provide
passwords, session cookies, OAuth secrets, or tokens. After inspecting that exact
widget, set `_data/news.json` -> `widget` to an object with these fields:
- provider: sociablekit
- author_profile: the exact profile URL above
- embed_url: the real HTTPS iframe URL from widgets.sociablekit.com under
  /linkedin-profile-posts/ (not an invented id or a public demo)
- verified: true only after confirming ownership and the actual rendered feed
- original_content: true only after comparing full text and original media

The renderer embeds that one widget; the provider, not a search-based task,
collects subsequent posts. Its own carousel controls layout and rotation.
Nothing is connected until the real widget exists and the source is verified.

## Native full-post embeds (supported, not an automatic profile feed)

For public personal posts that have been directly verified, `items` accepts:
`kind=linkedin-embed`, stable `id`, exact `author_profile`, exact `source_url`,
exact LinkedIn-provided full `embed_url`, verified ISO `published_at`,
`source_verified=true`, `embed_verified=true`, `embed_full=true`.
No summary, substitute headline, or image fallback is used. IDs and embed URLs
must come from the actual post and its **Embed full post** code, never guessed.
Use published_at from the original source; do not fabricate a date from search
snippets or a numeric id. Latest verified posts are sorted first.

Official embedding instructions and format limitations:
https://www.linkedin.com/help/linkedin/answer/a529065
https://www.linkedin.com/help/linkedin/answer/a7486069

Cross-origin LinkedIn embeds own the text and media. Visitors can scroll within
the compact frame and open the complete original post. Multi-photo posts and
reposts with commentary may not support native embedding. Never substitute
another format or image and call it exact. Deleted/private/unavailable posts
must not be copied around the restriction.

## Tests and validation

The browser test uses clearly labelled local fixtures (never published as user
posts) to test empty state, rejection of rewritten/forged entries, native-embed
source fidelity, ordering, controls, reduced motion, external-widget safeguards,
responsive layout, and failed-feed fallback. Fixture success is NOT proof of
live LinkedIn access or a working user widget. Verify the public source separately.
'''

RSS = '''---
layout: null
---
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Ramtin Mojtahedi — Original LinkedIn posts</title>
    <link>https://ramtin-mojtahedi.github.io/#news</link>
    <description>Links to verified original LinkedIn posts. Not a LinkedIn discovery service.</description>
    <atom:link href="https://ramtin-mojtahedi.github.io/news.xml" rel="self" type="application/rss+xml"/>
    <language>en-ca</language>
    {% for item in site.data.news.items %}{% if item.kind == 'linkedin-embed' and item.source_verified and item.embed_verified and item.embed_full %}{% unless item.archived %}
    <item>
      <title>Original LinkedIn post</title>
      <link>{{ item.source_url | xml_escape }}</link>
      <guid isPermaLink="true">{{ item.source_url | xml_escape }}</guid>
      <description>Open the original post on LinkedIn.</description>
      {% if item.published_at %}<pubDate>{{ item.published_at | date_to_rfc822 }}</pubDate>{% endif %}
    </item>
    {% endunless %}{% endif %}{% endfor %}
  </channel>
</rss>
'''

def main():
    archive = ROOT / '_data/news_archive.json'
    current = ROOT / '_data/news.json'
    if not archive.exists():
        archive.write_bytes(current.read_bytes())
    old = json.loads(current.read_text())
    if old.get('feed_mode') == 'linkedin-originals':
        raise RuntimeError('Migration already applied; do not erase later original posts.')
    new = {
        'schema_version': 2,
        'feed_mode': 'linkedin-originals',
        'linkedin_profile': PROFILE,
        'linkedin_activity': PROFILE + 'recent-activity/all/',
        'updated_at': None,
        'connection_status': 'connection_required',
        'widget': None,
        'items': [],
        'maintenance_note': 'Only original personal LinkedIn embeds or a verified connected profile-feed widget. No source connected yet; no original posts imported. Previous substitute news is archived separately. Browser refresh is not LinkedIn synchronization.'
    }
    current.write_text(json.dumps(new, indent=2, ensure_ascii=False) + '\n')
    hero = ROOT / '_includes/site-part-1.html'
    text, n = re.subn(r'<!-- verified-news:start -->.*?<!-- verified-news:end -->', lambda _: HTML, hero.read_text(), flags=re.S)
    if n != 1:
        raise RuntimeError('Expected one existing news block.')
    hero.write_text(text)
    (ROOT / 'assets/news-carousel.js').write_text(JS)
    (ROOT / 'assets/news-carousel.css').write_text(CSS)
    (ROOT / 'news.xml').write_text(RSS)
    index = ROOT / 'index.html'
    text = index.read_text()
    for extension in ('js', 'css'):
        text, n = re.subn(r'assets/news-carousel\.' + extension + r'\?[^"\s]+', 'assets/news-carousel.' + extension + '?v=linkedin-originals-20260913', text)
        if n != 1:
            raise RuntimeError('Carousel asset reference not found exactly once.')
    text = re.sub(r'\s*<link rel="stylesheet" href="assets/news-media\.css[^\"]*">', '', text)
    index.write_text(text)
    (ROOT / 'docs').mkdir(exist_ok=True)
    (ROOT / 'docs/linkedin-feed.md').write_text(README)
    assert json.loads(archive.read_text()) == old
    print('LinkedIn-only renderer prepared; substitute cards archived; no source connection or imported posts claimed.')

if __name__ == '__main__':
    main()
