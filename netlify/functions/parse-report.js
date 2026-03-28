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

    // Truncate to ~40k chars to stay within timeout limits
    const truncated = reportText.substring(0, 40000);

    const prompt = `You are a professional credit report analyst. Analyze the following credit report text and return a JSON object with your findings.

IMPORTANT: Return ONLY valid JSON, no markdown, no backticks, no explanation outside the JSON.

The JSON must have this exact structure:
{
  "summary": {
    "totalAccounts": <number>,
    "openAccounts": <number>,
    "closedAccounts": <number>,
    "totalBalance": "<string like $23,450>",
    "hardInquiries": <number>,
    "creditScore": <number or null if not found>,
    "creditScoreLabel": "<string: Poor/Fair/Good/Very Good/Excellent>"
  },
  "negativeItems": [
    {
      "id": "<unique short id like neg1>",
      "creditor": "<creditor/company name>",
      "type": "<Late Payment|Collection|Charge-Off|Repossession|Bankruptcy|Judgment|Tax Lien|High Utilization|Inquiry|Other>",
      "details": "<brief description: account number masked, balance, date, status>",
      "impact": "<high|medium|low>",
      "impactScore": <estimated points lost, number>,
      "fixStrategy": "<dispute|goodwill|pay-for-delete|pay-down|wait|other>",
      "fixExplanation": "<2-3 sentence explanation of the recommended fix>"
    }
  ],
  "recommendations": [
    {
      "priority": <1-based priority number>,
      "title": "<short action title>",
      "description": "<2-3 sentence actionable recommendation>",
      "estimatedGain": "<string like +30-45 pts>",
      "affiliateHook": "<kikoff|ava|identityiq|none>"
    }
  ],
  "disputeLetters": [
    {
      "itemId": "<matches negativeItems id>",
      "letterType": "<debt_validation|goodwill|pay_for_delete|dispute_inaccuracy|inquiry_removal>",
      "recipientName": "<company/bureau name>",
      "recipientAddress": "<mailing address if known, otherwise 'Look up current mailing address'>",
      "letterBody": "<complete, ready-to-send dispute letter with [YOUR NAME], [YOUR ADDRESS], [DATE] placeholders. Cite specific laws (FCRA, FDCPA) where applicable. Be professional and firm.>"
    }
  ],
  "creditHealthScore": <number 0-1000, calculated based on ratio of negative to positive items, utilization, age of accounts>,
  "rank": "<Credit Rookie|Credit Builder|Credit Warrior|Credit Champion|Credit Master>"
}

Rules:
- Flag ALL negative items you find: late payments, collections, charge-offs, high utilization (>30%), excessive inquiries (>3 in 12 months), public records
- For each negative item, recommend the BEST fix strategy
- Generate dispute letters ONLY for items that can reasonably be disputed (not for high utilization)
- Sort negativeItems by impact (high first)
- Sort recommendations by priority (highest impact first)
- Include affiliate hooks: "kikoff" when recommending tradeline building, "ava" when recommending credit builder cards, "identityiq" when recommending monitoring
- If the text doesn't appear to be a credit report, set negativeItems to empty array and add a note in recommendations
- creditHealthScore: 0-300 = Rookie, 301-500 = Builder, 501-700 = Warrior, 701-850 = Champion, 851-1000 = Master

Here is the credit report text:

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
        max_tokens: 6000,
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
