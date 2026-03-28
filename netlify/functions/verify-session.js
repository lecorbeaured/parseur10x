// netlify/functions/verify-session.js
// Verifies a Stripe Checkout session after the user returns from payment
//
// Environment variables needed:
//   STRIPE_SECRET_KEY = sk_live_...
//

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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Payment system not configured' }),
    };
  }

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const { sessionId } = JSON.parse(event.body || '{}');

    if (!sessionId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing sessionId' }),
      };
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        paid: session.payment_status === 'paid',
        status: session.status,
        customerEmail: session.customer_details?.email || null,
        subscriptionId: session.subscription || null,
      }),
    };
  } catch (err) {
    console.error('Session verification error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
