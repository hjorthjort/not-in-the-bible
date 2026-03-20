import test from "node:test";
import assert from "node:assert/strict";

import { buildRedditAction } from "../../bots/reddit/adapter.js";
import type { RedditMessage, RedditThing } from "../../bots/reddit/client.js";

test("reddit adapter analyzes a parent comment body", async () => {
  const mention: RedditMessage = {
    id: "mention1",
    name: "t1_mention1",
    parent_id: "t1_parent1"
  };
  const target: RedditThing = {
    body: "God baggage",
    id: "parent1",
    name: "t1_parent1",
    permalink: "/r/test/comments/abc/thread/parent1/"
  };

  const action = await buildRedditAction({
    mention,
    siteOrigin: "https://words.example.com",
    sourceId: "kjv",
    target
  });

  assert.ok(action);
  assert.equal(
    action.analysis.canonicalUrl,
    "https://www.reddit.com/r/test/comments/abc/thread/parent1/"
  );
  assert.equal(action.analysis.inBibleCount, 1);
  assert.equal(action.analysis.missingCount, 1);
});

test("reddit adapter analyzes a parent submission title and selftext", async () => {
  const mention: RedditMessage = {
    id: "mention2",
    name: "t1_mention2",
    parent_id: "t3_post1"
  };
  const target: RedditThing = {
    id: "post1",
    name: "t3_post1",
    permalink: "/r/test/comments/post1/example/",
    selftext: "baggage qzorp",
    title: "God"
  };

  const action = await buildRedditAction({
    mention,
    siteOrigin: "https://words.example.com",
    sourceId: "kjv",
    target
  });

  assert.ok(action);
  assert.equal(action.analysis.totalWords, 3);
  assert.equal(action.analysis.inBibleCount, 1);
  assert.equal(action.analysis.missingCount, 2);
});
