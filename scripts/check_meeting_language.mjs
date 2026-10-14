/* Focused regression checks for meeting requests and public translation links. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'http://127.0.0.1:4173';
const publicOrigin = 'https://ramtin-mojtahedi.github.io';
const expectedCodes = ['en', 'zh-CN', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'ur', 'fa'];
const outputDirectory = process.env.SITE_AUDIT_SCREENSHOTS;
const currentConfig = JSON.parse(await readFile(path.join(root, 'assets/booking-config.json'), 'utf8'));
let checks = 0;

function check(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  checks += 1;
}

// Offline mode preserves public-looking URLs while serving actual local assets.
// It supports restricted local environments without changing the production code.
async function serveLocal(page) {
  if (!process.env.SITE_AUDIT_LOCAL_FILES) return;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    let filename;
    if (url.origin === origin) {
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      filename = path.resolve(root, '.' + pathname);
      if (!filename.startsWith(root + path.sep)) return route.fulfill({ status: 403, body: '' });
    } else if (url.hostname === 'avatars.githubusercontent.com') {
      filename = path.join(root, 'assets/news/author-profile.jpg');
    } else {
      return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
    }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
      '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };
    try {
      return route.fulfill({ status: 200, contentType: types[path.extname(filename)] || 'application/octet-stream', body: await readFile(filename) });
    } catch (_) { return route.fulfill({ status: 404, body: 'Missing audit fixture' }); }
  });
}

const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
  await page.clock.install({ time: new Date('2026-10-14T16:00:00Z') });
  await serveLocal(page);
  const configurationRoute = '**/assets/booking-config.json';
  const fallbackConfig = route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ provider: null, bookingUrl: null, defaultTimeZone: 'America/Toronto' }) });
  await page.route(configurationRoute, fallbackConfig);
  await page.goto(`${origin}/visual-audit.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.SiteBooking && document.querySelector('.site-language-option'));

  const calendarResults = await page.evaluate(() => {
    const api = window.SiteBooking;
    const iso = (date, time, zone) => new Date(api.localTimeToUTC(date, time, zone)).toISOString();
    const throws = callback => { try { callback(); return false; } catch (_) { return true; } };
    const now = Date.parse('2026-10-14T16:00:00Z');
    const values = { name: 'Calendar Test', email: 'calendar-test@example.com', purpose: 'research',
      date: '2026-11-04', time: '10:00', timezone: 'America/Toronto', duration: '60',
      message: 'Research; discussion, and \\ notes\r\nSTATUS:CONFIRMED\n' + 'Résumé 世界 '.repeat(16) };
    const proposal = api.buildProposal(values, now);
    const ics = api.createICS(proposal, now, 'smoke-test');
    const physicalLines = ics.split('\r\n');
    const unfolded = ics.replace(/\r\n[ \t]/g, '');
    const mailto = new URL(api.mailtoFor(proposal));
    return {
      summer: iso('2026-10-14', '10:00', 'America/Toronto'),
      winter: iso('2026-11-04', '10:00', 'America/Toronto'),
      beforeFall: iso('2026-11-01', '00:30', 'America/Toronto'),
      afterFall: iso('2026-11-01', '02:30', 'America/Toronto'),
      halfHour: iso('2026-11-04', '10:00', 'Asia/Kolkata'),
      repeatedHourRejected: throws(() => api.localTimeToUTC('2026-11-01', '01:30', 'America/Toronto')),
      skippedHourRejected: throws(() => api.localTimeToUTC('2027-03-14', '02:30', 'America/Toronto')),
      invalidDateRejected: throws(() => api.localTimeToUTC('2026-02-29', '10:00', 'America/Toronto')),
      invalidZoneRejected: throws(() => api.localTimeToUTC('2026-11-04', '10:00', 'Invalid/Zone')),
      pastRejected: throws(() => api.buildProposal({ ...values, date: '2026-10-13' }, now)),
      nameHeaderInjectionRejected: throws(() => api.buildProposal({ ...values, name: 'Test\r\nATTENDEE:test@example.com' }, now)),
      durationMinutes: (proposal.end - proposal.start) / 60000,
      crlfOnly: !/(?<!\r)\n/.test(ics),
      utf8Folded: physicalLines.every(line => new TextEncoder().encode(line).length <= 75),
      preservedUnicode: unfolded.includes('Résumé 世界 '.repeat(16).trim()),
      escapedText: unfolded.includes('Research\\; discussion\\, and \\\\ notes\\nSTATUS:CONFIRMED\\n'),
      tentativeOnly: unfolded.includes('\r\nSTATUS:TENTATIVE\r\n') && !unfolded.includes('\r\nSTATUS:CONFIRMED\r\n'),
      utcStart: unfolded.includes('\r\nDTSTART:20261104T150000Z\r\n'),
      utcEnd: unfolded.includes('\r\nDTEND:20261104T160000Z\r\n'),
      noMeetingInvitation: !/\r\n(?:METHOD:REQUEST|ORGANIZER[;:]|ATTENDEE[;:])/.test(unfolded),
      completeEvent: unfolded.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n') && unfolded.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n'),
      mailtoScheme: mailto.protocol,
      mailtoRecipient: decodeURIComponent(mailto.pathname),
      mailtoUTC: mailto.searchParams.get('body').includes('UTC start: 2026-11-04T15:00:00.000Z'),
      validCalendly: !!api.validBookingURL('calendly', 'https://calendly.com/test-profile/conversation'),
      validCal: !!api.validBookingURL('cal', 'https://cal.com/test-profile/conversation'),
      rejectsSpoof: api.validBookingURL('calendly', 'https://calendly.com.evil.example/test/event') === null,
      rejectsCredentials: api.validBookingURL('calendly', 'https://user:password@calendly.com/test/event') === null,
      rejectsHTTP: api.validBookingURL('calendly', 'http://calendly.com/test/event') === null
    };
  });
  const expectedCalendar = {
    summer: '2026-10-14T14:00:00.000Z', winter: '2026-11-04T15:00:00.000Z',
    beforeFall: '2026-11-01T04:30:00.000Z', afterFall: '2026-11-01T07:30:00.000Z',
    halfHour: '2026-11-04T04:30:00.000Z', durationMinutes: 60,
    mailtoScheme: 'mailto:', mailtoRecipient: 'Ramtin.Mojtahedi@utoronto.ca'
  };
  for (const [key, actual] of Object.entries(calendarResults)) check(actual, expectedCalendar[key] ?? true, key);

  for (const [route, expectedPath] of [
    ['/visual-audit.html', '/'], ['/about/', '/about/'], ['/research/', '/research/'],
    ['/publications/', '/publications/'],
    ['/publications/self-supervised-transformer-liver-tumor-2026/', '/publications/self-supervised-transformer-liver-tumor-2026/']
  ]) {
    await page.goto(`${origin}${route}?visitor_email=private%40example.com&message=private-data`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.site-language-option', { state: 'attached' });
    check(await page.locator('.brand .mark').count(), 0, `${route}: old monogram removed`);
    if (expectedPath !== '/') check((await page.locator('.identity').textContent()).startsWith('RM '), false, `${route}: old header initials removed`);
    const links = await page.locator('.site-language-option').evaluateAll(nodes => nodes.map(node => ({ code: node.dataset.language, href: node.href })));
    check(links.map(link => link.code), expectedCodes, `${route}: eleven languages`);
    for (const link of links) {
      const destination = new URL(link.href);
      const publicPage = link.code === 'en' ? destination : new URL(destination.searchParams.get('u'));
      check(publicPage.origin, publicOrigin, `${route}: ${link.code} public origin`);
      check(publicPage.pathname, expectedPath, `${route}: ${link.code} correct path`);
      check(publicPage.search, '', `${route}: ${link.code} omits visitor query`);
      if (link.code !== 'en') {
        check(destination.origin, 'https://translate.google.com', 'translation provider');
        check(destination.searchParams.get('sl'), 'en', 'source language');
        check(destination.searchParams.get('tl'), link.code, 'target language');
      }
    }
  }

  await page.goto(`${origin}/visual-audit.html?message=secret#contact`, { waitUntil: 'networkidle' });
  await page.locator('.site-language-trigger').click();
  const translatedPage = () => page.locator('[data-language="fr"]').getAttribute('href');
  check(new URL(new URL(await translatedPage()).searchParams.get('u')).hash, '', 'translation source omits section fragment');
  check(new URL(await translatedPage()).hash, '#contact', 'translation outer link retains valid section anchor');
  check(new URL(await page.locator('[data-language="en"]').getAttribute('href')).hash, '#contact', 'English retains original section anchor');
  await page.evaluate(() => { location.hash = 'meeting-email'; });
  await page.waitForTimeout(50);
  check(new URL(new URL(await translatedPage()).searchParams.get('u')).hash, '', 'input anchor omitted from source');
  check(new URL(await translatedPage()).hash, '', 'input anchor omitted from outer link');
  await page.evaluate(() => { location.hash = 'unknown-secret'; });
  await page.waitForTimeout(50);
  check(new URL(new URL(await translatedPage()).searchParams.get('u')).hash, '', 'unknown fragment omitted from source');
  check(new URL(await translatedPage()).hash, '', 'unknown fragment omitted from outer link');
  await page.keyboard.press('Escape');
  check(await page.locator('.site-language').getAttribute('open'), null, 'Escape closes language menu');

  const proxyPage = await browser.newPage();
  const languageScript = await readFile(path.join(root, 'assets/site-language.js'), 'utf8');
  const languageStyle = await readFile(path.join(root, 'assets/site-language.css'), 'utf8');
  await proxyPage.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html', body:
    `<html><head><meta charset="utf-8"><link rel="canonical" href="${publicOrigin}/research/"><style>body{margin:0}.nav{position:fixed;top:0;left:0;right:0;height:64px;box-sizing:border-box;padding:10px 12px;display:flex;justify-content:flex-end;align-items:center;z-index:200;backdrop-filter:blur(18px)}${languageStyle}</style></head><body><iframe id="gt-nvframe" title="Translation toolbar" src="about:blank" style="position:fixed;top:0;left:0;width:100%;height:57px;border:0;z-index:9999"></iframe><nav class="nav"><div class="tools"></div></nav><script>${languageScript}</script></body></html>` }));
  await proxyPage.goto('https://ramtin-mojtahedi-github-io.translate.goog/research/?_x_tr_tl=ar&private=visitor-data');
  await proxyPage.waitForSelector('.site-language-trigger');
  check(await proxyPage.locator('[aria-current][data-language]').getAttribute('data-language'), 'ar', 'translation proxy selects Arabic');
  check(await proxyPage.locator('.site-language-current').getAttribute('dir'), 'rtl', 'Arabic selector label direction');
  check(await proxyPage.locator('[data-language="en"]').getAttribute('href'), `${publicOrigin}/research/`, 'translation proxy returns to original page');
  for (const width of [1024, 390]) {
    await proxyPage.setViewportSize({ width, height: 900 });
    check((await proxyPage.locator('.nav').boundingBox()).y >= 57, true, `${width}px translated navigation clears toolbar`);
    await proxyPage.locator('.site-language-trigger').click();
    check(await proxyPage.locator('.site-language').getAttribute('open') !== null, true, `${width}px translated language control receives pointer click`);
    const panel = await proxyPage.locator('.site-language-panel').boundingBox();
    check(panel.y >= 57 && panel.y + panel.height <= 901 && panel.x >= -1 && panel.x + panel.width <= width + 1, true, `${width}px translated language panel stays below toolbar within viewport`);
    await proxyPage.keyboard.press('Escape');
  }
  await proxyPage.goto('https://ramtin-mojtahedi-github-io.translate.goog/research/?_x_tr_tl=fa&private=visitor-data');
  await proxyPage.waitForSelector('.site-language-trigger');
  check(await proxyPage.locator('[aria-current][data-language]').getAttribute('data-language'), 'fa', 'translation proxy selects Persian');
  check(await proxyPage.locator('.site-language-current').textContent(), 'فارسی', 'Persian selector native label');
  check(await proxyPage.locator('.site-language-current').getAttribute('dir'), 'rtl', 'Persian selector label direction');
  await proxyPage.close();

  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 },
    { name: 'tablet', width: 768, height: 1024 }, { name: 'mobile', width: 390, height: 844 },
    { name: 'minimum', width: 320, height: 700 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/visual-audit.html`, { waitUntil: 'networkidle' });
    await page.locator('.site-language-trigger').click();
    await page.waitForTimeout(80);
    const bounds = await page.locator('.site-language-panel').boundingBox();
    check(bounds.x >= -1 && bounds.x + bounds.width <= viewport.width + 1, true, `${viewport.name}: language menu horizontal bounds`);
    check(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height + 1, true, `${viewport.name}: language menu vertical bounds`);
    check(await page.locator('.site-language-option').count(), expectedCodes.length, `${viewport.name}: full language choices`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${viewport.name}: document width`);
    if (outputDirectory && ['desktop', 'mobile'].includes(viewport.name)) {
      await mkdir(outputDirectory, { recursive: true });
      await page.screenshot({ path: path.join(outputDirectory, `website-language-${viewport.name}.png`) });
    }
    await page.keyboard.press('Escape');
    await page.locator('#meeting').scrollIntoViewIfNeeded();
    const bookingOverflow = await page.locator('#meeting').evaluate(section => [...section.querySelectorAll('input,select,textarea,button,.booking-card')]
      .some(element => { const box = element.getBoundingClientRect(); return box.left < -1 || box.right > innerWidth + 1; }));
    check(bookingOverflow, false, `${viewport.name}: booking controls within viewport`);
    if (outputDirectory && ['desktop', 'mobile'].includes(viewport.name)) {
      await page.locator('#meeting').screenshot({ path: path.join(outputDirectory, `website-meeting-${viewport.name}.png`),
        style: '.nav,.progress,.skip,.section-status,.rm-scroll-rail,.rm-back-top{visibility:hidden!important}' });
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/visual-audit.html`, { waitUntil: 'networkidle' });
  await page.locator('#meeting-name').fill('Calendar Smoke Test');
  await page.locator('#meeting-email').fill('calendar-test@example.com');
  await page.locator('#meeting-purpose').selectOption('research');
  await page.locator('#meeting-date').fill('2026-11-04');
  await page.locator('#meeting-time').fill('10:00');
  await page.locator('#meeting-duration').selectOption('60');
  await page.locator('#meeting-message').fill('Review the proposed research discussion.');
  await page.locator('#meeting-request button[type="submit"]').click();
  check(await page.locator('#meeting-prepared').isVisible(), true, 'meeting request prepared');
  const preparedHref = new URL(await page.locator('#meeting-email-link').getAttribute('href'));
  check(preparedHref.searchParams.get('body').includes('Duration: 60 minutes'), true, 'prepared email duration');
  check(preparedHref.searchParams.get('body').includes('subject to your confirmation'), true, 'prepared email confirmation wording');
  check(await page.locator('#booking-provider').isVisible(), false, 'unconfigured scheduler remains hidden');
  // Inspect the exact Blob/link handed to the browser. Suppress the final native
  // download so the suite also works where managed Chrome cancels disk downloads.
  await page.evaluate(() => {
    const createObjectURL = URL.createObjectURL;
    const click = HTMLAnchorElement.prototype.click;
    window.__calendarSmoke = {};
    URL.createObjectURL = function(blob) {
      window.__calendarSmoke.contents = blob.text();
      window.__calendarSmoke.type = blob.type;
      return createObjectURL.call(this, blob);
    };
    HTMLAnchorElement.prototype.click = function() {
      if (this.download) window.__calendarSmoke.filename = this.download;
      else click.call(this);
    };
    window.__calendarSmoke.restore = () => {
      URL.createObjectURL = createObjectURL;
      HTMLAnchorElement.prototype.click = click;
    };
  });
  await page.locator('#meeting-calendar').click();
  const calendarAction = await page.evaluate(async () => {
    const action = { filename: window.__calendarSmoke.filename, type: window.__calendarSmoke.type,
      contents: await window.__calendarSmoke.contents };
    window.__calendarSmoke.restore();
    delete window.__calendarSmoke;
    return action;
  });
  check(calendarAction.filename, 'tentative-meeting-2026-11-04.ics', 'calendar download filename');
  check(calendarAction.type, 'text/calendar;charset=utf-8', 'calendar download MIME type');
  check(calendarAction.contents.includes('\r\nSTATUS:TENTATIVE\r\n'), true, 'calendar action prepares tentative file');
  await page.locator('#meeting-time').fill('11:00');
  check(await page.locator('#meeting-prepared').isVisible(), false, 'changed input invalidates prepared request');
  check(await page.locator('#meeting-email-link').getAttribute('href'), null, 'changed input clears stale email');

  await page.unroute(configurationRoute, fallbackConfig);
  const providerFixtures = [
    { provider: 'calendly', bookingUrl: 'https://calendly.com/fixture/conversation' },
    { provider: 'cal', bookingUrl: 'https://cal.com/fixture/conversation' },
    { provider: 'calendly', bookingUrl: 'https://calendly.com.evil.example/fixture/conversation' },
    currentConfig
  ];
  for (const config of providerFixtures) {
    const fixtureRoute = route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
    await page.route(configurationRoute, fixtureRoute);
    await page.goto(`${origin}/visual-audit.html`, { waitUntil: 'networkidle' });
    const valid = await page.evaluate(config => !!window.SiteBooking.validBookingURL(config.provider, config.bookingUrl), config);
    check(await page.locator('#booking-provider').isVisible(), valid, `${config.provider || 'unconfigured'} provider visibility`);
    if (valid) {
      check(await page.locator('#booking-provider-link').getAttribute('href'), config.bookingUrl, 'provider destination');
      const inline = page.locator('#booking-inline-calendar iframe');
      check(await inline.count(), config.provider === 'calendly' ? 1 : 0, 'provider inline calendar mode');
      if (config.provider === 'calendly') {
        const src = new URL(await inline.getAttribute('src'));
        check(src.origin + src.pathname, new URL(config.bookingUrl).origin + new URL(config.bookingUrl).pathname, 'inline calendar event');
        check(src.searchParams.get('embed_domain'), '127.0.0.1', 'inline embedding domain');
        check(src.searchParams.get('embed_type'), 'Inline', 'inline embedding type');
        for (const width of [1440, 390, 320]) {
          await page.setViewportSize({ width, height: 900 });
          await inline.scrollIntoViewIfNeeded();
          const box = await inline.boundingBox();
          check(box.x >= -1 && box.x + box.width <= width + 1, true, `${width}px inline calendar width`);
        }
      }
      await page.locator('.booking-provider-fallback summary').click();
      check(await page.locator('#meeting-request').isVisible(), true, 'configured provider keeps request fallback');
    } else {
      check(await page.locator('#booking-inline-calendar iframe').count(), 0, 'invalid provider creates no iframe');
      check(await page.locator('#meeting-request').isVisible(), true, 'invalid provider keeps complete request flow');
    }
    await page.unroute(configurationRoute, fixtureRoute);
  }
  await page.close();
} finally { await browser.close(); }

console.log(`Meeting/language smoke validation passed: ${checks} checks, DST, calendar format, five page paths, eleven languages, and four viewport sizes.`);
