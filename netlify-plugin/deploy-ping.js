#!/usr/bin/env node
/**
 * EBSS SEO Deploy Automator
 * Pings IndexNow + Google Search Console on every Netlify deploy
 * Works across all your sites: affiliate, SaaS, product pages
 *
 * Usage: node deploy-ping.js --site https://yourdomain.com --sitemap /sitemap.xml
 */

const https = require("https");
const http = require("http");
const { URL } = require("url");

// ─── CONFIG (override via env vars) ───────────────────────────────────────────
const CONFIG = {
  // Your IndexNow API key (generate once at indexnow.org, save as env var)
  indexNowKey: process.env.INDEXNOW_KEY || "YOUR_INDEXNOW_KEY",

  // GSC Indexing API — service account JSON key (base64-encoded in env var)
  gscServiceAccountJson: process.env.GSC_SERVICE_ACCOUNT_JSON || null,

  // Which search engines to ping via IndexNow
  indexNowHosts: [
    "api.indexnow.org",    // routes to Bing, Yandex, etc.
    "www.bing.com",
    "search.seznam.cz",
  ],

  // Max URLs to submit in one batch (IndexNow allows 10k, GSC allows 200/day)
  maxIndexNow: 500,
  maxGSC: 200,

  // Delay between GSC submissions (ms) to avoid rate limits
  gscDelay: 300,
};

// ─── UTILS ────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(emoji, msg) {
  console.log(`${emoji}  ${msg}`);
}

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol === "http:" ? http : https;
    const req = protocol.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () =>
        resolve({ status: res.statusCode, body: data, headers: res.headers })
      );
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─── SITEMAP PARSER ───────────────────────────────────────────────────────────
async function fetchSitemap(sitemapUrl) {
  log("🗺️", `Fetching sitemap: ${sitemapUrl}`);
  const parsed = new URL(sitemapUrl);
  const options = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    path: parsed.pathname + parsed.search,
    method: "GET",
    headers: { "User-Agent": "EBSS-SEO-Automator/1.0" },
  };

  const res = await request(options);
  if (res.status !== 200) throw new Error(`Sitemap fetch failed: ${res.status}`);

  // Extract all <loc> URLs
  const urls = [];
  const locRegex = /<loc>(.*?)<\/loc>/gi;
  let match;
  while ((match = locRegex.exec(res.body)) !== null) {
    const url = match[1].trim();
    if (url && !url.endsWith(".xml")) {
      // skip nested sitemap index entries
      urls.push(url);
    }
  }

  // Handle sitemap index (sitemaps that reference other sitemaps)
  const sitemapRegex = /<sitemap>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/sitemap>/gi;
  const nestedSitemaps = [];
  while ((match = sitemapRegex.exec(res.body)) !== null) {
    nestedSitemaps.push(match[1].trim());
  }

  if (nestedSitemaps.length > 0) {
    log("📂", `Found ${nestedSitemaps.length} nested sitemaps, fetching...`);
    for (const nestedUrl of nestedSitemaps) {
      try {
        const nestedUrls = await fetchSitemap(nestedUrl);
        urls.push(...nestedUrls);
      } catch (e) {
        log("⚠️", `Failed to fetch nested sitemap ${nestedUrl}: ${e.message}`);
      }
    }
  }

  log("✅", `Found ${urls.length} URLs in sitemap`);
  return [...new Set(urls)]; // deduplicate
}

