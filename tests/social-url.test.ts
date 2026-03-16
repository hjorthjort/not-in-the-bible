import test from "node:test";
import assert from "node:assert/strict";

import { getSocialNetworkFromUrl, isSupportedSocialUrl } from "../src/lib/social-url.js";

test("supported networks are detected from canonical URLs", () => {
  assert.equal(getSocialNetworkFromUrl("https://x.com/jack/status/20"), "x");
  assert.equal(getSocialNetworkFromUrl("https://bsky.app/profile/bsky.app/post/3kq7ezofqak2f"), "bluesky");
  assert.equal(getSocialNetworkFromUrl("https://www.instagram.com/p/ABC123/"), "instagram");
  assert.equal(getSocialNetworkFromUrl("https://www.instagram.com/p/ABC123/?comment_id=1234567890"), "instagram");
  assert.equal(getSocialNetworkFromUrl("https://www.instagram.com/p/ABC123/c/1234567890/"), "instagram");
  assert.equal(getSocialNetworkFromUrl("https://www.facebook.com/20531316728/posts/10154009990506729/"), "facebook");
  assert.equal(
    getSocialNetworkFromUrl(
      "https://www.facebook.com/20531316728/posts/10154009990506729/?comment_id=987654321&reply_comment_id=123456789"
    ),
    "facebook"
  );
  assert.equal(getSocialNetworkFromUrl("https://www.tiktok.com/@scout2015/video/6718335390845095173"), "tiktok");
  assert.equal(
    getSocialNetworkFromUrl(
      "https://www.tiktok.com/@scout2015/video/6718335390845095173?comment_id=7444444444444444444&reply_comment_id=7555555555555555555"
    ),
    "tiktok"
  );
  assert.equal(getSocialNetworkFromUrl("https://youtu.be/dQw4w9WgXcQ"), "youtube");
  assert.equal(
    getSocialNetworkFromUrl("https://www.youtube.com/watch?v=DxL2HoqLbyA&lc=Ugz4rGC9qzbXhyqrZpB4AaABAg"),
    "youtube"
  );
  assert.equal(getSocialNetworkFromUrl("https://www.reddit.com/r/funny/comments/3g1jfi/buttons/"), "reddit");
  assert.equal(getSocialNetworkFromUrl("https://www.reddit.com/r/funny/comments/3g1jfi/buttons/ctu0ltr/"), "reddit");
  assert.equal(getSocialNetworkFromUrl("https://news.ycombinator.com/item?id=8863"), "hackernews");
  assert.equal(getSocialNetworkFromUrl("https://news.ycombinator.com/item?id=2921983"), "hackernews");
  assert.equal(getSocialNetworkFromUrl("https://lobste.rs/s/bunmdv/faster_asin_was_hiding_plain_sight"), "lobsters");
  assert.equal(
    getSocialNetworkFromUrl("https://lobste.rs/s/bunmdv/faster_asin_was_hiding_plain_sight#c_b2ebup"),
    "lobsters"
  );
  assert.equal(getSocialNetworkFromUrl("https://www.quora.com/What-is-the-best-programming-language"), "quora");
});

test("unsupported URLs are rejected", () => {
  assert.equal(isSupportedSocialUrl("https://example.com/post/123"), false);
  assert.equal(isSupportedSocialUrl("https://news.ycombinator.com/news"), false);
  assert.equal(isSupportedSocialUrl("not-a-url"), false);
});
