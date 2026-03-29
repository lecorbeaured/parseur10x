// netlify/functions/capture-email.js
// Captures email from the email gate
// For now, logs the email. Later wire to Resend for email list.
//
// Future: Add RESEND_API_KEY env var and send welcome email + add to audience

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
    const { email, source, fileName } = JSON.parse(event.body || '{}');

    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email required' }),
      };
    }

    // Log for now — visible in Netlify function logs
    console.log('EMAIL CAPTURED:', JSON.stringify({
      email,
      source: source || 'unknown',
      fileName: fileName || 'unknown',
      timestamp: new Date().toISOString(),
    }));

    // TODO: Wire to Resend when ready
    // const resend = new Resend(process.env.RESEND_API_KEY);
    // await resend.contacts.create({
    //   email,
    //   audienceId: process.env.RESEND_AUDIENCE_ID,
    // });
    // await resend.emails.send({
    //   from: 'PARSEUR 10X <noreply@parseur10x.live>',
    //   to: email,
    //   subject: 'Your Credit Report Analysis is Ready',
    //   html: '<h1>Your results are in!</h1><p>...</p>',
    // });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    };

  } catch (err) {
    console.error('Email capture error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
