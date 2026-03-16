import test from "node:test";
import assert from "node:assert/strict";

import { buildBibleHubVerseUrl, getPreferredVerseUrl } from "../src/lib/bible-reader-url.js";

test("builds Bible Hub links for canonical books", () => {
  assert.equal(buildBibleHubVerseUrl("GEN", 2, 3), "https://biblehub.com/genesis/2-3.htm");
  assert.equal(buildBibleHubVerseUrl("SNG", 1, 1), "https://biblehub.com/songs/1-1.htm");
});

test("builds Bible Hub links for supported deuterocanonical books", () => {
  assert.equal(buildBibleHubVerseUrl("TOB", 1, 1), "https://biblehub.com/catholic/tobit/1-1.htm");
  assert.equal(buildBibleHubVerseUrl("1ES", 1, 1), "https://biblehub.com/apocrypha/1_esdras/1-1.htm");
});

test("falls back to the source URL for unsupported books", () => {
  assert.equal(buildBibleHubVerseUrl("3MA", 1, 1), null);
  assert.equal(
    getPreferredVerseUrl({
      bookCode: "DAG",
      chapter: 13,
      verse: 1,
      fallbackUrl: "https://ebible.org/eng-Brenton/DAG13.htm#V1"
    }),
    "https://ebible.org/eng-Brenton/DAG13.htm#V1"
  );
});
