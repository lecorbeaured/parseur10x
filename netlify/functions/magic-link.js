// netlify/functions/magic-link.js
// Checks if email has an active Stripe subscription
// Generates a magic link token and logs it (wire to Resend later)
//
// Environment variables:
//   STRIPE_SECRET_KEY = sk_live_...
//   SITE_URL = https://parseur10x.live
//   MAGIC_LINK_SECRET = any-random-string-for-signing (add this to Netlify env vars)

const crypto = require('crypto');

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

  if (!process.env.STRIPE_SECRET_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Service not configured' }) };
  }

  try {
    const { email } = JSON.parse(event.body || '{}');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid email required' }) };
    }

    // Check Stripe for active subscription with this email
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    const customers = await stripe.customers.list({
      email: email.toLowerCase(),
      limit: 1,
    });

    if (!customers.data.length) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'No Pro subscription found for this email. Please check the email you used to subscribe, or upgrade to Pro.' }),
      };
    }

    const customer = customers.data[0];

    // Check for active subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 1,
    });

    if (!subscriptions.data.length) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Your subscription is no longer active. Please resubscribe to access Pro features.' }),
      };
    }

    // Generate magic link token
    const secret = process.env.MAGIC_LINK_SECRET || 'parseur10x-default-secret';
    const expiry = Date.now() + (60 * 60 * 1000); // 1 hour
    const payload = email.toLowerCase() + ':' + expiry;
    const token = crypto.createHmac('sha256', secret).update(payload).digest('hex') + ':' + expiry;

    const siteUrl = process.env.SITE_URL || 'https://parseur10x.live';
    const magicLink = `${siteUrl}/app.html?auth_token=${encodeURIComponent(token)}&auth_email=${encodeURIComponent(email.toLowerCase())}`;

    // Log the magic link (visible in Netlify function logs)
    // TODO: Send via Resend when domain is configured
    console.log('MAGIC LINK GENERATED:', JSON.stringify({
      email: email.toLowerCase(),
      link: magicLink,
      expires: new Date(expiry).toISOString(),
    }));

    // TODO: Uncomment when Resend is ready
    // const { Resend } = require('resend');
    // const resend = new Resend(process.env.RESEND_API_KEY);
    // await resend.emails.send({
    //   from: 'PARSEUR 10X <login@parseur10x.live>',
    //   to: email,
    //   subject: 'Your PARSEUR 10X Login Link',
    //   html: `<h2>Click to log in</h2><p><a href="${magicLink}">Log in to PARSEUR 10X Pro</a></p><p>This link expires in 1 hour.</p>`,
    // });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Login link sent to ' + email }),
    };

  } catch (err) {
    console.error('Magic link error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Something went wrong. Please try again.' }),
    };
  }
};
