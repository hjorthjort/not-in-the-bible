import { buildAnalyzedText } from "../../src/lib/word-match.js";

import { loadWordLookup } from "./bible-data.js";
import { buildExtractedTextSnippet, buildReplyText } from "./reply.js";
import type { AnalysisResult, PlatformId, TargetContent } from "./types.js";

export function buildSitePostUrl(siteOrigin: string, canonicalUrl: string, sourceId: string): string {
  const endpoint = new URL("/post", siteOrigin);
  endpoint.searchParams.set("url", canonicalUrl);

  if (sourceId && sourceId !== "kjv") {
    endpoint.searchParams.set("source", sourceId);
  }

  return endpoint.toString();
}

function uniqueWords(words: string[]): string[] {
  return [...new Set(words.filter(Boolean))];
}

export async function analyzeTarget(
  target: TargetContent,
  options: {
    maxReplyLength: number;
    siteOrigin: string;
  }
): Promise<AnalysisResult> {
  const wordLookup = await loadWordLookup(target.sourceId);
  const analyzed = buildAnalyzedText(target.text, wordLookup, {
    enableNormalization: true
  });

  const wordParts = analyzed.filter((part) => part.type === "word");
  const presentWords = uniqueWords(wordParts.filter((part) => part.inBible).map((part) => part.normalized));
  const missingWords = uniqueWords(wordParts.filter((part) => !part.inBible).map((part) => part.normalized));
  const siteUrl = buildSitePostUrl(options.siteOrigin, target.canonicalUrl, target.sourceId);
  const extractedTextSnippet = buildExtractedTextSnippet(target.text);

  const resultWithoutReply = {
    ...target,
    extractedTextSnippet,
    inBibleCount: wordParts.filter((part) => part.inBible).length,
    missingCount: wordParts.filter((part) => !part.inBible).length,
    missingWords,
    presentWords,
    siteUrl,
    totalWords: wordParts.length
  };

  return {
    ...resultWithoutReply,
    replyText: buildReplyText(resultWithoutReply, options.maxReplyLength)
  };
}

export function buildScreenshotStem(platform: PlatformId, dedupeKey: string): string {
  return `${platform}-${dedupeKey.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}
