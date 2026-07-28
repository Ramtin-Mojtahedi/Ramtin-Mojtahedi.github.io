(() => {
  'use strict';

  const list = document.getElementById('publicationList');
  if (!list) return;

  const publicationCount = Number(
    list.dataset.publicationCount || list.querySelectorAll('.pub').length
  );
  const publicationNumber = document.querySelector('.stats .stat [data-count]');

  if (publicationNumber && Number.isFinite(publicationCount) && publicationCount > 0) {
    publicationNumber.dataset.count = String(publicationCount);
    publicationNumber.textContent = '0';
    publicationNumber.removeAttribute('data-done');
  }
})();
