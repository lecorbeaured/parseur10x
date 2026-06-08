// netlify/functions/contact.js
// Handles contact form submissions from the homepage.
// Safe default: logs a sanitized message in Netlify function logs.
// Optional: send the message through Resend when RESEND_API_KEY and CONTACT_TO_EMAIL are configured.

exports.handler = async (event) => {
  const { rateLimit, rateLimitResponse } = require('./rate-limit');

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }


  const limit = rateLimit(event, { name: 'contact', max: 5, windowMs: 60 * 1000 });
  if (limit.limited) {
    return rateLimitResponse(headers, limit);
  }
  try {
    const { name, email, subject, message } = JSON.parse(event.body || '{}');

    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanSubject = String(subject || '').trim();
    const cleanMessage = String(message || '').trim();

    if (!cleanName || !cleanEmail || !cleanSubject || !cleanMessage) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'All fields are required' }),
      };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Valid email required' }),
      };
    }

    if (cleanMessage.length > 5000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Message is too long' }),
      };
    }

    const contactPayload = {
      name: cleanName,
      email: cleanEmail,
      subject: cleanSubject,
      messageLength: cleanMessage.length,
      timestamp: new Date().toISOString(),
    };

    console.log('CONTACT FORM SUBMISSION:', JSON.stringify(contactPayload));

    if (process.env.RESEND_API_KEY && process.env.CONTACT_TO_EMAIL) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.CONTACT_FROM_EMAIL || 'PARSEUR 10X <onboarding@resend.dev>',
          to: [process.env.CONTACT_TO_EMAIL],
          reply_to: cleanEmail,
          subject: `PARSEUR 10X Contact: ${cleanSubject}`,
          text: `Name: ${cleanName}\nEmail: ${cleanEmail}\nSubject: ${cleanSubject}\n\nMessage:\n${cleanMessage}`,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Resend contact email failed:', errorText);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('Contact form error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Unable to send message right now' }),
    };
  }
};
