(() => {
  'use strict';

  const root = document.documentElement;
  const nav = document.querySelector('.nav');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* Scroll depth: top glow, navigation shadow, side progress rail, and percentage. */
  const shadowBand = document.createElement('div');
  shadowBand.className = 'rm-scroll-shadow-band';
  shadowBand.setAttribute('aria-hidden', 'true');
  document.body.appendChild(shadowBand);

  const rail = document.createElement('div');
  rail.className = 'rm-scroll-rail';
  rail.setAttribute('aria-hidden', 'true');
  rail.innerHTML = `
    <span class="rm-scroll-rail-label">Scroll</span>
    <span class="rm-scroll-track">
      <span class="rm-scroll-fill"></span>
      <span class="rm-scroll-marker"></span>
    </span>
    <span class="rm-scroll-value">0%</span>
  `;
  document.body.appendChild(rail);

  const fill = rail.querySelector('.rm-scroll-fill');
  const marker = rail.querySelector('.rm-scroll-marker');
  const value = rail.querySelector('.rm-scroll-value');
  let scrollFrame = 0;

  function renderScrollDepth() {
    scrollFrame = 0;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
    const percentage = Math.round(progress * 100);

    root.style.setProperty('--rm-scroll-progress', progress.toFixed(4));
    fill.style.transform = `scaleY(${progress})`;
    marker.style.bottom = `${progress * 100}%`;
    value.textContent = `${percentage}%`;

    const hasDepth = window.scrollY > 18;
    nav?.classList.toggle('rm-scroll-depth', hasDepth);
    rail.classList.toggle('rm-visible', maxScroll > 240 && (hasDepth || progress > .015));
    shadowBand.style.opacity = hasDepth ? String(Math.min(.42, .12 + progress * .30)) : '0';
  }

  function requestScrollRender() {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(renderScrollDepth);
  }

  window.addEventListener('scroll', requestScrollRender, { passive: true });
  window.addEventListener('resize', requestScrollRender, { passive: true });
  window.addEventListener('load', requestScrollRender, { once: true });
  renderScrollDepth();

  /* Pointer depth: retain the normal cursor and add a restrained shadow ring. */
  if (!reduceMotion && finePointer) {
    const ring = document.createElement('div');
    const core = document.createElement('div');
    ring.className = 'rm-cursor-shadow';
    core.className = 'rm-cursor-core';
    ring.setAttribute('aria-hidden', 'true');
    core.setAttribute('aria-hidden', 'true');
    document.body.append(ring, core);

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let ringX = targetX;
    let ringY = targetY;
    let pointerVisible = false;

    const positionLayer = (element, x, y) => {
      element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    };

    function drawPointer() {
      ringX += (targetX - ringX) * .19;
      ringY += (targetY - ringY) * .19;
      positionLayer(ring, ringX, ringY);
      positionLayer(core, targetX, targetY);
      window.requestAnimationFrame(drawPointer);
    }

    window.addEventListener('pointermove', event => {
      targetX = event.clientX;
      targetY = event.clientY;
      if (!pointerVisible) {
        pointerVisible = true;
        ring.classList.add('rm-visible');
        core.classList.add('rm-visible');
      }
    }, { passive: true });

    document.documentElement.addEventListener('mouseleave', () => {
      pointerVisible = false;
      ring.classList.remove('rm-visible', 'rm-hover', 'rm-pressed');
      core.classList.remove('rm-visible', 'rm-pressed');
    });

    window.addEventListener('blur', () => {
      ring.classList.remove('rm-visible', 'rm-hover', 'rm-pressed');
      core.classList.remove('rm-visible', 'rm-pressed');
    });

    document.addEventListener('pointerover', event => {
      const interactive = event.target.closest(
        'a, button, input, textarea, select, summary, label, [role="button"], [tabindex]:not([tabindex="-1"])'
      );
      ring.classList.toggle('rm-hover', Boolean(interactive));
    }, { passive: true });

    document.addEventListener('pointerout', event => {
      if (!event.relatedTarget) return;
      const nextInteractive = event.relatedTarget.closest?.(
        'a, button, input, textarea, select, summary, label, [role="button"], [tabindex]:not([tabindex="-1"])'
      );
      ring.classList.toggle('rm-hover', Boolean(nextInteractive));
    }, { passive: true });

    document.addEventListener('pointerdown', () => {
      ring.classList.add('rm-pressed');
      core.classList.add('rm-pressed');
    }, { passive: true });

    document.addEventListener('pointerup', () => {
      ring.classList.remove('rm-pressed');
      core.classList.remove('rm-pressed');
    }, { passive: true });

    drawPointer();
  }
})();
