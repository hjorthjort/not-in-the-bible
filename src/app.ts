export {};

import { buildAnalyzedText, resolveWordMatch } from "./lib/word-match.js";
import { renderHighlightedVerseText } from "./lib/verse-highlight.js";
import { sortVersesByBibleOrder } from "./lib/verse-order.js";
import { extractTweetTextFromHtml } from "./lib/tweet-analysis.js";

const appElement = document.querySelector<HTMLElement>("#app");
const formElement = document.querySelector<HTMLFormElement>("#tweet-form");
const inputElement = document.querySelector<HTMLInputElement>("#tweet-url");
const tooltipElement = document.querySelector<HTMLElement>("#tooltip");
const sourceSelectElement = document.querySelector<HTMLSelectElement>("#bible-source");
const sourceNameElement = document.querySelector<HTMLElement>("#bible-source-name");

if (!appElement || !formElement || !inputElement || !tooltipElement || !sourceSelectElement || !sourceNameElement) {
  throw new Error("Missing required app elements.");
}

const app = appElement;
const form = formElement;
const input = inputElement;
const tooltip = tooltipElement;
const sourceSelect = sourceSelectElement;
const sourceName = sourceNameElement;

const DEFAULT_SOURCE_ID = "kjv";
const REDIRECT_PARAM = "__redirect";
const DEFAULT_APP_CONFIG: AppConfig = {
  enableWordNormalization: true
};

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

type Route =
  | { type: "home"; sourceId: string }
  | { type: "tweet"; username: string; statusId: string; canonicalUrl: string; sourceId: string }
  | { type: "word"; word: string; sourceId: string }
  | { type: "notFound"; sourceId: string };

type TweetEmbed = {
  html: string;
  text: string;
};

type AppConfig = {
  enableWordNormalization: boolean;
};

declare global {
  interface Window {
    __APP_CONFIG__?: Partial<AppConfig>;
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

function loadAppConfig(): AppConfig {
  const runtimeConfig = window.__APP_CONFIG__;

  return {
    enableWordNormalization:
      typeof runtimeConfig?.enableWordNormalization === "boolean"
        ? runtimeConfig.enableWordNormalization
        : DEFAULT_APP_CONFIG.enableWordNormalization
  };
}

const appConfig = loadAppConfig();
const wordMatchOptions = {
  enableNormalization: appConfig.enableWordNormalization
};

function resolveSourceId(catalog: SourceCatalog, requestedSourceId: string | null | undefined): string {
  if (requestedSourceId && catalog.sources.some((source) => source.id === requestedSourceId)) {
    return requestedSourceId;
  }

  return catalog.defaultSourceId;
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

function showTooltip(
  target: HTMLElement,
  verses: Verse[],
  matchedWords: string[],
  matchLabel?: string | null
): void {
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
            <span>${renderHighlightedVerseText(verse.text, matchedWords)}</span>
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
  const resolvedSourceId = resolveSourceId(catalog, selectedSourceId);
  const options = document.createDocumentFragment();
  let longestShortName = 0;

  for (const source of catalog.sources) {
    const option = document.createElement("option");
    const optionLabel = source.shortName;
    option.value = source.id;
    option.label = optionLabel;
    option.textContent = optionLabel;
    option.dataset.fullName = source.name;
    option.selected = source.id === resolvedSourceId;
    options.append(option);
    longestShortName = Math.max(longestShortName, source.shortName.length);
  }

  sourceSelect.replaceChildren(options);
  sourceSelect.value = resolvedSourceId;
  sourceSelect.style.setProperty("--source-select-chars", String(Math.max(longestShortName, 4)));

  const selectedOption = sourceSelect.selectedOptions.item(0);
  const selectedSourceName = selectedOption?.dataset.fullName ?? "";
  sourceName.textContent = selectedSourceName;
  sourceSelect.title = selectedSourceName;
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
  const text = extractTweetTextFromHtml(payload.html);

  return {
    html: payload.html,
    text
  };
}

async function renderTweetRoute(route: Extract<Route, { type: "tweet" }>): Promise<void> {
  const catalog = await loadSourceCatalog();
  const sourceId = resolveSourceId(catalog, route.sourceId);
  await syncSourceSelect(sourceId);
  input.value = route.canonicalUrl;
  app.innerHTML = `
    <section class="panel loading">
      <p>Loading tweet and Bible index…</p>
    </section>
  `;

  try {
    const [tweet, bibleData] = await Promise.all([
      fetchTweetEmbed(route.canonicalUrl),
      loadWordIndex(sourceId)
    ]);

    const text = tweet.text;
    const analyzed = buildAnalyzedText(text, bibleData.words, wordMatchOptions);
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
          element.href = `/word/${encodeURIComponent(linkedWord)}?source=${encodeURIComponent(sourceId)}`;
          element.dataset.word = linkedWord;
          element.addEventListener("mouseenter", async () => {
            const data = await loadVerses(sourceId);
            showTooltip(element, sampleVerses(part.verseIds, data), part.matchedWords, part.matchLabel);
          });
          element.addEventListener("mouseleave", hideTooltip);
          element.addEventListener("focus", async () => {
            const data = await loadVerses(sourceId);
            showTooltip(element, sampleVerses(part.verseIds, data), part.matchedWords, part.matchLabel);
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
      sourceId
    });
  }
}

async function renderWordRoute(route: Extract<Route, { type: "word" }>): Promise<void> {
  const catalog = await loadSourceCatalog();
  const sourceId = resolveSourceId(catalog, route.sourceId);
  await syncSourceSelect(sourceId);
  app.innerHTML = `
    <section class="panel loading">
      <p>Loading verses…</p>
    </section>
  `;

  try {
    const [wordData, verseData] = await Promise.all([
      loadWordIndex(sourceId),
      loadVerses(sourceId)
    ]);
    const resolved = resolveWordMatch(route.word, wordData.words, wordMatchOptions);
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

    const verses = sortVersesByBibleOrder(
      verseIds
        .map((id) => verseData.verseById?.get(id))
        .filter((verse): verse is Verse => Boolean(verse))
    );

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
                  <p>${renderHighlightedVerseText(verse.text, resolved.matchedWords)}</p>
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
      sourceId
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
  const catalog = await loadSourceCatalog();
  const sourceId = resolveSourceId(catalog, route.sourceId);
  await syncSourceSelect(sourceId);

  if (route.type === "tweet") {
    await renderTweetRoute({ ...route, sourceId });
    return;
  }

  if (route.type === "word") {
    await renderWordRoute({ ...route, sourceId });
    return;
  }

  if (route.type === "notFound") {
    await renderErrorState({
      title: "Page not found",
      message: "Page not found",
      sourceId
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
  const selectedOption = sourceSelect.selectedOptions.item(0);
  const selectedSourceName = selectedOption?.dataset.fullName ?? "";
  sourceName.textContent = selectedSourceName;
  sourceSelect.title = selectedSourceName;
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
