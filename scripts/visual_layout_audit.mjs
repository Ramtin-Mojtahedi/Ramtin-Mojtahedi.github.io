import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const auditUrl = process.env.VISUAL_AUDIT_URL || 'http://127.0.0.1:4173/visual-audit.html';
const artifactDirectory = 'visual-audit-artifacts';

const viewports = [
  { name: 'desktop-wide', width: 1600, height: 1000, capture: true },
  { name: 'desktop', width: 1440, height: 900, capture: false },
  { name: 'laptop', width: 1280, height: 800, capture: false },
  { name: 'tablet-landscape', width: 1024, height: 768, capture: false },
  { name: 'tablet-portrait', width: 768, height: 1024, capture: true },
  { name: 'mobile-wide', width: 430, height: 932, capture: false },
  { name: 'mobile', width: 390, height: 844, capture: true },
  { name: 'mobile-small', width: 360, height: 800, capture: false },
  { name: 'mobile-minimum', width: 320, height: 700, capture: false }
];

const ignoredSelectors = [
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

const textSelectors = [
  '.brand',
  '.links a',
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

const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : {})
});
const report = {
  url: auditUrl,
  createdAt: new Date().toISOString(),
  passed: true,
  viewports: []
};

await mkdir(artifactDirectory, { recursive: true });

