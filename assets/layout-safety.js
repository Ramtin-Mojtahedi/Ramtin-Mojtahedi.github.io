(() => {
  'use strict';

  const root = document.documentElement;
  const ignoredHorizontalSelectors = [
    '.progress',
    '.photoLabel',
    '.badge',
    '.rm-scroll-rail',
    '.rm-cursor-shadow',
    '.rm-cursor-core',
    '.rm-pointer-light',
    '.section-status',
    '.contact-honeypot',
    '.contact-honeypot-input'
  ];

  const overflowSelectors = [
    '.brand',
    '.hero h1',
    '.hero .role',
    '.hero .intro',
    '.actions .btn',
    '.chips span',
    '.impact-intro .title',
    '.impact-intro-description',
    '.impact-principles li',
    '.impact-stat',
    '.stat-kicker',
    '.impact-stat > span:not(.stat-explore)',
    '.section-heading-copy',
    '.section-heading-enhanced .title',
    '.section-context',
    '.entryTop',
    '.entry h3',
    '.entry .org',
    '.expert h3',
    '.expert p',
    '.pub',
    '.pub h3',
    '.pub p',
    '.pub a',
    '.present h3',
    '.present p',
    '.award',
    '.award p',
    '.teach h3',
    '.teach p',
    '.panel',
    '.lead',
    '.lead p',
    '.repo h3',
    '.repo p',
    '.contact h2',
    '.contact p',
    '.social a',
    '.field',
    '.field input',
    '.field textarea',
    '.field select',
    '.foot'
  ];

  const collisionContainers = [
    '.navin',
    '.heroGrid',
    '.impact-intro',
    '.stats',
    '.head',
    '.profileGrid',
    '.flow',
    '.timelineCols',
    '.expertGrid',
    '.cards3',
    '.awardGrid',
    '.teachGrid',
    '.serviceGrid',
    '.leadGrid',
    '.repoGrid',
    '.contactGrid',
    '.form',
    '.foot'
  ];

  const isVisible = element => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (Number.parseFloat(style.opacity || '1') === 0) return false;
    const bounds = element.getBoundingClientRect();
    return bounds.width > .5 && bounds.height > .5;
  };

  const isIgnoredHorizontalElement = element =>
    ignoredHorizontalSelectors.some(selector => element.matches(selector) || element.closest(selector));

  const overlapArea = (left, right) => {
    const width = Math.min(left.right, right.right) - Math.max(left.left, right.left);
    const height = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
    return width > 1.5 && height > 1.5 ? width * height : 0;
  };

  const descriptor = element => {
    if (!(element instanceof Element)) return 'unknown';
    const id = element.id ? `#${element.id}` : '';
    const classes = [...element.classList].slice(0, 3).map(value => `.${value}`).join('');
    return `${element.tagName.toLowerCase()}${id}${classes}`;
  };

  const scanLayout = (applyFixes = true) => {
    const issues = [];
    const viewportWidth = window.innerWidth;

    if (applyFixes) {
      document.querySelectorAll('[data-layout-overflow]').forEach(element => {
        element.removeAttribute('data-layout-overflow');
      });
      document.querySelectorAll('.layout-stack').forEach(element => {
        element.classList.remove('layout-stack');
      });
      root.classList.remove('hero-layout-compact', 'stats-layout-compact');
      if (viewportWidth > 1040) root.classList.remove('nav-layout-compact');
    }

    const nav = document.querySelector('.navin');
    const brand = nav?.querySelector('.brand');
    const links = nav?.querySelector('.links');
    const tools = nav?.querySelector('.tools');
    if (
      viewportWidth > 1040 &&
      nav && brand && links && tools &&
      isVisible(brand) && isVisible(links) && isVisible(tools)
    ) {
      const brandBounds = brand.getBoundingClientRect();
      const linksBounds = links.getBoundingClientRect();
      const toolsBounds = tools.getBoundingClientRect();
      const collides =
        overlapArea(brandBounds, linksBounds) > 0 ||
        overlapArea(linksBounds, toolsBounds) > 0 ||
        brandBounds.left < nav.getBoundingClientRect().left - 1 ||
        toolsBounds.right > nav.getBoundingClientRect().right + 1;
      if (collides) {
        issues.push({ type: 'navigation-collision', element: '.navin' });
        if (applyFixes) root.classList.add('nav-layout-compact');
      }
    }

    const heroTitle = document.querySelector('.hero h1');
    if (heroTitle && isVisible(heroTitle)) {
      const container = heroTitle.parentElement?.getBoundingClientRect();
      const bounds = heroTitle.getBoundingClientRect();
      if (
        heroTitle.scrollWidth > heroTitle.clientWidth + 2 ||
        (container && bounds.right > container.right + 1)
      ) {
        issues.push({ type: 'hero-title-overflow', element: '.hero h1' });
        if (applyFixes) root.classList.add('hero-layout-compact');
      }
    }

    const statistics = [...document.querySelectorAll('.stats > .stat')].filter(isVisible);
    const statisticOverflow = statistics.some(statistic =>
      statistic.scrollWidth > statistic.clientWidth + 2 ||
      statistic.scrollHeight > statistic.clientHeight + 2
    );
    if (statisticOverflow) {
      issues.push({ type: 'statistics-content-overflow', element: '.stats' });
      if (applyFixes) root.classList.add('stats-layout-compact');
    }

    document.querySelectorAll(overflowSelectors.join(',')).forEach(element => {
      if (!isVisible(element)) return;
      const style = getComputedStyle(element);
      const horizontalOverflow = element.scrollWidth > element.clientWidth + 2;
      const clippedVertically =
        element.scrollHeight > element.clientHeight + 2 &&
        ['hidden', 'clip'].includes(style.overflowY);

      if (horizontalOverflow) {
        issues.push({ type: 'content-overflow-x', element: descriptor(element) });
        if (applyFixes) element.setAttribute('data-layout-overflow', 'x');
      }
      if (clippedVertically) {
        issues.push({ type: 'content-clipped-y', element: descriptor(element) });
        if (applyFixes) element.setAttribute('data-layout-overflow', 'clip');
      }
    });

    collisionContainers.forEach(selector => {
      document.querySelectorAll(selector).forEach(container => {
        if (!isVisible(container)) return;
        const children = [...container.children].filter(child => {
          if (!isVisible(child)) return false;
          const position = getComputedStyle(child).position;
          return position !== 'absolute' && position !== 'fixed';
        });

        let collision = false;
        for (let leftIndex = 0; leftIndex < children.length && !collision; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < children.length; rightIndex += 1) {
            if (children[leftIndex].contains(children[rightIndex]) || children[rightIndex].contains(children[leftIndex])) {
              continue;
            }
            if (overlapArea(
              children[leftIndex].getBoundingClientRect(),
              children[rightIndex].getBoundingClientRect()
            ) > 2) {
              collision = true;
              issues.push({
                type: 'sibling-collision',
                element: descriptor(container),
                children: [descriptor(children[leftIndex]), descriptor(children[rightIndex])]
              });
              break;
            }
          }
        }

        if (collision && applyFixes && !container.matches('.navin, .stats')) {
          container.classList.add('layout-stack');
        }
      });
    });

    document.querySelectorAll('h1, h2, h3, p, li, a, button, label, small').forEach(element => {
      if (!isVisible(element) || isIgnoredHorizontalElement(element)) return;
      const position = getComputedStyle(element).position;
      if (position === 'fixed') return;
      const bounds = element.getBoundingClientRect();
      if (bounds.left < -2 || bounds.right > viewportWidth + 2) {
        issues.push({ type: 'text-outside-viewport', element: descriptor(element) });
        if (applyFixes) element.setAttribute('data-layout-overflow', 'x');
      }
    });

    const documentOverflow = document.documentElement.scrollWidth > viewportWidth + 2;
    if (documentOverflow) {
      issues.push({
        type: 'document-overflow-x',
        width: document.documentElement.scrollWidth,
        viewport: viewportWidth
      });
    }

    root.dataset.layoutAudit = issues.length ? 'adjusted' : 'clear';
    return issues;
  };

  let frame = 0;
  const scheduleAudit = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      scanLayout(true);
      requestAnimationFrame(() => scanLayout(true));
    });
  };

  window.__portfolioLayoutAudit = () => scanLayout(false);
  window.addEventListener('resize', scheduleAudit, { passive: true });
  window.addEventListener('load', scheduleAudit, { once: true });
  document.addEventListener('click', event => {
    if (event.target.closest('#menu, #awardBtn, #theme, .filter')) {
      setTimeout(scheduleAudit, 40);
    }
  });

  if (document.fonts?.ready) {
    document.fonts.ready.then(scheduleAudit).catch(() => scheduleAudit());
  }

  scheduleAudit();
  root.classList.add('layout-safety-ready');
})();
