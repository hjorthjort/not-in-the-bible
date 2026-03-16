export {};

import { renderHighlightedVerseText } from "./lib/verse-highlight.js";
import { SOCIAL_NETWORK_LABELS, type SocialNetworkId, isSupportedSocialUrl } from "./lib/social-url.js";
import { sortVersesByBibleOrder } from "./lib/verse-order.js";
import { buildAnalyzedText, resolveWordMatch } from "./lib/word-match.js";

const appElement = document.querySelector<HTMLElement>("#app");
const formElement = document.querySelector<HTMLFormElement>("#tweet-form");
const inputElement = document.querySelector<HTMLInputElement>("#tweet-url");
const tooltipElement = document.querySelector<HTMLElement>("#tooltip");
const sourceSelectElement = document.querySelector<HTMLSelectElement>("#bible-source");
const sourceNameElement = document.querySelector<HTMLElement>("#bible-source-name");
const sourceShortElement = document.querySelector<HTMLElement>("#bible-source-short");

if (
  !appElement ||
  !formElement ||
  !inputElement ||
  !tooltipElement ||
  !sourceSelectElement ||
  !sourceNameElement ||
  !sourceShortElement
) {
  throw new Error("Missing required app elements.");
}

const app = appElement;
const form = formElement;
const input = inputElement;
const tooltip = tooltipElement;
const sourceSelect = sourceSelectElement;
const sourceName = sourceNameElement;
const sourceShort = sourceShortElement;

const DEFAULT_SOURCE_ID = "kjv";
const POST_URL_PARAM = "url";
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
  | { type: "post"; socialUrl: string; sourceId: string }
  | { type: "word"; word: string; sourceId: string }
  | { type: "notFound"; sourceId: string };

type SocialEmbed = {
  canonicalUrl: string;
  html: string;
  network: SocialNetworkId;
  text: string;
};

type AppConfig = {
  enableWordNormalization: boolean;
};

type EmbeddedScript = {
  async: boolean;
  charset: string | null;
  src: string;
};

declare global {
  interface Window {
    __APP_CONFIG__?: Partial<AppConfig>;
    bluesky?: {
      scan: (element?: ParentNode) => void;
    };
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

const scriptPromises = new Map<string, Promise<void>>();

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

function parseLegacyXPath(pathname: string): string | null {
  const match = pathname.match(/^\/([^/]+)\/status\/(\d+)\/?$/);
  if (!match) {
    return null;
  }

  const [, username, statusId] = match;
  return `https://x.com/${username}/status/${statusId}`;
}

function persistSourceId(sourceId: string): void {
  localStorage.setItem("preferredBibleSource", sourceId);
}

function buildSearch(
  sourceId: string,
  extraParams: Record<string, string | null | undefined> = {}
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(extraParams)) {
    if (value) {
      params.set(key, value);
    }
  }

  if (sourceId && sourceId !== DEFAULT_SOURCE_ID) {
    params.set("source", sourceId);
  }

  const search = params.toString();
  return search ? `?${search}` : "";
}

function buildPostHref(postUrl: string, sourceId: string): string {
  return `/post${buildSearch(sourceId, { [POST_URL_PARAM]: postUrl })}`;
}

function navigate(
  pathname: string,
  sourceId = sourceSelect.value || DEFAULT_SOURCE_ID,
  extraParams: Record<string, string | null | undefined> = {}
): void {
  persistSourceId(sourceId);
  window.history.pushState({}, "", `${pathname}${buildSearch(sourceId, extraParams)}`);
  void renderRoute();
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
      <h1>Paste a post URL</h1>
      <p>
        Public post links from supported networks are embedded and checked against the selected local Bible index.
      </p>
      <p class="muted">Legacy X status paths still work and redirect into the new post view.</p>
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
    const optionLabel = `${source.shortName}: ${source.name}`;
    option.value = source.id;
    option.label = optionLabel;
    option.textContent = optionLabel;
    option.dataset.fullName = source.name;
    option.dataset.shortName = source.shortName;
    option.selected = source.id === resolvedSourceId;
    options.append(option);
    longestShortName = Math.max(longestShortName, source.shortName.length);
  }

  sourceSelect.replaceChildren(options);
  sourceSelect.value = resolvedSourceId;
  sourceSelect.style.setProperty("--source-select-chars", String(Math.max(longestShortName, 4)));

  const selectedOption = sourceSelect.selectedOptions.item(0);
  const selectedSourceName = selectedOption?.dataset.fullName ?? "";
  const selectedSourceShortName = selectedOption?.dataset.shortName ?? "";
  sourceName.textContent = selectedSourceName;
  sourceShort.textContent = selectedSourceShortName;
  sourceSelect.title = selectedSourceName;
}

