// netlify/functions/parse-report.js
// 3-model fallback chain: Claude Haiku → DeepSeek V3 → Mistral Small
// Tries each model in order; falls back on failure (rate limit, no credits, timeout)
//
// Environment variables:
//   ANTHROPIC_API_KEY = sk-ant-...
//   DEEPSEEK_API_KEY = sk-...
//   MISTRAL_API_KEY = ...

exports.config = { maxDuration: 26 };

const PROMPT_PREFIX = `You are PARSEUR 10X, a careful credit report analysis assistant for consumers.
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
- Only mark an account as a charge-off if the text explicitly says "charged off", "charge-off", or "charge off". Do not infer it from balance amounts or account status alone.
- Only mark an account as a collection if the text explicitly shows a collection agency or collection status.
- If a value is not visible, use an empty string, null, [], or "Unknown".
- Collections usually start with debt validation when ownership, balance, dates, or collector authority are unclear.
- Late payments usually start with goodwill unless there is a clear reporting inconsistency.
- Charge-offs may need factual dispute, goodwill, settlement strategy, or pay-for-delete depending on the details.
- High utilization should use pay-down strategy, not a dispute strategy.
- Hard inquiries should only be disputed if they look unfamiliar or unauthorized.
- Include personal information issues when names, addresses, employers, or phone numbers appear outdated or inconsistent.
- Letters must sound personal, firm, and natural. Avoid robotic template language.
- Keep letters under 250 words each.
- Do not use phrases like "pursuant to my rights" or "I dispute the validity."
- For dispute-style letters, recommend certified mail in the explanation or pro tip.
- Affiliate hook guide: kikoff=positive tradeline/credit builder, ava=credit builder/payment history, identityiq=monitoring, none=not relevant.
- Credit health score should be 0-1000. Rank mapping: 0-300 Rookie, 301-500 Builder, 501-700 Warrior, 701-850 Champion, 851-1000 Master.
- Give the user a clear first next step, not just a list of problems.

Credit report text:
`;

// ==================== MODEL DEFINITIONS ====================
const MODELS = [
  {
    name: 'DeepSeek V3',
    envKey: 'DEEPSEEK_API_KEY',
    call: async (prompt, apiKey) => {
      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          max_tokens: 3000,
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`DeepSeek API ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    },
  },
  {
    name: 'Mistral Small',
    envKey: 'MISTRAL_API_KEY',
    call: async (prompt, apiKey) => {
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          max_tokens: 3000,
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`Mistral API ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    },
  },
  {
    name: 'Claude Haiku',
    envKey: 'ANTHROPIC_API_KEY',
    call: async (prompt, apiKey) => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 3000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.content?.[0]?.text || '';
    },
  },
];

// ==================== JSON PARSER ====================
function parseResponse(rawText) {
  let cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  // Extract JSON from surrounding text
  const jsonStart = cleaned.indexOf('{');
  if (jsonStart > 0) cleaned = cleaned.substring(jsonStart);
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonEnd > 0 && jsonEnd < cleaned.length - 1) cleaned = cleaned.substring(0, jsonEnd + 1);

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Try to recover truncated JSON
    let fix = cleaned;
    fix = fix.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"{}[\]]*$/, '');
    fix = fix.replace(/,\s*$/, '');
    const ob = (fix.match(/{/g) || []).length;
    const cb = (fix.match(/}/g) || []).length;
    const oB = (fix.match(/\[/g) || []).length;
    const cB = (fix.match(/\]/g) || []).length;
    for (let i = 0; i < oB - cB; i++) fix += ']';
    for (let i = 0; i < ob - cb; i++) fix += '}';
    return JSON.parse(fix); // throws if still invalid
  }
}

