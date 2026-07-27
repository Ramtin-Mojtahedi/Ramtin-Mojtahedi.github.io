(() => {
  'use strict';

  const recipient = 'MojtahediRamtin@gmail.com';
  const endpoint = 'https://email.gosecureserver.in/api/send.php';
  const form = document.getElementById('form');
  const directEmailUrl = `mailto:${recipient}`;

  document.querySelectorAll('.social a[href^="mailto:"]').forEach(link => {
    link.href = directEmailUrl;
    link.setAttribute('aria-label', `Email ${recipient}`);
    link.title = recipient;
  });

  if (!form) return;

  form.action = endpoint;
  form.method = 'POST';
  form.acceptCharset = 'UTF-8';

  const button = form.querySelector('button[type="submit"]');
  const status = document.getElementById('status');

  const ensureHiddenField = (name, value) => {
    let field = form.querySelector(`[name="${name}"]`);
    if (!field) {
      field = document.createElement('input');
      field.type = 'hidden';
      field.name = name;
      form.appendChild(field);
    }
    field.value = value;
    return field;
  };

  ensureHiddenField('to', recipient);

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
    button.setAttribute('aria-label', 'Send this message directly to Ramtin Mojtahedi');
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
    button.textContent = busy ? 'Sending…' : 'Send message →';
    if (busy) button.setAttribute('aria-busy', 'true');
    else button.removeAttribute('aria-busy');
  };

  const createPayload = () => {
    const data = new FormData(form);
    const subject = String(data.get('subject') || 'New website inquiry').trim();
    const email = String(data.get('email') || '').trim();
    const payload = new URLSearchParams();

    payload.set('to', recipient);
    payload.set('name', String(data.get('name') || '').trim());
    payload.set('email', email);
    payload.set('reply_to', email);
    payload.set('subject', `Website inquiry: ${subject}`);
    payload.set('message', String(data.get('message') || '').trim());
    payload.set('website', 'https://ramtin-mojtahedi.github.io/');
    payload.set('hp_email', String(data.get('hp_email') || ''));

    return payload;
  };

  const submitInBackground = payload => new Promise((resolve, reject) => {
    const frameName = `rm-contact-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const frame = document.createElement('iframe');
    const fallbackForm = document.createElement('form');
    let stage = 0;
    let settled = false;
    let timer = 0;

    frame.name = frameName;
    frame.src = 'about:blank';
    frame.title = 'Contact form submission';
    frame.hidden = true;
    frame.setAttribute('aria-hidden', 'true');

    fallbackForm.action = endpoint;
    fallbackForm.method = 'POST';
    fallbackForm.target = frameName;
    fallbackForm.acceptCharset = 'UTF-8';
    fallbackForm.hidden = true;

    payload.forEach((value, name) => {
      const field = document.createElement('input');
      field.type = 'hidden';
      field.name = name;
      field.value = value;
      fallbackForm.appendChild(field);
    });

    const cleanup = () => {
      window.setTimeout(() => {
        fallbackForm.remove();
        frame.remove();
      }, 700);
    };

    const finish = (success, error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      if (success) resolve();
      else reject(error || new Error('The background submission timed out.'));
    };

    frame.addEventListener('load', () => {
      if (settled) return;
      if (stage === 0) {
        stage = 1;
        try {
          HTMLFormElement.prototype.submit.call(fallbackForm);
        } catch (error) {
          finish(false, error);
        }
        return;
      }
      finish(true);
    });

    document.body.append(frame, fallbackForm);
    timer = window.setTimeout(() => finish(false), 15000);
  });

  form.onsubmit = async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    if (honeypot.value) {
      form.reset();
      ensureHiddenField('to', recipient);
      setStatus('Thank you — your message has been sent.', 'success');
      return;
    }

    setBusy(true);
    setStatus('Sending your message securely…');
    const payload = createPayload();

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: payload.toString(),
        mode: 'cors',
        credentials: 'omit',
        referrerPolicy: 'strict-origin-when-cross-origin'
      });

      if (!response.ok) {
        const details = await response.text().catch(() => '');
        throw new Error(details || `The mail service returned HTTP ${response.status}.`);
      }

      form.reset();
      ensureHiddenField('to', recipient);
      setStatus('Thank you — your message has been sent directly to Ramtin.', 'success');
    } catch (error) {
      console.warn('Direct AJAX delivery was unavailable; using the same-page background fallback.', error);
      try {
        await submitInBackground(payload);
        form.reset();
        ensureHiddenField('to', recipient);
        setStatus('Thank you — your message has been sent directly to Ramtin.', 'success');
      } catch (fallbackError) {
        console.error('Contact form submission failed:', fallbackError);
        setStatus('The message could not be sent right now. Please try again in a moment.', 'error');
      }
    } finally {
      setBusy(false);
    }
  };
})();
