const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
const calls = [];

Module._load = function(request, parent, isMain) {
  if (request === 'stripe') {
    return function stripeFactory(secret) {
      calls.push({ type: 'stripe-init', secret });
      return {
        checkout: {
          sessions: {
            create: async (payload) => {
              calls.push({ type: 'checkout-create', payload });
              return { id: 'cs_test_123', url: 'https://checkout.stripe.com/test' };
            },
            retrieve: async (sessionId, options) => {
              calls.push({ type: 'session-retrieve', sessionId, options });
              return {
                id: sessionId,
                status: 'complete',
                payment_status: 'paid',
                customer_details: { email: 'buyer@example.com' },
                customer: { id: 'cus_123', email: 'buyer@example.com' },
                subscription: { id: 'sub_123', status: 'active' },
              };
            },
          },
        },
        customers: {
          retrieve: async (customerId) => ({ id: customerId, email: 'buyer@example.com' }),
        },
        webhooks: {
          constructEvent: (body, signature, secret) => {
            calls.push({ type: 'webhook-construct', body: body.toString ? body.toString() : body, signature, secret });
            return {
              type: 'checkout.session.completed',
              data: {
                object: {
                  customer_details: { email: 'buyer@example.com' },
                  customer: 'cus_123',
                  subscription: 'sub_123',
                  payment_status: 'paid',
                },
              },
            };
          },
        },
      };
    };
  }
  return originalLoad.apply(this, arguments);
};

async function run() {
  process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
  process.env.STRIPE_PRICE_ID = 'price_placeholder';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_placeholder';
  process.env.SITE_URL = 'http://localhost:8888/';

  const checkout = require('../netlify/functions/create-checkout.js');
  let res = await checkout.handler({ httpMethod: 'OPTIONS' });
  assert.strictEqual(res.statusCode, 200);

  res = await checkout.handler({ httpMethod: 'GET', body: '' });
  assert.strictEqual(res.statusCode, 405);

  res = await checkout.handler({ httpMethod: 'POST', body: JSON.stringify({ priceId: 'wrong' }) });
  assert.strictEqual(res.statusCode, 400);

  res = await checkout.handler({ httpMethod: 'POST', body: JSON.stringify({ source: 'test' }) });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(JSON.parse(res.body).sessionId, 'cs_test_123');
  const checkoutCall = calls.find(c => c.type === 'checkout-create');
  assert.strictEqual(checkoutCall.payload.line_items[0].price, 'price_placeholder');
  assert.strictEqual(checkoutCall.payload.success_url, 'http://localhost:8888/app.html?plan=pro&session_id={CHECKOUT_SESSION_ID}');

  const verify = require('../netlify/functions/verify-session.js');
  res = await verify.handler({ httpMethod: 'POST', body: JSON.stringify({}) });
  assert.strictEqual(res.statusCode, 400);

  res = await verify.handler({ httpMethod: 'POST', body: JSON.stringify({ sessionId: 'cs_test_123' }) });
  assert.strictEqual(res.statusCode, 200);
  const verifyBody = JSON.parse(res.body);
  assert.strictEqual(verifyBody.paid, true);
  assert.strictEqual(verifyBody.activeSubscription, true);
  assert.strictEqual(verifyBody.customerEmail, 'buyer@example.com');

  const webhook = require('../netlify/functions/stripe-webhook.js');
  res = await webhook.handler({ httpMethod: 'GET', headers: {}, body: '' });
  assert.strictEqual(res.statusCode, 405);

  res = await webhook.handler({ httpMethod: 'POST', headers: {}, body: '{}' });
  assert.strictEqual(res.statusCode, 400);

  res = await webhook.handler({ httpMethod: 'POST', headers: { 'stripe-signature': 'sig_test' }, body: '{}' });
  assert.strictEqual(res.statusCode, 200);

  console.log('Stripe function validation passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