// ==================== OUTPUT NORMALIZER ====================
function normalizeAnalysis(data) {
  const safe = data && typeof data === 'object' ? data : {};

  safe.summary = safe.summary && typeof safe.summary === 'object' ? safe.summary : {};
  safe.negativeItems = Array.isArray(safe.negativeItems) ? safe.negativeItems : [];
  safe.recommendations = Array.isArray(safe.recommendations) ? safe.recommendations : [];
  safe.disputeLetters = Array.isArray(safe.disputeLetters) ? safe.disputeLetters : [];
  safe.actionPlan = Array.isArray(safe.actionPlan) ? safe.actionPlan : [];
  safe.reviewWarnings = Array.isArray(safe.reviewWarnings) ? safe.reviewWarnings : [];

  const allowedImpacts = new Set(['high', 'medium', 'low']);
  const allowedStrategies = new Set(['dispute', 'debt_validation', 'goodwill', 'pay-for-delete', 'pay-down', 'wait', 'monitor']);

  safe.negativeItems = safe.negativeItems.map((item, index) => {
    const next = item && typeof item === 'object' ? item : {};
    next.id = next.id || `neg${index + 1}`;
    next.creditor = next.creditor || 'Unknown creditor';
    next.type = next.type || 'other';
    next.details = next.details || 'Review this item for possible reporting issues.';
    next.impact = allowedImpacts.has(next.impact) ? next.impact : 'medium';
    next.impactScore = Number.isFinite(Number(next.impactScore)) ? Number(next.impactScore) : 0;
    next.fixStrategy = allowedStrategies.has(next.fixStrategy) ? next.fixStrategy : 'monitor';
    next.fixExplanation = next.fixExplanation || 'Review the account details before taking action.';
    next.strategyExplainer = next.strategyExplainer && typeof next.strategyExplainer === 'object'
      ? next.strategyExplainer
      : { whatItIs: '', howToUse: '', proTip: '' };
    next.possibleIssues = Array.isArray(next.possibleIssues) ? next.possibleIssues : [];
    return next;
  });

  safe.recommendations = safe.recommendations.map((rec, index) => {
    const next = rec && typeof rec === 'object' ? rec : {};
    next.priority = Number.isFinite(Number(next.priority)) ? Number(next.priority) : index + 1;
    next.title = next.title || 'Review your credit report details';
    next.description = next.description || 'Check this item carefully before deciding the best next step.';
    next.affiliateHook = ['kikoff', 'ava', 'identityiq', 'none'].includes(next.affiliateHook) ? next.affiliateHook : 'none';
    next.strategyExplainer = next.strategyExplainer && typeof next.strategyExplainer === 'object'
      ? next.strategyExplainer
      : { whatItIs: '', howToUse: '', proTip: '' };
    return next;
  });

  const score = Number(safe.creditHealthScore);
  safe.creditHealthScore = Number.isFinite(score) ? Math.max(0, Math.min(1000, score)) : 0;
  safe.rank = safe.rank || getRankFromScore(safe.creditHealthScore);
  safe.confidence = ['high', 'medium', 'low'].includes(safe.confidence) ? safe.confidence : 'medium';

  return safe;
}

function getRankFromScore(score) {
  if (score <= 300) return 'Credit Rookie';
  if (score <= 500) return 'Credit Builder';
  if (score <= 700) return 'Credit Warrior';
  if (score <= 850) return 'Credit Champion';
  return 'Credit Master';
}

// ==================== HANDLER ====================
exports.handler = async (event) => {
  const { rateLimit, rateLimitResponse } = require('./rate-limit');

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }


  const limit = rateLimit(event, { name: 'parse_report', max: 5, windowMs: 60 * 1000 });
  if (limit.limited) {
    return rateLimitResponse(headers, limit);
  }
  try {
    const { reportText } = JSON.parse(event.body || '{}');
    if (!reportText || reportText.length < 100) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid or empty report text.' }) };
    }

    const maxReportChars = Number(process.env.MAX_REPORT_CHARS || 12000);
    const truncated = reportText.substring(0, maxReportChars);
    const truncationNote = reportText.length > maxReportChars
      ? `

[System note: The original report was ${reportText.length} characters. Only the first ${maxReportChars} characters were analyzed in this pass.]`
      : '';
    const prompt = PROMPT_PREFIX + truncated + truncationNote;

    // Try each model in order
    let lastError = '';
    for (const model of MODELS) {
      const apiKey = process.env[model.envKey];
      if (!apiKey) {
        console.log(`Skipping ${model.name}: no API key (${model.envKey})`);
        continue;
      }

      try {
        console.log(`Trying ${model.name}...`);
        const rawText = await model.call(prompt, apiKey);
        console.log(`${model.name} responded: ${rawText.length} chars`);

        const parsed = normalizeAnalysis(parseResponse(rawText));
        console.log(`${model.name} SUCCESS - items: ${(parsed.negativeItems || []).length}`);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(parsed),
        };
      } catch (err) {
        lastError = `${model.name}: ${err.message}`;
        console.error(`${model.name} FAILED:`, err.message);
        // Continue to next model
      }
    }

    // All models failed
    console.error('ALL MODELS FAILED. Last error:', lastError);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: 'Analysis service temporarily unavailable. Please try again in a moment.' }),
    };

  } catch (err) {
    console.error('Parse report error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
