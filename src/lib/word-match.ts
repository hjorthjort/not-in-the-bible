import { normalizeWord, TOKEN_PATTERN } from "./tweet-analysis.js";

export type WordLookup = Record<string, number[]>;

export type WordMatchResult = {
  normalized: string;
  matchedWord: string | null;
  matchedWords: string[];
  matchType: "exact" | "normalized" | "missing";
  matchLabel: string | null;
  verseIds: number[];
};

export type MatchedTextPart =
  | { type: "text"; value: string }
  | {
      type: "word";
      rawWord: string;
      normalized: string;
      matchedWord: string | null;
      matchedWords: string[];
      matchType: "exact" | "normalized" | "missing";
      matchLabel: string | null;
      inBible: boolean;
      verseIds: number[];
    };

export type WordMatchOptions = {
  enableNormalization?: boolean;
};

const IRREGULAR_NORMALIZATIONS: Record<string, string[]> = {
  childrens: ["children"]
};

const CONTRACTION_EXPANSIONS: Record<string, string[]> = {
  dont: ["do", "not"],
  doesnt: ["does", "not"],
  didnt: ["did", "not"],
  cant: ["can", "not"],
  couldnt: ["could", "not"],
  wont: ["will", "not"],
  wouldnt: ["would", "not"],
  shouldnt: ["should", "not"],
  isnt: ["is", "not"],
  arent: ["are", "not"],
  wasnt: ["was", "not"],
  werent: ["were", "not"],
  havent: ["have", "not"],
  hasnt: ["has", "not"],
  hadnt: ["had", "not"],
  im: ["i", "am"],
  ive: ["i", "have"],
  ill: ["i", "will"],
  id: ["i", "would"],
  youre: ["you", "are"],
  youve: ["you", "have"],
  youll: ["you", "will"],
  hes: ["he", "is"],
  hed: ["he", "would"],
  hell: ["he", "will"],
  shes: ["she", "is"],
  shed: ["she", "would"],
  shell: ["she", "will"],
  its: ["it", "is"],
  itd: ["it", "would"],
  itll: ["it", "will"],
  were: ["we", "are"],
  weve: ["we", "have"],
  well: ["we", "will"],
  theyre: ["they", "are"],
  theyve: ["they", "have"],
  theyll: ["they", "will"],
  thats: ["that", "is"],
  theres: ["there", "is"],
  whats: ["what", "is"]
};

function normalizeOptions(options?: WordMatchOptions): Required<WordMatchOptions> {
  return {
    enableNormalization: options?.enableNormalization ?? true
  };
}

function addCandidate(candidates: Set<string>, normalized: string, candidate: string): void {
  if (!candidate || candidate === normalized || candidate.length < 3) {
    return;
  }

  candidates.add(candidate);
}

function shouldTrySimplePluralFallback(normalized: string): boolean {
  if (normalized.length <= 3) {
    return false;
  }

  if (/(?:ss|us|is)$/.test(normalized)) {
    return false;
  }

  return normalized.length > 4 || /[^aeiou]s$/.test(normalized);
}

function getFallbackCandidates(normalized: string): string[] {
  const candidates = new Set<string>();

  for (const irregular of IRREGULAR_NORMALIZATIONS[normalized] ?? []) {
    addCandidate(candidates, normalized, irregular);
  }

  if (normalized.endsWith("ies") && normalized.length > 4) {
    addCandidate(candidates, normalized, `${normalized.slice(0, -3)}y`);
  }

  if (normalized.endsWith("es") && normalized.length > 4 && /(?:[sxz]|ch|sh|o)es$/.test(normalized)) {
    addCandidate(candidates, normalized, normalized.slice(0, -2));
  }

  if (normalized.endsWith("s") && shouldTrySimplePluralFallback(normalized)) {
    addCandidate(candidates, normalized, normalized.slice(0, -1));
  }

  if (normalized.endsWith("ing") && normalized.length > 5) {
    const stem = normalized.slice(0, -3);
    addCandidate(candidates, normalized, stem);
    addCandidate(candidates, normalized, `${stem}e`);
    if (stem.length > 1 && stem.at(-1) === stem.at(-2)) {
      addCandidate(candidates, normalized, stem.slice(0, -1));
    }
  }

  if (normalized.endsWith("ied") && normalized.length > 4) {
    addCandidate(candidates, normalized, `${normalized.slice(0, -3)}y`);
  }

  if (normalized.endsWith("ed") && normalized.length > 4) {
    const stem = normalized.slice(0, -2);
    addCandidate(candidates, normalized, stem);
    addCandidate(candidates, normalized, `${stem}e`);
    if (stem.length > 1 && stem.at(-1) === stem.at(-2)) {
      addCandidate(candidates, normalized, stem.slice(0, -1));
    }
  }

  return [...candidates];
}

function buildMissingResult(normalized: string): WordMatchResult {
  return {
    normalized,
    matchedWord: null,
    matchedWords: [],
    matchType: "missing",
    matchLabel: null,
    verseIds: []
  };
}

export function resolveWordMatch(
  rawWord: string,
  wordLookup: WordLookup,
  options?: WordMatchOptions
): WordMatchResult {
  const normalized = normalizeWord(rawWord);
  if (!normalized) {
    return buildMissingResult("");
  }

  const exactVerseIds = wordLookup[normalized] ?? [];
  if (exactVerseIds.length) {
    return {
      normalized,
      matchedWord: normalized,
      matchedWords: [normalized],
      matchType: "exact",
      matchLabel: null,
      verseIds: exactVerseIds
    };
  }

  if (!normalizeOptions(options).enableNormalization) {
    return buildMissingResult(normalized);
  }

  const contractionExpansion = CONTRACTION_EXPANSIONS[normalized];
  if (contractionExpansion?.length) {
    const expandedVerseGroups = contractionExpansion.map((candidate) => wordLookup[candidate] ?? []);

    if (expandedVerseGroups.every((verseIds) => verseIds.length > 0)) {
      return {
        normalized,
        matchedWord: contractionExpansion.join(" "),
        matchedWords: contractionExpansion,
        matchType: "normalized",
        matchLabel: `Inexact match: expanded to "${contractionExpansion.join(" ")}"`,
        verseIds: [...new Set(expandedVerseGroups.flat())]
      };
    }
  }

  for (const candidate of getFallbackCandidates(normalized)) {
    const verseIds = wordLookup[candidate];
    if (!verseIds?.length) {
      continue;
    }

    return {
      normalized,
      matchedWord: candidate,
      matchedWords: [candidate],
      matchType: "normalized",
      matchLabel: `Inexact match: matched as "${candidate}"`,
      verseIds
    };
  }

  return buildMissingResult(normalized);
}

export function buildAnalyzedText(
  text: string,
  wordLookup: WordLookup,
  options?: WordMatchOptions
): MatchedTextPart[] {
  const parts: MatchedTextPart[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const [rawWord] = match;
    const start = match.index ?? 0;
    const end = start + rawWord.length;
    const resolved = resolveWordMatch(rawWord, wordLookup, options);
    const inBible = resolved.verseIds.length > 0;

    if (start > lastIndex) {
      parts.push({
        type: "text",
        value: text.slice(lastIndex, start)
      });
    }

    parts.push({
      type: "word",
      rawWord,
      normalized: resolved.normalized,
      matchedWord: resolved.matchedWord,
      matchedWords: resolved.matchedWords,
      matchType: resolved.matchType,
      matchLabel: resolved.matchLabel,
      inBible,
      verseIds: resolved.verseIds
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
