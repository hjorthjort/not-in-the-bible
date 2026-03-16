import { normalizeWord, TOKEN_PATTERN } from "./tweet-analysis.js";

const MATCH_CLASS_NAME = "tooltip__match";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderHighlightedVerseText(text: string, matchedWords: string[]): string {
  if (!matchedWords.length) {
    return escapeHtml(text);
  }

  const matchedSet = new Set(matchedWords.map((word) => normalizeWord(word)).filter(Boolean));
  let markup = "";
  let lastIndex = 0;

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const [rawWord] = match;
    const start = match.index ?? 0;
    const end = start + rawWord.length;

    if (start > lastIndex) {
      markup += escapeHtml(text.slice(lastIndex, start));
    }

    const tokenMarkup = escapeHtml(rawWord);
    markup += matchedSet.has(normalizeWord(rawWord))
      ? `<mark class="${MATCH_CLASS_NAME}">${tokenMarkup}</mark>`
      : tokenMarkup;

    lastIndex = end;
  }

  if (lastIndex < text.length) {
    markup += escapeHtml(text.slice(lastIndex));
  }

  return markup;
}
