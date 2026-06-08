// netlify/functions/capture-email.js
// Captures email leads from the app and prepares them for Resend.
// Safe default: if Resend env vars are missing, the function validates the request,
// logs a sanitized lead event, and returns success without sending anything.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const { rateLimit, rateLimitResponse } = require('./rate-limit');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(payload),
  };
}

function safeString(value, fallback = '') {
  return String(value || fallback).trim();
}

async function resendRequest(path, payload) {
  const response = await fetch(`https://api.resend.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let data = null;

  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch (_) {
    data = { raw: responseText };
  }

  if (!response.ok) {
    const message = data?.message || data?.error || responseText || 'Resend request failed';
    throw new Error(message);
  }

  return data;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { success: false, error: 'Method not allowed' });
  }


  const limit = rateLimit(event, { name: 'capture_email', max: 10, windowMs: 60 * 1000 });
  if (limit.limited) {
    return rateLimitResponse(headers, limit);
  }
  try {
    const body = JSON.parse(event.body || '{}');

    const email = safeString(body.email).toLowerCase();
    const source = safeString(body.source, 'unknown').slice(0, 120);
    const fileName = safeString(body.fileName, 'not provided').slice(0, 180);
    const firstName = safeString(body.firstName || body.name).slice(0, 80);
    const leadMagnet = safeString(body.leadMagnet).slice(0, 120);

    if (!email) {
      return json(400, { success: false, error: 'Email required' });
    }

    if (!EMAIL_RE.test(email)) {
      return json(400, { success: false, error: 'Valid email required' });
    }

    const hasResendConfig = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_AUDIENCE_ID);
    const timestamp = new Date().toISOString();

    console.log('EMAIL CAPTURED:', JSON.stringify({
      email,
      source,
      fileName,
      leadMagnet,
      hasResendConfig,
      timestamp,
    }));

    if (!hasResendConfig) {
      return json(200, {
        success: true,
        provider: 'placeholder',
        message: 'Email captured locally. Add RESEND_API_KEY and RESEND_AUDIENCE_ID in Netlify to enable Resend.',
      });
    }

    await resendRequest(`/audiences/${process.env.RESEND_AUDIENCE_ID}/contacts`, {
      email,
      first_name: firstName || undefined,
      unsubscribed: false,
      audience_id: process.env.RESEND_AUDIENCE_ID,
    });

    if (process.env.RESEND_SEND_WELCOME_EMAIL === 'true') {
      const isChecklistLead = leadMagnet === 'credit-cleanup-checklist';
      await resendRequest('/emails', {
        from: process.env.RESEND_FROM_EMAIL || 'PARSEUR 10X <onboarding@resend.dev>',
        to: [email],
        subject: isChecklistLead
          ? 'Your free credit cleanup checklist is ready'
          : 'Your PARSEUR 10X credit report tools are ready',
        html: isChecklistLead ? `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
            <h1>Your Credit Cleanup Checklist</h1>
            <p>Here is your simple credit report cleanup checklist.</p>
            <ol>
              <li>Review your name, address, employers, and account ownership.</li>
              <li>Mark late payments, collections, charge-offs, and inquiries that look inaccurate.</li>
              <li>Gather proof before you dispute anything.</li>
              <li>Send focused letters and track responses for 30 days.</li>
            </ol>
            <p>When you are ready, use PARSEUR 10X to scan your credit report and organize the next steps.</p>
            <p style="font-size: 13px; color: #6b7280;">Educational information only. This is not legal, financial, or credit repair advice.</p>
          </div>
        ` : `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
            <h1>Welcome to PARSEUR 10X</h1>
            <p>Your credit report review tools are ready.</p>
            <p>Next step: upload your report, review possible errors, and use the guided dispute workflow.</p>
            <p style="font-size: 13px; color: #6b7280;">You received this because you requested access to PARSEUR 10X.</p>
          </div>
        `,
      });
    }

    return json(200, {
      success: true,
      provider: 'resend',
      message: 'Email captured successfully',
    });
  } catch (err) {
    console.error('Email capture error:', err.message);
    return json(500, {
      success: false,
      error: 'Unable to capture email right now',
    });
  }
};
