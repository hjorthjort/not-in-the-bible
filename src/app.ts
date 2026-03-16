export {};

const appElement = document.querySelector<HTMLElement>("#app");
const formElement = document.querySelector<HTMLFormElement>("#tweet-form");
const inputElement = document.querySelector<HTMLInputElement>("#tweet-url");
const tooltipElement = document.querySelector<HTMLElement>("#tooltip");
const sourceSelectElement = document.querySelector<HTMLSelectElement>("#bible-source");

if (!appElement || !formElement || !inputElement || !tooltipElement || !sourceSelectElement) {
  throw new Error("Missing required app elements.");
}

const app = appElement;
const form = formElement;
const input = inputElement;
const tooltip = tooltipElement;
const sourceSelect = sourceSelectElement;

const TOKEN_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const DEFAULT_SOURCE_ID = "kjv";
const REDIRECT_PARAM = "__redirect";

type Verse = {
  id: number;
  bookCode: string;
  bookName: string;
  chapter: number;
  verse: number;
  reference: string;
  url: string;
  text: string;
};

type SourceMetadata = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  sourceUrl: string;
  archiveUrl: string;
  license: string;
  licenseUrl: string;
};

type SourceStats = {
  verseCount: number;
  indexedWordCount: number;
};

type SourceCatalog = {
  defaultSourceId: string;
  sources: Array<SourceMetadata & { stats: SourceStats }>;
};

type WordIndexPayload = {
  source: SourceMetadata;
  stats: SourceStats;
  words: Record<string, number[]>;
};

type VersePayload = {
  source: SourceMetadata;
  stats: SourceStats;
  verses: Verse[];
  verseById?: Map<number, Verse>;
};

type TextPart =
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

type Route =
  | { type: "home"; sourceId: string }
  | { type: "tweet"; username: string; statusId: string; canonicalUrl: string; sourceId: string }
  | { type: "word"; word: string; sourceId: string }
  | { type: "notFound"; sourceId: string };

type TweetEmbed = {
  html: string;
  text: string;
};

declare global {
  interface Window {
    twttr?: {
      widgets?: {
        load: (element?: Element | null) => void;
      };
    };
  }
}

const dataState: {
  catalogPromise: Promise<SourceCatalog> | null;
  catalogPayload: SourceCatalog | null;
  wordsBySource: Map<string, Promise<WordIndexPayload> | WordIndexPayload>;
  versesBySource: Map<string, Promise<VersePayload> | VersePayload>;
} = {
  catalogPromise: null,
  catalogPayload: null,
  wordsBySource: new Map(),
  versesBySource: new Map()
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function normalizeWord(word: string): string {
  return word
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase();
}

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

function getWordCandidates(word: string): string[] {
  const candidates = new Set<string>();
  const normalized = normalizeWord(word);
  if (!normalized) {
    return [];
  }

  candidates.add(normalized);

  for (const irregular of IRREGULAR_NORMALIZATIONS[normalized] ?? []) {
    candidates.add(irregular);
  }

  if (normalized.endsWith("ies") && normalized.length > 3) {
    candidates.add(`${normalized.slice(0, -3)}y`);
  }

  if (normalized.endsWith("es") && normalized.length > 3) {
    candidates.add(normalized.slice(0, -2));
  }

  if (normalized.endsWith("s") && normalized.length > 2) {
    candidates.add(normalized.slice(0, -1));
  }

  if (normalized.endsWith("ing") && normalized.length > 5) {
    const stem = normalized.slice(0, -3);
    candidates.add(stem);
    candidates.add(`${stem}e`);
    if (stem.length > 1 && stem.at(-1) === stem.at(-2)) {
      candidates.add(stem.slice(0, -1));
    }
  }

  if (normalized.endsWith("ied") && normalized.length > 4) {
    candidates.add(`${normalized.slice(0, -3)}y`);
  }

  if (normalized.endsWith("ed") && normalized.length > 4) {
    const stem = normalized.slice(0, -2);
    candidates.add(stem);
    candidates.add(`${stem}e`);
    if (stem.length > 1 && stem.at(-1) === stem.at(-2)) {
      candidates.add(stem.slice(0, -1));
    }
  }

  return [...candidates];
}

function resolveWordMatch(
  rawWord: string,
  wordData: WordIndexPayload
): {
  normalized: string;
  matchedWord: string | null;
  matchedWords: string[];
  matchType: "exact" | "normalized" | "missing";
  matchLabel: string | null;
  verseIds: number[];
} {
  const candidates = getWordCandidates(rawWord);
  const normalized = candidates[0] ?? normalizeWord(rawWord);
  const contractionExpansion = CONTRACTION_EXPANSIONS[normalized];

  if (contractionExpansion?.length) {
    const expandedVerseIds = contractionExpansion
      .map((candidate) => wordData.words[candidate] ?? [])
      .flat();

    if (expandedVerseIds.length) {
      return {
        normalized,
        matchedWord: contractionExpansion.join(" "),
        matchedWords: contractionExpansion,
        matchType: "normalized",
        matchLabel: `Inexact match: expanded to ${contractionExpansion.join(" ")}`,
        verseIds: [...new Set(expandedVerseIds)]
      };
    }
  }

  for (const [index, candidate] of candidates.entries()) {
    const verseIds = wordData.words[candidate];
    if (!verseIds?.length) {
      continue;
    }

    return {
      normalized,
      matchedWord: candidate,
      matchedWords: [candidate],
      matchType: index === 0 ? "exact" : "normalized",
      matchLabel: index === 0 ? null : `Inexact match: matched as ${candidate}`,
      verseIds
    };
  }

  return {
    normalized,
    matchedWord: null,
    matchedWords: [],
    matchType: "missing",
    matchLabel: null,
    verseIds: []
  };
}

function parseTweetUrl(value: string): { username: string; statusId: string; canonicalUrl: string } | null {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.replace(/^www\./, "");
    if (!["x.com", "twitter.com"].includes(host)) {
      return null;
    }

    const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (!match) {
      return null;
    }

    const [, username, statusId] = match;
    return {
      username,
      statusId,
      canonicalUrl: `https://x.com/${username}/status/${statusId}`
    };
  } catch {
    return null;
  }
}

