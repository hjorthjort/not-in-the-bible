const DEFAULT_TIMEOUT_MS = 15000;

export class SocialEmbedError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "SocialEmbedError";
    this.status = status;
  }
}

function normalizeHost(hostname) {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
}

function withTimeout(signal, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        controller.abort(signal.reason);
      },
      { once: true }
    );
  }

  return {
    cleanup() {
      clearTimeout(timeout);
    },
    signal: controller.signal
  };
}

async function fetchJson(url, options = {}) {
  const { cleanup, signal } = withTimeout(options.signal, options.timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...options.headers
      },
      redirect: options.redirect ?? "follow",
      signal
    });

    if (!response.ok) {
      throw new SocialEmbedError(response.status, `Upstream request failed for ${url}.`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof SocialEmbedError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new SocialEmbedError(504, `Timed out while fetching ${url}.`);
    }

    throw new SocialEmbedError(502, `Could not fetch ${url}.`);
  } finally {
    cleanup();
  }
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, number) => String.fromCodePoint(Number.parseInt(number, 16)));
}

function stripHtml(value) {
  return value.replace(/<[^>]+>/g, "");
}

function compactWhitespace(value) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractSocialTextFromHtml(html) {
  const paragraphMatches = [...html.matchAll(/<blockquote\b[^>]*>[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  const paragraphHtml = paragraphMatches.map((match) => match[1]).join("\n\n");

  if (!paragraphHtml) {
    return "";
  }

  const normalizedHtml = paragraphHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<img\b[^>]*>/gi, "[...]")
    .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, "[...]");

  return compactWhitespace(decodeHtmlEntities(stripHtml(normalizedHtml)));
}

function detectNetwork(url) {
  const host = normalizeHost(url.hostname);

  if (host === "x.com" || host === "twitter.com") {
    return "x";
  }

  if (host === "bsky.app") {
    return "bluesky";
  }

  throw new SocialEmbedError(400, "Unsupported post URL.");
}

function normalizeXPath(url) {
  const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
  if (!match) {
    throw new SocialEmbedError(400, "Enter a public X status URL.");
  }

  const [, username, statusId] = match;
  return `https://x.com/${username}/status/${statusId}`;
}

function normalizeBlueskyUrl(url) {
  const match = url.pathname.match(/^\/profile\/([^/]+)\/post\/([^/]+)/);
  if (!match) {
    throw new SocialEmbedError(400, "Enter a Bluesky post URL.");
  }

  const [, actor, postId] = match;
  return `https://bsky.app/profile/${actor}/post/${postId}`;
}

function normalizeCanonicalUrl(url) {
  const network = detectNetwork(url);

  switch (network) {
    case "x":
      return { canonicalUrl: normalizeXPath(url), network };
    case "bluesky":
      return { canonicalUrl: normalizeBlueskyUrl(url), network };
    default:
      throw new SocialEmbedError(400, "Unsupported post URL.");
  }
}

async function fetchXOEmbed(canonicalUrl, options = {}) {
  const endpoint = new URL("https://publish.twitter.com/oembed");
  endpoint.searchParams.set("url", canonicalUrl);
  endpoint.searchParams.set("omit_script", "1");
  endpoint.searchParams.set("dnt", "true");
  endpoint.searchParams.set("align", "center");

  const payload = await fetchJson(endpoint, {
    signal: options.signal
  });
  return {
    canonicalUrl,
    html: payload.html,
    network: "x",
    text: extractSocialTextFromHtml(payload.html)
  };
}

async function fetchBlueskyOEmbed(canonicalUrl, options = {}) {
  const endpoint = new URL("https://embed.bsky.app/oembed");
  endpoint.searchParams.set("url", canonicalUrl);

  const payload = await fetchJson(endpoint, {
    signal: options.signal
  });
  return {
    canonicalUrl,
    html: payload.html,
    network: "bluesky",
    text: extractSocialTextFromHtml(payload.html)
  };
}

export async function fetchSocialEmbed(inputUrl, options = {}) {
  let parsedUrl;

  try {
    parsedUrl = new URL(inputUrl);
  } catch {
    throw new SocialEmbedError(400, "Enter a valid URL.");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new SocialEmbedError(400, "Enter a valid URL.");
  }

  const { canonicalUrl, network } = normalizeCanonicalUrl(parsedUrl);

  switch (network) {
    case "x":
      return fetchXOEmbed(canonicalUrl, options);
    case "bluesky":
      return fetchBlueskyOEmbed(canonicalUrl, options);
    default:
      throw new SocialEmbedError(400, "Unsupported post URL.");
  }
}
