(function () {

  function createCoachHTML() {
    return `
      <section id="ai-credit-coach" class="ai-credit-coach">

        <div class="coach-header">
          <div>
            <div class="coach-eyebrow">AI GUIDANCE</div>
            <h2>AI Credit Coach</h2>
            <p>
              Ask questions about your report, roadmap, disputes,
              utilization, collections, and next steps.
            </p>
          </div>
        </div>

        <div class="coach-quick-actions">
          <button class="coach-chip" data-question="What should I dispute first?">
            What should I dispute first?
          </button>

          <button class="coach-chip" data-question="What is hurting my score the most?">
            What is hurting my score the most?
          </button>

          <button class="coach-chip" data-question="What documents should I gather?">
            What documents should I gather?
          </button>

          <button class="coach-chip" data-question="What should I do in the next 30 days?">
            What should I do in the next 30 days?
          </button>
        </div>

        <div class="coach-chat">

          <div id="coachMessages" class="coach-messages">
            <div class="coach-message coach-message-ai">
              Hello. I am your AI Credit Coach.
              Ask a question about your credit improvement plan.
            </div>
          </div>

          <div class="coach-input-row">
            <textarea
              id="coachInput"
              placeholder="Ask a question..."
              rows="3"
            ></textarea>

            <button id="coachSendBtn">
              Ask Coach
            </button>
          </div>

        </div>

      </section>
    `;
  }

  function ensureCoachExists() {

    if (document.querySelector('#ai-credit-coach')) return;

    const tracker =
      document.querySelector('#dispute-tracker');

    if (!tracker) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = createCoachHTML();

    tracker.insertAdjacentElement(
      'afterend',
      wrapper.firstElementChild
    );

    bindCoachEvents();
  }

  function addMessage(text, type) {

    const messages =
      document.querySelector('#coachMessages');

    if (!messages) return;

    const div = document.createElement('div');

    div.className =
      'coach-message coach-message-' + type;

    div.textContent = text;

    messages.appendChild(div);

    messages.scrollTop =
      messages.scrollHeight;
  }

  function getTrackerSummary() {

    try {

      const disputes =
        JSON.parse(
          localStorage.getItem(
            'parseur10x_dispute_tracker_v1'
          )
        ) || [];

      return {
        total: disputes.length,
        sent: disputes.filter(x => x.status === 'sent').length,
        responded: disputes.filter(x => x.status === 'responded').length,
        closed: disputes.filter(x => x.status === 'closed').length
      };

    } catch {

      return {
        total: 0,
        sent: 0,
        responded: 0,
        closed: 0
      };
    }
  }

  async function askCoach(question) {

    addMessage(question, 'user');

    const stats =
      getTrackerSummary();

    let answer =
      `You currently have ${stats.total} tracked disputes. `;

    if (stats.sent === 0) {

      answer +=
      'Your next step is to review imported accounts and prepare your first dispute package.';

    } else if (stats.closed === stats.total && stats.total > 0) {

      answer +=
      'Great work. All tracked disputes are currently closed.';

    } else {

      answer +=
      'Focus on follow-ups, response tracking, and documentation.';
    }

    setTimeout(function () {
      addMessage(answer, 'ai');
    }, 500);
  }

  function bindCoachEvents() {

    document
      .querySelector('#coachSendBtn')
      ?.addEventListener('click', function () {

        const input =
          document.querySelector('#coachInput');

        if (!input?.value.trim()) return;

        askCoach(input.value.trim());

        input.value = '';
      });

    document
      .querySelectorAll('.coach-chip')
      .forEach(btn => {

        btn.addEventListener('click', function () {

          askCoach(
            btn.dataset.question
          );
        });
      });
  }

  window.renderAICreditCoach =
    ensureCoachExists;

  document.addEventListener(
    'DOMContentLoaded',
    ensureCoachExists
  );

})();
