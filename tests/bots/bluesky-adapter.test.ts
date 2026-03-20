import test from "node:test";
import assert from "node:assert/strict";

import { buildBlueskyAction } from "../../bots/bluesky/adapter.js";
import type { BskyPost } from "../../bots/bluesky/client.js";

test("bluesky adapter analyzes the parent post when summoned in a reply", async () => {
  const mention: BskyPost = {
    author: { handle: "summoner.bsky.social" },
    cid: "cid-mention",
    record: {
      reply: {
        parent: { cid: "cid-parent", uri: "at://did:plc:author/app.bsky.feed.post/3parent" },
        root: { cid: "cid-root", uri: "at://did:plc:author/app.bsky.feed.post/3root" }
      },
      text: "@bot check this"
    },
    uri: "at://did:plc:summoner/app.bsky.feed.post/3mention"
  };
  const parent: BskyPost = {
    author: { handle: "author.bsky.social" },
    cid: "cid-parent",
    record: {
      text: "God created baggage"
    },
    uri: "at://did:plc:author/app.bsky.feed.post/3parent"
  };

  const action = await buildBlueskyAction({
    mention,
    siteOrigin: "https://words.example.com",
    sourceId: "kjv",
    target: parent
  });

  assert.equal(
    action.analysis.canonicalUrl,
    "https://bsky.app/profile/author.bsky.social/post/3parent"
  );
  assert.equal(action.analysis.replyTargetId, mention.uri);
  assert.equal(action.analysis.inBibleCount, 2);
  assert.equal(action.analysis.missingCount, 1);
});

test("bluesky adapter analyzes the mention itself when it is not a reply", async () => {
  const mention: BskyPost = {
    author: { handle: "summoner.bsky.social" },
    cid: "cid-mention",
    record: {
      text: "God baggage"
    },
    uri: "at://did:plc:summoner/app.bsky.feed.post/3mention"
  };

  const action = await buildBlueskyAction({
    mention,
    siteOrigin: "https://words.example.com",
    sourceId: "kjv",
    target: null
  });

  assert.equal(
    action.analysis.canonicalUrl,
    "https://bsky.app/profile/summoner.bsky.social/post/3mention"
  );
});
