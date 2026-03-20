import test from "node:test";
import assert from "node:assert/strict";

import { analyzeTarget, buildSitePostUrl } from "../../bots/shared/analysis.js";

test("analyzeTarget counts words and builds a stable site link", async () => {
  const result = await analyzeTarget(
    {
      canonicalUrl: "https://x.com/example/status/123",
      platform: "x",
      replyTargetId: "123",
      sourceId: "kjv",
      text: "God baggage qzorp"
    },
    {
      maxReplyLength: 280,
      siteOrigin: "https://words.example.com"
    }
  );

  assert.equal(result.totalWords, 3);
  assert.equal(result.inBibleCount, 1);
  assert.equal(result.missingCount, 2);
  assert.deepEqual(result.presentWords, ["god"]);
  assert.deepEqual(result.missingWords, ["baggage", "qzorp"]);
  assert.equal(
    result.siteUrl,
    "https://words.example.com/post?url=https%3A%2F%2Fx.com%2Fexample%2Fstatus%2F123"
  );
  assert.match(result.replyText, /^1\/3 words are in the KJV\. 2 are not\. View:/);
});

test("buildSitePostUrl preserves non-default sources", () => {
  assert.equal(
    buildSitePostUrl("https://words.example.com", "https://bsky.app/profile/example/post/abc", "kjv-apocrypha"),
    "https://words.example.com/post?url=https%3A%2F%2Fbsky.app%2Fprofile%2Fexample%2Fpost%2Fabc&source=kjv-apocrypha"
  );
});