function extractTweetText(node: Node | null): string {
  if (!node) {
    return "";
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  if (node.nodeName === "IMG" || node.nodeName === "A") {
    return "[...]";
  }

  if (node.nodeName === "BR") {
    return "\n";
  }

  return Array.from(node.childNodes, (childNode) => extractTweetText(childNode)).join("");
}

async function loadSourceCatalog(): Promise<SourceCatalog> {
  if (dataState.catalogPayload) {
    return dataState.catalogPayload;
  }

  if (!dataState.catalogPromise) {
    dataState.catalogPromise = fetch("/data/sources.json").then(async (response) => {
      if (!response.ok) {
        throw new Error("Failed to load Bible source catalog.");
      }

      const payload = (await response.json()) as SourceCatalog;
      dataState.catalogPayload = payload;
      return payload;
    });
  }

  return dataState.catalogPromise;
}

async function loadWordIndex(sourceId: string): Promise<WordIndexPayload> {
  const cached = dataState.wordsBySource.get(sourceId);
  if (cached) {
    return cached;
  }

  const promise = fetch(`/data/${sourceId}/words.json`).then(async (response) => {
    if (!response.ok) {
      throw new Error("Failed to load Bible index.");
    }

    const payload = (await response.json()) as WordIndexPayload;
    dataState.wordsBySource.set(sourceId, payload);
    return payload;
  });

  dataState.wordsBySource.set(sourceId, promise);
  return promise;
}

async function loadVerses(sourceId: string): Promise<VersePayload> {
  const cached = dataState.versesBySource.get(sourceId);
  if (cached) {
    return cached;
  }

  const promise = fetch(`/data/${sourceId}/verses.json`).then(async (response) => {
    if (!response.ok) {
      throw new Error("Failed to load verse data.");
    }

    const payload = (await response.json()) as VersePayload;
    payload.verseById = new Map(payload.verses.map((verse) => [verse.id, verse]));
    dataState.versesBySource.set(sourceId, payload);
    return payload;
  });

  dataState.versesBySource.set(sourceId, promise);
  return promise;
}

function buildAnalyzedText(text: string, wordData: WordIndexPayload): TextPart[] {
  const parts: TextPart[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const [rawWord] = match;
    const start = match.index ?? 0;
    const end = start + rawWord.length;
    const resolved = resolveWordMatch(rawWord, wordData);
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

function sampleVerses(verseIds: number[], verseData: VersePayload, count = 5): Verse[] {
  const shuffled = [...verseIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled
    .slice(0, count)
    .map((id) => verseData.verseById?.get(id))
    .filter((verse): verse is Verse => Boolean(verse));
}

function getRandomVerse(verseData: VersePayload): Verse {
  return verseData.verses[Math.floor(Math.random() * verseData.verses.length)];
}

async function renderErrorState({
  title,
  message,
  sourceId = DEFAULT_SOURCE_ID
}: {
  title: string;
  message: string;
  sourceId?: string;
}): Promise<void> {
  let verseMarkup = "";

  try {
    const verseData = await loadVerses(sourceId);
    const verse = getRandomVerse(verseData);
    verseMarkup = `
      <aside class="error-verse">
        <p class="error-verse__eyebrow">Random verse from ${escapeHtml(verseData.source.shortName)}</p>
        <a class="error-verse__link" href="${verse.url}" target="_blank" rel="noreferrer">${escapeHtml(verse.reference)}</a>
        <p class="error-verse__text">${escapeHtml(verse.text)}</p>
      </aside>
    `;
  } catch {
    verseMarkup = "";
  }

  app.innerHTML = `
    <section class="panel panel--error">
      <p class="error-code">Error</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      ${verseMarkup}
    </section>
  `;
}

function showTooltip(target: HTMLElement, verses: Verse[], matchLabel?: string | null): void {
  if (!verses.length) {
    tooltip.hidden = true;
    return;
  }

  const matchNote = matchLabel ? `<p class="tooltip__label">${escapeHtml(matchLabel)}</p>` : "";
  tooltip.innerHTML =
    matchNote +
    verses
      .map(
        (verse) => `
          <a class="tooltip__verse" href="${verse.url}" target="_blank" rel="noreferrer">
            <strong>${escapeHtml(verse.reference)}</strong>
            <span>${escapeHtml(verse.text)}</span>
          </a>
        `
      )
      .join("");

  const rect = target.getBoundingClientRect();
  tooltip.style.left = `${Math.min(window.innerWidth - 340, Math.max(16, rect.left + window.scrollX))}px`;
  tooltip.style.top = `${rect.bottom + window.scrollY + 12}px`;
  tooltip.hidden = false;
}

function hideTooltip(): void {
  tooltip.hidden = true;
}

function renderHome(): void {
  app.innerHTML = `
    <section class="panel">
      <h1>Paste a tweet URL</h1>
      <p>
        Public tweet links from <code>x.com</code> or <code>twitter.com</code> are supported.
        The app embeds the tweet, extracts the visible tweet text, and checks each word against the selected local Bible index.
      </p>
      <p class="muted">
        If X refuses to return embed data for a tweet, this static version cannot recover it server-side.
      </p>
    </section>
  `;
}

async function syncSourceSelect(selectedSourceId: string): Promise<void> {
  const catalog = await loadSourceCatalog();
  sourceSelect.innerHTML = catalog.sources
    .map(
      (source) => `
        <option value="${source.id}">${escapeHtml(source.shortName)}: ${escapeHtml(source.name)}</option>
      `
    )
    .join("");
  sourceSelect.value = catalog.sources.some((source) => source.id === selectedSourceId)
    ? selectedSourceId
    : catalog.defaultSourceId;
}

async function fetchTweetEmbed(tweetUrl: string): Promise<TweetEmbed> {
  const endpoint = new URL("https://publish.twitter.com/oembed");
  endpoint.searchParams.set("url", tweetUrl);
  endpoint.searchParams.set("omit_script", "1");
  endpoint.searchParams.set("dnt", "true");
  endpoint.searchParams.set("align", "center");

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Tweet lookup failed with ${response.status}.`);
  }

  const payload = (await response.json()) as { html: string };
  const parser = new DOMParser();
  const documentFragment = parser.parseFromString(payload.html, "text/html");
  const text = extractTweetText(documentFragment.querySelector("blockquote p")).trim();

  return {
    html: payload.html,
    text
  };
}

async function renderTweetRoute(route: Extract<Route, { type: "tweet" }>): Promise<void> {
  await syncSourceSelect(route.sourceId);
  input.value = route.canonicalUrl;
  app.innerHTML = `
    <section class="panel loading">
      <p>Loading tweet and Bible index…</p>
    </section>
  `;

  try {
    const [tweet, bibleData] = await Promise.all([
      fetchTweetEmbed(route.canonicalUrl),
      loadWordIndex(route.sourceId)
    ]);

    const text = tweet.text;
    const analyzed = buildAnalyzedText(text, bibleData);
    const inBibleCount = analyzed.filter((part) => part.type === "word" && part.inBible).length;
    const missingCount = analyzed.filter((part) => part.type === "word" && !part.inBible).length;

    app.innerHTML = `
      <section class="panel">
        <div class="stats">
          <span>${escapeHtml(bibleData.source.shortName)}</span>
          <span>${inBibleCount} words in the Bible</span>
          <span>${missingCount} words not in the Bible</span>
        </div>
        ${
          text
            ? `<p class="tweet-text" id="tweet-text"></p>`
            : `<p class="muted">The embed loaded, but the tweet text could not be extracted from the oEmbed HTML.</p>`
        }
      </section>
      <section class="panel">
        <div id="tweet-embed" class="tweet-embed">${tweet.html}</div>
      </section>
    `;

    const textContainer = document.querySelector<HTMLElement>("#tweet-text");
    if (textContainer) {
      const fragment = document.createDocumentFragment();

      for (const part of analyzed) {
        if (part.type === "text") {
          fragment.append(document.createTextNode(part.value));
          continue;
        }

        const element = document.createElement(part.inBible ? "a" : "span");
        element.className = part.inBible ? "word word--present" : "word word--missing";
        if (part.matchType === "normalized") {
          element.classList.add("word--normalized");
          element.title = part.matchLabel ?? "Inexact match";
        }
        element.textContent = part.rawWord;

        if (part.inBible && element instanceof HTMLAnchorElement) {
          const linkedWord =
            part.matchedWords.length === 1 ? part.matchedWords[0] : part.normalized;
          element.href = `/word/${encodeURIComponent(linkedWord)}?source=${encodeURIComponent(route.sourceId)}`;
          element.dataset.word = linkedWord;
          element.addEventListener("mouseenter", async () => {
            const data = await loadVerses(route.sourceId);
            showTooltip(element, sampleVerses(part.verseIds, data), part.matchLabel);
          });
          element.addEventListener("mouseleave", hideTooltip);
          element.addEventListener("focus", async () => {
            const data = await loadVerses(route.sourceId);
            showTooltip(element, sampleVerses(part.verseIds, data), part.matchLabel);
          });
          element.addEventListener("blur", hideTooltip);
        }

        fragment.append(element);
      }

      textContainer.replaceChildren(fragment);
    }

    window.twttr?.widgets?.load(document.querySelector("#tweet-embed"));
  } catch {
    await renderErrorState({
      title: "Couldn't find tweet",
      message: "Couldn't find tweet",
      sourceId: route.sourceId
    });
  }
}

async function renderWordRoute(route: Extract<Route, { type: "word" }>): Promise<void> {
  await syncSourceSelect(route.sourceId);
  app.innerHTML = `
    <section class="panel loading">
      <p>Loading verses…</p>
    </section>
  `;

  try {
    const [wordData, verseData] = await Promise.all([
      loadWordIndex(route.sourceId),
      loadVerses(route.sourceId)
    ]);
    const resolved = resolveWordMatch(route.word, wordData);
    const displayWord = resolved.matchedWord ?? resolved.normalized;
    const verseIds = resolved.verseIds;
    const normalizationNote =
      resolved.matchType === "normalized" && resolved.matchLabel
        ? `<p class="muted">Matched <code>${escapeHtml(route.word)}</code> as <code>${escapeHtml(
            displayWord
          )}</code>.</p>`
        : "";

    if (!verseIds.length) {
      app.innerHTML = `
        <section class="panel">
          <h1>${escapeHtml(resolved.normalized)} <span class="source-tag">${escapeHtml(
            wordData.source.shortName
          )}</span></h1>
          <p>This word does not appear in the indexed Bible text.</p>
        </section>
      `;
      return;
    }

    const verses = verseIds
      .map((id) => verseData.verseById?.get(id))
      .filter((verse): verse is Verse => Boolean(verse));

    app.innerHTML = `
      <section class="panel">
        <h1>${escapeHtml(displayWord)} <span class="source-tag">${escapeHtml(wordData.source.shortName)}</span></h1>
        ${normalizationNote}
        <p>${verses.length} verse references found in ${escapeHtml(wordData.source.name)}.</p>
        <div class="verse-list">
          ${verses
            .map(
              (verse) => `
                <article class="verse-card">
                  <a href="${verse.url}" target="_blank" rel="noreferrer">${escapeHtml(verse.reference)}</a>
                  <p>${escapeHtml(verse.text)}</p>
                </article>
              `
            )
            .join("")}
        </div>
      </section>
    `;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await renderErrorState({
      title: "Word lookup failed",
      message,
      sourceId: route.sourceId
    });
  }
}

function parsePath(pathname: string, search = window.location.search): Route {
  const params = new URLSearchParams(search);
  const requestedSourceId = params.get("source") || localStorage.getItem("preferredBibleSource") || DEFAULT_SOURCE_ID;
  const tweetMatch = pathname.match(/^\/([^/]+)\/status\/(\d+)\/?$/);
  if (tweetMatch) {
    const [, username, statusId] = tweetMatch;
    return {
      type: "tweet",
      username,
      statusId,
      canonicalUrl: `https://x.com/${username}/status/${statusId}`,
      sourceId: requestedSourceId
    };
  }

  const wordMatch = pathname.match(/^\/word\/([^/]+)\/?$/);
  if (wordMatch) {
    return {
      type: "word",
      word: decodeURIComponent(wordMatch[1]),
      sourceId: requestedSourceId
    };
  }

  if (pathname === "/" || pathname === "") {
    return { type: "home", sourceId: requestedSourceId };
  }

  return { type: "notFound", sourceId: requestedSourceId };
}

function restoreRedirectedPath(): void {
  const url = new URL(window.location.href);
  const redirectedPath = url.searchParams.get(REDIRECT_PARAM);

  if (!redirectedPath) {
    return;
  }

  const restored = new URL(redirectedPath, window.location.origin);
  if (restored.origin !== window.location.origin) {
    return;
  }

  window.history.replaceState({}, "", `${restored.pathname}${restored.search}${restored.hash}`);
}

async function renderRoute(): Promise<void> {
  hideTooltip();
  const route = parsePath(window.location.pathname, window.location.search);
  await syncSourceSelect(route.sourceId);

  if (route.type === "tweet") {
    await renderTweetRoute(route);
    return;
  }

  if (route.type === "word") {
    await renderWordRoute(route);
    return;
  }

  if (route.type === "notFound") {
    await renderErrorState({
      title: "Page not found",
      message: "Page not found",
      sourceId: route.sourceId
    });
    return;
  }

  renderHome();
}

function navigate(pathname: string, sourceId = sourceSelect.value || DEFAULT_SOURCE_ID): void {
  const search = sourceId && sourceId !== DEFAULT_SOURCE_ID ? `?source=${encodeURIComponent(sourceId)}` : "";
  localStorage.setItem("preferredBibleSource", sourceId);
  window.history.pushState({}, "", `${pathname}${search}`);
  void renderRoute();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const parsed = parseTweetUrl(input.value);
  if (!parsed) {
    input.setCustomValidity("Enter a public x.com or twitter.com status URL.");
    input.reportValidity();
    return;
  }

  input.setCustomValidity("");
  navigate(`/${parsed.username}/status/${parsed.statusId}`, sourceSelect.value || DEFAULT_SOURCE_ID);
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const link = target.closest<HTMLAnchorElement>("a[href^='/']");
  if (!link || link.target === "_blank") {
    return;
  }

  const url = new URL(link.href);
  event.preventDefault();
  const nextSourceId = url.searchParams.get("source") || sourceSelect.value || DEFAULT_SOURCE_ID;
  navigate(url.pathname, nextSourceId);
});

sourceSelect.addEventListener("change", () => {
  const route = parsePath(window.location.pathname, window.location.search);
  navigate(window.location.pathname, sourceSelect.value || route.sourceId || DEFAULT_SOURCE_ID);
});

window.addEventListener("popstate", () => {
  void renderRoute();
});

window.addEventListener("scroll", hideTooltip, { passive: true });
window.addEventListener("resize", hideTooltip);

restoreRedirectedPath();
void renderRoute();
