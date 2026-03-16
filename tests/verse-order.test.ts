import test from "node:test";
import assert from "node:assert/strict";

import { sortVersesByBibleOrder } from "../src/lib/verse-order.js";

test("sorts verses by canonical Bible book order instead of alphabetically", () => {
  const verses = sortVersesByBibleOrder([
    {
      id: 3,
      bookCode: "JHN",
      chapter: 3,
      verse: 16
    },
    {
      id: 1,
      bookCode: "1CH",
      chapter: 1,
      verse: 1
    },
    {
      id: 2,
      bookCode: "GEN",
      chapter: 1,
      verse: 1
    },
    {
      id: 4,
      bookCode: "EXO",
      chapter: 2,
      verse: 1
    }
  ]);

  assert.deepEqual(
    verses.map((verse) => `${verse.bookCode} ${verse.chapter}:${verse.verse}`),
    ["GEN 1:1", "EXO 2:1", "1CH 1:1", "JHN 3:16"]
  );
});

test("sorts within a book by chapter and verse", () => {
  const verses = sortVersesByBibleOrder([
    {
      id: 2,
      bookCode: "GEN",
      chapter: 2,
      verse: 1
    },
    {
      id: 1,
      bookCode: "GEN",
      chapter: 1,
      verse: 3
    },
    {
      id: 3,
      bookCode: "GEN",
      chapter: 1,
      verse: 2
    }
  ]);

  assert.deepEqual(
    verses.map((verse) => `${verse.bookCode} ${verse.chapter}:${verse.verse}`),
    ["GEN 1:2", "GEN 1:3", "GEN 2:1"]
  );
});
