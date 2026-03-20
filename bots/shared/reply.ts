import type { AnalysisResult } from "./types.js";

function formatSourceLabel(sourceId: string): string {
  if (sourceId === "kjv") {
    return "KJV";
  }

  return sourceId.toUpperCase();
}

function buildSnippet(text: string, maxLength = 90): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function buildExtractedTextSnippet(text: string): string {
  return buildSnippet(text);
}

export function buildReplyText(analysis: Omit<AnalysisResult, "replyText">, maxLength: number): string {
  const sourceLabel = formatSourceLabel(analysis.sourceId);
  const base = `${analysis.inBibleCount}/${analysis.totalWords} words are in the ${sourceLabel}. ${analysis.missingCount} are not. View: ${analysis.siteUrl}`;

  if (!analysis.extractedTextSnippet) {
    return base;
  }

  const withSnippet = `${base} Text: "${analysis.extractedTextSnippet}"`;
  return withSnippet.length <= maxLength ? withSnippet : base;
}
