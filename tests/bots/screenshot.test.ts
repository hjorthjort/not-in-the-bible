import test from "node:test";
import assert from "node:assert/strict";

import { captureAnalysisScreenshot } from "../../bots/shared/screenshot.js";

test("screenshot smoke test", { skip: !process.env.BOT_SCREENSHOT_SMOKE_URL }, async () => {
  const buffer = await captureAnalysisScreenshot({
    canonicalUrl: process.env.BOT_SCREENSHOT_SMOKE_URL ?? "",
    siteOrigin: process.env.SITE_ORIGIN ?? "http://localhost:4173",
    sourceId: process.env.BOT_BIBLE_SOURCE ?? "kjv"
  });

  assert.ok(buffer);
  assert.ok(buffer.length > 0);
});
