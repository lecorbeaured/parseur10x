// ==================== STATE MANAGEMENT ====================
  const APP_STATE = {
    isPro: false,
    fileName: '',
    parsedAt: null,
    emailCaptured: false,
  };

  // Check if email was previously captured
  try {
    if (localStorage.getItem('parseur10x_email')) {
      APP_STATE.emailCaptured = true;
    }
  } catch(e) {}

  const STRIPE_PK = 'pk_live_51TFKH15slFMmVhuxVLAxzKVymPgrgxCjk4ztrmwCUYkqjgBHPFr5QfwhnbtrCkTDucLQyRgVTuSxDZbYkDtkjFhk00i3LwJXql';

  // ==================== PRO STATUS CHECK ====================
  function activatePro(showUnlockAnimation = false) {
    APP_STATE.isPro = true;
    document.getElementById('planBadge').textContent = 'PRO';
    document.getElementById('planBadge').classList.add('pro');
    document.getElementById('upgradeBtn').style.display = 'none';
    document.getElementById('loginBtn').style.display = 'none';
    try { localStorage.setItem('parseur10x_pro', 'true'); } catch(e) {}
    trackEvent('pro_activated', { method: showUnlockAnimation ? 'checkout' : 'returning' });

    // Show logged-in email if available
    try {
      const email = localStorage.getItem('parseur10x_pro_email');
      if (email) {
        document.getElementById('planBadge').textContent = 'PRO · ' + email.split('@')[0];
      }
    } catch(e) {}

    // If we have analysis data, re-render results with everything unlocked
    if (APP_STATE.analysis && document.getElementById('resultsState').style.display === 'block') {
      const negsCount = (APP_STATE.analysis.negativeItems || []).length;
      const recsCount = (APP_STATE.analysis.recommendations || []).length;
      const unlockedItems = Math.max(0, negsCount - 1);
      const unlockedRecs = Math.max(0, recsCount - 1);

      showResults(APP_STATE.analysis);

      if (showUnlockAnimation && (unlockedItems > 0 || unlockedRecs > 0)) {
        showUnlockBanner(unlockedItems, unlockedRecs);
      }
    }
  }

  function showUnlockBanner(items, recs) {
    const banner = document.createElement('div');
    banner.className = 'unlock-banner';
    banner.innerHTML = `
      <div class="unlock-banner-icon">🔓</div>
      <div class="unlock-banner-text">
        <strong>Pro Unlocked!</strong>
        You now have access to ${items > 0 ? items + ' more negative item' + (items > 1 ? 's' : '') : ''}${items > 0 && recs > 0 ? ' and ' : ''}${recs > 0 ? recs + ' more recommendation' + (recs > 1 ? 's' : '') : ''}, plus dispute letters, Credit Quest, and unlimited parses.
      </div>
    `;
    
    const resultsHeader = document.querySelector('.results-header');
    if (resultsHeader) {
      resultsHeader.after(banner);
      requestAnimationFrame(() => banner.classList.add('show'));
      setTimeout(() => {
        banner.classList.remove('show');
        setTimeout(() => banner.remove(), 400);
      }, 6000);
    }
  }

  function deactivatePro() {
    APP_STATE.isPro = false;
    document.getElementById('planBadge').textContent = 'FREE PLAN';
    document.getElementById('planBadge').classList.remove('pro');
    document.getElementById('upgradeBtn').style.display = '';
    document.getElementById('loginBtn').style.display = '';
    try { localStorage.removeItem('parseur10x_pro'); } catch(e) {}
    try { localStorage.removeItem('parseur10x_pro_email'); } catch(e) {}
    try { localStorage.removeItem('parseur10x_auth_token'); } catch(e) {}
  }

  // Check localStorage for returning pro users
  try {
    if (localStorage.getItem('parseur10x_pro') === 'true') {
      activatePro();
    }
  } catch(e) {}

  // Restore analysis from sessionStorage (survives Stripe redirect)
  try {
    const savedAnalysis = sessionStorage.getItem('parseur10x_analysis');
    if (savedAnalysis) {
      APP_STATE.analysis = JSON.parse(savedAnalysis);
    }
  } catch(e) {}

  // Handle return from Stripe Checkout
  (function handleCheckoutReturn() {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const canceled = params.get('canceled');

    if (sessionId) {
      // Verify the session with our backend
      verifyCheckoutSession(sessionId);
      // Clean URL without reload
      window.history.replaceState({}, '', '/app.html');
      // If we have saved analysis, jump straight to results
      if (APP_STATE.analysis) {
        document.getElementById('uploadState').style.display = 'none';
        document.getElementById('resultsState').style.display = 'block';
      }
    } else if (canceled) {
      showToast('Checkout canceled — no charges were made.', 'warning');
      window.history.replaceState({}, '', '/app.html');
      // Return to results if analysis exists
      if (APP_STATE.analysis) {
        document.getElementById('uploadState').style.display = 'none';
        document.getElementById('resultsState').style.display = 'block';
        showResults(APP_STATE.analysis);
      }
    } else if (params.get('plan') === 'pro') {
      activatePro(true);
      window.history.replaceState({}, '', '/app.html');
    }
  })();

  async function verifyCheckoutSession(sessionId) {
    try {
      const res = await fetch('/.netlify/functions/verify-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      const data = await res.json();

      if (data.paid && data.activeSubscription) {
        if (data.customerEmail) {
          try { localStorage.setItem('parseur10x_pro_email', data.customerEmail); } catch(e) {}
        }
        activatePro(true);
        showToast('Welcome to Pro! You now have full access.', 'success');
        setTimeout(triggerConfetti, 300);
      } else {
        showToast('Payment not confirmed yet. If you completed payment, refresh in a moment.', 'warning');
      }
    } catch (err) {
      console.error('Session verification error:', err);
      showToast('We could not verify the payment yet. Please refresh or contact support if payment completed.', 'warning');
    }
  }

  // ==================== STRIPE CHECKOUT ====================
  function showUpgradeModal() {
    trackEvent('upgrade_click', { source: 'app' });

    const existing = document.getElementById('parseur-upgrade-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'parseur-upgrade-modal';
    modal.className = 'email-gate-overlay open';
    modal.innerHTML = `
      <div class="email-gate-modal" style="max-width:520px;padding:32px 28px;">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-size:2.2rem;margin-bottom:8px;">🛡️</div>
          <h2 style="font-family:var(--font-display);font-size:1.35rem;font-weight:800;margin:0 0 6px;">Upgrade to PARSEUR 10X Pro</h2>
          <p style="color:var(--text-secondary);font-size:0.88rem;margin:0;">Everything you need to dispute, track, and win.</p>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">
          <div style="background:var(--surface-raised);border:1px solid var(--border-color);border-radius:12px;padding:16px;">
            <div style="font-weight:700;font-size:0.82rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:12px;">Free Plan</div>
            <ul style="list-style:none;margin:0;padding:0;font-size:0.83rem;color:var(--text-secondary);display:flex;flex-direction:column;gap:7px;">
              <li>✅ Credit report analysis</li>
              <li>✅ AI Roadmap</li>
              <li>✅ Dispute Tracker</li>
              <li>✅ Progress Dashboard</li>
              <li>✅ <strong>1 free dispute letter</strong></li>
              <li style="color:var(--text-muted);">— 1 parse / month</li>
              <li style="color:var(--text-muted);">— See 1 negative item</li>
              <li style="color:var(--text-muted);">— See 1 recommendation</li>
            </ul>
          </div>
          <div style="background:linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%);border:2px solid var(--accent);border-radius:12px;padding:16px;position:relative;">
            <div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;font-size:0.7rem;font-weight:700;padding:2px 10px;border-radius:20px;letter-spacing:0.06em;white-space:nowrap;">RECOMMENDED</div>
            <div style="font-weight:700;font-size:0.82rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--accent);margin-bottom:12px;">Pro Plan</div>
            <ul style="list-style:none;margin:0;padding:0;font-size:0.83rem;color:#e2e8f0;display:flex;flex-direction:column;gap:7px;">
              <li>✅ Everything in Free</li>
              <li>✅ Unlimited parses</li>
              <li>✅ All negative items</li>
              <li>✅ All recommendations</li>
              <li>✅ <strong>Unlimited dispute letters</strong></li>
              <li>✅ Bureau-specific templates</li>
              <li>✅ Follow-up letters</li>
              <li>✅ 609 dispute templates</li>
              <li>✅ PDF dispute packages</li>
              <li>✅ Reminder system</li>
            </ul>
          </div>
        </div>
        <button class="email-gate-btn" id="upgradeModalCheckoutBtn" onclick="document.getElementById('parseur-upgrade-modal').remove();document.body.style.overflow='';handleStripeCheckout();">
          Upgrade to Pro — \$17/mo →
        </button>
        <p style="text-align:center;font-size:0.75rem;color:var(--text-muted);margin-top:10px;">Cancel anytime. Secure checkout via Stripe.</p>
        <div style="text-align:center;margin-top:10px;">
          <a href="#" style="font-size:0.8rem;color:var(--text-muted);text-decoration:none;" onclick="document.getElementById('parseur-upgrade-modal').remove();document.body.style.overflow='';return false;">No thanks, keep free plan</a>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    modal.addEventListener('click', function(e) {
      if (e.target === modal) { modal.remove(); document.body.style.overflow = ''; }
    });
  }

  async function handleStripeCheckout() {
    const btn = document.querySelector('.upgrade-btn') || document.querySelector('.pro-banner-btn');
    const origText = btn ? btn.textContent : '';
    if (btn) { btn.textContent = 'Opening checkout...'; btn.style.pointerEvents = 'none'; }

    try {
      const stripe = Stripe(STRIPE_PK);
      const res = await fetch('/.netlify/functions/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'app' })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create checkout session');
      }

      const { sessionId } = await res.json();
      const { error } = await stripe.redirectToCheckout({ sessionId });

      if (error) throw error;
    } catch (err) {
      console.error('Checkout error:', err);
      showToast('Something went wrong. Please try again.', 'error');
    } finally {
      if (btn) { btn.textContent = origText; btn.style.pointerEvents = ''; }
    }
  }

  // ==================== TOAST NOTIFICATIONS ====================
  function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    const icons = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' };
    toast.innerHTML = '<span>' + (icons[type] || '') + '</span> ' + message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ==================== MAGIC LINK AUTH ====================
  function showLoginModal() {
    document.getElementById('loginModal').classList.add('open');
    document.body.style.overflow = 'hidden';
    // Reset state
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('loginSuccess').style.display = 'none';
    document.getElementById('loginSubmitBtn').style.display = '';
    document.querySelector('#loginModal .email-gate-field').style.display = '';
    document.querySelector('#loginModal .email-gate-sub').style.display = '';
    setTimeout(() => document.getElementById('loginEmail').focus(), 300);
  }

  // Handle Enter key on login input
  document.addEventListener('DOMContentLoaded', () => {
    const loginInput = document.getElementById('loginEmail');
    if (loginInput) {
      loginInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitLogin();
      });
    }
  });

  async function submitLogin() {
    const emailInput = document.getElementById('loginEmail');
    const email = emailInput.value.trim();
    const errEl = document.getElementById('loginError');
    const btn = document.getElementById('loginSubmitBtn');

    if (!email) {
      errEl.textContent = 'Please enter your email.';
      errEl.style.display = 'block';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errEl.textContent = 'Please enter a valid email.';
      errEl.style.display = 'block';
      return;
    }

    errEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Checking subscription...';

    try {
      const res = await fetch('/.netlify/functions/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        errEl.textContent = data.error || 'Something went wrong.';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Send Login Link →';
        return;
      }

      // Success — show confirmation
      btn.style.display = 'none';
      document.querySelector('#loginModal .email-gate-field').style.display = 'none';
      document.querySelector('#loginModal .email-gate-sub').style.display = 'none';
      document.getElementById('loginSuccess').style.display = 'block';

      // Auto-close after 5 seconds
      setTimeout(() => {
        document.getElementById('loginModal').classList.remove('open');
        document.body.style.overflow = '';
      }, 5000);

    } catch (err) {
      console.error('Login error:', err);
      errEl.textContent = 'Connection error. Please try again.';
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Send Login Link →';
    }
  }

  // Handle magic link token on page load
  (function handleMagicLinkToken() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('auth_token');
    const authEmail = params.get('auth_email');

    if (token && authEmail) {
      // Verify token with backend
      verifyMagicLink(token, authEmail);
      window.history.replaceState({}, '', '/app.html');
    }
  })();

  async function verifyMagicLink(token, email) {
    try {
      const res = await fetch('/.netlify/functions/verify-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email }),
      });

      const data = await res.json();

      if (data.valid) {
        try {
          localStorage.setItem('parseur10x_pro_email', email);
          localStorage.setItem('parseur10x_auth_token', token);
        } catch(e) {}
        activatePro(true);
        showToast('Welcome back! Logged in as ' + email, 'success');
        setTimeout(triggerConfetti, 300);
      } else {
        showToast(data.error || 'Invalid or expired login link. Please request a new one.', 'warning');
      }
    } catch (err) {
      console.error('Magic link verification error:', err);
      showToast('Could not verify login. Please try again.', 'error');
    }
  }

  // ==================== EMAIL GATE ====================
  function showEmailGate(analysis) {
    // Populate teaser stats
    const negs = analysis.negativeItems || [];
    const totalGain = negs.reduce((sum, n) => sum + (n.impactScore || 0), 0);
    document.getElementById('egItemCount').textContent = negs.length;
    document.getElementById('egScoreGain').textContent = '+' + totalGain + ' pts';

    // Show the gate
    document.getElementById('processingState').style.display = 'none';
    document.getElementById('emailGate').classList.add('open');
    document.body.style.overflow = 'hidden';

    // Focus email input
    setTimeout(() => document.getElementById('egEmail').focus(), 400);

    // Enter key submits
    document.getElementById('egEmail').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitEmailGate();
    });
  }

  async function submitEmailGate() {
    const emailInput = document.getElementById('egEmail');
    const email = emailInput.value.trim();
    const errEl = document.getElementById('egError');
    const btn = document.getElementById('egSubmitBtn');

    // Validate
    if (!email) {
      errEl.textContent = 'Please enter your email address.';
      errEl.style.display = 'block';
      emailInput.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errEl.textContent = 'Please enter a valid email address.';
      errEl.style.display = 'block';
      emailInput.focus();
      return;
    }

    errEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Unlocking...';

    // Store email locally
    APP_STATE.emailCaptured = true;
    trackEvent('email_captured', { source: 'email_gate' });
    try { localStorage.setItem('parseur10x_email', email); } catch(e) {}

    // Send to backend (non-blocking — don't wait for response)
    fetch('/.netlify/functions/capture-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: 'email_gate', fileName: APP_STATE.fileName }),
    }).catch(() => {}); // Fail silently — email is already stored locally

    // Close gate and show results
    await sleep(600);
    document.getElementById('emailGate').classList.remove('open');
    document.body.style.overflow = '';
    btn.disabled = false;
    btn.textContent = 'See My Results →';

    showResults(APP_STATE.analysis);
  }

  // ==================== AFFILIATE LINKS ====================
  const AFFILIATES = {
    kikoff: { url: 'https://kikoff.pxf.io/c/7007975/2344833/14994', label: 'Try Kikoff — $0/mo credit builder →', pixel: 'https://imp.pxf.io/i/7007975/2344833/14994' },
    ava: { url: 'https://meetava.sjv.io/KB0xLA', label: 'Check Ava Credit eligibility →', pixel: null },
    identityiq: { url: 'https://www.identityiq.com/sc-securemax.aspx?offercode=431297RY', label: 'Start IdentityIQ monitoring →', pixel: null },
  };

  // ==================== FILE UPLOAD ====================
  const uploadZone = document.getElementById('uploadZone');

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });
  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
  });
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]);
  });

  function handleFileUpload(file) {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      showToast('Please upload a PDF file.', 'warning');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showToast('File too large. Max 20MB.', 'warning');
      return;
    }

    // Free user: 1 parse per month limit
    if (!APP_STATE.isPro) {
      try {
        const parseKey = 'parseur10x_free_parse_' + new Date().getFullYear() + '-' + (new Date().getMonth() + 1);
        const parseCount = parseInt(localStorage.getItem(parseKey) || '0');
        if (parseCount >= 1) {
          showToast('Free plan limit reached — 1 parse per month. Upgrade to Pro for unlimited.', 'warning');
          setTimeout(() => showUpgradeModal(), 1500);
          return;
        }
      } catch(e) {}
    }

    APP_STATE.fileName = file.name;
    trackEvent('report_upload', { file_size: file.size, is_pro: APP_STATE.isPro });
    startProcessing(file);
  }

  // ==================== PROCESSING ====================
  function updateStep(stepNum, status) {
    const el = document.getElementById('step' + stepNum);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (status === 'active') el.classList.add('active');
    if (status === 'done') {
      el.classList.add('done');
      el.querySelector('.step-indicator').textContent = '✓';
    }
  }

  async function startProcessing(file) {
    document.getElementById('uploadState').style.display = 'none';
    document.getElementById('processingState').style.display = 'block';

    try {
      // Step 1: Extract text from PDF using pdf.js
      updateStep(1, 'active');
      const reportText = await extractPdfText(file);
      updateStep(1, 'done');

      if (!reportText || reportText.trim().length < 50) {
        throw new Error('Could not extract text from this PDF. It may be a scanned image. Please try a text-based credit report PDF.');
      }

      // Step 2-4: Send to Claude API for analysis
      updateStep(2, 'active');
      await sleep(400);
      updateStep(2, 'done');
      updateStep(3, 'active');

      const analysis = await analyzeReport(reportText);

      updateStep(3, 'done');
      updateStep(4, 'active');
      await sleep(400);
      updateStep(4, 'done');

      // Step 5: Render results
      updateStep(5, 'active');
      await sleep(300);
      updateStep(5, 'done');

      APP_STATE.analysis = analysis;
      // Persist analysis so it survives Stripe redirect
      try { sessionStorage.setItem('parseur10x_analysis', JSON.stringify(analysis)); } catch(e) {}
      await sleep(500);

      // Pro users or already-gated users skip email gate
      if (APP_STATE.isPro || APP_STATE.emailCaptured) {
        showResults(analysis);
      } else {
        showEmailGate(analysis);
      }

    } catch (err) {
      console.error('Processing error:', err);
      showToast(err.message || 'Something went wrong. Please try again.', 'error');
      // Return to upload state
      setTimeout(() => {
        document.getElementById('processingState').style.display = 'none';
        document.getElementById('uploadState').style.display = 'block';
        resetProcessingSteps();
      }, 2000);
    }
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ==================== PDF.JS TEXT EXTRACTION ====================
  async function extractPdfText(file) {
    const pdfjsLib = window.pdfjsLib;
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    return fullText;
  }

  // ==================== CLAUDE API ANALYSIS ====================
  async function analyzeReport(reportText) {
    const DEEPSEEK_KEY = 'sk-05fc91e2756a46e48757b136626502c8';

    const len = reportText.length;
    console.log('Full PDF text length:', len, 'chars');

    // Split by Equifax page header pattern (works with browser pdf.js extraction)
    const trueNegativeKeywords = [
      'status: charge off', 'loan/account type: debt buyer',
      'amount past due: $', 'date of 1st delinquency', 'date major delinquency',
      'status: collection'
    ];

    const header = reportText.substring(0, 1500);
    const pages = reportText.split(/Prepared for:/);
    const negativePages = pages.filter(page => {
      const lower = page.toLowerCase();
      return trueNegativeKeywords.some(kw => lower.includes(kw));
    });

    console.log('Negative pages found:', negativePages.length, 'of', pages.length);

    // Group negative pages into chunks of ~12000 chars each
    const chunks = [];
    let current = '';
    for (const page of negativePages) {
      if (current.length + page.length > 12000) {
        if (current) chunks.push(current);
        current = page;
      } else {
        current += '\n\n---\n\n' + page;
      }
    }
    if (current) chunks.push(current);

    console.log('Chunks to analyze:', chunks.length);

    const prompt = `You are PARSEUR 10X, a careful credit report analysis assistant for consumers.
Return ONLY valid JSON. Do not use markdown, comments, or backticks.

Primary goal:
- Help the user understand possible credit report issues.
- Identify items that may be inaccurate, incomplete, unverifiable, outdated, duplicated, or worth reviewing.
- Recommend practical next steps without claiming guaranteed deletion or guaranteed score increases.
- Do not encourage false disputes. If an item appears accurate, recommend goodwill, payment strategy, utilization reduction, or monitoring instead.

Required JSON shape:
{
  "summary": {
    "totalAccounts": 0,
    "openAccounts": 0,
    "closedAccounts": 0,
    "totalBalance": "$0",
    "hardInquiries": 0,
    "creditScore": null,
    "creditScoreLabel": "",
    "oldestAccountAge": "",
    "utilizationRate": "",
    "reportBureausFound": []
  },
  "negativeItems": [
    {
      "id": "neg1",
      "creditor": "",
      "type": "collection|late_payment|charge_off|repossession|bankruptcy|inquiry|high_utilization|personal_info|other",
      "bureau": "Experian|Equifax|TransUnion|Multiple|Unknown",
      "accountNumberLast4": "",
      "details": "",
      "whyItMatters": "",
      "possibleIssues": [],
      "impact": "high|medium|low",
      "impactScore": 0,
      "fixStrategy": "dispute|debt_validation|goodwill|pay-for-delete|pay-down|wait|monitor",
      "fixExplanation": "",
      "nextStep": "",
      "timeline": "",
      "strategyExplainer": {
        "whatItIs": "",
        "howToUse": "",
        "proTip": ""
      }
    }
  ],
  "recommendations": [
    {
      "priority": 1,
      "title": "",
      "description": "",
      "whyThisComesFirst": "",
      "estimatedGain": "",
      "affiliateHook": "kikoff|ava|identityiq|none",
      "strategyExplainer": {
        "whatItIs": "",
        "howToUse": "",
        "proTip": ""
      }
    }
  ],
  "disputeLetters": [
    {
      "itemId": "neg1",
      "letterType": "debt_validation|goodwill|pay_for_delete|dispute_inaccuracy|method_of_verification",
      "recipientName": "",
      "recipientAddress": "",
      "letterBody": ""
    }
  ],
  "actionPlan": [
    { "step": 1, "title": "", "description": "", "timing": "" }
  ],
  "creditHealthScore": 0,
  "rank": "Credit Rookie|Credit Builder|Credit Warrior|Credit Champion|Credit Master",
  "confidence": "high|medium|low",
  "reviewWarnings": []
}

Analysis rules:
- IMPORTANT: The report text below may be sampled from multiple sections of a longer document. Only flag items where the negative status is explicitly and clearly stated in the text you can see. Do not infer or assume negative status from partial data.
- Prioritize exact items found in the report text. Do not invent creditors, balances, bureaus, dates, or addresses.
- Only mark an account as a charge-off if the text explicitly says "charged off", "charge-off", or "charge off".
- Only mark an account as a collection if the text explicitly shows a collection agency or collection status.
- Only mark an account as a late payment if the text explicitly shows a late payment notation (30, 60, 90 days late).
- Flag ALL negative items you can find — do not stop at 1 or 2. Return every negative item visible in the text.
- Collections usually start with debt validation when ownership, balance, dates, or collector authority are unclear.
- Late payments usually start with goodwill unless there is a clear reporting inconsistency.
- Charge-offs may need factual dispute, goodwill, settlement strategy, or pay-for-delete depending on the details.
- High utilization should use pay-down strategy, not a dispute strategy.
- Hard inquiries should only be disputed if they look unfamiliar or unauthorized.
- Include personal information issues when names, addresses, employers, or phone numbers appear outdated or inconsistent.
- Letters must sound personal, firm, and natural. Avoid robotic template language.
- Keep letters under 250 words each.
- Do not use phrases like "pursuant to my rights" or "I dispute the validity."
- Affiliate hook guide: kikoff=positive tradeline/credit builder, ava=credit builder/payment history, identityiq=monitoring, none=not relevant.
- Credit health score should be 0-100. Rank mapping: 0-30 Rookie, 31-50 Builder, 51-70 Warrior, 71-85 Champion, 86-100 Master.
- Give the user a clear first next step, not just a list of problems.

Credit report text:
`;

    // Call DeepSeek for each chunk and merge results
    async function callDeepSeek(chunkText, chunkIndex, totalChunks) {
      const chunkPrompt = prompt + chunkText;
      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + DEEPSEEK_KEY,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          max_tokens: 4000,
          temperature: 0.1,
          messages: [{ role: 'user', content: chunkPrompt }],
        }),
      });
      if (!res.ok) {
        console.error('DeepSeek chunk', chunkIndex, 'failed:', res.status);
        return null;
      }
      const raw = await res.json();
      const content = raw.choices?.[0]?.message?.content || '';
      console.log('Chunk', chunkIndex + 1, '/', totalChunks, '- response:', content.length, 'chars');
      try {
        const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        return JSON.parse(cleaned);
      } catch(e) {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          try { return JSON.parse(match[0]); } catch(e2) { return null; }
        }
        return null;
      }
    }

    // If no negative pages found, use header + first 12000 chars as fallback
    const chunksToProcess = chunks.length > 0 ? chunks : [reportText.substring(0, 12000)];
    console.log('Processing', chunksToProcess.length, 'chunks...');

    // Process all chunks in parallel (faster) but cap at 6 chunks to avoid rate limits
    const maxChunks = Math.min(chunksToProcess.length, 6);
    const chunkResults = await Promise.all(
      chunksToProcess.slice(0, maxChunks).map((chunk, i) => callDeepSeek(chunk, i, maxChunks))
    );

    // Merge all results
    const validResults = chunkResults.filter(r => r !== null);
    if (validResults.length === 0) throw new Error('Analysis failed. Please try again.');

    // Use first result as base for summary/recommendations
    const data = validResults[0];

    // Merge negative items and dispute letters from all chunks
    const allNegativeItems = [];
    const allDisputeLetters = [];
    const seenCreditors = new Set();

    for (const result of validResults) {
      if (result.negativeItems) {
        for (const item of result.negativeItems) {
          const key = (item.creditor || item.account || '').toLowerCase().trim();
          if (key && !seenCreditors.has(key)) {
            seenCreditors.add(key);
            allNegativeItems.push(item);
          }
        }
      }
      if (result.disputeLetters) {
        allDisputeLetters.push(...result.disputeLetters);
      }
    }

    data.negativeItems = allNegativeItems;
    data.disputeLetters = allDisputeLetters;

    // Normalize fields
    data.negativeItems = data.negativeItems.map((item, i) => ({
      ...item,
      id: item.id || 'neg_' + (i + 1),
      account: (item.creditor || item.account || 'Unknown Account').replace(/\s*-\s*(Closed|Open|Collection)$/i, '').trim(),
      issueType: item.type || item.issueType || 'other',
      impactLevel: item.impact || item.impactLevel || 'medium',
      description: item.details || item.description || '',
    }));

    // Re-assign dispute letter itemIds to match normalized neg item ids
    data.disputeLetters = data.disputeLetters.map((letter, i) => ({
      ...letter,
      itemId: data.negativeItems[i] ? data.negativeItems[i].id : ('neg_' + (i + 1)),
      letterType: letter.letterType || 'standard',
    }));

    console.log('FINAL - Negative items:', data.negativeItems.length, '| Letters:', data.disputeLetters.length);
    trackEvent('analysis_complete', { negative_items: data.negativeItems.length, score: data.creditHealthScore });
    return data;
  }

  // ==================== RENDER RESULTS ====================
  function showResults(data) {
    document.getElementById('uploadState').style.display = 'none';
    document.getElementById('processingState').style.display = 'none';
    document.getElementById('resultsState').style.display = 'block';

    APP_STATE.parsedAt = new Date();
    document.getElementById('parseDate').textContent = APP_STATE.parsedAt.toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const isPro = APP_STATE.isPro;

    // Pro banner
    if (isPro) {
      document.getElementById('proBanner').style.display = 'none';
    }

    // ===== CREDIT HEALTH SCORE (Pro only) =====
    const score = data.creditHealthScore || 0;
    const scoreCard = document.querySelector('.score-card');
    if (isPro) {
      scoreCard.classList.remove('score-locked');
      const existingLockLabel = scoreCard.querySelector('.score-locked-label');
      if (existingLockLabel) existingLockLabel.remove();
      document.getElementById('scoreNum').textContent = score;
      document.getElementById('scoreLabel').textContent = (data.rank || 'Credit Rookie') + ' · PARSEUR Score';
      const offset = 339 - (Math.min(score, 1000) / 1000 * 339);
      const ringEl = document.getElementById('scoreRing');
      const ringColor = score < 300 ? '#DC2626' : score < 500 ? '#D97706' : score < 700 ? '#F59E0B' : '#059669';
      ringEl.style.stroke = ringColor;
      document.getElementById('scoreNum').style.color = ringColor;
      setTimeout(() => { ringEl.style.strokeDashoffset = offset; }, 300);
    } else {
      scoreCard.classList.add('score-locked');
      document.getElementById('scoreNum').textContent = '???';
      document.getElementById('scoreLabel').textContent = 'Upgrade to reveal';
      const lockLabel = document.createElement('div');
      lockLabel.className = 'score-locked-label';
      lockLabel.textContent = '🔒 Pro Only';
      lockLabel.onclick = () => showUpgradeModal();
      scoreCard.appendChild(lockLabel);
    }

    // ===== REPORT OVERVIEW (always visible) =====
    const summary = data.summary || {};
    document.getElementById('reportOverview').innerHTML = `
      <div class="stat-row"><span>Total Accounts</span> <span class="stat-value">${summary.totalAccounts || '—'}</span></div>
      <div class="stat-row"><span>Open Accounts</span> <span class="stat-value">${summary.openAccounts || '—'}</span></div>
      <div class="stat-row"><span>Closed Accounts</span> <span class="stat-value">${summary.closedAccounts || '—'}</span></div>
      <div class="stat-row"><span>Total Balance</span> <span class="stat-value">${summary.totalBalance || '—'}</span></div>
      <div class="stat-row"><span>Hard Inquiries</span> <span class="stat-value ${(summary.hardInquiries || 0) > 3 ? 'yellow' : ''}">${summary.hardInquiries || '—'}</span></div>
      ${summary.creditScore ? `<div class="stat-row"><span>Credit Score</span> <span class="stat-value">${summary.creditScore} (${summary.creditScoreLabel || ''})</span></div>` : ''}
    `;

    // ===== ISSUE BREAKDOWN (always visible) =====
    const negs = data.negativeItems || [];
    const highCount = negs.filter(n => n.impact === 'high').length;
    const medCount = negs.filter(n => n.impact === 'medium').length;
    const lowCount = negs.filter(n => n.impact === 'low').length;
    const totalGain = negs.reduce((sum, n) => sum + (n.impactScore || 0), 0);

    document.getElementById('issueBreakdown').innerHTML = `
      <div class="stat-row"><span>🔴 High Impact</span> <span class="stat-value red">${highCount}</span></div>
      <div class="stat-row"><span>🟡 Medium Impact</span> <span class="stat-value yellow">${medCount}</span></div>
      <div class="stat-row"><span>🟢 Low Impact</span> <span class="stat-value green">${lowCount}</span></div>
      <div class="stat-row"><span>Estimated Score Gain</span> <span class="stat-value green">+${totalGain} pts</span></div>
      <div class="stat-row"><span>Dispute Priority</span> <span class="stat-value ${highCount > 0 ? 'red' : 'green'}">${highCount > 0 ? 'High' : medCount > 0 ? 'Medium' : 'Low'}</span></div>
    `;

    // ===== NEGATIVE ITEMS (Free: 1 visible, rest locked) =====
    document.getElementById('negCount').textContent = negs.length + ' items found';
    let negHtml = '';

    if (negs.length === 0) {
      negHtml = '<div style="padding:24px;text-align:center;color:var(--text-muted);">No negative items found — your report looks clean! 🎉</div>';
    } else {
      negs.forEach((item, i) => {
        const hasLetter = (data.disputeLetters || []).find(l => l.itemId === item.id);
        const isVisible = isPro || i === 0; // Free users see only first item

        if (isVisible) {
          const freeLetterUsed = localStorage.getItem('parseur10x_free_letter_used') === 'true';
          const actionBtn = hasLetter
            ? (isPro
              ? `<button class="neg-action" onclick="showDisputeLetter('${item.id}')">Generate Letter ✉️</button>`
              : freeLetterUsed
                ? `<button class="neg-action pro-only" onclick="showUpgradeModal()">🔓 Upgrade for Unlimited Letters</button>`
                : `<button class="neg-action" onclick="showDisputeLetter('${item.id}')">✉️ Generate Free Letter</button>`)
            : `<button class="neg-action" onclick="scrollToRecs()">See Fix →</button>`;

          const se = item.strategyExplainer;
          const explainerHtml = se ? `
            <div class="strategy-explainer">
              <button class="strategy-toggle" onclick="this.classList.toggle('open');this.nextElementSibling.classList.toggle('open');">
                <span class="arrow">▶</span> What is "${escHtml(item.fixStrategy.replace(/-/g,' '))}" and how to use it
              </button>
              <div class="strategy-body">
                <div class="strategy-body-inner">
                  <div class="strategy-section">
                    <div class="strategy-section-label">What It Is</div>
                    <p>${escHtml(se.whatItIs)}</p>
                  </div>
                  <div class="strategy-section">
                    <div class="strategy-section-label">How To Use It</div>
                    <p>${escHtml(se.howToUse)}</p>
                  </div>
                  <div class="strategy-protip">
                    <strong>Pro Tip:</strong> ${escHtml(se.proTip)}
                  </div>
                  <div class="paper-trail-badge">📬 For disputes: always use certified mail — build your paper trail</div>
                </div>
              </div>
            </div>
          ` : '';

          negHtml += `
            <div class="neg-item" style="flex-wrap:wrap;">
              <div class="neg-item-info">
                <h4>${escHtml(item.creditor)} — ${escHtml(item.type)}</h4>
                <p>${escHtml(item.details)}</p>
                <p style="font-size:0.8rem;color:var(--accent);margin-top:4px;font-weight:600;">Strategy: ${escHtml(item.fixStrategy.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()))}</p>
                <p style="font-size:0.82rem;color:var(--text-secondary);margin-top:2px;">${escHtml(item.fixExplanation)}</p>
                ${explainerHtml}
              </div>
              <span class="neg-impact ${item.impact}">${item.impact === 'high' ? 'High Impact' : item.impact === 'medium' ? 'Medium' : 'Low Impact'}</span>
              ${actionBtn}
            </div>
          `;
        } else {
          // Locked item — blurred with overlay
          negHtml += `
            <div class="neg-item locked">
              <div class="neg-item-info">
                <h4>${escHtml(item.creditor)} — ${escHtml(item.type)}</h4>
                <p>${escHtml(item.details)}</p>
              </div>
              <span class="neg-impact ${item.impact}">${item.impact === 'high' ? 'High Impact' : item.impact === 'medium' ? 'Medium' : 'Low Impact'}</span>
              <button class="neg-action">Generate Letter ✉️</button>
              <div class="locked-overlay">
                <button class="locked-overlay-btn" onclick="showUpgradeModal()">🔒 Unlock with Pro</button>
              </div>
            </div>
          `;
        }
      });

      // Add upgrade banner after locked items for free users
      if (!isPro && negs.length > 1) {
        negHtml += `
          <div class="locked-more-banner">
            <h3>🔓 ${negs.length - 1} more item${negs.length - 1 > 1 ? 's' : ''} found — Upgrade to see all</h3>
            <p>Pro members see every negative item with full details, impact scores, and AI-generated dispute letters.</p>
            <button class="locked-overlay-btn" onclick="showUpgradeModal()">Upgrade to Pro — $17/mo →</button>
          </div>
        `;
      }
    }
    document.getElementById('negItemsList').innerHTML = negHtml;

    // ===== RECOMMENDATIONS (Free: 1 visible, rest locked) =====
    const recs = data.recommendations || [];
    const recIcons = { 1: '🎯', 2: '💌', 3: '📉', 4: '🏗️', 5: '💳', 6: '🔍' };
    let recsHtml = '';

    recs.forEach((rec, i) => {
      const isVisible = isPro || i === 0;
      const aff = rec.affiliateHook && AFFILIATES[rec.affiliateHook];
      const affStyle = rec.affiliateHook === 'kikoff' ? 'background:var(--success-light);border-color:rgba(5,150,105,0.15);'
        : rec.affiliateHook === 'ava' ? 'background:var(--pro-gold-light);border-color:rgba(184,134,11,0.15);'
        : '';

      if (isVisible) {
        let affHtml = '';
        if (aff) {
          affHtml = `
            <div class="aff-cta-card ${rec.affiliateHook}">
              <div class="aff-cta-left">
                <div class="aff-cta-badge">${rec.affiliateHook === 'kikoff' ? '🏗️ Recommended' : rec.affiliateHook === 'ava' ? '💳 Recommended' : '🔍 Recommended'}</div>
                <div class="aff-cta-text">${aff.label.replace(' →', '')}</div>
              </div>
              <a href="${aff.url}" target="_blank" rel="noopener sponsored" class="aff-cta-btn" onclick="trackEvent('affiliate_click', {partner:'${rec.affiliateHook}',location:'recommendation'})">Get Started →</a>
              ${aff.pixel ? `<img height="0" width="0" src="${aff.pixel}" style="position:absolute;visibility:hidden;" border="0" />` : ''}
            </div>
          `;
        }

        recsHtml += `
          <div class="rec-card" ${affStyle ? `style="${affStyle}"` : ''}>
            <div class="rec-icon">${recIcons[i + 1] || '💡'}</div>
            <div class="rec-content">
              <h4>${escHtml(rec.title)}${rec.estimatedGain ? ` <span style="color:var(--success);font-size:0.82rem;">${escHtml(rec.estimatedGain)}</span>` : ''}</h4>
              <p>${escHtml(rec.description)}</p>
              ${rec.strategyExplainer ? `
                <div class="strategy-explainer">
                  <button class="strategy-toggle" onclick="this.classList.toggle('open');this.nextElementSibling.classList.toggle('open');">
                    <span class="arrow">▶</span> Learn more about this strategy
                  </button>
                  <div class="strategy-body">
                    <div class="strategy-body-inner">
                      <div class="strategy-section">
                        <div class="strategy-section-label">What It Is</div>
                        <p>${escHtml(rec.strategyExplainer.whatItIs)}</p>
                      </div>
                      <div class="strategy-section">
                        <div class="strategy-section-label">How To Use It</div>
                        <p>${escHtml(rec.strategyExplainer.howToUse)}</p>
                      </div>
                      <div class="strategy-protip">
                        <strong>Pro Tip:</strong> ${escHtml(rec.strategyExplainer.proTip)}
                      </div>
                      <div class="paper-trail-badge">📬 For disputes: always use certified mail — build your paper trail</div>
                    </div>
                  </div>
                </div>
              ` : ''}
              ${affHtml}
            </div>
          </div>
        `;
      } else {
        recsHtml += `
          <div class="rec-card locked">
            <div class="rec-icon">${recIcons[i + 1] || '💡'}</div>
            <div class="rec-content">
              <h4>${escHtml(rec.title)}</h4>
              <p>${escHtml(rec.description)}</p>
            </div>
            <div class="locked-overlay">
              <button class="locked-overlay-btn" onclick="showUpgradeModal()">🔒 Unlock with Pro</button>
            </div>
          </div>
        `;
      }
    });

    if (!isPro && recs.length > 1) {
      recsHtml += `
        <div class="locked-more-banner">
          <h3>🔓 ${recs.length - 1} more recommendation${recs.length - 1 > 1 ? 's' : ''} — Upgrade to unlock</h3>
          <p>Pro members get full fix strategies, dispute letters, and personalized credit building tools.</p>
          <button class="locked-overlay-btn" onclick="showUpgradeModal()">Upgrade to Pro — $17/mo →</button>
        </div>
      `;
    }
    document.getElementById('recsList').innerHTML = recsHtml;

    // ===== SIDEBAR: Gamification (Pro only) + Affiliates (always visible) =====
    const gamWidget = document.getElementById('gamificationWidget');
    if (isPro) {
      gamWidget.classList.remove('sidebar-locked');
      const existingOverlay = gamWidget.querySelector('.sidebar-locked-overlay');
      if (existingOverlay) existingOverlay.remove();
      updateGamification(data);
    } else {
      gamWidget.classList.add('sidebar-locked');
      if (!gamWidget.querySelector('.sidebar-locked-overlay')) {
        const overlay = document.createElement('div');
        overlay.className = 'sidebar-locked-overlay';
        overlay.innerHTML = `
          <p>🔒 Credit Quest is a Pro feature</p>
          <button class="locked-overlay-btn" onclick="showUpgradeModal()">Upgrade to Pro — $17/mo →</button>
        `;
        gamWidget.appendChild(overlay);
      }
    }

    // Parse limit check for free users (1/month)
    if (!isPro) {
      try {
        const parseKey = 'parseur10x_free_parse_' + new Date().getFullYear() + '-' + (new Date().getMonth() + 1);
        const parseCount = parseInt(localStorage.getItem(parseKey) || '0');
        localStorage.setItem(parseKey, (parseCount + 1).toString());
      } catch(e) {}
    }

    // Confetti
    setTimeout(triggerConfetti, 500);
  }

  function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function scrollToRecs() {
    document.getElementById('recsList').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ==================== GAMIFICATION UPDATE ====================
  function updateGamification(data) {
    const rank = data.rank || 'Credit Rookie';
    const rankEmojis = { 'Credit Rookie': '🌱', 'Credit Builder': '🔨', 'Credit Warrior': '⚔️', 'Credit Champion': '🏆', 'Credit Master': '👑' };
    const ranks = ['Credit Rookie', 'Credit Builder', 'Credit Warrior', 'Credit Champion', 'Credit Master'];
    const rankIdx = ranks.indexOf(rank);
    const progress = Math.max(20, ((rankIdx + 1) / ranks.length) * 100);

    const gwRank = document.querySelector('.gw-rank');
    if (gwRank) {
      gwRank.querySelector('.gw-rank-emoji').textContent = rankEmojis[rank] || '🌱';
      gwRank.querySelector('.gw-rank-name').textContent = rank;
      gwRank.querySelector('.gw-rank-next').textContent = rankIdx < ranks.length - 1 ? 'Next: ' + ranks[rankIdx + 1] : 'Max rank achieved!';
    }
    const gwFill = document.querySelector('.gw-progress-fill');
    if (gwFill) gwFill.style.width = progress + '%';
    const gwLabel = document.querySelector('.gw-progress-label');
    if (gwLabel) gwLabel.textContent = (rankIdx + 1) + '/' + ranks.length + ' milestones completed';
  }

  // ==================== DISPUTE LETTERS (DYNAMIC) ====================
  APP_STATE.disputeLetters = {};
  APP_STATE.pendingLetterId = null;
  APP_STATE.activeLetterMeta = null;

  // Load saved user info
  try {
    const saved = localStorage.getItem('parseur10x_user_info');
    if (saved) APP_STATE.userInfo = JSON.parse(saved);
  } catch(e) {}

  function showDisputeLetter(itemId) {
    const analysis = APP_STATE.analysis;
    if (!analysis) return;

    const letter = (analysis.disputeLetters || []).find(l => l.itemId === itemId);
    if (!letter) {
      showToast('No dispute letter available for this item.', 'info');
      return;
    }

    if (!APP_STATE.isPro) {
      const freeLetterUsed = localStorage.getItem('parseur10x_free_letter_used') === 'true';
      if (freeLetterUsed) {
        showUpgradeModal();
        showToast("You've used your free letter. Upgrade for unlimited dispute letters.", 'info');
        return;
      }
      localStorage.setItem('parseur10x_free_letter_used', 'true');
      showToast('First dispute letter is on us! Upgrade for unlimited letters.', 'success');
    }

    // Check if we have user info, if not ask for it first
    if (!APP_STATE.userInfo) {
      APP_STATE.pendingLetterId = itemId;
      document.getElementById('userInfoModal').classList.add('open');
      document.body.style.overflow = 'hidden';
      setTimeout(() => document.getElementById('userFullName').focus(), 300);
      return;
    }

    // We have user info — render the letter with placeholders filled
    renderLetter(letter);
  }

  function saveUserInfo() {
    const name = document.getElementById('userFullName').value.trim();
    const address = document.getElementById('userAddress').value.trim();
    const cityStateZip = document.getElementById('userCityStateZip').value.trim();

    if (!name || !address || !cityStateZip) {
      showToast('Please fill in all fields.', 'warning');
      return;
    }

    APP_STATE.userInfo = { name, address, cityStateZip };
    try { localStorage.setItem('parseur10x_user_info', JSON.stringify(APP_STATE.userInfo)); } catch(e) {}

    // Close info modal
    document.getElementById('userInfoModal').classList.remove('open');

    // If we have a pending letter, show it now
    if (APP_STATE.pendingLetterId) {
      const analysis = APP_STATE.analysis;
      const letter = (analysis.disputeLetters || []).find(l => l.itemId === APP_STATE.pendingLetterId);
      APP_STATE.pendingLetterId = null;
      if (letter) renderLetter(letter);
      else document.body.style.overflow = '';
    } else {
      document.body.style.overflow = '';
    }
  }

  function renderLetter(letter) {
    trackEvent('dispute_letter_generated', { letter_type: letter.letterType, recipient: letter.recipientName });
    const info = APP_STATE.userInfo;
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Replace all placeholder variants
    let body = letter.letterBody;
    if (info) {
      body = body
        .replace(/\[YOUR NAME\]/gi, info.name)
        .replace(/\[YOUR FULL NAME\]/gi, info.name)
        .replace(/\[YOUR ADDRESS\]/gi, info.address + '\n' + info.cityStateZip)
        .replace(/\[YOUR STREET ADDRESS\]/gi, info.address)
        .replace(/\[CITY, STATE ZIP\]/gi, info.cityStateZip)
        .replace(/\[DATE\]/gi, today)
        .replace(/\[TODAY'S DATE\]/gi, today)
        .replace(/\[YOUR SIGNATURE\]/gi, info.name)
        .replace(/\[YOUR PRINTED NAME\]/gi, info.name)
        .replace(/\[YOUR PHONE NUMBER\]/gi, '[Phone optional — written correspondence preferred]')
        .replace(/\[PHONE NUMBER\]/gi, '[Phone optional — written correspondence preferred]');
    }

    // Remove "Send via Certified Mail" lines from letter body (we show it in UI instead)
    body = body
      .replace(/\n*Send via Certified Mail[,.]? ?Return Receipt Requested\.?\n*/gi, '\n')
      .replace(/\n*Sent via Certified Mail[,.]? ?Return Receipt Requested\.?\n*/gi, '\n')
      .replace(/\n*Tracking #:?\s*_{0,20}\n*/gi, '\n');

    APP_STATE.activeLetterMeta = {
      letterType: letter.letterType || 'dispute_letter',
      recipientName: letter.recipientName || 'credit_bureau',
      generatedAt: today
    };

    document.getElementById('modalTitle').textContent = letter.letterType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' - ' + letter.recipientName;
    document.getElementById('letterContent').textContent = body;
    document.getElementById('letterModal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    document.getElementById('letterModal').classList.remove('open');
    document.body.style.overflow = '';
  }

  function copyLetter() {
    const text = document.getElementById('letterContent').textContent;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.querySelector('.modal-actions .btn-sm.primary');
      btn.textContent = '✅ Copied!';
      setTimeout(() => btn.textContent = '📋 Copy to Clipboard', 2000);
    });
  }

  function downloadLetter() {
    if (!APP_STATE.isPro) {
      showUpgradeModal();
      showToast('Dispute letter downloads are a Pro feature. Upgrade to unlock.', 'info');
      return;
    }

    const text = document.getElementById('letterContent').textContent || '';
    if (!text.trim()) {
      showToast('No letter content found to download.', 'warning');
      return;
    }

    const meta = APP_STATE.activeLetterMeta || {};
    const safeRecipient = String(meta.recipientName || 'credit-bureau')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'credit-bureau';
    const safeType = String(meta.letterType || 'dispute-letter')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'dispute-letter';
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `parseur10x-${safeType}-${safeRecipient}-${dateStamp}.txt`;

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    trackEvent('dispute_letter_downloaded', { letter_type: meta.letterType || 'unknown', recipient: meta.recipientName || 'unknown' });
    showToast('Letter downloaded.', 'success');
  }

  function printLetter() {
    window.print();
  }

  // ==================== CONFETTI ====================
  function triggerConfetti() {
    const container = document.getElementById('confettiContainer');
    const colors = ['#2563EB', '#059669', '#F59E0B', '#DC2626', '#8B5CF6', '#EC4899'];

    for (let i = 0; i < 60; i++) {
      const piece = document.createElement('div');
      piece.classList.add('confetti-piece');
      piece.style.left = Math.random() * 100 + '%';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = Math.random() * 1.5 + 's';
      piece.style.animationDuration = (2 + Math.random() * 2) + 's';
      piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      piece.style.width = (6 + Math.random() * 8) + 'px';
      piece.style.height = (6 + Math.random() * 8) + 'px';
      container.appendChild(piece);
    }

    setTimeout(() => container.innerHTML = '', 5000);
  }

  // ==================== RESET ====================
  function resetProcessingSteps() {
    document.querySelectorAll('.processing-step').forEach(s => {
      s.classList.remove('active', 'done');
      s.querySelector('.step-indicator').textContent = s.id.replace('step', '');
    });
  }

  function resetApp() {
    document.getElementById('resultsState').style.display = 'none';
    document.getElementById('uploadState').style.display = 'block';
    document.getElementById('fileInput').value = '';
    APP_STATE.analysis = null;
    try { sessionStorage.removeItem('parseur10x_analysis'); } catch(e) {}
    resetProcessingSteps();
    // Remove any unlock banners
    document.querySelectorAll('.unlock-banner').forEach(b => b.remove());
  }

  // Close modal on escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
  document.getElementById('letterModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('letterModal')) closeModal();
  });
