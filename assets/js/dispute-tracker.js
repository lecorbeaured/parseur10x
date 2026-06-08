(function () {
  const STORAGE_KEY = 'parseur10x_dispute_tracker_v1';
  const ANALYSIS_KEY = 'parseur10x_latest_analysis_v1';

  function loadDisputes() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveDisputes(disputes) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(disputes));
  }

  function saveLatestAnalysis(analysis) {
    try {
      localStorage.setItem(ANALYSIS_KEY, JSON.stringify(analysis || {}));
    } catch {}
  }

  function loadLatestAnalysis() {
    try {
      return JSON.parse(localStorage.getItem(ANALYSIS_KEY)) || {};
    } catch {
      return {};
    }
  }

  function createId() {
    return 'dispute_' + Date.now() + '_' + Math.random().toString(16).slice(2);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function daysSince(dateString) {
    if (!dateString) return 0;
    const start = new Date(dateString);
    const now = new Date();
    return Math.max(0, Math.floor((now - start) / 86400000));
  }

  function escapeHTML(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function getStatusLabel(status) {
    return {
      draft: 'Draft',
      sent: 'Sent',
      responded: 'Responded',
      followup: 'Needs Follow-Up',
      closed: 'Closed'
    }[status] || 'Draft';
  }

  function getNextAction(dispute) {
    if (dispute.status === 'draft') return 'Send your dispute and save proof of mailing.';
    if (dispute.status === 'sent') {
      const days = daysSince(dispute.sentDate);
      if (days >= 30) return 'Review for bureau response and prepare a follow-up if needed.';
      return `${30 - days} days until your 30-day follow-up check.`;
    }
    if (dispute.status === 'responded') return 'Compare the response against your original report.';
    if (dispute.status === 'followup') return 'Send a follow-up letter and update the sent date.';
    if (dispute.status === 'closed') return 'Keep this record for your files.';
    return 'Review this dispute.';
  }

  function normalizeImportedItem(item, index) {
    if (typeof item === 'string') return item;
    return (
      item.account ||
      item.creditor ||
      item.title ||
      item.name ||
      item.issue ||
      item.description ||
      `Flagged Item ${index + 1}`
    );
  }

  function getImportableItems() {
    const analysis = loadLatestAnalysis();

    const sources = [
      ...(Array.isArray(analysis.possibleIssues) ? analysis.possibleIssues : []),
      ...(Array.isArray(analysis.negativeItems) ? analysis.negativeItems : []),
      ...(Array.isArray(analysis.reviewWarnings) ? analysis.reviewWarnings : [])
    ];

    return sources.map(normalizeImportedItem).filter(Boolean);
  }

  function importFlaggedAccounts() {
    const items = getImportableItems();
    if (!items.length) {
      alert('No flagged accounts found yet. Run a credit report analysis first, then try importing again.');
      return;
    }

    const existing = loadDisputes();
    const existingNames = new Set(existing.map(item => String(item.account || '').toLowerCase()));

    const imported = items
      .filter(item => !existingNames.has(String(item).toLowerCase()))
      .map(item => ({
        id: createId(),
        account: item,
        bureau: 'All Three',
        status: 'draft',
        sentDate: '',
        notes: 'Imported from credit analysis. Review for accuracy before sending any dispute.',
        createdAt: new Date().toISOString(),
        imported: true
      }));

    if (!imported.length) {
      alert('All flagged accounts already appear in your tracker.');
      return;
    }

    saveDisputes([...imported, ...existing]);
    renderTracker();
    refreshProgressSoon();
    refreshProgressSoon();

    if (window.updateCreditProgress) {
      window.updateCreditProgress();
    }

    if (window.trackParseurEvent) {
      window.trackParseurEvent('disputes_imported', { count: imported.length });
    }
  }

  function timelineHTML(dispute) {
    const status = dispute.status || 'draft';

    const steps = [
      { key: 'draft', label: 'Created' },
      { key: 'sent', label: 'Sent' },
      { key: 'followup', label: '30-Day Review' },
      { key: 'responded', label: 'Response' },
      { key: 'closed', label: 'Closed' }
    ];

    const order = ['draft', 'sent', 'followup', 'responded', 'closed'];
    const activeIndex = Math.max(0, order.indexOf(status));

    return `
      <div class="tracker-timeline" aria-label="Dispute timeline">
        ${steps.map((step, index) => `
          <div class="timeline-step ${index <= activeIndex ? 'is-active' : ''}">
            <span></span>
            <small>${step.label}</small>
          </div>
        `).join('')}
      </div>
    `;
  }


  function refreshProgressSoon() {
    if (window.updateCreditProgress) {
      window.updateCreditProgress();
    }

    setTimeout(function () {
      if (window.updateCreditProgress) {
        window.updateCreditProgress();
      }
    }, 50);
  }

  function renderTracker() {
    const disputes = loadDisputes();

    const existing = document.querySelector('#dispute-tracker');
    if (existing) existing.remove();

    const mount =
      document.querySelector('#credit-roadmap-wrap') ||
      document.querySelector('#results') ||
      document.querySelector('.results-section') ||
      document.querySelector('main') ||
      document.body;

    const section = document.createElement('section');
    section.id = 'dispute-tracker';
    section.className = 'dispute-tracker';
    section.setAttribute('aria-labelledby', 'dispute-tracker-title');

    section.innerHTML = `
      <div class="tracker-header">
        <div>
          <p class="eyebrow">Stay Organized</p>
          <h2 id="dispute-tracker-title">Dispute Tracker</h2>
          <p>Track each dispute, date sent, bureau, status, and next action. Your records are saved locally in this browser.</p>
        </div>

        <div class="tracker-header-actions">
          <button type="button" class="tracker-import-btn" data-import-flagged>Import Flagged Accounts</button>
          <button type="button" class="tracker-add-btn" data-add-dispute>Add Dispute</button>
        </div>
      </div>

      <form class="tracker-form" data-dispute-form hidden>
        <div class="tracker-form-grid">
          <label>
            Account or Item
            <input name="account" type="text" placeholder="Example: ABC Bank late payment" required>
          </label>

          <label>
            Bureau
            <select name="bureau" required>
              <option value="">Select bureau</option>
              <option>Experian</option>
              <option>Equifax</option>
              <option>TransUnion</option>
              <option>All Three</option>
            </select>
          </label>

          <label>
            Status
            <select name="status" required>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="responded">Responded</option>
              <option value="followup">Needs Follow-Up</option>
              <option value="closed">Closed</option>
            </select>
          </label>

          <label>
            Date Sent
            <input name="sentDate" type="date" value="${today()}">
          </label>
        </div>

        <label>
          Notes
          <textarea name="notes" rows="3" placeholder="Add proof of mailing, response notes, or next steps."></textarea>
        </label>

        <div class="tracker-form-actions">
          <button type="submit">Save Dispute</button>
          <button type="button" data-cancel-dispute>Cancel</button>
        </div>
      </form>

      <div class="tracker-summary">
        <div><strong>${disputes.length}</strong><span>Total</span></div>
        <div><strong>${disputes.filter(d => d.status === 'sent').length}</strong><span>Sent</span></div>
        <div><strong>${disputes.filter(d => d.status === 'followup').length}</strong><span>Follow-Up</span></div>
        <div><strong>${disputes.filter(d => d.status === 'closed').length}</strong><span>Closed</span></div>
      </div>

      <div class="tracker-list">
        ${
          disputes.length
            ? disputes.map(dispute => `
              <article class="tracker-card" data-dispute-id="${escapeHTML(dispute.id)}">
                <div class="tracker-card-top">
                  <div>
                    <h3>${escapeHTML(dispute.account)}</h3>
                    <p>${escapeHTML(dispute.bureau)} · Sent: ${escapeHTML(dispute.sentDate || 'Not sent yet')}</p>
                  </div>
                  <span class="tracker-status status-${escapeHTML(dispute.status)}">${escapeHTML(getStatusLabel(dispute.status))}</span>
                </div>

                ${timelineHTML(dispute)}

                <p class="tracker-next"><strong>Next action:</strong> ${escapeHTML(getNextAction(dispute))}</p>

                ${dispute.notes ? `<p class="tracker-notes">${escapeHTML(dispute.notes)}</p>` : ''}

                <div class="tracker-card-actions">
                  <button type="button" data-mark-sent>Mark Sent</button>
                  <button type="button" data-mark-followup>Mark Follow-Up</button>
                  <button type="button" data-mark-responded>Mark Responded</button>
                  <button type="button" data-mark-closed>Mark Closed</button>
                  <button type="button" data-delete-dispute>Delete</button>
                </div>
              </article>
            `).join('')
            : `
              <div class="tracker-empty">
                <h3>No disputes tracked yet</h3>
                <p>Add your first dispute or import flagged accounts after running an analysis.</p>
              </div>
            `
        }
      </div>
    `;

    if (mount.id === 'credit-roadmap-wrap') {
      mount.insertAdjacentElement('afterend', section);
    } else {
      mount.appendChild(section);
    }

    bindTrackerEvents(section);

    if (window.renderAICreditCoach) {
      window.renderAICreditCoach();
    }
  }

  function bindTrackerEvents(section) {
    const form = section.querySelector('[data-dispute-form]');
    const addButton = section.querySelector('[data-add-dispute]');
    const cancelButton = section.querySelector('[data-cancel-dispute]');
    const importButton = section.querySelector('[data-import-flagged]');

    importButton.addEventListener('click', importFlaggedAccounts);

    addButton.addEventListener('click', function () {
      form.hidden = false;
      addButton.hidden = true;
      form.querySelector('input[name="account"]').focus();
    });

    cancelButton.addEventListener('click', function () {
      form.reset();
      form.hidden = true;
      addButton.hidden = false;
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      const formData = new FormData(form);
      const disputes = loadDisputes();

      disputes.unshift({
        id: createId(),
        account: formData.get('account'),
        bureau: formData.get('bureau'),
        status: formData.get('status'),
        sentDate: formData.get('sentDate'),
        notes: formData.get('notes'),
        createdAt: new Date().toISOString()
      });

      saveDisputes(disputes);
      renderTracker();
      refreshProgressSoon();
      refreshProgressSoon();

    if (window.updateCreditProgress) {
      window.updateCreditProgress();
    }

      if (window.trackParseurEvent) {
        window.trackParseurEvent('dispute_added', { source: 'dispute_tracker' });
      }
    });

    section.querySelectorAll('[data-dispute-id]').forEach(function (card) {
      const id = card.getAttribute('data-dispute-id');

      card.querySelector('[data-mark-sent]').addEventListener('click', function () {
        updateDispute(id, { status: 'sent', sentDate: today() });
      });

      card.querySelector('[data-mark-followup]').addEventListener('click', function () {
        updateDispute(id, { status: 'followup' });
      });

      card.querySelector('[data-mark-responded]').addEventListener('click', function () {
        updateDispute(id, { status: 'responded' });
      });

      card.querySelector('[data-mark-closed]').addEventListener('click', function () {
        updateDispute(id, { status: 'closed' });
      });

      card.querySelector('[data-delete-dispute]').addEventListener('click', function () {
        const disputes = loadDisputes().filter(dispute => dispute.id !== id);
        saveDisputes(disputes);
        renderTracker();

    if (window.updateCreditProgress) {
      window.updateCreditProgress();
    }
      });
    });
  }

  function updateDispute(id, updates) {
    const disputes = loadDisputes().map(function (dispute) {
      if (dispute.id !== id) return dispute;
      return Object.assign({}, dispute, updates, { updatedAt: new Date().toISOString() });
    });

    saveDisputes(disputes);
    renderTracker();
    refreshProgressSoon();
    refreshProgressSoon();

    if (window.updateCreditProgress) {
      window.updateCreditProgress();
    }
  }

  window.renderDisputeTracker = renderTracker;

  document.addEventListener('parseur:analysis-complete', function (event) {
    saveLatestAnalysis(event.detail || {});
    renderTracker();

    if (window.updateCreditProgress) {
      window.updateCreditProgress();
    }
  });

  // Tracker now renders after analysis or roadmap only.
})();
