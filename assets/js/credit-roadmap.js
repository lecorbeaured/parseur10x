(function () {
  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function textIncludes(analysis, terms) {
    const text = JSON.stringify(analysis || {}).toLowerCase();
    return terms.some(term => text.includes(term));
  }

  function calculateHealthScore(analysis) {
    let score = 82;

    const issueCount =
      safeArray(analysis.possibleIssues).length +
      safeArray(analysis.negativeItems).length +
      safeArray(analysis.reviewWarnings).length;

    if (issueCount >= 1) score -= 8;
    if (issueCount >= 3) score -= 10;
    if (issueCount >= 6) score -= 12;

    if (textIncludes(analysis, ['collection', 'charge-off', 'charge off'])) score -= 12;
    if (textIncludes(analysis, ['late payment', '30 days late', '60 days late', '90 days late'])) score -= 10;
    if (textIncludes(analysis, ['high utilization', 'utilization', 'maxed'])) score -= 10;
    if (textIncludes(analysis, ['inquiry', 'hard inquiry'])) score -= 4;

    return Math.max(35, Math.min(95, score));
  }

  function getScoreLabel(score) {
    if (score >= 85) return 'Strong';
    if (score >= 70) return 'Needs Review';
    if (score >= 55) return 'Needs Action';
    return 'High Priority';
  }

  function buildHealthBreakdown(analysis) {
    return [
      {
        label: 'Payment History',
        score: textIncludes(analysis, ['late payment', '30 days late', '60 days late', '90 days late']) ? 58 : 82
      },
      {
        label: 'Utilization',
        score: textIncludes(analysis, ['utilization', 'high balance', 'maxed']) ? 48 : 78
      },
      {
        label: 'Collections',
        score: textIncludes(analysis, ['collection', 'charge-off', 'charge off']) ? 52 : 86
      },
      {
        label: 'Inquiries',
        score: textIncludes(analysis, ['inquiry', 'hard inquiry']) ? 68 : 88
      },
      {
        label: 'Account Age',
        score: textIncludes(analysis, ['thin file', 'new account', 'short credit history']) ? 62 : 76
      }
    ];
  }

  function getUtilizationHint(analysis) {
    if (textIncludes(analysis, ['utilization', 'high balance', 'credit limit', 'maxed'])) {
      return {
        title: 'Lower high credit card utilization',
        detail: 'Focus on bringing revolving balances below 30% first. If possible, aim below 10% later for stronger score health.',
        impact: 'High Impact',
        impactClass: 'high'
      };
    }

    return {
      title: 'Review revolving balances',
      detail: 'Check every credit card balance against its limit. Prioritize any card that is close to maxed out.',
      impact: 'Medium Impact',
      impactClass: 'medium'
    };
  }

  function buildRoadmap(analysis) {
    const utilizationHint = getUtilizationHint(analysis);
    const actionPlan = safeArray(analysis.actionPlan);

    return [
      {
        period: 'Next 30 Days',
        title: 'Stabilize and organize',
        impact: utilizationHint.impact,
        impactClass: utilizationHint.impactClass,
        items: [
          utilizationHint.title,
          actionPlan[0] || 'Review all flagged accounts for accuracy.',
          'Save a clean copy of your credit report and mark each item as accurate, questionable, or needs proof.'
        ],
        focus: utilizationHint.detail,
        why: 'Often one of the fastest score improvement levers.'
      },
      {
        period: 'Days 31 to 60',
        title: 'Dispute and document',
        impact: 'High Impact',
        impactClass: 'high',
        items: [
          actionPlan[1] || 'Gather documents before sending disputes.',
          'Send dispute letters only for items you genuinely believe may be inaccurate or unverifiable.',
          'Keep proof of mailing, dates, and copies of every letter.'
        ],
        focus: 'Your report shows items worth reviewing carefully.',
        why: 'Good records make follow-up easier and reduce confusion.'
      },
      {
        period: 'Days 61 to 90',
        title: 'Follow up and rebuild',
        impact: 'Medium Impact',
        impactClass: 'medium',
        items: [
          actionPlan[2] || 'Follow up after bureau responses arrive.',
          'Review bureau responses and compare updates against your original report.',
          'Continue positive credit habits: on-time payments, lower balances, and no unnecessary new applications.'
        ],
        focus: 'The goal is not only removing possible errors. The bigger goal is building stronger credit habits.',
        why: 'This turns a one-time cleanup into a long-term credit improvement system.'
      }
    ];
  }

  function createHealthScoreHTML(analysis) {
    const score = calculateHealthScore(analysis);
    const label = getScoreLabel(score);
    const breakdown = buildHealthBreakdown(analysis);

    return `
      <section class="credit-health-score" aria-labelledby="credit-health-title">
        <div class="health-score-main">
          <p class="eyebrow">Credit Health Snapshot</p>
          <h2 id="credit-health-title">${score}/100</h2>
          <span class="health-label">${label}</span>
          <p>This is a simple educational estimate based on the report details detected. It is not a FICO score.</p>
        </div>

        <div class="health-breakdown">
          ${breakdown.map(item => `
            <div class="health-row">
              <div class="health-row-top">
                <span>${item.label}</span>
                <strong>${item.score}/100</strong>
              </div>
              <div class="health-bar">
                <span style="width:${item.score}%"></span>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function createRoadmapHTML(analysis) {
    const roadmap = buildRoadmap(analysis);

    return `
      <div id="credit-roadmap-wrap">
        ${createHealthScoreHTML(analysis)}

        <section class="credit-roadmap" id="credit-roadmap" aria-labelledby="credit-roadmap-title">
          <div class="roadmap-header">
            <p class="eyebrow">Your Next Best Steps</p>
            <h2 id="credit-roadmap-title">Credit Improvement Roadmap</h2>
            <p>Use this roadmap as a simple guide. Review everything carefully and only dispute information you believe is inaccurate, outdated, duplicated, or unverifiable.</p>
          </div>

          <div class="roadmap-grid">
            ${roadmap.map(step => `
              <article class="roadmap-card">
                <div class="roadmap-card-top">
                  <span class="roadmap-period">${step.period}</span>
                  <span class="impact-badge impact-${step.impactClass}">${step.impact}</span>
                </div>

                <h3>${step.title}</h3>

                <ul>
                  ${step.items.map(item => `<li>${item}</li>`).join('')}
                </ul>

                <div class="roadmap-note">
                  <strong>Focus:</strong> ${step.focus}
                </div>

                <div class="roadmap-impact">
                  <strong>Why it matters:</strong> ${step.why}
                </div>
              </article>
            `).join('')}
          </div>

          <div id="credit-progress-card" class="credit-progress-card">
            <div class="progress-header">
              <h3>Credit Repair Progress</h3>
              <span class="progress-percent" id="progressPercent">0%</span>
            </div>

            <div class="progress-bar-wrap">
              <div class="progress-bar">
                <span id="progressBarFill" style="width:0%"></span>
              </div>
            </div>

            <div class="progress-stats">
              <div>
                <strong id="progressDisputes">0</strong>
                <span>Disputes</span>
              </div>

              <div>
                <strong id="progressSent">0</strong>
                <span>Sent</span>
              </div>

              <div>
                <strong id="progressResponses">0</strong>
                <span>Responses</span>
              </div>

              <div>
                <strong id="progressClosed">0</strong>
                <span>Closed</span>
              </div>
            </div>

            <div class="progress-next-action">
              <strong>Next Recommended Action</strong>
              <p id="progressRecommendation">
                Review imported accounts and identify which items you believe may be inaccurate, outdated, duplicated, or unverifiable.
              </p>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function findResultsMount() {
    return (
      document.querySelector('#results') ||
      document.querySelector('.results-section') ||
      document.querySelector('.analysis-results') ||
      document.querySelector('main') ||
      document.body
    );
  }

  function renderCreditRoadmap(analysis) {
    if (!analysis || typeof analysis !== 'object') return;

    const existing = document.querySelector('#credit-roadmap-wrap');
    if (existing) existing.remove();

    const mount = findResultsMount();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = createRoadmapHTML(analysis);

    
mount.appendChild(wrapper.firstElementChild);

if (window.renderDisputeTracker) {
  window.renderDisputeTracker();
}

  }

  window.renderCreditRoadmap = renderCreditRoadmap;

  document.addEventListener('parseur:analysis-complete', function (event) {
    renderCreditRoadmap(event.detail || {});
  });

  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    document.addEventListener('DOMContentLoaded', function () {
      if (document.querySelector('#roadmap-test-button')) return;

      const button = document.createElement('button');
      button.id = 'roadmap-test-button';
      button.type = 'button';
      button.textContent = 'Test Credit Roadmap';
      button.style.position = 'fixed';
      button.style.right = '16px';
      button.style.bottom = '16px';
      button.style.zIndex = '9999';
      button.style.padding = '12px 16px';
      button.style.borderRadius = '999px';
      button.style.border = '0';
      button.style.background = '#0f766e';
      button.style.color = '#fff';
      button.style.fontWeight = '700';
      button.style.cursor = 'pointer';

      button.addEventListener('click', function () {
        const sampleAnalysis = {
          possibleIssues: [
            { title: 'Possible late payment mismatch' },
            { title: 'Collection account needs review' }
          ],
          negativeItems: [
            { creditor: 'Sample Creditor Collection Account' }
          ],
          reviewWarnings: [
            'High utilization detected'
          ],
          actionPlan: [
            'Review all negative accounts for accuracy.',
            'Gather documents before sending disputes.',
            'Follow up after bureau responses arrive.'
          ]
        };

        try {
          localStorage.setItem('parseur10x_latest_analysis_v1', JSON.stringify(sampleAnalysis));
        } catch (error) {
          console.warn('Could not save sample analysis:', error);
        }

        window.renderCreditRoadmap(sampleAnalysis);

        if (window.renderDisputeTracker) {
          window.renderDisputeTracker();
        }
      });

      document.body.appendChild(button);
    });
  }
})();
