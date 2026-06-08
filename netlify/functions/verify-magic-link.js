// netlify/functions/verify-magic-link.js
// Verifies a magic link token is valid and not expired
//
// Environment variables:
//   MAGIC_LINK_SECRET = same secret used in magic-link.js

const crypto = require('crypto');
const { rateLimit, rateLimitResponse } = require('./rate-limit');

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


  const limit = rateLimit(event, { name: 'verify_magic_link', max: 20, windowMs: 60 * 1000 });
  if (limit.limited) {
    return rateLimitResponse(headers, limit);
  }
  if (!process.env.MAGIC_LINK_SECRET) {
    console.error('Magic link verification missing MAGIC_LINK_SECRET.');
    return { statusCode: 500, headers, body: JSON.stringify({ valid: false, error: 'Service not configured' }) };
  }

  try {
    const { token, email } = JSON.parse(event.body || '{}');

    if (!token || !email) {
      return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'Missing token or email' }) };
    }

    // Parse token: hash:expiry
    const parts = token.split(':');
    if (parts.length !== 2) {
      return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'Invalid token format' }) };
    }

    const [hash, expiryStr] = parts;
    const expiry = parseInt(expiryStr);

    // Check expiry
    if (Date.now() > expiry) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ valid: false, error: 'Login link has expired. Please request a new one.' }),
      };
    }

    // Verify hash
    const secret = process.env.MAGIC_LINK_SECRET;
    const payload = email.toLowerCase() + ':' + expiryStr;
    const expectedHash = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    if (hash !== expectedHash) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ valid: false, error: 'Invalid login link. Please request a new one.' }),
      };
    }

    // Token is valid
    console.log('MAGIC LINK VERIFIED:', email.toLowerCase());

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ valid: true, email: email.toLowerCase() }),
    };

  } catch (err) {
    console.error('Verify magic link error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ valid: false, error: 'Verification failed' }),
    };
  }
};
