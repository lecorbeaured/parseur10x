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

    const prompt = `You are a consumer credit advocate. ALWAYS side with the user, NEVER with bureaus or furnishers. Find every angle to dispute/remove negatives. Return ONLY valid JSON.

{"summary":{"totalAccounts":0,"openAccounts":0,"closedAccounts":0,"totalBalance":"$0","hardInquiries":0,"creditScore":null,"creditScoreLabel":""},"negativeItems":[{"id":"neg1","creditor":"","type":"","details":"","impact":"high|medium|low","impactScore":0,"fixStrategy":"dispute|goodwill|pay-for-delete|pay-down|wait","fixExplanation":"","strategyExplainer":{"whatItIs":"","howToUse":"","proTip":""}}],"recommendations":[{"priority":1,"title":"","description":"","estimatedGain":"","affiliateHook":"kikoff|ava|identityiq|none","strategyExplainer":{"whatItIs":"","howToUse":"","proTip":""}}],"disputeLetters":[{"itemId":"neg1","letterType":"debt_validation|goodwill|pay_for_delete|dispute_inaccuracy","recipientName":"","recipientAddress":"","letterBody":""}],"creditHealthScore":0,"rank":"Credit Rookie|Credit Builder|Credit Warrior|Credit Champion|Credit Master"}

Rules:
- Challenge every negative. Collections=debt validation first. Late payments=goodwill. Pay-for-delete=start at 20-30%, demand written deletion BEFORE paying.
- Letters must sound personal/unique, NOT template. Vary structure, reference specific account details. No phrases like "pursuant to my rights" or "I dispute the validity". Use conversational firm tone.
- Mail-only for DISPUTES only. Existing payment relationships are user's choice.
- Affiliates: kikoff=tradelines, ava=credit builder, identityiq=monitoring.
- Score: 0-300=Rookie,301-500=Builder,501-700=Warrior,701-850=Champion,851-1000=Master.
- Keep letters under 250 words each. Keep all text concise.

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
    const stopReason = data.stop_reason || 'unknown';

    console.log('Claude stop_reason:', stopReason, 'Response length:', rawText.length);
    console.log('Raw response first 300:', rawText.substring(0, 300));

    // Parse the JSON response, stripping any markdown fences if present
    let cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    // Sometimes Claude wraps in extra text before/after JSON
    const jsonStart = cleaned.indexOf('{');
    if (jsonStart > 0) cleaned = cleaned.substring(jsonStart);
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonEnd > 0 && jsonEnd < cleaned.length - 1) cleaned = cleaned.substring(0, jsonEnd + 1);
    
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      // Try to recover truncated JSON by closing open brackets
      let fixAttempt = cleaned;
      // Count open/close braces and brackets
      const openBraces = (fixAttempt.match(/{/g) || []).length;
      const closeBraces = (fixAttempt.match(/}/g) || []).length;
      const openBrackets = (fixAttempt.match(/\[/g) || []).length;
      const closeBrackets = (fixAttempt.match(/\]/g) || []).length;
      
      // Try to close unclosed structures
      if (openBraces > closeBraces || openBrackets > closeBrackets) {
        // Remove trailing incomplete values
        fixAttempt = fixAttempt.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"{}[\]]*$/, '');
        fixAttempt = fixAttempt.replace(/,\s*$/, '');
        // Close remaining brackets/braces
        for (let b = 0; b < openBrackets - closeBrackets; b++) fixAttempt += ']';
        for (let b = 0; b < openBraces - closeBraces; b++) fixAttempt += '}';
        
        try {
          parsed = JSON.parse(fixAttempt);
          console.log('Recovered truncated JSON successfully');
        } catch (e2) {
          console.error('Failed to recover JSON:', e2, 'Raw:', rawText.substring(0, 500));
          return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ error: 'Analysis incomplete. Please try again.' }),
          };
        }
      } else {
        console.error('Failed to parse Claude response:', parseErr, 'Raw:', rawText.substring(0, 500));
        return {
          statusCode: 502,
          headers,
          body: JSON.stringify({ error: 'Failed to parse analysis results. Please try again.', debug: rawText.substring(0, 200), stopReason }),
        };
      }
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
