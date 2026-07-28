(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sectionConfiguration = [
    {
      id: 'expertise',
      number: '01',
      kicker: 'Technical capabilities',
      title: 'Advanced capabilities for clinically grounded research.',
      description: 'Methods, frameworks, data systems, and evaluation practices spanning the complete clinical research workflow.',
      replaceContext: true
    },
    {
      id: 'profile',
      number: '02',
      kicker: 'Research profile',
      title: 'Research built for clinical translation.',
      description: 'Medical imaging, foundation models, multimodal prediction, and rigorous evaluation aligned with real clinical questions.'
    },
    {
      id: 'experience',
      number: '03',
      kicker: 'Experience & education',
      title: 'A multidisciplinary record across medicine, computing, and engineering.',
      description: 'Research appointments and academic training supporting technically rigorous, reproducible, and clinically relevant work.'
    },
    {
      id: 'publications',
      number: '04',
      kicker: 'Research output',
      description: 'Peer-reviewed and accepted work spanning medical imaging, clinical prediction, segmentation, and biomedical engineering.'
    },
    {
      id: 'presentations',
      number: '05',
      kicker: 'Conference contributions',
      description: 'Research communicated across medical imaging, oncology, neuroscience, and biomedical engineering venues.'
    },
    {
      id: 'recognition',
      number: '06',
      kicker: 'Honours & recognition',
      description: 'Competitive recognition for research achievement, leadership, innovation, and community contribution.'
    },
    {
      id: 'teaching',
      number: '07',
      kicker: 'Teaching impact',
      description: 'Instruction, mentorship, and academic support across computing, engineering, and technical problem-solving.'
    },
    {
      id: 'service',
      number: '08',
      kicker: 'Leadership & service',
      description: 'Leadership, mentorship, outreach, sustainability, student support, and professional contribution.'
    },
    {
      id: 'code',
      number: '09',
      kicker: 'Open-source work',
      description: 'Selected public implementations supporting segmentation, representation learning, and clinical prediction.'
    },
    {
      id: 'contact',
      number: '10',
      kicker: 'Professional contact',
      title: 'Collaboration and professional inquiries.',
      description: 'Research collaboration, speaking, reviewing, technical discussion, mentorship, and related professional opportunities.'
    }
  ];

  const statisticConfiguration = [
    { label: 'Research output', target: 'publications' },
    { label: 'Conference activity', target: 'presentations' },
    { label: 'Recognition', target: 'recognition' },
    { label: 'Professional service', target: 'service' },
    { label: 'Teaching reach', target: 'teaching' },
    { label: 'Leadership', target: 'service' },
    { label: 'Technical breadth', target: 'expertise' }
  ];

  const createElement = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };

  const snapshotSection = document.querySelector('.statsSec');
  const snapshotWrap = snapshotSection?.querySelector('.wrap');
  const statistics = snapshotWrap ? [...snapshotWrap.querySelectorAll('.stats .stat')] : [];

  if (snapshotSection && snapshotWrap) {
    snapshotSection.id = 'snapshot';
    snapshotSection.dataset.sectionNumber = '00';

    if (!snapshotWrap.querySelector('.impact-intro')) {
      const header = createElement('header', 'impact-intro reveal');
      header.setAttribute('aria-labelledby', 'snapshot-title');

      const copy = createElement('div', 'impact-intro-copy');
      const kicker = createElement('p', 'kicker', 'Professional snapshot');
      const title = createElement(
        'h2',
        'title',
        'Research, leadership, and technical impact at a glance.'
      );
      title.id = 'snapshot-title';
      const description = createElement(
        'p',
        'impact-intro-description',
        'A concise view of scholarly output, conference activity, recognition, professional service, teaching reach, leadership, and programming breadth.'
      );
      copy.append(kicker, title, description);

      const principles = createElement('ul', 'impact-principles');
      principles.setAttribute('aria-label', 'Professional priorities');
      ['Clinical relevance', 'Technical rigour', 'Reproducible delivery'].forEach(value => {
        principles.appendChild(createElement('li', '', value));
      });

      header.append(copy, principles);
      snapshotWrap.insertBefore(header, snapshotWrap.firstChild);
    }
  }

  statistics.forEach((statistic, index) => {
    const configuration = statisticConfiguration[index];
    if (!configuration || statistic.dataset.impactReady === 'true') return;

    statistic.dataset.impactReady = 'true';
    statistic.dataset.target = configuration.target;
    statistic.classList.add('impact-stat');
    statistic.tabIndex = 0;
    statistic.setAttribute('role', 'link');

    const category = createElement('small', 'stat-kicker', configuration.label);
    statistic.prepend(category);

    const arrow = createElement('span', 'stat-explore', 'View section');
    arrow.setAttribute('aria-hidden', 'true');
    statistic.appendChild(arrow);

    const number = statistic.querySelector('b');
    const label = statistic.querySelector(':scope > span:not(.stat-explore)');
    const numberText = number?.textContent?.trim() || number?.dataset.count || '';
    const labelText = label?.textContent?.trim() || configuration.label;
    statistic.setAttribute(
      'aria-label',
      `${numberText} ${labelText}. Open the ${configuration.label.toLowerCase()} section.`
    );

    const activate = () => {
      document.getElementById(configuration.target)?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start'
      });
    };

    statistic.addEventListener('click', activate);
    statistic.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activate();
    });

    statistic.addEventListener('pointermove', event => {
      const bounds = statistic.getBoundingClientRect();
      statistic.style.setProperty('--impact-x', `${event.clientX - bounds.left}px`);
      statistic.style.setProperty('--impact-y', `${event.clientY - bounds.top}px`);
    }, { passive: true });
  });

  const sectionRecords = [];

  sectionConfiguration.forEach(configuration => {
    const section = document.getElementById(configuration.id);
    if (!section) return;

    const heading = configuration.id === 'profile'
      ? section.querySelector('.sticky')
      : configuration.id === 'contact'
        ? section.querySelector('.contactGrid > div')
        : section.querySelector('.head');

    if (!heading) return;

    heading.classList.add('section-heading-enhanced');
    section.dataset.sectionNumber = configuration.number;
    section.dataset.sectionLabel = configuration.kicker;

    const kicker = heading.querySelector('.kicker');
    const title = heading.querySelector('.title, h2');
    const copy = kicker?.parentElement || heading;
    copy.classList.add('section-heading-copy');

    if (!copy.querySelector(':scope > .section-index')) {
      const sectionIndex = createElement('span', 'section-index', configuration.number);
      sectionIndex.setAttribute('aria-hidden', 'true');
      copy.insertBefore(sectionIndex, copy.firstChild);
    }

    if (kicker && configuration.kicker) kicker.textContent = configuration.kicker;
    if (title && configuration.title) title.textContent = configuration.title;

    if (title) {
      title.id ||= `${configuration.id}-title`;
      section.setAttribute('aria-labelledby', title.id);
    }

    let context = [...heading.children].find(element =>
      element.tagName === 'P' && !element.classList.contains('kicker')
    );

    if (!context && configuration.description) {
      context = createElement('p', 'section-context', configuration.description);
      if (configuration.id === 'profile' || configuration.id === 'contact') {
        title?.insertAdjacentElement('afterend', context);
      } else {
        heading.appendChild(context);
      }
    } else if (context) {
      context.classList.add('section-context');
      if (configuration.description && (configuration.replaceContext || !context.textContent.trim())) {
        context.textContent = configuration.description;
      }
    }

    sectionRecords.push({
      element: section,
      number: configuration.number,
      label: configuration.kicker
    });
  });

  const cards = document.querySelectorAll(
    '.expert, .present, .teach, .repo, .panel, .pub, .award, .lead'
  );
  cards.forEach(card => card.classList.add('impact-card'));

  const hero = document.getElementById('home');
  hero?.classList.add('hero-impact-ready');
  hero?.querySelector('.chips')?.setAttribute('aria-label', 'Core research capabilities');

  const status = createElement('div', 'section-status');
  status.setAttribute('aria-hidden', 'true');
  status.innerHTML = `
    <span class="section-status-number">00</span>
    <span class="section-status-label">Professional snapshot</span>
  `;
  document.body.appendChild(status);

  const observedSections = snapshotSection
    ? [{ element: snapshotSection, number: '00', label: 'Professional snapshot' }, ...sectionRecords]
    : sectionRecords;

  const statusNumber = status.querySelector('.section-status-number');
  const statusLabel = status.querySelector('.section-status-label');
  let currentSection = null;
  let scrollFrame = 0;

  const updateCurrentSection = () => {
    scrollFrame = 0;
    const marker = window.innerHeight * 0.38;
    let selected = observedSections[0] || null;
    let selectedDistance = Number.POSITIVE_INFINITY;

    observedSections.forEach(record => {
      const bounds = record.element.getBoundingClientRect();
      const containsMarker = bounds.top <= marker && bounds.bottom >= marker;
      const distance = containsMarker ? -1 : Math.abs(bounds.top - marker);
      if (distance < selectedDistance) {
        selected = record;
        selectedDistance = distance;
      }
    });

    if (!selected || currentSection === selected.element) return;
    currentSection?.classList.remove('section-current');
    currentSection = selected.element;
    currentSection.classList.add('section-current');
    statusNumber.textContent = selected.number;
    statusLabel.textContent = selected.label;
  };

  const requestCurrentSectionUpdate = () => {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(updateCurrentSection);
  };

  window.addEventListener('scroll', requestCurrentSectionUpdate, { passive: true });
  window.addEventListener('resize', requestCurrentSectionUpdate, { passive: true });
  window.addEventListener('load', requestCurrentSectionUpdate, { once: true });
  updateCurrentSection();

  document.documentElement.classList.add('impact-ready');
})();
