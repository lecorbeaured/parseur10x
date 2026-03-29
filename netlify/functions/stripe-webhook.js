// netlify/functions/stripe-webhook.js
// Handles Stripe webhook events for subscription lifecycle
//
// Environment variables:
//   STRIPE_SECRET_KEY = sk_live_...
//   STRIPE_WEBHOOK_SECRET = whsec_... (get from Stripe Dashboard → Webhooks)
//
// Events handled:
//   customer.subscription.deleted — subscription canceled
//   customer.subscription.updated — plan change, payment method update
//   invoice.payment_failed — payment failed
//   invoice.payment_succeeded — renewal succeeded
//   checkout.session.completed — new subscription created

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return { statusCode: 500, body: 'Webhook not configured' };
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

  let stripeEvent;

  try {
    const sig = event.headers['stripe-signature'];
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
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
        const subscriptionId = session.subscription;
        console.log('NEW SUBSCRIPTION:', JSON.stringify({
          email,
          subscriptionId,
          customerId: session.customer,
          amount: session.amount_total,
          timestamp: new Date().toISOString(),
        }));
        // TODO: When Resend is ready, send welcome email
        // TODO: Store subscription mapping in database if needed
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = data.object;
        const customerId = subscription.customer;
        const status = subscription.status;
        const cancelAtPeriodEnd = subscription.cancel_at_period_end;

        // Get customer email
        const customer = await stripe.customers.retrieve(customerId);

        console.log('SUBSCRIPTION UPDATED:', JSON.stringify({
          email: customer.email,
          customerId,
          subscriptionId: subscription.id,
          status,
          cancelAtPeriodEnd,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
          timestamp: new Date().toISOString(),
        }));

        if (cancelAtPeriodEnd) {
          console.log('PENDING CANCELLATION:', customer.email, '— access until', new Date(subscription.current_period_end * 1000).toISOString());
          // TODO: Send "sorry to see you go" email via Resend
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = data.object;
        const customerId = subscription.customer;

        const customer = await stripe.customers.retrieve(customerId);

        console.log('SUBSCRIPTION CANCELED:', JSON.stringify({
          email: customer.email,
          customerId,
          subscriptionId: subscription.id,
          canceledAt: new Date().toISOString(),
        }));
        // TODO: Send "your Pro access has ended" email via Resend
        // Note: User's localStorage will still show Pro until they clear it
        // The magic link login will correctly deny access since subscription is inactive
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = data.object;
        const customerId = invoice.customer;
        const amount = invoice.amount_paid;

        const customer = await stripe.customers.retrieve(customerId);

        console.log('PAYMENT SUCCEEDED:', JSON.stringify({
          email: customer.email,
          customerId,
          amount: amount / 100,
          invoiceId: invoice.id,
          billingReason: invoice.billing_reason,
          timestamp: new Date().toISOString(),
        }));

        // billing_reason: 'subscription_cycle' = renewal, 'subscription_create' = first payment
        if (invoice.billing_reason === 'subscription_cycle') {
          console.log('RENEWAL SUCCESS:', customer.email, '$' + (amount / 100));
          // TODO: Send renewal confirmation email via Resend
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = data.object;
        const customerId = invoice.customer;
        const attemptCount = invoice.attempt_count;

        const customer = await stripe.customers.retrieve(customerId);

        console.log('PAYMENT FAILED:', JSON.stringify({
          email: customer.email,
          customerId,
          attemptCount,
          nextAttempt: invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000).toISOString() : 'none',
          invoiceId: invoice.id,
          timestamp: new Date().toISOString(),
        }));
        // TODO: Send "payment failed, please update card" email via Resend
        // Stripe will auto-retry based on your Smart Retries settings
        break;
      }

      default:
        console.log('Unhandled webhook event:', type);
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };

  } catch (err) {
    console.error('Webhook handler error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
