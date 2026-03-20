import test from "node:test";
import assert from "node:assert/strict";

import { buildXAction } from "../../bots/x/adapter.js";
import type { XTweet } from "../../bots/x/client.js";

test("x adapter analyzes the replied-to tweet when the mention is a reply", async () => {
  const mention: XTweet = {
    authorUsername: "summoner",
    id: "200",
    referencedTweets: [{ id: "150", type: "replied_to" }],
    text: "@bot check this"
  };
  const parent: XTweet = {
    authorUsername: "author",
    id: "150",
    referencedTweets: [],
    text: "God created baggage"
  };

  const action = await buildXAction({
    mention,
    siteOrigin: "https://words.example.com",
    sourceId: "kjv",
    target: parent
  });

  assert.ok(action);
  assert.equal(action.analysis.canonicalUrl, "https://x.com/author/status/150");
  assert.equal(action.analysis.replyTargetId, "200");
  assert.equal(action.analysis.inBibleCount, 2);
  assert.equal(action.analysis.missingCount, 1);
});

test("x adapter analyzes the mention itself when it is top-level", async () => {
  const mention: XTweet = {
    authorUsername: "summoner",
    id: "201",
    referencedTweets: [],
    text: "God baggage"
  };

  const action = await buildXAction({
    mention,
    siteOrigin: "https://words.example.com",
    sourceId: "kjv",
    target: null
  });

  assert.ok(action);
  assert.equal(action.analysis.canonicalUrl, "https://x.com/summoner/status/201");
  assert.equal(action.analysis.replyTargetId, "201");
});
