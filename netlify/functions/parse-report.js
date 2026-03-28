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

    // Truncate to ~20k chars for speed
    const truncated = reportText.substring(0, 20000);

    const prompt = `Analyze this credit report. Return ONLY valid JSON, no markdown or backticks.

JSON structure:
{"summary":{"totalAccounts":0,"openAccounts":0,"closedAccounts":0,"totalBalance":"$0","hardInquiries":0,"creditScore":null,"creditScoreLabel":""},"negativeItems":[{"id":"neg1","creditor":"","type":"Late Payment|Collection|Charge-Off|High Utilization|Inquiry|Other","details":"","impact":"high|medium|low","impactScore":0,"fixStrategy":"dispute|goodwill|pay-for-delete|pay-down|wait","fixExplanation":"","strategyExplainer":{"whatItIs":"1-2 sentence definition of this strategy","howToUse":"2-3 sentences on the most powerful way to execute this strategy","proTip":"1 sentence expert tip that most people miss"}}],"recommendations":[{"priority":1,"title":"","description":"","estimatedGain":"+0 pts","affiliateHook":"kikoff|ava|identityiq|none","strategyExplainer":{"whatItIs":"","howToUse":"","proTip":""}}],"disputeLetters":[{"itemId":"neg1","letterType":"debt_validation|goodwill|pay_for_delete|dispute_inaccuracy","recipientName":"","recipientAddress":"","letterBody":"Full dispute letter with [YOUR NAME],[YOUR ADDRESS],[DATE] placeholders citing FCRA/FDCPA laws"}],"creditHealthScore":0,"rank":"Credit Rookie|Credit Builder|Credit Warrior|Credit Champion|Credit Master"}

Rules:
- Flag late payments, collections, charge-offs, high utilization >30%, excess inquiries. Sort by impact.
- Generate dispute letters for disputable items only.
- Affiliate hooks: kikoff=tradeline building, ava=credit builder card, identityiq=monitoring.
- Score 0-300=Rookie,301-500=Builder,501-700=Warrior,701-850=Champion,851-1000=Master.

CRITICAL STRATEGY RULES:
- NEVER suggest calling or phoning creditors or bureaus. ALL communication must be in writing via certified mail with return receipt requested. The user needs a paper trail.
- Every dispute letter MUST include "Send via Certified Mail, Return Receipt Requested" and "Do not contact me by phone. All correspondence must be in writing."
- strategyExplainer.whatItIs: Define the strategy clearly (e.g. "Debt validation forces a collector to prove they own your debt and have the right to collect it under FDCPA §1692g")
- strategyExplainer.howToUse: The most powerful way to execute (e.g. "Send within 30 days of first contact. Use certified mail. If they can't validate within 30 days, they must remove the account and cease collection.")
- strategyExplainer.proTip: Expert-level tip (e.g. "Request the original signed contract, not just a printout. Most debt buyers don't have it, which forces deletion.")
- For goodwill letters: Explain this is asking for mercy, not demanding rights. Include tips on tone, timing, and what to emphasize.
- For pay-for-delete: Explain getting the agreement IN WRITING before paying. Never pay without written deletion agreement.
- For all strategies: Emphasize certified mail, paper trail, documentation of everything.

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
        max_tokens: 5000,
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
