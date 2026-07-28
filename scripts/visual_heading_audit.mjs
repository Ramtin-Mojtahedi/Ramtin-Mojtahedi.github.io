import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const auditUrl = process.env.VISUAL_AUDIT_URL || 'http://127.0.0.1:4173/visual-audit.html';
const viewports = [
  { name: 'desktop-wide', width: 1600, height: 1000 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'mobile-wide', width: 430, height: 932 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'mobile-minimum', width: 320, height: 700 }
];

const browser = await chromium.launch({ headless: true });
const report = {
  url: auditUrl,
  createdAt: new Date().toISOString(),
  passed: true,
  viewports: []
};

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      colorScheme: 'light',
      reducedMotion: 'reduce'
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
    });
    await page.waitForTimeout(120);

    const result = await page.evaluate(viewport => {
      const selectors = [
        '#home h1',
        '.impact-intro .title',
        '.section-heading-enhanced .title',
        '.contact .section-heading-enhanced h2'
      ];
      const issues = [];

      const descriptor = element => {
        const section = element.closest('section[id]')?.id || 'unknown-section';
        const classes = [...element.classList].map(value => `.${value}`).join('');
        return `${section}:${element.tagName.toLowerCase()}${classes}`;
      };

      const textNodes = element => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        return nodes;
      };

      document.querySelectorAll(selectors.join(',')).forEach(heading => {
        const style = getComputedStyle(heading);
        const bounds = heading.getBoundingClientRect();
        if (bounds.left < -2 || bounds.right > window.innerWidth + 2) {
          issues.push({
            type: 'heading-outside-viewport',
            heading: descriptor(heading),
            text: heading.textContent.trim(),
            left: Math.round(bounds.left),
            right: Math.round(bounds.right),
            viewportWidth: window.innerWidth
          });
        }
        if (style.hyphens !== 'none') {
          issues.push({
            type: 'heading-hyphenation-enabled',
            heading: descriptor(heading),
            computedHyphens: style.hyphens
          });
        }

        textNodes(heading).forEach(node => {
          const value = node.nodeValue || '';
          const pattern = /\S+/g;
          let match;
          while ((match = pattern.exec(value)) !== null) {
            const word = match[0];
            if (word.length < 5 || /[-–—/]/.test(word)) continue;
            const range = document.createRange();
            range.setStart(node, match.index);
            range.setEnd(node, match.index + word.length);
            const rects = [...range.getClientRects()].filter(rect => rect.width > .5 && rect.height > .5);
            range.detach();
            if (rects.length > 1) {
              issues.push({
                type: 'split-heading-word',
                heading: descriptor(heading),
                word,
                text: heading.textContent.trim(),
                fragments: rects.map(rect => ({
                  left: Math.round(rect.left),
                  top: Math.round(rect.top),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height)
                }))
              });
            }
          }
        });
      });

      return { viewport, issues };
    }, viewport);

    report.viewports.push({
      ...viewport,
      passed: result.issues.length === 0,
      issues: result.issues
    });
    if (result.issues.length) report.passed = false;
    await page.close();
  }
} finally {
  await browser.close();
}

await writeFile(
  'visual-heading-audit-report.json',
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8'
);

if (!report.passed) {
  console.error('Rendered heading-wrap audit failed.');
  for (const viewport of report.viewports.filter(result => !result.passed)) {
    console.error(`- ${viewport.name} (${viewport.width}×${viewport.height})`);
    for (const issue of viewport.issues) console.error(`  ${JSON.stringify(issue)}`);
  }
  process.exit(1);
}

console.log(`Heading-wrap audit passed across ${report.viewports.length} viewport sizes.`);