async function fetchSocialEmbed(postUrl: string): Promise<SocialEmbed> {
  const endpoint = new URL("/api/embed", window.location.origin);
  endpoint.searchParams.set("url", postUrl);

  const response = await fetch(endpoint);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Post lookup failed with ${response.status}.`);
  }

  return (await response.json()) as SocialEmbed;
}

function splitEmbedHtml(html: string): { markup: string; scripts: EmbeddedScript[] } {
  const scripts: EmbeddedScript[] = [];
  const markup = html.replace(/<script\b([^>]*)>(?:[\s\S]*?)<\/script>/gi, (_match, attributes) => {
    const srcMatch = attributes.match(/\bsrc=(["'])(.*?)\1/i);
    if (!srcMatch?.[2]) {
      return "";
    }

    const charsetMatch = attributes.match(/\bcharset=(["'])(.*?)\1/i);
    scripts.push({
      async: /\basync\b/i.test(attributes),
      charset: charsetMatch?.[2] ?? null,
      src: srcMatch[2]
    });
    return "";
  });

  return {
    markup,
    scripts
  };
}

async function loadScriptOnce(src: string, charset: string | null = null): Promise<void> {
  const cached = scriptPromises.get(src);
  if (cached) {
    return cached;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CSS.escape(src)}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    if (charset) {
      script.charset = charset;
    }
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.append(script);
  });

  scriptPromises.set(src, promise);
  return promise;
}

async function executeEmbedScript(script: EmbeddedScript): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const element = document.createElement("script");
    element.src = script.src;
    element.async = script.async;
    if (script.charset) {
      element.charset = script.charset;
    }
    element.addEventListener(
      "load",
      () => {
        element.remove();
        resolve();
      },
      { once: true }
    );
    element.addEventListener(
      "error",
      () => {
        element.remove();
        reject(new Error(`Failed to execute ${script.src}`));
      },
      { once: true }
    );
    document.body.append(element);
  });
}

async function mountPostEmbed(container: HTMLElement, embed: SocialEmbed): Promise<void> {
  const { markup, scripts } = splitEmbedHtml(embed.html);
  container.innerHTML = markup;

  if (embed.network === "x") {
    await loadScriptOnce("https://platform.twitter.com/widgets.js", "utf-8");
    window.twttr?.widgets?.load(container);
    return;
  }

  if (embed.network === "bluesky" && window.bluesky?.scan) {
    window.bluesky.scan(container);
    return;
  }

  for (const script of scripts) {
    if (embed.network === "bluesky") {
      await loadScriptOnce(script.src, script.charset);
      window.bluesky?.scan?.(container);
      continue;
    }

    await executeEmbedScript(script);
  }
}

function renderAnalyzedText(
  container: HTMLElement,
  text: string,
  sourceId: string,
  wordLookup: Record<string, number[]>
): void {
  const analyzed = buildAnalyzedText(text, wordLookup, wordMatchOptions);
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
      const linkedWord = part.matchedWords.length === 1 ? part.matchedWords[0] : part.normalized;
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

  container.replaceChildren(fragment);
}

async function renderPostRoute(route: Extract<Route, { type: "post" }>): Promise<void> {
  const catalog = await loadSourceCatalog();
  const sourceId = resolveSourceId(catalog, route.sourceId);
  await syncSourceSelect(sourceId);
  input.value = route.socialUrl;
  app.innerHTML = `
    <section class="panel loading">
      <p>Loading post and Bible index…</p>
    </section>
  `;

  try {
    const [embed, bibleData] = await Promise.all([
      fetchSocialEmbed(route.socialUrl),
      loadWordIndex(sourceId)
    ]);

    const analyzed = buildAnalyzedText(embed.text, bibleData.words, wordMatchOptions);
    const inBibleCount = analyzed.filter((part) => part.type === "word" && part.inBible).length;
    const missingCount = analyzed.filter((part) => part.type === "word" && !part.inBible).length;
    const networkLabel = SOCIAL_NETWORK_LABELS[embed.network];

    app.innerHTML = `
      <section class="panel">
        <div class="stats">
          <span>${escapeHtml(bibleData.source.shortName)}</span>
          <span>${escapeHtml(networkLabel)}</span>
          <span>${inBibleCount} words in the Bible</span>
          <span>${missingCount} words not in the Bible</span>
        </div>
        ${
          embed.text
            ? `<p class="post-text" id="post-text"></p>`
            : `<p class="muted">The embed loaded, but no public text could be extracted from this post.</p>`
        }
      </section>
      <section class="panel">
        <div id="post-embed" class="post-embed"></div>
      </section>
    `;

    const textContainer = document.querySelector<HTMLElement>("#post-text");
    if (textContainer) {
      renderAnalyzedText(textContainer, embed.text, sourceId, bibleData.words);
    }

    const embedContainer = document.querySelector<HTMLElement>("#post-embed");
    if (embedContainer) {
      await mountPostEmbed(embedContainer, embed);
    }

    input.value = embed.canonicalUrl;
    if (window.location.pathname === "/post" && embed.canonicalUrl !== route.socialUrl) {
      persistSourceId(sourceId);
      window.history.replaceState({}, "", buildPostHref(embed.canonicalUrl, sourceId));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load that post.";
    await renderErrorState({
      title: "Couldn't load post",
      message,
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
    const [wordData, verseData] = await Promise.all([loadWordIndex(sourceId), loadVerses(sourceId)]);
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
  const postUrl = params.get(POST_URL_PARAM);

  if (pathname === "/post" && postUrl) {
    return {
      type: "post",
      socialUrl: postUrl,
      sourceId: requestedSourceId
    };
  }

  const legacyXUrl = parseLegacyXPath(pathname);
  if (legacyXUrl) {
    return {
      type: "post",
      socialUrl: legacyXUrl,
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

  if (route.type === "post") {
    await renderPostRoute({ ...route, sourceId });
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

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const submittedUrl = input.value.trim();
  if (!isSupportedSocialUrl(submittedUrl)) {
    input.setCustomValidity("Enter a supported public post URL.");
    input.reportValidity();
    return;
  }

  input.setCustomValidity("");
  navigate("/post", sourceSelect.value || DEFAULT_SOURCE_ID, { [POST_URL_PARAM]: submittedUrl });
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
  window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  void renderRoute();
});

sourceSelect.addEventListener("change", () => {
  const selectedOption = sourceSelect.selectedOptions.item(0);
  const selectedSourceName = selectedOption?.dataset.fullName ?? "";
  const selectedSourceShortName = selectedOption?.dataset.shortName ?? "";
  const nextSourceId = sourceSelect.value || DEFAULT_SOURCE_ID;

  sourceName.textContent = selectedSourceName;
  sourceShort.textContent = selectedSourceShortName;
  sourceSelect.title = selectedSourceName;

  const route = parsePath(window.location.pathname, window.location.search);
  if (route.type === "post") {
    navigate("/post", nextSourceId, { [POST_URL_PARAM]: route.socialUrl });
    return;
  }

  navigate(window.location.pathname, nextSourceId);
});

window.addEventListener("popstate", () => {
  void renderRoute();
});

window.addEventListener("scroll", hideTooltip, { passive: true });
window.addEventListener("resize", hideTooltip);

restoreRedirectedPath();
void renderRoute();
