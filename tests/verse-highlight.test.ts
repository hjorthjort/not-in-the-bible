import test from "node:test";
import assert from "node:assert/strict";

import { renderHighlightedVerseText } from "../src/lib/verse-highlight.js";

test("highlights every matching word occurrence in verse text", () => {
  const markup = renderHighlightedVerseText("Has he said, and has he not done it?", ["has"]);

  assert.equal(
    markup,
    '<mark class="tooltip__match">Has</mark> he said, and <mark class="tooltip__match">has</mark> he not done it?'
  );
});

test("highlights each word in normalized phrase matches and escapes verse text", () => {
  const markup = renderHighlightedVerseText('Do not fear <evil> & do not faint.', ["do", "not"]);

  assert.equal(
    markup,
    '<mark class="tooltip__match">Do</mark> <mark class="tooltip__match">not</mark> fear &lt;evil&gt; &amp; <mark class="tooltip__match">do</mark> <mark class="tooltip__match">not</mark> faint.'
  );
});
