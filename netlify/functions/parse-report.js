// netlify/functions/parse-report.js
// Receives extracted credit report text from client-side pdf.js
// Sends to Claude API for analysis
// Returns structured negative items, recommendations, and dispute letter data
//
// Environment variables needed:
//   ANTHROPIC_API_KEY = sk-ant-...
//

// Extend timeout to 26 seconds (Netlify paid allows up to 26s on background)
exports.config = {
  maxDuration: 26,
};

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

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Analysis service not configured' }),
    };
  }

  try {
    const { reportText } = JSON.parse(event.body || '{}');

    if (!reportText || reportText.length < 100) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid or empty report text. Please upload a valid credit report PDF.' }),
      };
    }

    // Truncate to ~8k chars for speed
    const truncated = reportText.substring(0, 8000);

    const prompt = `Analyze this credit report. Return ONLY valid JSON, no markdown or backticks.

JSON structure:
{"summary":{"totalAccounts":0,"openAccounts":0,"closedAccounts":0,"totalBalance":"$0","hardInquiries":0,"creditScore":null,"creditScoreLabel":""},"negativeItems":[{"id":"neg1","creditor":"","type":"Late Payment|Collection|Charge-Off|High Utilization|Inquiry|Other","details":"brief details","impact":"high|medium|low","impactScore":0,"fixStrategy":"dispute|goodwill|pay-for-delete|pay-down|wait","fixExplanation":"2 sentences","strategyExplainer":{"whatItIs":"1 sentence","howToUse":"2 sentences","proTip":"1 sentence"}}],"recommendations":[{"priority":1,"title":"","description":"2 sentences","estimatedGain":"+0 pts","affiliateHook":"kikoff|ava|identityiq|none","strategyExplainer":{"whatItIs":"1 sentence","howToUse":"2 sentences","proTip":"1 sentence"}}],"disputeLetters":[{"itemId":"neg1","letterType":"debt_validation|goodwill|pay_for_delete|dispute_inaccuracy","recipientName":"","recipientAddress":"","letterBody":"Concise letter with [YOUR NAME],[YOUR ADDRESS],[DATE] placeholders citing FCRA/FDCPA. End with: Send via Certified Mail Return Receipt Requested. Include: Do not contact me by phone, all correspondence must be in writing."}],"creditHealthScore":0,"rank":"Credit Rookie|Credit Builder|Credit Warrior|Credit Champion|Credit Master"}

Rules: Flag negatives, sort by impact. NEVER suggest phone calls—all communication via certified mail with paper trail. Strategy explainers must be concise. Pay-for-delete: get written agreement BEFORE paying. Affiliates: kikoff=tradelines, ava=credit builder card, identityiq=monitoring. Score 0-300=Rookie,301-500=Builder,501-700=Warrior,701-850=Champion,851-1000=Master. Keep ALL text concise to minimize response size.

Credit report:
${truncated}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Claude API error:', response.status, errBody);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'AI analysis service temporarily unavailable. Please try again.' }),
      };
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';

    // Parse the JSON response, stripping any markdown fences if present
    const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Failed to parse Claude response:', parseErr, 'Raw:', rawText.substring(0, 500));
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'Failed to parse analysis results. Please try again.' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(parsed),
    };

  } catch (err) {
    console.error('Parse report error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