const auditPage = async (page, viewport, state) => page.evaluate(
  ({ viewport, state, ignoredSelectors, textSelectors, collisionContainers }) => {
    const issues = [];
    const epsilon = 2;

    const isVisible = element => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (Number.parseFloat(style.opacity || '1') === 0) return false;
      const bounds = element.getBoundingClientRect();
      return bounds.width > .5 && bounds.height > .5;
    };

    const ignored = element => ignoredSelectors.some(
      selector => element.matches(selector) || element.closest(selector)
    );

    const descriptor = element => {
      const id = element.id ? `#${element.id}` : '';
      const classes = [...element.classList].slice(0, 3).map(value => `.${value}`).join('');
      return `${element.tagName.toLowerCase()}${id}${classes}`;
    };

    const overlapArea = (left, right) => {
      const width = Math.min(left.right, right.right) - Math.max(left.left, right.left);
      const height = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
      return width > 1.5 && height > 1.5 ? width * height : 0;
    };

    const documentWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth
    );
    if (documentWidth > window.innerWidth + epsilon) {
      issues.push({
        type: 'document-horizontal-overflow',
        documentWidth,
        viewportWidth: window.innerWidth
      });
    }

    document.querySelectorAll(textSelectors.join(',')).forEach(element => {
      if (!isVisible(element) || ignored(element)) return;
      const style = getComputedStyle(element);
      const horizontalOverflow = element.scrollWidth > element.clientWidth + epsilon;
      const clippedVertically =
        element.scrollHeight > element.clientHeight + epsilon &&
        ['hidden', 'clip'].includes(style.overflowY);

      if (horizontalOverflow) {
        issues.push({
          type: 'element-horizontal-overflow',
          element: descriptor(element),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          text: element.textContent.trim().slice(0, 120)
        });
      }
      if (clippedVertically) {
        issues.push({
          type: 'element-vertical-clipping',
          element: descriptor(element),
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          text: element.textContent.trim().slice(0, 120)
        });
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

        for (let leftIndex = 0; leftIndex < children.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < children.length; rightIndex += 1) {
            const left = children[leftIndex];
            const right = children[rightIndex];
            if (left.contains(right) || right.contains(left)) continue;
            const area = overlapArea(left.getBoundingClientRect(), right.getBoundingClientRect());
            if (area > 2) {
              issues.push({
                type: 'sibling-overlap',
                container: descriptor(container),
                elements: [descriptor(left), descriptor(right)],
                overlapArea: Math.round(area)
              });
            }
          }
        }
      });
    });

    document.querySelectorAll('h1, h2, h3, p, li, a, button, label, small').forEach(element => {
      if (!isVisible(element) || ignored(element)) return;
      if (getComputedStyle(element).position === 'fixed') return;
      const bounds = element.getBoundingClientRect();
      if (bounds.left < -epsilon || bounds.right > window.innerWidth + epsilon) {
        issues.push({
          type: 'text-outside-viewport',
          element: descriptor(element),
          left: Math.round(bounds.left),
          right: Math.round(bounds.right),
          viewportWidth: window.innerWidth,
          text: element.textContent.trim().slice(0, 120)
        });
      }
    });

    const requiredStatistics = document.querySelectorAll('.stats > .stat').length;
    if (requiredStatistics !== 7) {
      issues.push({ type: 'unexpected-statistic-count', count: requiredStatistics });
    }

    const runtimeIssues = typeof window.__portfolioLayoutAudit === 'function'
      ? window.__portfolioLayoutAudit()
      : [{ type: 'runtime-layout-audit-missing' }];
    if (runtimeIssues.length) {
      issues.push({ type: 'runtime-layout-issues', issues: runtimeIssues });
    }

    if (document.documentElement.dataset.layoutAudit !== 'clear') {
      issues.push({
        type: 'runtime-layout-state-not-clear',
        state: document.documentElement.dataset.layoutAudit || 'missing'
      });
    }

    return {
      viewport,
      state,
      documentWidth,
      documentHeight: document.documentElement.scrollHeight,
      issues
    };
  },
  { viewport, state, ignoredSelectors, textSelectors, collisionContainers }
);

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      colorScheme: 'light',
      reducedMotion: 'reduce'
    });
    const consoleErrors = [];
    page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`);
    });

    await page.goto(auditUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => document.documentElement.classList.contains('layout-safety-ready'),
      null,
      { timeout: 15000 }
    );
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      document.querySelectorAll('.reveal').forEach(element => element.classList.add('show'));
      const step = Math.max(480, Math.floor(window.innerHeight * .75));
      for (let position = 0; position < document.documentElement.scrollHeight; position += step) {
        window.scrollTo(0, position);
        await new Promise(resolve => setTimeout(resolve, 12));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(120);

    const states = [];
    states.push(await auditPage(page, viewport, 'default'));

    if (viewport.width <= 1040) {
      await page.click('#menu');
      await page.waitForTimeout(80);
      states.push(await auditPage(page, viewport, 'mobile-menu-open'));
      await page.click('#menu');
    }

    await page.evaluate(() => document.getElementById('recognition')?.scrollIntoView());
    await page.click('#awardBtn');
    await page.waitForTimeout(80);
    states.push(await auditPage(page, viewport, 'recognition-expanded'));

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('#theme');
    await page.waitForTimeout(80);
    states.push(await auditPage(page, viewport, 'dark-theme'));

    if (viewport.capture) {
      await page.screenshot({
        path: `${artifactDirectory}/${viewport.name}.jpg`,
        type: 'jpeg',
        quality: 72,
        fullPage: true
      });
    }

    const issues = states.flatMap(result => result.issues.map(issue => ({
      ...issue,
      state: result.state
    })));
    if (consoleErrors.length) {
      issues.push({ type: 'browser-console-errors', errors: consoleErrors });
    }

    report.viewports.push({
      name: viewport.name,
      width: viewport.width,
      height: viewport.height,
      passed: issues.length === 0,
      states,
      consoleErrors,
      issues
    });
    if (issues.length) report.passed = false;
    await page.close();
  }
} finally {
  await browser.close();
}

await writeFile('visual-audit-report.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (!report.passed) {
  console.error('Rendered visual layout audit failed.');
  for (const viewport of report.viewports.filter(result => !result.passed)) {
    console.error(`- ${viewport.name} (${viewport.width}×${viewport.height})`);
    for (const issue of viewport.issues.slice(0, 20)) {
      console.error(`  ${JSON.stringify(issue)}`);
    }
  }
  process.exit(1);
}

console.log(`Rendered layout audit passed across ${report.viewports.length} viewport sizes.`);
