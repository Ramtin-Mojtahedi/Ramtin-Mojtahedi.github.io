(() => {
  'use strict';

  const recipient = 'MojtahediRamtin@gmail.com';
  const endpoint = `https://formsubmit.co/ajax/${recipient}`;
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

  ensureHiddenField('_captcha', 'false');
  ensureHiddenField('_template', 'table');
  ensureHiddenField('_subject', 'New message from the Ramtin Mojtahedi website');

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

  form.onsubmit = async event => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    const originalButtonText = button?.textContent || 'Send message →';
    if (button) {
      button.disabled = true;
      button.textContent = 'Sending…';
      button.setAttribute('aria-busy', 'true');
    }

    if (status) {
      status.textContent = 'Sending your message securely…';
      status.style.color = '';
    }

    const payload = new FormData(form);
    const subject = String(payload.get('subject') || 'New inquiry').trim();
    const replyTo = String(payload.get('email') || '').trim();
    payload.set('_subject', `Website inquiry: ${subject}`);
    payload.set('_replyto', replyTo);
    payload.set('_captcha', 'false');
    payload.set('_template', 'table');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: payload
      });

      const result = await response.json().catch(() => ({}));
      const accepted = response.ok && result.success !== false && result.success !== 'false';
      if (!accepted) throw new Error(result.message || 'The message service did not accept the submission.');

      form.reset();
      if (status) {
        status.textContent = 'Thank you — your message has been sent directly to Ramtin.';
        status.style.color = '#9ef0d1';
      }
    } catch (error) {
      if (status) {
        status.innerHTML = `The message could not be sent automatically. Please email <a href="${directEmailUrl}">${recipient}</a> directly.`;
        status.style.color = '#ffd0c2';
      }
      console.error('Contact form submission failed:', error);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalButtonText;
        button.removeAttribute('aria-busy');
      }
    }
  };
})();
