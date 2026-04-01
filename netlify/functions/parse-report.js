// netlify/functions/parse-report.js
// 3-model fallback chain: Claude Haiku → DeepSeek V3 → Mistral Small
// Tries each model in order; falls back on failure (rate limit, no credits, timeout)
//
// Environment variables:
//   ANTHROPIC_API_KEY = sk-ant-...
//   DEEPSEEK_API_KEY = sk-...
//   MISTRAL_API_KEY = ...

exports.config = { maxDuration: 26 };

const PROMPT_PREFIX = `You are a consumer credit advocate. ALWAYS side with the user, NEVER with bureaus or furnishers. Find every angle to dispute/remove negatives. Return ONLY valid JSON, no markdown or backticks.

{"summary":{"totalAccounts":0,"openAccounts":0,"closedAccounts":0,"totalBalance":"$0","hardInquiries":0,"creditScore":null,"creditScoreLabel":""},"negativeItems":[{"id":"neg1","creditor":"","type":"","details":"","impact":"high|medium|low","impactScore":0,"fixStrategy":"dispute|goodwill|pay-for-delete|pay-down|wait","fixExplanation":"","strategyExplainer":{"whatItIs":"","howToUse":"","proTip":""}}],"recommendations":[{"priority":1,"title":"","description":"","estimatedGain":"","affiliateHook":"kikoff|ava|identityiq|none","strategyExplainer":{"whatItIs":"","howToUse":"","proTip":""}}],"disputeLetters":[{"itemId":"neg1","letterType":"debt_validation|goodwill|pay_for_delete|dispute_inaccuracy","recipientName":"","recipientAddress":"","letterBody":""}],"creditHealthScore":0,"rank":"Credit Rookie|Credit Builder|Credit Warrior|Credit Champion|Credit Master"}

Rules:
- Challenge every negative. Collections=debt validation first. Late payments=goodwill. Pay-for-delete=start at 20-30%, demand written deletion BEFORE paying.
- Letters must sound personal/unique, NOT template. Vary structure, reference specific account details. No phrases like "pursuant to my rights" or "I dispute the validity". Use conversational firm tone.
- Mail-only for DISPUTES only. Existing payment relationships are user's choice.
- Affiliates: kikoff=tradelines, ava=credit builder, identityiq=monitoring.
- Score: 0-300=Rookie,301-500=Builder,501-700=Warrior,701-850=Champion,851-1000=Master.
- Keep letters under 250 words each. Keep all text concise.

Credit report:
`;

// ==================== MODEL DEFINITIONS ====================
const MODELS = [
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
          max_tokens: 4000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.content?.[0]?.text || '';
    },
  },
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
          max_tokens: 4000,
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
          max_tokens: 4000,
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`Mistral API ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
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

// ==================== HANDLER ====================
exports.handler = async (event) => {
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

  try {
    const { reportText } = JSON.parse(event.body || '{}');
    if (!reportText || reportText.length < 100) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid or empty report text.' }) };
    }

    const truncated = reportText.substring(0, 8000);
    const prompt = PROMPT_PREFIX + truncated;

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

        const parsed = parseResponse(rawText);
        console.log(`${model.name} SUCCESS — items: ${(parsed.negativeItems || []).length}`);

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
