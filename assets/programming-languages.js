(() => {
  'use strict';

  const programmingLanguages = Object.freeze([
    'Python',
    'MATLAB',
    'C',
    'C++',
    'C#',
    'Java',
    'Julia',
    'R',
    'SQL',
    'Bash'
  ]);

  const statistics = document.querySelector('.stats');
  if (statistics && !statistics.querySelector('[data-stat="programming-languages"]')) {
    const statistic = document.createElement('div');
    statistic.className = 'stat stat-programming-languages';
    statistic.dataset.stat = 'programming-languages';
    statistic.title = programmingLanguages.join(', ');
    statistic.setAttribute(
      'aria-label',
      `${programmingLanguages.length} programming languages: ${programmingLanguages.join(', ')}`
    );

    const number = document.createElement('b');
    number.dataset.count = String(programmingLanguages.length);
    number.textContent = String(programmingLanguages.length);

    const label = document.createElement('span');
    label.textContent = 'Programming languages';

    statistic.append(number, label);
    statistics.appendChild(statistic);
  }

  const programmingCard = [...document.querySelectorAll('.expert')].find(card =>
    card.querySelector('h3')?.textContent.trim() === 'Programming & Data'
  );

  if (programmingCard) {
    programmingCard.dataset.programmingLanguages = programmingLanguages.join('|');
    const description = programmingCard.querySelector('p');
    if (description) {
      description.textContent =
        `${programmingLanguages.join('; ')}; DICOM/PACS; EHR and claims; ` +
        'HL7 FHIR; SNOMED-CT; ICD-10; PostgreSQL; MongoDB; Arrow/Parquet.';
    }
  }
})();
