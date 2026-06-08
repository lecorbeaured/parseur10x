// netlify/functions/verify-session.js
// Verifies a Stripe Checkout session after a user returns from payment.
//
// Required Netlify environment variable:
//   STRIPE_SECRET_KEY = sk_test_... or sk_live_...

const { rateLimit, rateLimitResponse } = require('./rate-limit');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(statusCode, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }


  const limit = rateLimit(event, { name: 'verify_session', max: 20, windowMs: 60 * 1000 });
  if (limit.limited) {
    return rateLimitResponse(headers, limit);
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('Session verification is missing STRIPE_SECRET_KEY');
    return json(500, { error: 'Payment system is not configured yet.' });
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return json(400, { error: 'Invalid JSON body' });
  }

  const sessionId = payload.sessionId;
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
    return json(400, { error: 'Missing or invalid sessionId' });
  }

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    });

    const subscription = session.subscription || null;
    const subscriptionStatus = typeof subscription === 'object' ? subscription.status : null;
    const paid = session.payment_status === 'paid' && session.status === 'complete';
    const activeSubscription = ['active', 'trialing'].includes(subscriptionStatus);

    return json(200, {
      paid,
      activeSubscription,
      status: session.status,
      paymentStatus: session.payment_status,
      customerEmail: session.customer_details?.email || session.customer_email || session.customer?.email || null,
      customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
      subscriptionId: typeof subscription === 'string' ? subscription : subscription?.id || null,
      subscriptionStatus,
    });
  } catch (err) {
    console.error('Session verification error:', err.message);
    return json(500, { error: 'Unable to verify checkout session.' });
  }
};
