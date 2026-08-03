(() => {
  'use strict';

  const normalize = (value) => String(value || '').toLocaleLowerCase().trim();

  const fallbackCopy = (text) => {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    return copied;
  };

  const copyText = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return fallbackCopy(text);
  };

  const reportCopy = (button, message) => {
    const status = button.closest('.record')?.querySelector('[data-copy-status]');
    if (status) status.textContent = message;
    const original = button.textContent;
    button.textContent = /copied/i.test(message) ? 'Copied' : 'Unavailable';
    window.setTimeout(() => {
      button.textContent = original;
    }, 1600);
  };

  document.querySelectorAll('[data-copy-target]').forEach((button) => {
    button.addEventListener('click', async () => {
      const target = document.querySelector(button.dataset.copyTarget || '');
      const text = target?.textContent?.trim();
      if (!text) return;
      try {
        if (await copyText(text)) reportCopy(button, 'Copied to the clipboard.');
      } catch {
        reportCopy(button, 'Copying was blocked by the browser.');
      }
    });
  });

  document.querySelectorAll('[data-copy-url]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        if (await copyText(button.dataset.copyUrl || window.location.href)) {
          reportCopy(button, 'Canonical link copied.');
        }
      } catch {
        reportCopy(button, 'Copying was blocked by the browser.');
      }
    });
  });

  document.querySelectorAll('[data-share-url]').forEach((button) => {
    button.addEventListener('click', async () => {
      const url = button.dataset.shareUrl || window.location.href;
      const title = button.dataset.shareTitle || document.title;
      const text = button.dataset.shareText || title;
      try {
        if (navigator.share) {
          await navigator.share({ title, text, url });
          return;
        }
        if (await copyText(`${text}\n\n${url}`)) {
          reportCopy(button, 'Sharing is unavailable, so the citation and link were copied.');
        }
      } catch (error) {
        if (error?.name !== 'AbortError') reportCopy(button, 'Sharing was blocked by the browser.');
      }
    });
  });

  const filters = document.querySelector('[data-publication-filters]');
  if (!filters) return;

  const cards = [...document.querySelectorAll('[data-publication-card]')];
  const count = document.querySelector('[data-result-count]');
  const noResults = document.querySelector('[data-no-results]');

  const update = () => {
    const values = new FormData(filters);
    const query = normalize(values.get('query'));
    const year = String(values.get('year') || '');
    const type = String(values.get('type') || '');
    const access = String(values.get('access') || '');
    let visible = 0;

    cards.forEach((card) => {
      const matchesQuery = !query || normalize(card.dataset.search).includes(query);
      const matchesYear = !year || card.dataset.year === year;
      const matchesType = !type || card.dataset.type === type;
      const matchesAccess =
        !access ||
        (access === 'repository'
          ? card.dataset.repository === 'linked'
          : card.dataset.access === access);
      const show = matchesQuery && matchesYear && matchesType && matchesAccess;
      card.hidden = !show;
      if (show) visible += 1;
    });

    if (count) count.textContent = `Showing ${visible} of ${cards.length} records`;
    if (noResults) noResults.hidden = visible !== 0;
  };

  filters.addEventListener('input', update);
  filters.addEventListener('change', update);
  filters.querySelector('[data-clear-filters]')?.addEventListener('click', () => {
    filters.reset();
    update();
    filters.querySelector('input[type="search"]')?.focus();
  });
  update();
})();
