(function (global) {
  'use strict';

  const DEFAULT_EMAIL = 'ramtinrms@gmail.com';
  const PURPOSES = {
    consultation: 'Medical AI and technical consultation',
    research: 'Research collaboration',
    mentoring: 'Mentoring and academic advice',
    speaking: 'Speaking and professional opportunities',
    other: 'Another topic'
  };
  const formatters = new Map();

  function zoneParts(timestamp, timeZone) {
    if (!formatters.has(timeZone)) {
      formatters.set(timeZone, new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      }));
    }
    const result = {};
    for (const part of formatters.get(timeZone).formatToParts(new Date(timestamp))) {
      if (part.type !== 'literal') result[part.type] = Number(part.value);
    }
    return result;
  }

  function localTimeToUTC(date, time, timeZone) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      throw new Error('Choose a valid date and time.');
    }
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    const naive = Date.UTC(year, month - 1, day, hour, minute);
    const parsed = new Date(naive);
    if (year < 2020 || year > 2100 || hour > 23 || minute > 59 ||
        parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day) {
      throw new Error('Choose a valid date between 2020 and 2100 and a valid time.');
    }
    const offsets = new Set();
    try {
      // Sample both sides of nearby clock changes, including half-hour offsets.
      for (let step = -6; step <= 6; step += 1) {
        const sample = naive + step * 6 * 3600000;
        const p = zoneParts(sample, timeZone);
        offsets.add(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - sample);
      }
    } catch (_) {
      throw new Error('Choose a supported time zone.');
    }
    const matches = [];
    for (const offset of offsets) {
      const candidate = naive - offset;
      const p = zoneParts(candidate, timeZone);
      if (p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute) {
        matches.push(candidate);
      }
    }
    const unique = [...new Set(matches)].sort((a, b) => a - b);
    if (!unique.length) {
      throw new Error('This local time does not exist because the clocks move forward. Choose a different time.');
    }
    if (unique.length > 1) {
      throw new Error('This local time occurs twice because the clocks move back. Choose a time outside the repeated hour.');
    }
    return unique[0];
  }

  function buildProposal(values, now = Date.now()) {
    const name = String(values.name || '').trim();
    const email = String(values.email || '').trim();
    const message = String(values.message || '').trim();
    const duration = Number(values.duration);
    if (!name || name.length > 100 || /[\r\n]/.test(name)) throw new Error('Enter your name (up to 100 characters).');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180) throw new Error('Enter a valid email address.');
    if (!Object.prototype.hasOwnProperty.call(PURPOSES, values.purpose)) throw new Error('Choose a meeting topic.');
    if (duration !== 30 && duration !== 60) throw new Error('Choose a 30- or 60-minute session.');
    if (message.length > 1200) throw new Error('Keep your message to 1,200 characters or fewer.');
    const start = localTimeToUTC(String(values.date || ''), String(values.time || ''), values.timezone);
    if (start <= now) throw new Error('Choose a date and time in the future in the selected time zone.');
    return {
      name, email, message, duration, purpose: PURPOSES[values.purpose],
      date: values.date, time: values.time, timezone: values.timezone,
      start, end: start + duration * 60000
    };
  }

  function dateLabel(timestamp, timeZone, locale = 'en') {
    return new Intl.DateTimeFormat(locale, {
      timeZone, year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    }).format(new Date(timestamp));
  }

  function mailtoFor(proposal, email = DEFAULT_EMAIL) {
    const body = [
      `Hello Ramtin,`, '',
      `I would like to request a meeting about ${proposal.purpose.toLowerCase()}.`, '',
      `Name: ${proposal.name}`,
      `Reply email: ${proposal.email}`,
      `Proposed start: ${dateLabel(proposal.start, proposal.timezone)}`,
      `Proposed end: ${dateLabel(proposal.end, proposal.timezone)}`,
      `Time zone: ${proposal.timezone}`,
      `Duration: ${proposal.duration} minutes`,
      `UTC start: ${new Date(proposal.start).toISOString()}`,
      `UTC end: ${new Date(proposal.end).toISOString()}`, '',
      ...(proposal.message ? ['Context:', proposal.message, ''] : []),
      'I understand this is a proposed time and is subject to your confirmation.',
      'Please reply with an agreed time and calendar invitation, including an online meeting link if appropriate.', '',
      `Thank you,`, proposal.name
    ].join('\r\n');
    return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Meeting request: ${proposal.purpose}`)}&body=${encodeURIComponent(body)}`;
  }

  function escapeICS(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  }

  function foldICS(line) {
    // RFC 5545 folds at 75 UTF-8 octets, including the continuation space.
    const encoder = new TextEncoder();
    const result = [];
    let current = '';
    let bytes = 0;
    for (const character of String(line)) {
      const size = encoder.encode(character).length;
      if (bytes + size > 75) {
        result.push(current);
        current = ' ';
        bytes = 1;
      }
      current += character;
      bytes += size;
    }
    result.push(current);
    return result.join('\r\n');
  }

  function timestampICS(timestamp) {
    return new Date(timestamp).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }

  function createICS(proposal, now = Date.now(), uid) {
    const identifier = uid || (global.crypto?.randomUUID ? global.crypto.randomUUID() : `${now}-${Math.random().toString(36).slice(2)}`);
    const description = [
      'Tentative personal calendar hold only. This does not book or confirm a meeting.',
      'Send your meeting request and wait for a reply with the agreed time and calendar invitation.',
      `Topic: ${proposal.purpose}`,
      `Requested by: ${proposal.name} (${proposal.email})`,
      `Proposed time zone: ${proposal.timezone}`,
      ...(proposal.message ? [`Context: ${proposal.message}`] : [])
    ].join('\n');
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ramtin Mojtahedi//Tentative meeting hold//EN',
      'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${escapeICS(identifier)}@ramtinmojtahedi.github.io`,
      `DTSTAMP:${timestampICS(now)}`, `DTSTART:${timestampICS(proposal.start)}`,
      `DTEND:${timestampICS(proposal.end)}`, 'STATUS:TENTATIVE', 'TRANSP:OPAQUE',
      'SUMMARY:Tentative hold: meeting with Ramtin Mojtahedi',
      `DESCRIPTION:${escapeICS(description)}`, 'END:VEVENT', 'END:VCALENDAR'
    ].map(foldICS).join('\r\n') + '\r\n';
  }

  function validBookingURL(provider, value) {
    if (!['calendly', 'cal'].includes(provider) || typeof value !== 'string') return null;
    try {
      const url = new URL(value);
      const allowed = provider === 'calendly' ? ['calendly.com', 'www.calendly.com'] : ['cal.com', 'www.cal.com'];
      if (url.protocol !== 'https:' || !allowed.includes(url.hostname) || url.username || url.password || url.port) return null;
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length < 2 || segments.some(segment => !/^[A-Za-z0-9_-]+$/.test(segment))) return null;
      return url.href;
    } catch (_) { return null; }
  }

  const api = { localTimeToUTC, buildProposal, mailtoFor, escapeICS, foldICS, timestampICS, createICS, validBookingURL };
  global.SiteBooking = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  const form = document.getElementById('meeting-request');
  if (!form) return;
  const error = document.getElementById('meeting-error');
  const prepared = document.getElementById('meeting-prepared');
  const emailLink = document.getElementById('meeting-email-link');
  const dateInput = document.getElementById('meeting-date');
  const zoneInput = document.getElementById('meeting-zone');
  let proposal = null;
  let contactEmail = DEFAULT_EMAIL;
  let hasEditedForm = false;

  function updateDateMinimum() {
    try {
      const p = zoneParts(Date.now(), zoneInput.value);
      dateInput.min = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
      dateInput.max = '2100-12-31';
    } catch (_) {}
  }

  function resetPrepared() {
    proposal = null;
    prepared.hidden = true;
    error.hidden = true;
    emailLink.removeAttribute('href');
  }

  const onFormEdit = () => { hasEditedForm = true; resetPrepared(); };
  form.addEventListener('input', onFormEdit);
  form.addEventListener('change', onFormEdit);
  zoneInput.addEventListener('change', updateDateMinimum);
  updateDateMinimum();
  form.addEventListener('submit', event => {
    event.preventDefault();
    resetPrepared();
    if (!form.reportValidity()) return;
    try {
      proposal = buildProposal(Object.fromEntries(new FormData(form).entries()));
      emailLink.href = mailtoFor(proposal, contactEmail);
      document.getElementById('meeting-summary').textContent = `${dateLabel(proposal.start, proposal.timezone, document.documentElement.lang || 'en')} · ${proposal.duration} minutes · ${proposal.timezone}`;
      prepared.hidden = false;
      emailLink.focus();
    } catch (exception) {
      error.textContent = exception.message || 'Please check your proposed date and time.';
      error.hidden = false;
      error.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }
  });

  document.getElementById('meeting-calendar').addEventListener('click', () => {
    if (!proposal) return;
    const url = URL.createObjectURL(new Blob([createICS(proposal)], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `tentative-meeting-${proposal.date}.ics`;
    document.body.append(link);
    link.click();
    link.remove();
    global.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // Public configuration contains scheduling links only; no credentials belong here.
  const scriptURL = document.currentScript?.src || new URL('assets/site-booking.js', document.baseURI).href;
  const showRequestIntro = () => {
    document.querySelector('[data-i18n="booking.intro"]').textContent = 'Request a consultation or collaboration meeting about medical AI, research, technical projects, or professional opportunities. Share a little context and propose a time.';
  };
  fetch(new URL('booking-config.json', scriptURL), { credentials: 'same-origin' })
    .then(response => { if (!response.ok) throw new Error('Configuration unavailable'); return response.json(); })
    .then(config => {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.contactEmail || '')) contactEmail = config.contactEmail;
      if (!hasEditedForm && [...zoneInput.options].some(option => option.value === config.defaultTimeZone)) {
        zoneInput.value = config.defaultTimeZone;
        updateDateMinimum();
      }
      const bookingURL = validBookingURL(config.provider, config.bookingUrl);
      if (!bookingURL) { showRequestIntro(); return; }
      const providerLink = document.getElementById('booking-provider-link');
      providerLink.href = bookingURL;
      document.querySelector('[data-i18n="booking.intro"]').textContent = 'Book a consultation or collaboration meeting about medical AI, research, technical projects, or professional opportunities. Open the booking calendar to choose an available time.';
      if (typeof config.bookingSummary === 'string' && config.bookingSummary.length <= 300) {
        document.querySelector('[data-i18n="booking.noteIntro"]').textContent = config.bookingSummary;
      }
      document.getElementById('meeting').classList.add('booking-connected', 'booking-link-only');
      const providerNote = document.querySelector('#booking-provider [data-i18n="booking.providerNote"]');
      providerNote.textContent = 'View live availability and choose a time in your time zone. The booking calendar opens in a new tab.';
      providerNote.removeAttribute('data-i18n');
      document.getElementById('booking-fallback-mount').append(document.getElementById('booking-request-panel'));
      document.getElementById('booking-provider').hidden = false;
      const stepLabels = [
        'Open the booking calendar.',
        'Choose an available date and time in your time zone.',
        'Complete your booking and receive the service’s confirmation.'
      ];
      document.querySelectorAll('#booking-steps li>div').forEach((element, index) => {
        element.textContent = stepLabels[index];
        element.removeAttribute('data-i18n');
      });
      const explanation = document.getElementById('booking-explanation');
      explanation.querySelector('strong').textContent = 'Availability and confirmations';
      explanation.querySelector('p').textContent = 'The scheduling service manages available times and booking confirmations. To propose a different time, use the optional meeting request form below.';
      explanation.querySelectorAll('[data-i18n]').forEach(element => element.removeAttribute('data-i18n'));
    })
    .catch(showRequestIntro);
})(typeof globalThis !== 'undefined' ? globalThis : this);
