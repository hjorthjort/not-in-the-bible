import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveWordMatch } from "../src/lib/word-match.js";

type WordPayload = {
  words: Record<string, number[]>;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");

function loadWords(sourceId: string): Record<string, number[]> {
  const payload = JSON.parse(
    readFileSync(path.join(rootDir, "data", sourceId, "words.json"), "utf8")
  ) as WordPayload;
  return payload.words;
}

test("prefers exact matches before contraction or stemming fallbacks", () => {
  const result = resolveWordMatch(
    "were",
    {
      were: [1],
      we: [2],
      are: [3]
    },
    { enableNormalization: true }
  );

  assert.equal(result.matchType, "exact");
  assert.equal(result.matchedWord, "were");
  assert.deepEqual(result.verseIds, [1]);
});

test("normalization feature flag gates inexact fallback matches", () => {
  const lookup = {
    cat: [2]
  };

  const normalized = resolveWordMatch("cats", lookup, { enableNormalization: true });
  assert.equal(normalized.matchType, "normalized");
  assert.equal(normalized.matchedWord, "cat");

  const exactOnly = resolveWordMatch("cats", lookup, { enableNormalization: false });
  assert.equal(exactOnly.matchType, "missing");
  assert.equal(exactOnly.matchedWord, null);
});

test("does not normalize has to ha in kjv", () => {
  const result = resolveWordMatch("has", loadWords("kjv"), { enableNormalization: true });

  assert.equal(result.matchType, "missing");
  assert.equal(result.matchedWord, null);
  assert.deepEqual(result.matchedWords, []);
});

test("keeps verbatim has match in web instead of normalizing to ha", () => {
  const result = resolveWordMatch("has", loadWords("web"), { enableNormalization: true });

  assert.equal(result.matchType, "exact");
  assert.equal(result.matchedWord, "has");
  assert.deepEqual(result.matchedWords, ["has"]);
  assert.ok(result.verseIds.length > 0);
});
