import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildAnalyzedText, extractTweetTextFromHtml } from "../src/lib/tweet-analysis.js";
import { tweetFixtures } from "./fixtures/tweet-cases.js";

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

const wordLookups = new Map<string, Record<string, number[]>>();

function getWords(sourceId: string): Record<string, number[]> {
  const cached = wordLookups.get(sourceId);
  if (cached) {
    return cached;
  }

  const loaded = loadWords(sourceId);
  wordLookups.set(sourceId, loaded);
  return loaded;
}

test("tweet fixtures stay stable across extraction and analysis", async (t) => {
  for (const fixture of tweetFixtures) {
    await t.test(fixture.id, () => {
      const extractedText = extractTweetTextFromHtml(fixture.html);
      assert.equal(extractedText, fixture.expectedText);

      const baselineAnalysis = buildAnalyzedText(extractedText, getWords("kjv"));
      const baselineWords = baselineAnalysis
        .filter((part) => part.type === "word")
        .map((part) => part.normalized);

      assert.deepEqual(baselineWords, fixture.expectedWords);

      for (const expectation of fixture.expectations) {
        const analysis = buildAnalyzedText(extractedText, getWords(expectation.sourceId));
        const wordParts = analysis.filter((part) => part.type === "word");
        const presentWords = wordParts.filter((part) => part.inBible).map((part) => part.normalized);
        const missingWords = wordParts.filter((part) => !part.inBible).map((part) => part.normalized);

        assert.deepEqual(
          presentWords,
          expectation.presentWords,
          `${fixture.id} present words for ${expectation.sourceId}`
        );
        assert.deepEqual(
          missingWords,
          expectation.missingWords,
          `${fixture.id} missing words for ${expectation.sourceId}`
        );
      }
    });
  }
});
