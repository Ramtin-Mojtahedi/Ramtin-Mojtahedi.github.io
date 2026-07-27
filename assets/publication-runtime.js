(() => {
  'use strict';

  const list = document.getElementById('publicationList');
  if (!list) return;

  const publicationCount = Number(list.dataset.publicationCount || list.querySelectorAll('.pub').length);
  const stats = document.querySelectorAll('.stats .stat');

  if (stats.length && Number.isFinite(publicationCount) && publicationCount > 0) {
    const publicationNumber = stats[0].querySelector('[data-count]');
    const publicationLabel = stats[0].querySelector('span');

    if (publicationNumber) {
      publicationNumber.dataset.count = String(publicationCount);
      publicationNumber.textContent = '0';
      publicationNumber.removeAttribute('data-done');
    }

    if (publicationLabel) {
      publicationLabel.textContent = 'Peer-reviewed and accepted publications';
    }
  }
})();
