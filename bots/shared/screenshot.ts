import { chromium } from "playwright";

import { buildSitePostUrl } from "./analysis.js";

export async function captureAnalysisScreenshot(options: {
  canonicalUrl: string;
  siteOrigin: string;
  sourceId: string;
}): Promise<Buffer | null> {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: {
        height: 1200,
        width: 1280
      }
    });

    await page.goto(buildSitePostUrl(options.siteOrigin, options.canonicalUrl, options.sourceId), {
      timeout: 45000,
      waitUntil: "networkidle"
    });
    await page.waitForSelector(".panel", {
      state: "visible",
      timeout: 15000
    });

    return await page.locator(".panel").first().screenshot({
      type: "png"
    });
  } catch {
    return null;
  } finally {
    await browser?.close();
  }
}
