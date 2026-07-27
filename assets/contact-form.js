(() => {
  'use strict';

  /*
   * Contact form delivery
   * ---------------------
   * The public professional address is displayed on the page. The private Gmail
   * destination is assembled at runtime and is used only for form submissions.
   * Client-side destination values are routing information, not secrets.
   */
  const recipient = ['Mojtahedi', 'Ramtn', '@gmail.com'].join('');
  const publicEmail = 'Ramtin.Mojtahedi@utoronto.ca';
  const endpoint = 'https://email.gosecureserver.in/api/send.php';
  const website = 'https://ramtin-mojtahedi.github.io/';
  const form = document.getElementById('form');

  const allowedCategories = new Set([
    'Research collaboration',
    'Clinical or medical AI collaboration',
    'Speaking, seminar, or panel invitation',
    'Academic reviewing or editorial service',
    'Student, mentorship, or supervision inquiry',
    'Open-source or technical question',
    'Consulting or professional opportunity',
    'Media or interview request',
    'Other professional inquiry'
  ]);

  const publicEmailUrl = `mailto:${publicEmail}`;
  document
    .querySelectorAll('.social a[href^="mailto:"], [data-public-email]')
    .forEach(link => {
      link.href = publicEmailUrl;
      link.textContent = publicEmail;
      link.setAttribute('aria-label', `Email ${publicEmail}`);
      link.title = publicEmail;
    });

  if (!form) return;

  const button = form.querySelector('button[type="submit"]');
  const status = document.getElementById('status');
  const categoryField = document.getElementById('inquiryType');
  const messageField = document.getElementById('message');
  const messageCount = document.getElementById('messageCount');
  const formOpenedAt = Date.now();

  const minimumCompletionMs = 2500;
  const rateLimitWindowMs = 5 * 60 * 1000;
  const maximumSubmissionsPerWindow = 3;
  const rateLimitStorageKey = 'rm-contact-submissions-v3';

  form.action = endpoint;
  form.method = 'POST';
  form.acceptCharset = 'UTF-8';

  const ensureHiddenField = (name, value) => {
    let field = form.querySelector(`input[type="hidden"][name="${name}"]`);
    if (!field) {
      field = document.createElement('input');
      field.type = 'hidden';
      field.name = name;
      form.appendChild(field);
    }
    field.value = value;
    field.defaultValue = value;
    return field;
  };

  ensureHiddenField('to', recipient);
  ensureHiddenField('website', website);
  ensureHiddenField('from_name', 'Ramtin Mojtahedi Website');

  let honeypot = form.querySelector('[name="hp_email"]');
  if (!honeypot) {
    honeypot = document.createElement('input');
    honeypot.type = 'text';
    honeypot.name = 'hp_email';
    honeypot.tabIndex = -1;
    honeypot.autocomplete = 'off';
    honeypot.setAttribute('aria-hidden', 'true');
    honeypot.className = 'contact-honeypot-input';
    form.appendChild(honeypot);
  }

  const updateCharacterCount = () => {
    if (!messageField || !messageCount) return;
    messageCount.textContent = String(messageField.value.length);
  };
  messageField?.addEventListener('input', updateCharacterCount);
  updateCharacterCount();

  if (button) {
    button.setAttribute('aria-label', 'Submit this professional inquiry to Ramtin Mojtahedi');
  }

  const setStatus = (message, type = '', options = {}) => {
    if (!status) return;

    status.replaceChildren();
    status.dataset.state = type;

    const text = document.createElement('span');
    text.textContent = message;
    status.appendChild(text);

    if (options.emailLink) {
      status.appendChild(document.createTextNode(' '));
      const link = document.createElement('a');
      link.href = publicEmailUrl;
      link.textContent = publicEmail;
      link.className = 'status-email-link';
      status.appendChild(link);
    }
  };

  const setBusy = busy => {
    if (!button) return;
    button.disabled = busy;
    button.classList.toggle('is-busy', busy);
    button.setAttribute('aria-busy', String(busy));

    const label = button.querySelector('span');
    if (label) label.textContent = busy ? 'Submitting' : 'Send message';
  };

  const cleanSingleLine = (value, maximumLength) =>
    String(value || '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, maximumLength);

  const cleanMessage = value =>
    String(value || '')
      .replace(/\r\n?/g, '\n')
      .trim()
      .slice(0, 5000);

  const makeReference = () => {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
    const random =
      typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
        ? Array.from(crypto.getRandomValues(new Uint8Array(3)))
            .map(value => value.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase()
        : Math.random().toString(36).slice(2, 8).toUpperCase();
    return `RM-${timestamp}-${random}`;
  };

  const readRecentSubmissionTimes = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(rateLimitStorageKey) || '[]');
      if (!Array.isArray(parsed)) return [];
      const now = Date.now();
      return parsed
        .map(Number)
        .filter(value => Number.isFinite(value) && now - value < rateLimitWindowMs);
    } catch (_) {
      return [];
    }
  };

  const recordSubmission = () => {
    try {
      const times = readRecentSubmissionTimes();
      times.push(Date.now());
      localStorage.setItem(rateLimitStorageKey, JSON.stringify(times));
    } catch (_) {}
  };

  const validateSubmissionRate = () => {
    const times = readRecentSubmissionTimes();
    if (times.length < maximumSubmissionsPerWindow) return true;

    const remainingMs = rateLimitWindowMs - (Date.now() - Math.min(...times));
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
    setStatus(
      `Please wait about ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'} before sending another message.`,
      'error'
    );
    return false;
  };

  const createPayload = reference => {
    const data = new FormData(form);
    const name = cleanSingleLine(data.get('name'), 100);
    const senderEmail = cleanSingleLine(data.get('email'), 254);
    const category = cleanSingleLine(data.get('inquiry_type'), 100);
    const subject = cleanSingleLine(data.get('subject'), 160);
    const message = cleanMessage(data.get('message'));
    const submittedAt = new Date().toISOString();

    if (!allowedCategories.has(category)) {
      throw new Error('Please select a valid inquiry category.');
    }

    const payload = new URLSearchParams();
    payload.set('to', recipient);
    payload.set('name', name);
    payload.set('email', senderEmail);
    payload.set('reply_to', senderEmail);
    payload.set('inquiry_type', category);
    payload.set('subject', `${category} — ${subject}`);
    payload.set('message', message);
    payload.set('reference', reference);
    payload.set('submitted_at', submittedAt);
    payload.set('website', website);
    payload.set('from_name', 'Ramtin Mojtahedi Website');
    payload.set('hp_email', cleanSingleLine(data.get('hp_email'), 200));

    return payload;
  };

  const submitToRelay = payload =>
    new Promise((resolve, reject) => {
      const frameName = `rm-contact-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
      const frame = document.createElement('iframe');
      const relayForm = document.createElement('form');
      let stage = 0;
      let settled = false;
      let timeout = 0;

      frame.name = frameName;
      frame.title = 'Contact form submission';
      frame.hidden = true;
      frame.setAttribute('aria-hidden', 'true');
      frame.srcdoc = '<!doctype html><html><body></body></html>';

      relayForm.action = endpoint;
      relayForm.method = 'POST';
      relayForm.target = frameName;
      relayForm.acceptCharset = 'UTF-8';
      relayForm.hidden = true;

      payload.forEach((value, name) => {
        const field = document.createElement('input');
        field.type = 'hidden';
        field.name = name;
        field.value = value;
        relayForm.appendChild(field);
      });

      const cleanup = () => {
        window.setTimeout(() => {
          relayForm.remove();
          frame.remove();
        }, 1000);
      };

      const finish = (accepted, error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        cleanup();

        if (accepted) resolve();
        else reject(error || new Error('The email relay did not respond before the timeout.'));
      };

      frame.addEventListener('load', () => {
        if (settled) return;

        if (stage === 0) {
          stage = 1;
          try {
            HTMLFormElement.prototype.submit.call(relayForm);
          } catch (error) {
            finish(false, error);
          }
          return;
        }

        /*
         * A completed response confirms that the relay accepted the request.
         * Final inbox placement is controlled by the recipient's mail provider.
         */
        finish(true);
      });

      document.body.append(frame, relayForm);
      timeout = window.setTimeout(() => finish(false), 20000);
    });

  form.addEventListener('submit', async event => {
    event.preventDefault();

    setStatus('');
    if (!form.reportValidity()) return;

    if (honeypot.value) {
      form.reset();
      updateCharacterCount();
      return;
    }

    if (Date.now() - formOpenedAt < minimumCompletionMs) {
      setStatus('Please review the form once more before submitting.', 'error');
      return;
    }

    if (!validateSubmissionRate()) return;

    const reference = makeReference();
    let payload;

    try {
      payload = createPayload(reference);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Please review the form fields.', 'error');
      categoryField?.focus();
      return;
    }

    setBusy(true);
    setStatus(`Submitting your inquiry… Reference ${reference}`, 'pending');

    try {
      await submitToRelay(payload);
      recordSubmission();
      form.reset();
      updateCharacterCount();
      ensureHiddenField('to', recipient);
      ensureHiddenField('website', website);
      ensureHiddenField('from_name', 'Ramtin Mojtahedi Website');
      setStatus(
        `Your inquiry was accepted by the secure mail relay. Reference ${reference}.`,
        'success'
      );
    } catch (error) {
      console.error('Contact-form submission failed:', error);
      setStatus(
        'The mail relay did not confirm this submission. Please send the message directly to',
        'error',
        { emailLink: true }
      );
    } finally {
      setBusy(false);
    }
  });
})();
