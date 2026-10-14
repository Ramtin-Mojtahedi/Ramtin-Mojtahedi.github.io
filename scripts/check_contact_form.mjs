/* Contact delivery regression checks; every request is intercepted, no email is sent. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'http://127.0.0.1:4173';
const relayURL = 'https://email.gosecureserver.in/api/send.php';
const geoURL = 'https://get.geojs.io/v1/ip/geo.json';
const recipient = 'ramtinrms@gmail.com';
const visitor = { name: 'Dr. Léa García 李', email: 'visitor@example.test',
  category: 'Research collaboration', title: 'Research partnership — Étude 世界',
  message: 'Hello Ramtin,\nResearch discussion — résumé, 世界, فارسی.\n' +
    'A detailed paragraph 🌍 — complete contact context.\n'.repeat(90) + 'Last line without loss.' };
const geoFixture = { ip: '203.0.113.42', city: 'Toronto', region: 'Ontario', country: 'Canada' };
let checks = 0;

function check(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  checks += 1;
}

async function until(predicate, label) {
  const deadline = Date.now() + 6000;
  while (!predicate()) {
    assert(Date.now() < deadline, label);
    await new Promise(resolve => setTimeout(resolve, 15));
  }
}

function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });

async function fixture({ geo = 'available', relay = 'success' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-10-14T16:00:00Z') });
  const state = { geoRequests: [], relayRequests: [] };
  const geoGate = gate();
  const relayGate = gate();

  // Serve actual site files at a normal origin and block all real outbound traffic.
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
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>External service isolated for contact test</title>' });
    }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
      '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };
    try { return route.fulfill({ status: 200, contentType: types[path.extname(filename)] || 'application/octet-stream', body: await readFile(filename) }); }
    catch (_) { return route.fulfill({ status: 404, body: 'Missing contact audit fixture' }); }
  });

  await page.route(geoURL, async route => {
    state.geoRequests.push({ url: route.request().url(), method: route.request().method(), headers: route.request().headers() });
    if (geo === 'failure') return route.abort('failed');
    if (geo === 'timeout') {
      await geoGate.promise;
      try { await route.abort('timedout'); } catch (_) { /* Request was already aborted by the lookup timeout. */ }
      return;
    }
    const body = geo === 'partial' ? { ip: '2001:db8::42' }
      : geo === 'unavailable' ? {} : geoFixture;
    return route.fulfill({ status: geo === 'service-error' ? 503 : 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });

  await page.route(relayURL, async route => {
    state.relayRequests.push({ method: route.request().method(), resourceType: route.request().resourceType(),
      childFrame: !!route.request().frame().parentFrame(), headers: route.request().headers(),
      payload: new URLSearchParams(route.request().postData() || '') });
    if (relay === 'pending' || relay === 'timeout') await relayGate.promise;
    try {
      await route.fulfill({ status: relay === 'service-error' ? 500 : 200, contentType: 'text/html',
        body: '<!doctype html><title>Mock relay response; no message was sent</title>' });
    } catch (_) { /* A timed-out submission may have removed its hidden frame. */ }
  });

  await page.goto(`${origin}/visual-audit.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#form input[name="to"]', { state: 'attached' });
  await page.clock.runFor(2000);
  return { page, state, releaseRelay: relayGate.release,
    close: async () => { geoGate.release(); relayGate.release(); await context.close(); } };
}

async function fill(page) {
  await page.locator('#name').fill(visitor.name);
  await page.locator('#email').fill(visitor.email);
  await page.locator('#inquiryType').selectOption(visitor.category);
  await page.locator('#subject').fill(visitor.title);
  await page.locator('#message').fill(visitor.message);
}

async function submit(page) {
  await page.evaluate(() => document.getElementById('form').requestSubmit());
}

async function submitted(page) {
  await page.waitForFunction(() => document.getElementById('status').dataset.state === 'success');
  const status = await page.locator('#status').textContent();
  check(/\bsubmitted\b/i.test(status), true, 'success says submitted');
  check(/\bdelivered\b|delivery confirmed/i.test(status), false, 'success does not claim inbox delivery');
  check(await page.locator('#form button[type="submit"]').isEnabled(), true, 'button restored after completion');
  check(await page.locator('#form button[type="submit"]').getAttribute('aria-busy'), 'false', 'busy state cleared');
}

try {
  const initial = await fixture();
  try {
    check(initial.state.geoRequests.length, 0, 'no IP lookup at page load');
    check(initial.state.relayRequests.length, 0, 'no relay at page load');
    const privacy = await initial.page.locator('#contact-network-note').textContent();
    check(/IP/i.test(privacy) && /approximate/i.test(privacy) && /GeoJS/.test(privacy), true, 'visible network/privacy notice');
    check(privacy.includes(recipient), true, 'privacy notice identifies current recipient');
    check((await initial.page.locator('#form').getAttribute('aria-describedby') || '').split(/\s+/).includes('contact-network-note'), true, 'form exposes privacy note to assistive technology');
    const mailtos = await initial.page.locator('#contact a[href^="mailto:"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
    check([...new Set(mailtos)], [`mailto:${recipient}`], 'contact links use one inbox');
    if (process.env.SITE_AUDIT_SCREENSHOTS) {
      await mkdir(process.env.SITE_AUDIT_SCREENSHOTS, { recursive: true });
      await initial.page.locator('#contact').screenshot({ path: path.join(process.env.SITE_AUDIT_SCREENSHOTS, 'website-contact-gmail.png'),
        style: '.nav,.progress,.skip,.section-status,.rm-scroll-rail,.rm-back-top{visibility:hidden!important}' });
    }
    await submit(initial.page);
    check(initial.state.geoRequests.length, 0, 'invalid form does not trigger IP lookup');
    check(initial.state.relayRequests.length, 0, 'invalid form does not send');
    await fill(initial.page);
    await initial.page.locator('#hp_email').evaluate(node => { node.value = 'bot@example.test'; });
    await submit(initial.page);
    check(initial.state.geoRequests.length, 0, 'honeypot does not trigger IP lookup');
    check(initial.state.relayRequests.length, 0, 'honeypot does not send');
  } finally { await initial.close(); }

  const success = await fixture({ relay: 'pending' });
  try {
    await fill(success.page);
    await success.page.locator('#form input[name="to"]').evaluate(node => { node.value = 'unapproved@example.test'; });
    await submit(success.page);
    await until(() => success.state.relayRequests.length === 1, 'relay request should be prepared');
    check(await success.page.locator('#form button[type="submit"]').isDisabled(), true, 'button busy during submission');
    check(await success.page.locator('#form button[type="submit"]').getAttribute('aria-busy'), 'true', 'accessible busy state');
    await submit(success.page);
    await submit(success.page);
    check(success.state.geoRequests.length, 1, 'duplicate submit does not repeat lookup');
    check(success.state.relayRequests.length, 1, 'one relay request while busy');
    const geoRequest = success.state.geoRequests[0];
    check(geoRequest.method, 'GET', 'IP lookup uses GET');
    check(new URL(geoRequest.url).search, '', 'no form details in IP lookup URL');
    check(geoRequest.headers.referer, undefined, 'IP lookup omits referrer');
    const request = success.state.relayRequests[0];
    const payload = request.payload;
    check(request.method, 'POST', 'relay receives form POST');
    check(request.resourceType, 'document', 'relay uses document navigation');
    check(request.childFrame, true, 'relay targets hidden child frame');
    check(payload.getAll('to'), [recipient], 'exactly one fixed recipient despite form tampering');
    check(payload.get('reply_to'), visitor.email, 'Reply-To is the visitor');
    check(payload.get('name'), visitor.name, 'Unicode sender name preserved');
    check(payload.get('email'), visitor.email, 'sender email preserved');
    check(payload.get('message_title'), visitor.title, 'complete title retained');
    check(payload.get('subject'), `[Website inquiry] ${visitor.title} — ${visitor.category}`, 'professional subject formatting');
    const body = payload.get('message').replace(/\r\n/g, '\n');
    check(body.includes(visitor.message), true, 'complete long Unicode/newline message retained');
    check([visitor.name, visitor.email, visitor.title, geoFixture.ip, 'Toronto, Ontario, Canada'].every(value => body.includes(value)), true, 'readable email body includes sender and network details');
    check(payload.get('sender_ip_client_reported'), geoFixture.ip, 'client-reported IP metadata');
    check(payload.get('approximate_ip_location'), 'Toronto, Ontario, Canada', 'city/region/country metadata');
    check(payload.get('ip_lookup_status'), 'available', 'available lookup status');
    check(/approximate/i.test(payload.get('ip_location_note')) && /unverified/i.test(payload.get('ip_location_note')), true, 'location limitations included');
    success.releaseRelay();
    await submitted(success.page);
    check(await success.page.locator('#message').inputValue(), '', 'successful submission resets form');
    check(await success.page.locator('#form input[name="to"]').inputValue(), recipient, 'reset keeps correct recipient');
  } finally { await success.close(); }

  for (const geo of ['unavailable', 'service-error', 'failure', 'timeout', 'partial']) {
    const sample = await fixture({ geo });
    try {
      await fill(sample.page);
      await submit(sample.page);
      await until(() => sample.state.geoRequests.length === 1, `${geo}: lookup initiated`);
      if (geo === 'timeout') await sample.page.clock.runFor(4001);
      await until(() => sample.state.relayRequests.length === 1, `${geo}: metadata failure must not block relay`);
      await submitted(sample.page);
      const payload = sample.state.relayRequests[0].payload;
      check(payload.get('to'), recipient, `${geo}: correct recipient`);
      check(payload.get('ip_lookup_status'), geo === 'partial' ? 'partial' : 'unavailable', `${geo}: truthful lookup status`);
      check(payload.get('sender_ip_client_reported'), geo === 'partial' ? '2001:db8::42' : 'Unavailable', `${geo}: IP handled honestly`);
      check(payload.get('approximate_ip_location'), 'Unavailable', `${geo}: unavailable location handled honestly`);
      check(payload.get('message').replace(/\r\n/g, '\n').includes(visitor.message), true, `${geo}: message remains complete`);
    } finally { await sample.close(); }
  }

  for (const relay of ['throw', 'timeout']) {
    const sample = await fixture({ relay });
    try {
      await fill(sample.page);
      if (relay === 'throw') {
        await sample.page.evaluate(() => {
          const nativeSubmit = HTMLFormElement.prototype.submit;
          HTMLFormElement.prototype.submit = function() {
            if (this.action === 'https://email.gosecureserver.in/api/send.php') throw new Error('Mock relay submit failure');
            return nativeSubmit.call(this);
          };
        });
      }
      await submit(sample.page);
      if (relay === 'timeout') {
        await until(() => sample.state.relayRequests.length === 1, 'relay timeout request initiated');
        await sample.page.clock.runFor(20001);
      }
      await sample.page.waitForFunction(() => document.getElementById('status').dataset.state === 'error');
      for (const [selector, expected] of [['#name', visitor.name], ['#email', visitor.email], ['#subject', visitor.title], ['#message', visitor.message]]) {
        check(await sample.page.locator(selector).inputValue(), expected, `${relay}: input ${selector} preserved`);
      }
      check(await sample.page.locator('#status a').getAttribute('href'), `mailto:${recipient}`, `${relay}: direct email fallback`);
      check(await sample.page.locator('#form button[type="submit"]').isEnabled(), true, `${relay}: button restored`);
    } finally { await sample.close(); }
  }

  // A cross-origin document load cannot prove that the relay accepted or delivered
  // mail, even when that document is an error page. Keep the status honest.
  const opaqueRelay = await fixture({ relay: 'service-error' });
  try { await fill(opaqueRelay.page); await submit(opaqueRelay.page); await submitted(opaqueRelay.page); }
  finally { await opaqueRelay.close(); }
} finally { await browser.close(); }

console.log(`Contact-form verification passed: ${checks} checks; all IP and relay requests were mocked, no email sent.`);
