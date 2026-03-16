import test from "node:test";
import assert from "node:assert/strict";

import { getSocialNetworkFromUrl, isSupportedSocialUrl } from "../src/lib/social-url.js";

test("supported networks are detected from canonical URLs", () => {
  assert.equal(getSocialNetworkFromUrl("https://x.com/jack/status/20"), "x");
  assert.equal(getSocialNetworkFromUrl("https://bsky.app/profile/bsky.app/post/3kq7ezofqak2f"), "bluesky");
  assert.equal(getSocialNetworkFromUrl("https://www.instagram.com/p/ABC123/"), "instagram");
  assert.equal(getSocialNetworkFromUrl("https://www.facebook.com/20531316728/posts/10154009990506729/"), "facebook");
  assert.equal(getSocialNetworkFromUrl("https://www.threads.net/@threads/post/CuP9t8nL74j"), "threads");
  assert.equal(getSocialNetworkFromUrl("https://www.tiktok.com/@scout2015/video/6718335390845095173"), "tiktok");
  assert.equal(getSocialNetworkFromUrl("https://youtu.be/dQw4w9WgXcQ"), "youtube");
  assert.equal(getSocialNetworkFromUrl("https://www.reddit.com/r/funny/comments/3g1jfi/buttons/"), "reddit");
});

test("unsupported URLs are rejected", () => {
  assert.equal(isSupportedSocialUrl("https://example.com/post/123"), false);
  assert.equal(isSupportedSocialUrl("not-a-url"), false);
});
