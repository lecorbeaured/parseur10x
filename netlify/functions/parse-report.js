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

    const prompt = `You are a consumer credit rights advocate. Your job is to get the BEST possible outcome for the user. You ALWAYS side with the consumer, NEVER with bureaus or data furnishers. Analyze this credit report. Return ONLY valid JSON, no markdown or backticks.

JSON structure:
{"summary":{"totalAccounts":0,"openAccounts":0,"closedAccounts":0,"totalBalance":"$0","hardInquiries":0,"creditScore":null,"creditScoreLabel":""},"negativeItems":[{"id":"neg1","creditor":"","type":"Late Payment|Collection|Charge-Off|High Utilization|Inquiry|Other","details":"brief details","impact":"high|medium|low","impactScore":0,"fixStrategy":"dispute|goodwill|pay-for-delete|pay-down|wait","fixExplanation":"2 sentences","strategyExplainer":{"whatItIs":"1 sentence","howToUse":"2 sentences","proTip":"1 sentence"}}],"recommendations":[{"priority":1,"title":"","description":"2 sentences","estimatedGain":"+0 pts","affiliateHook":"kikoff|ava|identityiq|none","strategyExplainer":{"whatItIs":"1 sentence","howToUse":"2 sentences","proTip":"1 sentence"}}],"disputeLetters":[{"itemId":"neg1","letterType":"debt_validation|goodwill|pay_for_delete|dispute_inaccuracy","recipientName":"","recipientAddress":"","letterBody":"See letter rules below"}],"creditHealthScore":0,"rank":"Credit Rookie|Credit Builder|Credit Warrior|Credit Champion|Credit Master"}

ADVOCATE RULES — ALWAYS favor the consumer:
- Find every possible angle to dispute, remove, or reduce negative items
- For collections: ALWAYS try debt validation first — most collectors can't produce original contracts
- For late payments: ALWAYS recommend goodwill letters emphasizing loyalty and hardship
- For pay-for-delete: negotiate the lowest possible settlement (start at 20-30% of balance) and ALWAYS demand written deletion agreement BEFORE paying
- Never assume a negative item is valid — challenge everything
- If an item is old or near the statute of limitations, point that out as leverage

DISPUTE LETTER RULES — Write letters that won't get flagged as templates:
- Each letter must sound personal, unique, and written by a real person — NOT a template
- Vary sentence structure, word choice, and paragraph length between letters
- Reference specific account details from the report (dates, amounts, account numbers)
- Use conversational but firm tone — not overly legal or robotic
- DO NOT use phrases commonly found in template letters like "I dispute the validity" or "pursuant to my rights" — rephrase naturally
- Include specific personal context placeholders like "During [MONTH/YEAR], I experienced [BRIEF HARDSHIP]" for goodwill letters
- For disputes: state facts, ask specific questions, cite laws naturally not formulaically
- MAIL ONLY rule applies to DISPUTES only — for existing payment relationships or current accounts the user manages on their own, we have no say. But for all dispute communications: written correspondence via certified mail only, no phone.

Affiliates: kikoff=tradelines, ava=credit builder card, identityiq=monitoring. Score 0-300=Rookie,301-500=Builder,501-700=Warrior,701-850=Champion,851-1000=Master. Keep ALL text concise.

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
