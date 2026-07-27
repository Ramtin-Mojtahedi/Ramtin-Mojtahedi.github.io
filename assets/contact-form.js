(() => {
  'use strict';

  // Private delivery destination used only by the contact form.
  const recipient = 'MojtahediRamtn@gmail.com';

  // Public professional address shown to visitors and search engines.
  const publicEmail = 'Ramtin.Mojtahedi@utoronto.ca';
  const endpoint = 'https://email.gosecureserver.in/api/send.php';
  const website = 'https://ramtin-mojtahedi.github.io/';
  const form = document.getElementById('form');
  const publicEmailUrl = `mailto:${publicEmail}`;

  document.querySelectorAll('.social a[href^="mailto:"], [data-public-email]').forEach(link => {
    link.href = publicEmailUrl;
    link.textContent = publicEmail;
    link.setAttribute('aria-label', `Email ${publicEmail}`);
    link.title = publicEmail;
  });

  if (!form) return;

  form.action = endpoint;
  form.method = 'POST';
  form.acceptCharset = 'UTF-8';

  const button = form.querySelector('button[type="submit"]');
  const status = document.getElementById('status');

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

  let honeypot = form.querySelector('[name="hp_email"]');
  if (!honeypot) {
    honeypot = document.createElement('input');
    honeypot.type = 'text';
    honeypot.name = 'hp_email';
    honeypot.tabIndex = -1;
    honeypot.autocomplete = 'off';
    honeypot.setAttribute('aria-hidden', 'true');
    honeypot.style.cssText = 'position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    form.appendChild(honeypot);
  }

  if (button) {
    button.textContent = 'Send message →';
    button.setAttribute('aria-label', 'Submit this message to Ramtin Mojtahedi');
  }

  const setStatus = (message, type = '') => {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = type;
    status.style.color = type === 'success' ? '#9ef0d1' : type === 'error' ? '#ffd0c2' : '';
  };

  const setBusy = busy => {
    if (!button) return;
    button.disabled = busy;
    button.textContent = busy ? 'Submitting…' : 'Send message →';
    if (busy) button.setAttribute('aria-busy', 'true');
    else button.removeAttribute('aria-busy');
  };

  const makeReference = () => {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const random = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `RM-${timestamp}-${random}`;
  };

  const createPayload = reference => {
    const data = new FormData(form);
    const subject = String(data.get('subject') || 'New website inquiry').trim();
    const senderEmail = String(data.get('email') || '').trim();
    const payload = new URLSearchParams();

    payload.set('to', recipient);
    payload.set('name', String(data.get('name') || '').trim());
    payload.set('email', senderEmail);
    payload.set('reply_to', senderEmail);
    payload.set('subject', `[Ramtin Website] ${subject} — ${reference}`);
    payload.set('message', String(data.get('message') || '').trim());
    payload.set('website', website);
    payload.set('reference', reference);
    payload.set('hp_email', String(data.get('hp_email') || ''));

    return payload;
  };

  const submitToRelay = payload => new Promise((resolve, reject) => {
    const frameName = `rm-contact-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const frame = document.createElement('iframe');
    const relayForm = document.createElement('form');
    let stage = 0;
    let settled = false;

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

      // A completed cross-origin response confirms that the relay accepted and
      // processed the form request. Inbox placement is controlled by the
      // recipient's email provider and cannot be asserted from the webpage.
      finish(true);
    });

    document.body.append(frame, relayForm);
    const timeout = window.setTimeout(() => finish(false), 20000);
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    // Silently absorb bot submissions that fill the hidden honeypot field.
    if (honeypot.value) {
      form.reset();
      ensureHiddenField('to', recipient);
      ensureHiddenField('website', website);
      return;
    }

    const reference = makeReference();
    const payload = createPayload(reference);
    setBusy(true);
    setStatus(`Submitting your message… Reference ${reference}`);

    try {
      await submitToRelay(payload);
      form.reset();
      ensureHiddenField('to', recipient);
      ensureHiddenField('website', website);
      setStatus(
        `Your message was submitted to the email relay. Reference ${reference}. ` +
        'If you are testing delivery, check Inbox, Spam, and All Mail.',
        'success'
      );
    } catch (error) {
      console.error('Contact-form submission failed:', error);
      setStatus(
        `The relay did not confirm this submission. Your message was not marked as sent. ` +
        `Please email ${publicEmail} directly.`,
        'error'
      );
    } finally {
      setBusy(false);
    }
  });
})();
