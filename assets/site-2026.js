(() => {
  'use strict';

  const root = document.documentElement;
  const theme = document.getElementById('theme');
  const menu = document.getElementById('menu');
  const links = document.getElementById('links');

  let savedTheme = '';
  try {
    savedTheme = localStorage.getItem('rmTheme') || '';
  } catch (_) {}

  const initialTheme = savedTheme || (
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );

  const setTheme = value => {
    root.dataset.theme = value;
    if (theme) theme.textContent = value === 'dark' ? '☀' : '◐';
    try {
      localStorage.setItem('rmTheme', value);
    } catch (_) {}
  };

  setTheme(initialTheme);
  theme?.addEventListener('click', () => {
    setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  if (menu && links) {
    menu.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      menu.textContent = open ? '×' : '☰';
      menu.setAttribute('aria-expanded', String(open));
    });

    links.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        links.classList.remove('open');
        menu.textContent = '☰';
        menu.setAttribute('aria-expanded', 'false');
      });
    });
  }

  const progress = document.getElementById('progress');
  const updateProgress = () => {
    if (!progress) return;
    const maximum = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = `${maximum > 0 ? (window.scrollY / maximum) * 100 : 0}%`;
  };
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress, { passive: true });
  updateProgress();

  const publicationItems = [...document.querySelectorAll('#publications .pub')];
  const publicationTotal = publicationItems.length;
  const publicationCounter = document.querySelector('.stats .stat:first-child b[data-count]');
  const publicationLabel = publicationCounter?.closest('.stat')?.querySelector('span');
  const allPublicationsFilter = document.querySelector('.filter[data-filter="all"]');
  const scholarFilter = document.querySelector('.filter[data-filter="scholar-auto"]');
  const scholarItems = publicationItems.filter(item =>
    String(item.dataset.group || '').split(/\s+/).includes('scholar-auto')
  );

  if (publicationCounter && publicationTotal) {
    publicationCounter.dataset.count = String(publicationTotal);
    publicationCounter.textContent = String(publicationTotal);
  }
  if (publicationLabel) {
    publicationLabel.textContent = 'Peer-reviewed, accepted, and published works';
  }
  if (allPublicationsFilter && publicationTotal) {
    allPublicationsFilter.textContent = `All ${publicationTotal}`;
  }
  if (scholarFilter && scholarItems.length === 0) {
    scholarFilter.hidden = true;
  }

  const revealElements = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('show');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.08 });
    revealElements.forEach(element => revealObserver.observe(element));
  } else {
    revealElements.forEach(element => element.classList.add('show'));
  }

  const animateCounter = element => {
    if (element.dataset.done) return;

    const parsedTarget = Number(element.dataset.count);
    const target = Number.isFinite(parsedTarget) && parsedTarget >= 0
      ? parsedTarget
      : Number.parseInt(String(element.textContent || '').replace(/[^0-9]/g, ''), 10);

    // A malformed statistic must never become the literal text "NaN". When no
    // valid number can be recovered, leave a safe zero and report the source in
    // the browser console for maintainers.
    if (!Number.isFinite(target) || target < 0) {
      element.dataset.done = 'true';
      element.textContent = element.dataset.suffix ? `0${element.dataset.suffix}` : '0';
      console.error('Invalid data-count value prevented from rendering:', element.dataset.count);
      return;
    }

    element.dataset.done = 'true';
    const suffix = element.dataset.suffix || '';
    const start = performance.now();
    const duration = Math.min(1800, 850 + target * 2);
    element.textContent = `0${suffix}`;

    const tick = now => {
      const proportion = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - proportion, 3);
      const value = Math.round(target * eased);
      element.textContent = `${Number.isFinite(value) ? value.toLocaleString() : '0'}${suffix}`;
      if (proportion < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const counterElements = document.querySelectorAll('[data-count]');
  if ('IntersectionObserver' in window) {
    const counterObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      });
    }, { threshold: 0.5 });
    counterElements.forEach(element => counterObserver.observe(element));
  } else {
    counterElements.forEach(animateCounter);
  }

  document.querySelectorAll('.filter').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.filter').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      const selected = button.dataset.filter || 'all';

      document.querySelectorAll('#publications .pub').forEach(publication => {
        const groups = String(publication.dataset.group || '').split(/\s+/).filter(Boolean);
        publication.hidden = selected !== 'all' && !groups.includes(selected);
      });
    });
  });

  const awardButton = document.getElementById('awardBtn');
  const awards = document.getElementById('awards');
  if (awardButton && awards) {
    const awardTotal = awards.querySelectorAll('.award').length;
    if (awardTotal > 0) {
      awardButton.textContent = `Show all ${awardTotal} distinctions ↓`;
    }

    awardButton.addEventListener('click', () => {
      const open = awards.classList.toggle('open');
      awardButton.setAttribute('aria-expanded', String(open));
      awardButton.textContent = open
        ? 'Show fewer distinctions ↑'
        : `Show all ${awardTotal} distinctions ↓`;
      if (open) awards.querySelectorAll('.extra').forEach(item => item.classList.add('show'));
    });
  }

  const currentYear = document.getElementById('currentYear');
  if (currentYear) currentYear.textContent = String(new Date().getFullYear());
})();