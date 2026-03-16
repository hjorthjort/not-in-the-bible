import test from "node:test";
import assert from "node:assert/strict";

import { getSocialNetworkFromUrl, isSupportedSocialUrl } from "../src/lib/social-url.js";

test("supported networks are detected from canonical URLs", () => {
  assert.equal(getSocialNetworkFromUrl("https://x.com/jack/status/20"), "x");
  assert.equal(getSocialNetworkFromUrl("https://bsky.app/profile/bsky.app/post/3kq7ezofqak2f"), "bluesky");
});

test("unsupported URLs are rejected", () => {
  assert.equal(isSupportedSocialUrl("https://example.com/post/123"), false);
  assert.equal(isSupportedSocialUrl("not-a-url"), false);
});
