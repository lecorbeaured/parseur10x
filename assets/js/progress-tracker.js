(function () {
  const STORAGE_KEY = 'parseur10x_dispute_tracker_v1';

  function getDisputes() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function setText(id, value) {
    const el = document.querySelector(id);
    if (el) el.textContent = String(value);
  }

  function updateProgress() {
    const card = document.querySelector('#credit-progress-card');
    if (!card) return;

    const disputes = getDisputes();

    const total = disputes.length;
    const sent = disputes.filter(x => x.status === 'sent').length;
    const responded = disputes.filter(x => x.status === 'responded').length;
    const closed = disputes.filter(x => x.status === 'closed').length;

    let percent = 0;

    if (total > 0) {
      percent = Math.round(
        ((sent * 0.25) + (responded * 0.5) + closed) / total * 100
      );
    }

    setText('#progressDisputes', total);
    setText('#progressSent', sent);
    setText('#progressResponses', responded);
    setText('#progressClosed', closed);
    setText('#progressPercent', percent + '%');

    const fill = document.querySelector('#progressBarFill');
    if (fill) fill.style.width = percent + '%';

    const recommendation = document.querySelector('#progressRecommendation');

    if (recommendation) {
      if (total === 0) {
        recommendation.textContent = 'Import flagged accounts from your report and review them carefully.';
      } else if (sent === 0) {
        recommendation.textContent = 'Review imported accounts and prepare your first dispute package.';
      } else if (responded === 0) {
        recommendation.textContent = 'Monitor bureau response deadlines and keep proof of mailing.';
      } else if (closed < total) {
        recommendation.textContent = 'Review responses and continue working unresolved disputes.';
      } else {
        recommendation.textContent = 'Excellent work. All tracked disputes are currently closed.';
      }
    }
  }

  window.updateCreditProgress = updateProgress;

  document.addEventListener('DOMContentLoaded', updateProgress);
  document.addEventListener('parseur:analysis-complete', function () {
    setTimeout(updateProgress, 100);
  });

  window.addEventListener('storage', updateProgress);
})();
