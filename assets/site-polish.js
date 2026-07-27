(() => {
  const root = document.documentElement;
  const heroPhoto = document.querySelector('.photo img');
  const themeButton = document.getElementById('theme');
  const nav = document.querySelector('.nav');
  const navLinks = [...document.querySelectorAll('.links a[href^="#"]')];
  const sections = [...document.querySelectorAll('main section[id]')];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // The professional headshot is embedded directly in this JavaScript file so it
  // remains visible even when a browser blocks or delays SVG/image asset loading.
  const headshot = 'data:image/webp;base64,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';

  if (heroPhoto) {
    heroPhoto.src = headshot;
    heroPhoto.alt = 'Professional headshot of Ramtin Mojtahedi';
    heroPhoto.width = 480;
    heroPhoto.height = 514;
    heroPhoto.decoding = 'async';
    heroPhoto.fetchPriority = 'high';
    heroPhoto.style.opacity = '1';
    heroPhoto.addEventListener('error', () => {
      heroPhoto.src = 'https://avatars.githubusercontent.com/u/85639926?v=4';
    }, { once: true });
  }

  const photoLabel = document.querySelector('.photoLabel');
  if (photoLabel) {
    photoLabel.innerHTML = '<b>Ramtin Mojtahedi, Ph.D.</b><span>Postdoctoral Medical AI Researcher · UHN / University of Toronto</span>';
  }

  const icons = {
    light: '<svg class="rm-theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"></path></svg>',
    dark: '<svg class="rm-theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20.4 15.3A8.5 8.5 0 0 1 8.7 3.6 8.5 8.5 0 1 0 20.4 15.3Z"></path></svg>'
  };

  function syncThemeControl() {
    if (!themeButton) return;
    const dark = root.dataset.theme === 'dark';
    themeButton.innerHTML = `${dark ? icons.light : icons.dark}<span class="rm-theme-text">${dark ? 'Light' : 'Dark'}</span>`;
    themeButton.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    themeButton.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
    themeButton.setAttribute('aria-pressed', String(dark));
  }

  syncThemeControl();
  if (themeButton) {
    themeButton.addEventListener('click', () => requestAnimationFrame(syncThemeControl));
  }
  new MutationObserver(syncThemeControl).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  const backTop = document.createElement('button');
  backTop.type = 'button';
  backTop.className = 'rm-back-top';
  backTop.setAttribute('aria-label', 'Back to top');
  backTop.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="m6 15 6-6 6 6"></path></svg>';
  document.body.appendChild(backTop);
  backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }));

  function updateNavigation() {
    const y = window.scrollY;
    nav?.classList.toggle('rm-scrolled', y > 18);
    backTop.classList.toggle('rm-show', y > 620);
  }
  window.addEventListener('scroll', updateNavigation, { passive: true });
  updateNavigation();

  if ('IntersectionObserver' in window && sections.length) {
    const sectionObserver = new IntersectionObserver(entries => {
      const active = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!active) return;
      navLinks.forEach(link => {
        link.classList.toggle('rm-active', link.getAttribute('href') === `#${active.target.id}`);
      });
    }, { rootMargin: '-30% 0px -60% 0px', threshold: [0, .1, .35] });
    sections.forEach(section => sectionObserver.observe(section));
  }

  document.querySelectorAll('.expert, .present, .teach, .repo, .panel').forEach(card => {
    card.addEventListener('pointermove', event => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--rm-x', `${event.clientX - rect.left}px`);
      card.style.setProperty('--rm-y', `${event.clientY - rect.top}px`);
    }, { passive: true });
  });

  if (!reduceMotion && finePointer) {
    const light = document.createElement('div');
    light.className = 'rm-pointer-light';
    light.setAttribute('aria-hidden', 'true');
    document.body.prepend(light);

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let currentX = targetX;
    let currentY = targetY;

    window.addEventListener('pointermove', event => {
      targetX = event.clientX;
      targetY = event.clientY;
      light.classList.add('rm-visible');
    }, { passive: true });

    document.documentElement.addEventListener('mouseleave', () => light.classList.remove('rm-visible'));

    const draw = () => {
      currentX += (targetX - currentX) * .14;
      currentY += (targetY - currentY) * .14;
      light.style.transform = `translate3d(${currentX - 195}px, ${currentY - 195}px, 0)`;
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }
})();
