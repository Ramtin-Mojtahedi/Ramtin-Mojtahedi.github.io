(() => {
  const root = document.documentElement;
  const heroPhoto = document.querySelector('.photo img');
  const themeButton = document.getElementById('theme');
  const nav = document.querySelector('.nav');
  const navLinks = [...document.querySelectorAll('.links a[href^="#"]')];
  const sections = [...document.querySelectorAll('main section[id]')];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (heroPhoto) {
    heroPhoto.src = 'assets/ramtin-headshot.svg';
    heroPhoto.alt = 'Professional headshot of Ramtin Mojtahedi';
    heroPhoto.width = 480;
    heroPhoto.height = 514;
    heroPhoto.decoding = 'async';
    heroPhoto.fetchPriority = 'high';
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
