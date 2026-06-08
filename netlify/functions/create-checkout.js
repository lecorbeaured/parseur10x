// netlify/functions/create-checkout.js
// Creates a Stripe Checkout session for the PARSEUR 10X Pro plan.
//
// Required Netlify environment variables:
//   STRIPE_SECRET_KEY = sk_test_... or sk_live_...
//   STRIPE_PRICE_ID = price_...
//   SITE_URL = https://your-domain.com

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

function cleanSiteUrl(rawUrl) {
  return (rawUrl || 'http://localhost:8888').replace(/\/$/, '');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }


  const limit = rateLimit(event, { name: 'create_checkout', max: 10, windowMs: 60 * 1000 });
  if (limit.limited) {
    return rateLimitResponse(headers, limit);
  }
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const proPriceId = process.env.STRIPE_PRICE_ID;

  if (!stripeSecretKey || !proPriceId) {
    console.error('Stripe checkout is missing STRIPE_SECRET_KEY or STRIPE_PRICE_ID');
    return json(500, { error: 'Payment system is not configured yet.' });
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return json(400, { error: 'Invalid JSON body' });
  }

  // The frontend does not need to send a price ID. If it does, only allow the configured Pro price.
  if (payload.priceId && payload.priceId !== proPriceId) {
    return json(400, { error: 'Invalid price' });
  }

  try {
    const stripe = require('stripe')(stripeSecretKey);
    const siteUrl = cleanSiteUrl(process.env.SITE_URL);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: proPriceId, quantity: 1 }],
      success_url: `${siteUrl}/app.html?plan=pro&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/app.html?canceled=true`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      metadata: {
        product: 'parseur10x_pro',
        source: payload.source || 'unknown',
      },
      subscription_data: {
        metadata: {
          product: 'parseur10x_pro',
        },
      },
    });

    return json(200, { sessionId: session.id, url: session.url || null });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    return json(500, { error: 'Unable to start checkout. Please try again.' });
  }
};
