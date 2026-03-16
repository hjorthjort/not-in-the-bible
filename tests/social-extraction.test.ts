import test from "node:test";
import assert from "node:assert/strict";

import { extractSocialTextFromHtml } from "../src/lib/tweet-analysis.js";

test("extracts Bluesky post text from oEmbed html", () => {
  const html =
    '<blockquote class="bluesky-embed"><p lang="en">App Version 1.77 is rolling out now (1/7)\n\nRead on for details 🧵</p>&mdash; <a href="https://bsky.app/profile/bsky.app">Bluesky (@bsky.app)</a></blockquote><script async src="https://embed.bsky.app/static/embed.js" charset="utf-8"></script>';

  assert.equal(extractSocialTextFromHtml(html), "App Version 1.77 is rolling out now (1/7)\n\nRead on for details 🧵");
});

test("preserves hashtag anchor text for TikTok captions", () => {
  const html =
    '<blockquote class="tiktok-embed"><section><a target="_blank" href="https://www.tiktok.com/@scout2015?refer=embed">@scout2015</a><p>Scramble up ur name &amp; I’ll try to guess it😍❤️ <a target="_blank" href="https://www.tiktok.com/tag/foryoupage?refer=embed">#foryoupage</a> <a target="_blank" href="https://www.tiktok.com/tag/petsoftiktok?refer=embed">#petsoftiktok</a></p></section></blockquote><script async src="https://www.tiktok.com/embed.js"></script>';

  assert.equal(
    extractSocialTextFromHtml(html),
    "Scramble up ur name & I’ll try to guess it😍❤️ #foryoupage #petsoftiktok"
  );
});
