export const TOKEN_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export type AnalyzedTextPart =
  | { type: "text"; value: string }
  | {
      type: "word";
      rawWord: string;
      normalized: string;
      inBible: boolean;
      verseIds: number[];
    };

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  apos: "'",
  eacute: "é",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  rsquo: "'"
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, body) => {
    const normalizedBody = body.toLowerCase();

    if (normalizedBody.startsWith("#x")) {
      const codePoint = Number.parseInt(normalizedBody.slice(2), 16);
      return Number.isNaN(codePoint) ? entity : String.fromCodePoint(codePoint);
    }

    if (normalizedBody.startsWith("#")) {
      const codePoint = Number.parseInt(normalizedBody.slice(1), 10);
      return Number.isNaN(codePoint) ? entity : String.fromCodePoint(codePoint);
    }

    return ENTITY_MAP[normalizedBody] ?? entity;
  });
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

export function normalizeWord(word: string): string {
  return word
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase();
}

export function extractTweetTextFromHtml(html: string): string {
  const paragraphMatch = html.match(/<blockquote\b[^>]*>[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p>/i);
  const paragraphHtml = paragraphMatch?.[1] ?? "";

  if (!paragraphHtml) {
    return "";
  }

  const normalizedHtml = paragraphHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<img\b[^>]*>/gi, "[...]")
    .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, "[...]");

  return decodeHtmlEntities(stripHtml(normalizedHtml)).trim();
}

export function buildAnalyzedText(
  text: string,
  wordLookup: Record<string, number[]>
): AnalyzedTextPart[] {
  const parts: AnalyzedTextPart[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const [rawWord] = match;
    const start = match.index ?? 0;
    const end = start + rawWord.length;
    const normalized = normalizeWord(rawWord);
    const verseIds = wordLookup[normalized] ?? [];
    const inBible = verseIds.length > 0;

    if (start > lastIndex) {
      parts.push({
        type: "text",
        value: text.slice(lastIndex, start)
      });
    }

    parts.push({
      type: "word",
      rawWord,
      normalized,
      inBible,
      verseIds
    });
    lastIndex = end;
  }

  if (lastIndex < text.length) {
    parts.push({
      type: "text",
      value: text.slice(lastIndex)
    });
  }

  return parts;
}
