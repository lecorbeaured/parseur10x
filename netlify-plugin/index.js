/**
 * EBSS SEO Automator — Netlify Plugin
 * Automatically pings IndexNow + Google Indexing API after every deploy
 *
 * Install: add to netlify.toml under [plugins] section
 */

module.exports = {
  onSuccess: async ({ utils, constants, inputs }) => {
    const { execSync } = require("child_process");
    const path = require("path");

    const siteUrl = process.env.URL || inputs.siteUrl;
    const sitemapPath = inputs.sitemapPath || "/sitemap.xml";

    if (!siteUrl) {
      console.log("⚠️  [SEO Automator] No site URL found — skipping pings");
      return;
    }

    console.log("🚀 [SEO Automator] Deploy successful! Starting SEO pings...\n");

    try {
      const scriptPath = path.join(__dirname, "deploy-ping.js");
      execSync(
        `node "${scriptPath}" --site=${siteUrl} --sitemap=${sitemapPath}`,
        {
          stdio: "inherit",
          env: {
            ...process.env,
            INDEXNOW_KEY: process.env.INDEXNOW_KEY,
            GSC_SERVICE_ACCOUNT_JSON: process.env.GSC_SERVICE_ACCOUNT_JSON,
          },
        }
      );
    } catch (e) {
      // Don't fail the deploy if pings fail
      console.log(`⚠️  [SEO Automator] Ping error: ${e.message}`);
      utils.status.show({
        title: "SEO Automator",
        summary: "Deploy succeeded but SEO pings encountered errors",
        text: e.message,
      });
    }
  },
};
