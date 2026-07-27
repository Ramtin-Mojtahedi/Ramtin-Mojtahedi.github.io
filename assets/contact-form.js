(() => {
  'use strict';

  const recipient = 'mojtahediramtin@gmail.com';
  const ajaxEndpoint = `https://formsubmit.co/ajax/${recipient}`;
  const postEndpoint = `https://formsubmit.co/${recipient}`;
  const websiteUrl = 'https://ramtin-mojtahedi.github.io/';
  const successUrl = `${websiteUrl}contact-sent.html`;
  const form = document.getElementById('form');
  const directEmailUrl = `mailto:${recipient}`;

  document.querySelectorAll('.social a[href^="mailto:"]').forEach(link => {
    link.href = directEmailUrl;
    link.setAttribute('aria-label', `Email ${recipient}`);
    link.title = recipient;
  });

  if (!form) return;

  const button = form.querySelector('button[type="submit"]');
  const status = document.getElementById('status');

  if (button) {
    button.textContent = 'Send message →';
    button.setAttribute('aria-label', 'Send this message directly to Ramtin Mojtahedi');
  }

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

  ensureHiddenField('_url', websiteUrl);
  ensureHiddenField('_next', successUrl);
  ensureHiddenField('_template', 'table');
  ensureHiddenField('_subject', 'New message from the Ramtin Mojtahedi website');
  ensureHiddenField('_captcha', 'false');

  let honey = form.querySelector('[name="_honey"]');
  if (!honey) {
    honey = document.createElement('input');
    honey.type = 'text';
    honey.name = '_honey';
    honey.tabIndex = -1;
    honey.autocomplete = 'off';
    honey.setAttribute('aria-hidden', 'true');
    honey.style.cssText = 'position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    form.appendChild(honey);
  }

  form.action = postEndpoint;
  form.method = 'POST';
  form.acceptCharset = 'UTF-8';

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

  const submitThroughHiddenFrame = () => new Promise(resolve => {
    const frameName = 'rm-contact-submit-frame';
    let frame = document.querySelector(`iframe[name="${frameName}"]`);
    if (!frame) {
      frame = document.createElement('iframe');
      frame.name = frameName;
      frame.title = 'Contact form submission';
      frame.hidden = true;
      frame.setAttribute('aria-hidden', 'true');
      document.body.appendChild(frame);
    }

    const previousTarget = form.target;
    form.target = frameName;
    let resolved = false;

    const finish = result => {
      if (resolved) return;
      resolved = true;
      form.target = previousTarget;
      frame.removeEventListener('load', onLoad);
      resolve(result);
    };

    const onLoad = () => {
      try {
        const location = frame.contentWindow?.location;
        if (location?.origin === window.location.origin && location.pathname.endsWith('/contact-sent.html')) {
          finish({ success: true });
        }
      } catch (_) {
        // A cross-origin FormSubmit page means the request was received and may
        // be waiting for the one-time recipient activation.
      }
    };

    frame.addEventListener('load', onLoad);
    HTMLFormElement.prototype.submit.call(form);

    window.setTimeout(() => finish({ success: false, pendingActivation: true }), 14000);
  });

  form.onsubmit = async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    setBusy(true);
    setStatus('Sending your message securely…');

    const data = new FormData(form);
    const subject = String(data.get('subject') || 'New inquiry').trim();
    const replyTo = String(data.get('email') || '').trim();
    const payload = {
      name: String(data.get('name') || '').trim(),
      email: replyTo,
      subject,
      message: String(data.get('message') || '').trim(),
      _subject: `Website inquiry: ${subject}`,
      _replyto: replyTo,
      _template: 'table',
      _url: websiteUrl,
      _captcha: 'false',
      _honey: String(data.get('_honey') || '')
    };

    try {
      const response = await fetch(ajaxEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(payload),
        mode: 'cors',
        credentials: 'omit',
        referrer: websiteUrl,
        referrerPolicy: 'strict-origin-when-cross-origin'
      });

      const responseText = await response.text();
      let result = {};
      try { result = responseText ? JSON.parse(responseText) : {}; } catch (_) {}

      const responseMessage = String(result.message || responseText || '').trim();
      const accepted = response.ok && (
        result.success === true ||
        result.success === 'true' ||
        /sent successfully|email sent|submission received|success/i.test(responseMessage)
      );

      if (accepted) {
        form.reset();
        setStatus('Thank you — your message has been sent directly to Ramtin.', 'success');
        return;
      }

      const activationRequired = /activate|activation|confirm|confirmation|not activated|verify/i.test(responseMessage);
      if (activationRequired) {
        setStatus(`The form has reached the mail service. A one-time activation email was sent to ${recipient}. After that link is confirmed, messages will send directly from this page.`, 'error');
        return;
      }

      throw new Error(responseMessage || `Submission service returned HTTP ${response.status}.`);
    } catch (error) {
      console.warn('AJAX contact submission was unavailable; using the same-page form fallback.', error);
      const fallback = await submitThroughHiddenFrame();
      if (fallback.success) {
        form.reset();
        setStatus('Thank you — your message has been sent directly to Ramtin.', 'success');
      } else {
        setStatus(`Your message reached the mail service, but the address still needs its one-time FormSubmit activation. Please open the activation email sent to ${recipient}, confirm it once, and submit again.`, 'error');
      }
    } finally {
      setBusy(false);
    }
  };
})();