// ─── INDEXNOW ─────────────────────────────────────────────────────────────────
async function pingIndexNow(siteUrl, urls) {
  if (!CONFIG.indexNowKey || CONFIG.indexNowKey === "YOUR_INDEXNOW_KEY") {
    log("⚠️", "IndexNow key not set — skipping IndexNow ping");
    return { submitted: 0, errors: 0 };
  }

  const parsed = new URL(siteUrl);
  const host = parsed.hostname;
  const batch = urls.slice(0, CONFIG.maxIndexNow);

  log("🚀", `Pinging IndexNow with ${batch.length} URLs...`);

  const payload = JSON.stringify({
    host,
    key: CONFIG.indexNowKey,
    keyLocation: `${siteUrl}/${CONFIG.indexNowKey}.txt`,
    urlList: batch,
  });

  let submitted = 0;
  let errors = 0;

  for (const indexNowHost of CONFIG.indexNowHosts) {
    try {
      const res = await request(
        {
          protocol: "https:",
          hostname: indexNowHost,
          path: "/indexnow",
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        payload
      );

      if (res.status === 200 || res.status === 202) {
        log("✅", `IndexNow → ${indexNowHost}: ${res.status} OK`);
        submitted = batch.length;
      } else if (res.status === 422) {
        log("⚠️", `IndexNow → ${indexNowHost}: 422 (URL not belonging to host)`);
        errors++;
      } else {
        log("❌", `IndexNow → ${indexNowHost}: ${res.status}`);
        errors++;
      }
    } catch (e) {
      log("❌", `IndexNow → ${indexNowHost} failed: ${e.message}`);
      errors++;
    }
  }

  return { submitted, errors };
}

// ─── GOOGLE INDEXING API ──────────────────────────────────────────────────────
async function getGoogleAccessToken(serviceAccountJson) {
  // Simple JWT signing for Google OAuth2 service account
  const crypto = require("crypto");

  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/indexing",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  // Build JWT
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  const sigInput = `${header}.${payload}`;

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(sigInput);
  const sig = sign.sign(sa.private_key, "base64url");
  const jwt = `${sigInput}.${sig}`;

  // Exchange for access token
  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
  const res = await request(
    {
      protocol: "https:",
      hostname: "oauth2.googleapis.com",
      path: "/token",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  );

  const parsed = JSON.parse(res.body);
  if (!parsed.access_token) throw new Error(`Failed to get token: ${res.body}`);
  return parsed.access_token;
}

async function pingGoogleIndexingAPI(urls, accessToken) {
  const batch = urls.slice(0, CONFIG.maxGSC);
  log("🔍", `Submitting ${batch.length} URLs to Google Indexing API...`);

  let submitted = 0;
  let errors = 0;

  for (const url of batch) {
    const body = JSON.stringify({ url, type: "URL_UPDATED" });
    try {
      const res = await request(
        {
          protocol: "https:",
          hostname: "indexing.googleapis.com",
          path: "/v3/urlNotifications:publish",
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        body
      );

      if (res.status === 200) {
        submitted++;
        process.stdout.write(".");
      } else {
        errors++;
        process.stdout.write("x");
      }
    } catch (e) {
      errors++;
    }

    await sleep(CONFIG.gscDelay);
  }

  console.log(""); // newline after dots
  log("✅", `GSC Indexing API: ${submitted} submitted, ${errors} errors`);
  return { submitted, errors };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const siteArg = args.find((a) => a.startsWith("--site="))?.split("=")[1] ||
                  process.env.DEPLOY_URL || process.env.URL;
  const sitemapPath = args.find((a) => a.startsWith("--sitemap="))?.split("=")[1] || "/sitemap.xml";

  if (!siteArg) {
    console.error("❌ Usage: node deploy-ping.js --site=https://yourdomain.com");
    process.exit(1);
  }

  const siteUrl = siteArg.replace(/\/$/, "");
  const sitemapUrl = `${siteUrl}${sitemapPath}`;

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   EBSS SEO Deploy Automator v1.0         ║");
  console.log("╚══════════════════════════════════════════╝\n");

  log("🌐", `Site: ${siteUrl}`);
  log("📅", `Time: ${new Date().toISOString()}\n`);

  const results = { indexNow: null, gsc: null, urls: 0 };

  try {
    // 1. Fetch sitemap
    const urls = await fetchSitemap(sitemapUrl);
    results.urls = urls.length;

    if (urls.length === 0) {
      log("⚠️", "No URLs found in sitemap — check your sitemap.xml");
      process.exit(0);
    }

    // 2. Ping IndexNow
    results.indexNow = await pingIndexNow(siteUrl, urls);

    // 3. Ping Google Indexing API (if service account configured)
    if (CONFIG.gscServiceAccountJson) {
      try {
        const token = await getGoogleAccessToken(CONFIG.gscServiceAccountJson);
        results.gsc = await pingGoogleIndexingAPI(urls, token);
      } catch (e) {
        log("⚠️", `GSC Indexing API error: ${e.message}`);
        results.gsc = { submitted: 0, errors: 1 };
      }
    } else {
      log("ℹ️", "GSC_SERVICE_ACCOUNT_JSON not set — skipping Google Indexing API");
    }

    // 4. Summary
    console.log("\n╔══════════════════════════════════════════╗");
    console.log("║   DEPLOY PING SUMMARY                    ║");
    console.log("╠══════════════════════════════════════════╣");
    console.log(`║  URLs found:     ${String(results.urls).padEnd(24)}║`);
    if (results.indexNow) {
      console.log(`║  IndexNow sent:  ${String(results.indexNow.submitted).padEnd(24)}║`);
    }
    if (results.gsc) {
      console.log(`║  GSC API sent:   ${String(results.gsc.submitted).padEnd(24)}║`);
    }
    console.log("╚══════════════════════════════════════════╝\n");

  } catch (e) {
    log("❌", `Fatal error: ${e.message}`);
    process.exit(1);
  }
}

main();
