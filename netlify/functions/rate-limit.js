// netlify/functions/rate-limit.js
// Lightweight in-memory rate limiting for Netlify Functions.
// This protects against accidental abuse during local testing and gives basic guardrails in production.
// For high traffic, replace this with a durable store such as Upstash Redis or Netlify Blobs.

const buckets = global.__PARSEUR10X_RATE_LIMIT_BUCKETS__ || new Map();
global.__PARSEUR10X_RATE_LIMIT_BUCKETS__ = buckets;

function getClientIp(event) {
  const headers = event.headers || {};
  const forwardedFor = headers['x-forwarded-for'] || headers['X-Forwarded-For'] || '';
  const firstForwardedIp = forwardedFor.split(',')[0].trim();
  return firstForwardedIp || headers['client-ip'] || headers['Client-Ip'] || event.ip || 'unknown';
}

function rateLimit(event, options = {}) {
  const windowMs = Number(options.windowMs || 60 * 1000);
  const max = Number(options.max || 20);
  const name = options.name || 'default';
  const now = Date.now();
  const ip = getClientIp(event);
  const key = `${name}:${ip}`;
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, remaining: Math.max(max - 1, 0), resetAt: now + windowMs };
  }

  existing.count += 1;

  if (existing.count > max) {
    return {
      limited: true,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return { limited: false, remaining: Math.max(max - existing.count, 0), resetAt: existing.resetAt };
}

function rateLimitResponse(headers, result) {
  return {
    statusCode: 429,
    headers: {
      ...headers,
      'Retry-After': String(result.retryAfter || 60),
      'X-RateLimit-Remaining': '0',
    },
    body: JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' }),
  };
}

module.exports = { rateLimit, rateLimitResponse };
