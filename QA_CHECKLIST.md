# Parseur10x QA Checklist

Use this checklist before every local test, ZIP handoff, and Netlify deploy.

## 1. Local setup

Run from the project root:

```bash
cd /Users/mollah/Desktop/WEBSITES/parseur10x
```

Install the Netlify CLI if needed:

```bash
npm install -g netlify-cli
```

Create a local env file from the example:

```bash
cp .env.example .env
```

Fill in real values only when testing live services. Never commit `.env`.

## 2. Start localhost

Preferred command:

```bash
netlify dev
```

Expected local URL:

```text
http://localhost:8888
```

Fallback static server, for page layout only:

```bash
python3 -m http.server 8888
```

Use `netlify dev` when testing functions, Stripe, Resend, or parser behavior.

## 3. Homepage checks

Open:

```text
http://localhost:8888/
```

Confirm:

- Page loads without console errors.
- Main CTA opens the app or intended funnel.
- Lead magnet CTA opens `/credit-cleanup-checklist`.
- Contact form submits successfully.
- Contact form rejects missing or invalid fields.
- Mobile layout works at 390px width.

## 4. App checks

Open:

```text
http://localhost:8888/app
```

Confirm:

- App page loads without console errors.
- Upload privacy notice appears near the PDF upload area.
- PDF upload control appears.
- Free user flow shows limited results.
- Pro-only letter download is gated for free users.
- Pro state unlocks the letter download button.
- Letter download creates a `.txt` file.

## 5. Lead magnet checks

Open:

```text
http://localhost:8888/credit-cleanup-checklist
```

Confirm:

- Page loads.
- Form rejects blank or invalid email.
- Form accepts a valid email.
- Placeholder mode works without Resend env vars.
- Resend mode works after adding real env vars.

## 6. SEO page checks

Open each page:

```text
/free-credit-report-parser
/credit-dispute-letter-generator
/remove-late-payments
/remove-collections
/609-dispute-letter
/credit-inquiry-removal
```

Confirm:

- Page loads.
- Title and meta description are present.
- Canonical URL is present.
- Google Analytics script is present.
- CTA links point to the app or lead magnet.
- Mobile layout is readable.

## 7. Function checks

Test function endpoints through `netlify dev`:

```text
/.netlify/functions/contact
/.netlify/functions/capture-email
/.netlify/functions/create-checkout
/.netlify/functions/verify-session
/.netlify/functions/magic-link
/.netlify/functions/verify-magic-link
/.netlify/functions/parse-report
/.netlify/functions/stripe-webhook
```

Confirm:

- OPTIONS requests return success.
- Wrong methods return 405 when expected.
- Missing fields return 400.
- Rate-limited requests return 429.
- No function logs full credit report data.
- No function exposes secret values.

## 8. Stripe checks

Before live testing, confirm these env vars exist:

```text
STRIPE_SECRET_KEY
STRIPE_PRICE_ID
STRIPE_WEBHOOK_SECRET
SITE_URL
```

Confirm:

- Checkout creates a valid Stripe Checkout URL.
- Success URL points back to the site.
- Cancel URL points back to the site.
- Webhook rejects missing or invalid signatures.
- Webhook accepts valid Stripe events.
- Pro access verifies only paid or active subscription sessions.

## 9. Resend checks

Before live testing, confirm these env vars exist:

```text
RESEND_API_KEY
RESEND_AUDIENCE_ID
RESEND_FROM_EMAIL
RESEND_NOTIFY_EMAIL
```

Confirm:

- Email capture works without real Resend values in placeholder mode.
- Real Resend contact creation works after env vars are added.
- Contact form notification works after env vars are added.
- Welcome/checklist email sends after env vars are added.

## 10. Security checks

Confirm:

- `.env` is not committed.
- `.DS_Store` is not committed.
- `MAGIC_LINK_SECRET` has no fallback default.
- Sensitive logs are redacted.
- Upload privacy copy is visible.
- CORS headers are intentional.
- Rate limiting is enabled on sensitive functions.

## 11. SEO checks

Confirm:

- `sitemap.xml` is valid XML.
- `robots.txt` blocks `/app` and `/app.html`.
- No noindex page is listed in sitemap.
- All sitemap URLs map to real files or Netlify routes.
- Public SEO pages are not blocked.

## 12. Final pre-deploy checks

Run:

```bash
git status
find . -name ".DS_Store"
find . -name "__MACOSX"
```

Expected:

- Working tree is clean, or only intentional changes are shown.
- No `.DS_Store` files.
- No `__MACOSX` folders.

Then deploy preview:

```bash
netlify deploy
```

After preview passes, deploy production:

```bash
netlify deploy --prod
```

## 13. Monetization checks

Confirm every high-intent page has at least one clear path to money:

- Pro subscription CTA.
- Dispute letter pack CTA when added.
- Credit monitoring affiliate CTA when added.
- Lead magnet form.
- Email funnel entry point.

The goal is simple: every visitor should have a next step, and every next step should build trust, collect a lead, or move them closer to purchase.
