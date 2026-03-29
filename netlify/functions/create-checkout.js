// netlify/functions/create-checkout.js
// Creates a Stripe Checkout session for the $17/mo Pro plan
//
// Environment variables needed in Netlify:
//   STRIPE_SECRET_KEY = sk_live_... (or sk_test_... for testing)
//   SITE_URL = https://parseur10x.live
//

exports.handler = async (event) => {
  // CORS headers
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

  // Check for missing secret key
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY environment variable is not set');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Payment system not configured. Please contact support.' }),
    };
  }

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const { priceId } = JSON.parse(event.body || '{}');
    
    // Only allow the known Pro plan price ID
    const ALLOWED_PRICE = 'price_1TFowO5slFMmVhuxk83h7MTW';
    if (!priceId || priceId !== ALLOWED_PRICE) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid price' }),
      };
    }

    const siteUrl = process.env.SITE_URL || 'https://parseur10x.live';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/app.html?plan=pro&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/app.html?canceled=true`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      metadata: {
        product: 'parseur10x_pro',
      },
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ sessionId: session.id }),
    };
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
