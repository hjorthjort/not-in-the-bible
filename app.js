const app = document.querySelector("#app");
const form = document.querySelector("#tweet-form");
const input = document.querySelector("#tweet-url");
const tooltip = document.querySelector("#tooltip");
const sourceSelect = document.querySelector("#bible-source");

const TOKEN_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const DEFAULT_SOURCE_ID = "kjv";
const dataState = {
  catalogPromise: null,
  catalogPayload: null,
  wordsBySource: new Map(),
  versesBySource: new Map()
};

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function normalizeWord(word) {
  return word
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase();
}

function parseTweetUrl(value) {
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

async function loadSourceCatalog() {
  if (dataState.catalogPayload) {
    return dataState.catalogPayload;
  }

  if (!dataState.catalogPromise) {
    dataState.catalogPromise = fetch("/data/sources.json").then(async (response) => {
      if (!response.ok) {
        throw new Error("Failed to load Bible source catalog.");
      }

      const payload = await response.json();
      dataState.catalogPayload = payload;
      return payload;
    });
  }

  return dataState.catalogPromise;
}

async function loadWordIndex(sourceId) {
  if (dataState.wordsBySource.has(sourceId)) {
    return dataState.wordsBySource.get(sourceId);
  }

  const promise = fetch(`/data/${sourceId}/words.json`).then(async (response) => {
    if (!response.ok) {
      throw new Error("Failed to load Bible index.");
    }

    const payload = await response.json();
    dataState.wordsBySource.set(sourceId, payload);
    return payload;
  });

  dataState.wordsBySource.set(sourceId, promise);
  return promise;
}

async function loadVerses(sourceId) {
  if (dataState.versesBySource.has(sourceId)) {
    return dataState.versesBySource.get(sourceId);
  }

  const promise = fetch(`/data/${sourceId}/verses.json`).then(async (response) => {
      if (!response.ok) {
        throw new Error("Failed to load verse data.");
      }

      const payload = await response.json();
      payload.verseById = new Map(payload.verses.map((verse) => [verse.id, verse]));
      dataState.versesBySource.set(sourceId, payload);
      return payload;
    });

  dataState.versesBySource.set(sourceId, promise);
  return promise;
}

function buildAnalyzedText(text, wordData) {
  const parts = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const [rawWord] = match;
    const start = match.index ?? 0;
    const end = start + rawWord.length;
    const normalized = normalizeWord(rawWord);
    const verseIds = wordData.words[normalized] ?? [];
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

function sampleVerses(verseIds, verseData, count = 5) {
  const shuffled = [...verseIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled.slice(0, count).map((id) => verseData.verseById.get(id));
}

function showTooltip(target, verses) {
  if (!verses.length) {
    tooltip.hidden = true;
    return;
  }

  tooltip.innerHTML = verses
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

function hideTooltip() {
  tooltip.hidden = true;
}

function renderHome() {
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

async function syncSourceSelect(selectedSourceId) {
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

async function fetchTweetEmbed(tweetUrl) {
  const endpoint = new URL("https://publish.twitter.com/oembed");
  endpoint.searchParams.set("url", tweetUrl);
  endpoint.searchParams.set("omit_script", "1");
  endpoint.searchParams.set("dnt", "true");
  endpoint.searchParams.set("align", "center");

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Tweet lookup failed with ${response.status}.`);
  }

  const payload = await response.json();
  const parser = new DOMParser();
  const documentFragment = parser.parseFromString(payload.html, "text/html");
  const text = documentFragment.querySelector("blockquote p")?.textContent?.trim() ?? "";

  return {
    html: payload.html,
    text
  };
}

async function renderTweetRoute(route) {
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
        <div id="tweet-embed" class="tweet-embed">${tweet.html}</div>
      </section>
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
    `;

    const textContainer = document.querySelector("#tweet-text");
    if (textContainer) {
      const fragment = document.createDocumentFragment();

      for (const part of analyzed) {
        if (part.type === "text") {
          fragment.append(document.createTextNode(part.value));
          continue;
        }

        const element = document.createElement(part.inBible ? "a" : "span");
        element.className = part.inBible ? "word word--present" : "word word--missing";
        element.textContent = part.rawWord;

        if (part.inBible) {
          element.href = `/word/${encodeURIComponent(part.normalized)}?source=${encodeURIComponent(route.sourceId)}`;
          element.dataset.word = part.normalized;
          element.addEventListener("mouseenter", async () => {
            const data = await loadVerses(route.sourceId);
            showTooltip(element, sampleVerses(part.verseIds, data));
          });
          element.addEventListener("mouseleave", hideTooltip);
          element.addEventListener("focus", async () => {
            const data = await loadVerses(route.sourceId);
            showTooltip(element, sampleVerses(part.verseIds, data));
          });
          element.addEventListener("blur", hideTooltip);
        }

        fragment.append(element);
      }

      textContainer.replaceChildren(fragment);
    }

    if (window.twttr?.widgets) {
      window.twttr.widgets.load(document.querySelector("#tweet-embed"));
    }
  } catch (error) {
    app.innerHTML = `
      <section class="panel">
        <h1>Tweet lookup failed</h1>
        <p>${escapeHtml(error.message)}</p>
        <p class="muted">
          For a purely static site, public oEmbed is the workable no-key path. If X stops returning oEmbed data, the fallback is adding a tiny serverless fetcher or manual paste mode.
        </p>
      </section>
    `;
  }
}

async function renderWordRoute(word) {
  const route = parsePath(window.location.pathname, window.location.search);
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
    const normalized = normalizeWord(word);
    const verseIds = wordData.words[normalized] ?? [];

    if (!verseIds.length) {
      app.innerHTML = `
        <section class="panel">
          <h1>${escapeHtml(normalized)} <span class="source-tag">${escapeHtml(wordData.source.shortName)}</span></h1>
          <p>This word does not appear in the indexed Bible text.</p>
        </section>
      `;
      return;
    }

    const verses = verseIds.map((id) => verseData.verseById.get(id));
    app.innerHTML = `
      <section class="panel">
        <h1>${escapeHtml(normalized)} <span class="source-tag">${escapeHtml(wordData.source.shortName)}</span></h1>
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
    app.innerHTML = `
      <section class="panel">
        <h1>Word lookup failed</h1>
        <p>${escapeHtml(error.message)}</p>
      </section>
    `;
  }
}

function parsePath(pathname, search = window.location.search) {
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

  return { type: "home", sourceId: requestedSourceId };
}

async function renderRoute() {
  hideTooltip();
  const route = parsePath(window.location.pathname, window.location.search);
  await syncSourceSelect(route.sourceId);

  if (route.type === "tweet") {
    await renderTweetRoute(route);
    return;
  }

  if (route.type === "word") {
    await renderWordRoute(route.word);
    return;
  }

  renderHome();
}

function navigate(pathname, sourceId = sourceSelect.value || DEFAULT_SOURCE_ID) {
  const search = sourceId && sourceId !== DEFAULT_SOURCE_ID ? `?source=${encodeURIComponent(sourceId)}` : "";
  localStorage.setItem("preferredBibleSource", sourceId);
  window.history.pushState({}, "", `${pathname}${search}`);
  renderRoute();
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
  const link = event.target.closest("a[href^='/']");
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
  renderRoute();
});

window.addEventListener("scroll", hideTooltip, { passive: true });
window.addEventListener("resize", hideTooltip);

renderRoute();
