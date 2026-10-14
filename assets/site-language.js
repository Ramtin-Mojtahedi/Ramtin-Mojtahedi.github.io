/* Public website translation links. No visitor form data is read or transmitted. */
(() => {
  'use strict';

  const publicOrigin = 'https://ramtin-mojtahedi.github.io';
  const languages = [
    { code: 'en', lang: 'en', name: 'English', english: 'English' },
    { code: 'zh-CN', lang: 'zh-Hans', name: '简体中文', english: 'Simplified Chinese' },
    { code: 'hi', lang: 'hi', name: 'हिन्दी', english: 'Hindi' },
    { code: 'es', lang: 'es', name: 'Español', english: 'Spanish' },
    { code: 'fr', lang: 'fr', name: 'Français', english: 'French' },
    { code: 'ar', lang: 'ar', name: 'العربية', english: 'Arabic', direction: 'rtl' },
    { code: 'bn', lang: 'bn', name: 'বাংলা', english: 'Bengali' },
    { code: 'pt', lang: 'pt', name: 'Português', english: 'Portuguese' },
    { code: 'ru', lang: 'ru', name: 'Русский', english: 'Russian' },
    { code: 'ur', lang: 'ur', name: 'اردو', english: 'Urdu', direction: 'rtl' }
  ];

  function publicPageUrl() {
    let pathname = window.location.pathname;
    const canonical = document.querySelector('link[rel="canonical"]');
    // Canonicals give local previews the same public path as the published site.
    if (window.location.origin !== publicOrigin && canonical) {
      try {
        const canonicalUrl = new URL(canonical.href);
        if (canonicalUrl.origin === publicOrigin) pathname = canonicalUrl.pathname;
      } catch (_) { /* The public-origin fallback below remains safe. */ }
    }
    const page = new URL(publicOrigin);
    page.pathname = pathname;
    // Keep an existing public section anchor, never query strings or arbitrary fragments.
    try {
      const fragment = decodeURIComponent(window.location.hash.slice(1));
      const target = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(fragment)
        ? document.getElementById(fragment) : null;
      if (target && !target.matches('input, textarea, select, button, form')) {
        page.hash = fragment;
      }
    } catch (_) { /* Malformed fragments are omitted. */ }
    return page.href;
  }

  function languageUrl(code) {
    const original = publicPageUrl();
    if (code === 'en') return original;
    const translated = new URL('https://translate.google.com/translate');
    translated.searchParams.set('sl', 'en');
    translated.searchParams.set('tl', code);
    translated.searchParams.set('u', original);
    return translated.href;
  }

  function selectedLanguage() {
    // Google's translated-page proxy exposes the selected language in its URL.
    if (window.location.hostname.endsWith('.translate.goog')) {
      const code = new URLSearchParams(window.location.search).get('_x_tr_tl');
      const selected = languages.find(language => language.code.toLowerCase() === (code || '').toLowerCase());
      if (selected) return selected;
    }
    return languages[0];
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function globe() {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '19');
    svg.setAttribute('height', '19');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('aria-hidden', 'true');
    const shapes = [
      ['circle', { cx: '12', cy: '12', r: '9' }],
      ['ellipse', { cx: '12', cy: '12', rx: '4', ry: '9' }],
      ['path', { d: 'M3 12h18' }]
    ];
    shapes.forEach(([tag, attributes]) => {
      const shape = document.createElementNS(namespace, tag);
      Object.entries(attributes).forEach(([name, value]) => shape.setAttribute(name, value));
      svg.append(shape);
    });
    return svg;
  }

  function mount() {
    if (document.querySelector('.site-language')) return;
    const host = document.querySelector('.tools') || document.querySelector('.site-header');
    if (!host) return;

    const selected = selectedLanguage();
    const selector = element('details', 'site-language notranslate');
    selector.setAttribute('translate', 'no');
    selector.setAttribute('dir', 'ltr');
    const summary = element('summary', 'site-language-trigger');
    summary.setAttribute('aria-label', `Choose website language. Current language: ${selected.english}`);
    const label = element('span', 'site-language-current', selected.name);
    label.setAttribute('lang', selected.lang);
    label.setAttribute('dir', selected.direction || 'ltr');
    const chevron = element('span', 'site-language-chevron', '⌄');
    chevron.setAttribute('aria-hidden', 'true');
    summary.append(globe(), label, chevron);

    const panel = element('div', 'site-language-panel');
    const heading = element('p', 'site-language-heading', 'Choose your language');
    heading.id = 'site-language-heading';
    const list = element('ul', 'site-language-list');
    list.setAttribute('aria-labelledby', heading.id);
    const links = [];
    languages.forEach(language => {
      const item = element('li');
      const link = element('a', 'site-language-option');
      link.href = languageUrl(language.code);
      link.dataset.language = language.code;
      link.setAttribute('aria-label', language.code === 'en'
        ? 'English — original website' : `${language.english} — translate website with Google Translate`);
      link.setAttribute('referrerpolicy', 'no-referrer');
      link.target = '_top';
      if (language.code === selected.code) link.setAttribute('aria-current', 'true');
      const nativeName = element('span', 'site-language-name', language.name);
      nativeName.setAttribute('lang', language.lang);
      nativeName.setAttribute('dir', language.direction || 'ltr');
      const marker = element('span', 'site-language-marker', language.code === selected.code ? '✓' : '↗');
      marker.setAttribute('aria-hidden', 'true');
      link.append(nativeName, marker);
      item.append(link);
      list.append(item);
      links.push(link);
    });
    const notice = element('p', 'site-language-notice');
    const provider = element('a', '', 'Translations by Google Translate');
    provider.href = 'https://support.google.com/translate/answer/2534559?hl=en';
    provider.target = '_blank';
    provider.rel = 'noopener noreferrer';
    notice.append(provider, element('span', '', 'The English version is the original.'));
    panel.append(heading, list, notice);
    selector.append(summary, panel);
    host.prepend(selector);
    host.classList.add('has-site-language');

    const refreshLinks = () => links.forEach(link => {
      link.href = languageUrl(link.dataset.language);
    });
    links.forEach(link => {
      link.addEventListener('click', event => {
        // Rebuild links if Google's proxy has rewritten an anchor after mounting.
        link.href = languageUrl(link.dataset.language);
        if (link.dataset.language !== 'en') return;
        try {
          window.top.location.href = publicPageUrl();
          event.preventDefault();
        } catch (_) { /* The original-page anchor remains the fallback. */ }
      });
    });
    const positionPanel = () => {
      const bounds = summary.getBoundingClientRect();
      const top = Math.max(12, Math.min(bounds.bottom + 10, window.innerHeight - 120));
      selector.style.setProperty('--site-language-top', `${top}px`);
    };
    selector.addEventListener('toggle', () => {
      if (!selector.open) return;
      refreshLinks();
      positionPanel();
    });
    // Plain anchor navigation works independently of JavaScript after mounting.
    window.addEventListener('hashchange', refreshLinks);
    window.addEventListener('resize', () => { if (selector.open) positionPanel(); }, { passive: true });
    document.addEventListener('click', event => {
      if (selector.open && !selector.contains(event.target)) selector.open = false;
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && selector.open) {
        selector.open = false;
        summary.focus();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
