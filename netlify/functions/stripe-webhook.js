// netlify/functions/stripe-webhook.js
// Handles Stripe webhook events for the PARSEUR 10X subscription lifecycle.
//
// Required Netlify environment variables:
//   STRIPE_SECRET_KEY = sk_test_... or sk_live_...
//   STRIPE_WEBHOOK_SECRET = whsec_...
//
// Recommended Stripe events:
//   checkout.session.completed
//   customer.subscription.updated
//   customer.subscription.deleted
//   invoice.payment_succeeded
//   invoice.payment_failed

function getStripeSignature(headers = {}) {
  return headers['stripe-signature'] || headers['Stripe-Signature'] || headers['STRIPE-SIGNATURE'];
}

function getRawBody(event) {
  if (event.isBase64Encoded) {
    return Buffer.from(event.body || '', 'base64');
  }
  return event.body || '';
}

function safeEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const [name, domain] = email.split('@');
  if (!name || !domain) return 'redacted';
  return `${name.slice(0, 2)}***@${domain}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey || !webhookSecret) {
    console.error('Stripe webhook is missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return { statusCode: 500, body: 'Webhook not configured' };
  }

  const stripe = require('stripe')(stripeSecretKey);
  const signature = getStripeSignature(event.headers);

  if (!signature) {
    return { statusCode: 400, body: 'Missing Stripe signature' };
  }

  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(getRawBody(event), signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const { type, data } = stripeEvent;

  try {
    switch (type) {
      case 'checkout.session.completed': {
        const session = data.object;
        const email = session.customer_details?.email || session.customer_email;
        console.log('Stripe checkout completed:', JSON.stringify({
          email: safeEmail(email),
          subscriptionId: session.subscription || null,
          customerId: session.customer || null,
          paymentStatus: session.payment_status || null,
          timestamp: new Date().toISOString(),
        }));
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = data.object;
        const customer = await stripe.customers.retrieve(subscription.customer);
        console.log('Stripe subscription updated:', JSON.stringify({
          email: safeEmail(customer.email),
          customerId: subscription.customer,
          subscriptionId: subscription.id,
          status: subscription.status,
          cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
          currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
          timestamp: new Date().toISOString(),
        }));
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = data.object;
        const customer = await stripe.customers.retrieve(subscription.customer);
        console.log('Stripe subscription canceled:', JSON.stringify({
          email: safeEmail(customer.email),
          customerId: subscription.customer,
          subscriptionId: subscription.id,
          status: subscription.status,
          canceledAt: new Date().toISOString(),
        }));
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = data.object;
        const customer = await stripe.customers.retrieve(invoice.customer);
        console.log('Stripe invoice payment succeeded:', JSON.stringify({
          email: safeEmail(customer.email),
          customerId: invoice.customer,
          amountPaid: invoice.amount_paid,
          invoiceId: invoice.id,
          billingReason: invoice.billing_reason,
          timestamp: new Date().toISOString(),
        }));
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = data.object;
        const customer = await stripe.customers.retrieve(invoice.customer);
        console.log('Stripe invoice payment failed:', JSON.stringify({
          email: safeEmail(customer.email),
          customerId: invoice.customer,
          attemptCount: invoice.attempt_count,
          nextPaymentAttempt: invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000).toISOString() : null,
          invoiceId: invoice.id,
          timestamp: new Date().toISOString(),
        }));
        break;
      }

      default:
        console.log('Unhandled Stripe webhook event:', type);
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error('Webhook handler error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Webhook handler failed' }) };
  }
};
