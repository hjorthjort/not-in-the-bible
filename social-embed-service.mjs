const DEFAULT_TIMEOUT_MS = 15000;
const META_EMBED_API_VERSION = "v25.0";

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

async function fetchText(url, options = {}) {
  const { cleanup, signal } = withTimeout(options.signal, options.timeoutMs);

  try {
    const response = await fetch(url, {
      headers: options.headers,
      redirect: options.redirect ?? "follow",
      signal
    });

    if (!response.ok) {
      throw new SocialEmbedError(response.status, `Upstream request failed for ${url}.`);
    }

    return await response.text();
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

function isLinkLikeText(text, href) {
  const normalizedText = text.trim().toLowerCase();
  const normalizedHref = href?.trim().toLowerCase() ?? "";

  if (!normalizedText) {
    return false;
  }

  if (/^(?:https?:\/\/|www\.)/.test(normalizedText)) {
    return true;
  }

  return Boolean(normalizedHref && normalizedText === normalizedHref);
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
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_match, attributes, innerHtml) => {
      const hrefMatch = attributes.match(/\bhref=(["'])(.*?)\1/i);
      const visibleText = decodeHtmlEntities(stripHtml(innerHtml)).trim();

      if (isLinkLikeText(visibleText, hrefMatch?.[2] ?? null)) {
        return "[...]";
      }

      return innerHtml;
    });

  return compactWhitespace(decodeHtmlEntities(stripHtml(normalizedHtml)));
}

function extractMetaContent(html, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=(["'])${escapedKey}\\1[^>]+content=(["'])([\\s\\S]*?)\\2`, "i"),
    new RegExp(`<meta[^>]+content=(["'])([\\s\\S]*?)\\1[^>]+property=(["'])${escapedKey}\\3`, "i"),
    new RegExp(`<meta[^>]+name=(["'])${escapedKey}\\1[^>]+content=(["'])([\\s\\S]*?)\\2`, "i"),
    new RegExp(`<meta[^>]+content=(["'])([\\s\\S]*?)\\1[^>]+name=(["'])${escapedKey}\\3`, "i")
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const rawValue = match?.[3] ?? match?.[2] ?? "";
    const decoded = compactWhitespace(decodeHtmlEntities(rawValue));
    if (decoded) {
      return decoded;
    }
  }

  return "";
}

function extractLongestParagraphText(html) {
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) =>
      compactWhitespace(
        decodeHtmlEntities(
          stripHtml(match[1].replace(/<br\s*\/?>/gi, "\n").replace(/<img\b[^>]*>/gi, " "))
        )
      )
    )
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  return paragraphs[0] ?? "";
}

function pickBestMetaText(network, html) {
  const metaCandidates = [
    extractMetaContent(html, "og:description"),
    extractMetaContent(html, "description"),
    extractMetaContent(html, "twitter:description"),
    extractMetaContent(html, "og:title"),
    extractMetaContent(html, "twitter:title"),
    extractLongestParagraphText(html)
  ].filter(Boolean);

  for (const candidate of metaCandidates) {
    const normalized = compactWhitespace(candidate);
    if (!normalized) {
      continue;
    }

    if (network === "instagram" && /^instagram$/i.test(normalized)) {
      continue;
    }

    if (network === "facebook" && /^facebook$/i.test(normalized)) {
      continue;
    }

    if (network === "threads" && /^join threads to share ideas/i.test(normalized)) {
      continue;
    }

    return normalized;
  }

  return "";
}

function combineText(...parts) {
  const seen = new Set();
  return compactWhitespace(
    parts
      .map((part) => (part ?? "").trim())
      .filter(Boolean)
      .filter((part) => {
        const key = part.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .join("\n\n")
  );
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getMetaToken(env = {}) {
  return env.META_EMBED_ACCESS_TOKEN || env.META_APP_ACCESS_TOKEN || null;
}

function extractInstagramContextText(html) {
  const contextMatch = html.match(/contextJSON":"((?:\\.|[^"])*)"/);
  if (!contextMatch?.[1]) {
    return "";
  }

  try {
    const decodedJson = JSON.parse(`"${contextMatch[1]}"`);
    const context = JSON.parse(decodedJson);
    const candidates = [
      context?.context?.media?.caption,
      context?.gql_data?.shortcode_media?.edge_media_to_caption?.edges?.[0]?.node?.text,
      context?.gql_data?.xdt_shortcode_media?.edge_media_to_caption?.edges?.[0]?.node?.text
    ];

    return compactWhitespace(candidates.find((value) => typeof value === "string") ?? "");
  } catch {
    return "";
  }
}

function buildIframeHtml(src, title, height = 760) {
  return `<iframe src="${escapeAttribute(src)}" title="${escapeAttribute(title)}" width="100%" height="${height}" style="border:0;display:block;margin:0 auto;max-width:600px;width:100%;" loading="lazy" referrerpolicy="origin-when-cross-origin" allowfullscreen></iframe>`;
}

function buildMetaGraphOEmbedUrl(pathname, canonicalUrl, accessToken) {
  const endpoint = new URL(`https://graph.facebook.com/${META_EMBED_API_VERSION}/${pathname}`);
  endpoint.searchParams.set("url", canonicalUrl);
  endpoint.searchParams.set("access_token", accessToken);
  return endpoint;
}

function detectNetwork(url) {
  const host = normalizeHost(url.hostname);

  if (host === "x.com" || host === "twitter.com") {
    return "x";
  }

  if (host === "bsky.app") {
    return "bluesky";
  }

  if (host === "instagram.com") {
    return "instagram";
  }

  if (host === "facebook.com") {
    return "facebook";
  }

  if (host === "threads.net" || host === "threads.com") {
    return "threads";
  }

  if (host === "tiktok.com") {
    return "tiktok";
  }

  if (host === "youtube.com" || host === "youtu.be") {
    return "youtube";
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

function normalizeInstagramUrl(url) {
  const match = url.pathname.match(/^\/(p|reel|reels)\/([^/]+)/);
  if (!match) {
    throw new SocialEmbedError(400, "Enter an Instagram post or reel URL.");
  }

  const [, kind, shortcode] = match;
  return `https://www.instagram.com/${kind}/${shortcode}/`;
}

function normalizeFacebookUrl(url) {
  const normalized = new URL(`https://www.facebook.com${url.pathname}`);
  const searchKeys = ["id", "story_fbid", "fbid", "v"];

  for (const key of searchKeys) {
    const value = url.searchParams.get(key);
    if (value) {
      normalized.searchParams.set(key, value);
    }
  }

  return normalized.toString();
}

function normalizeThreadsUrl(url) {
  const match = url.pathname.match(/^\/@([^/]+)\/post\/([^/]+)/);
  if (!match) {
    throw new SocialEmbedError(400, "Enter a Threads post URL.");
  }

  const [, username, postId] = match;
  return `https://www.threads.net/@${username}/post/${postId}`;
}

function normalizeTikTokUrl(url) {
  const match = url.pathname.match(/^\/@([^/]+)\/video\/(\d+)/);
  if (!match) {
    throw new SocialEmbedError(400, "Enter a TikTok video URL.");
  }

  const [, username, videoId] = match;
  return `https://www.tiktok.com/@${username}/video/${videoId}`;
}

function extractYouTubeVideoId(url) {
  const host = normalizeHost(url.hostname);

  if (host === "youtu.be") {
    const videoId = url.pathname.replace(/^\/+/, "").split("/")[0];
    if (videoId) {
      return videoId;
    }
  }

  if (host === "youtube.com") {
    if (url.pathname === "/watch") {
      return url.searchParams.get("v");
    }

    const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/);
    if (match) {
      return match[1];
    }
  }

  return null;
}

function normalizeYouTubeUrl(url) {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    throw new SocialEmbedError(400, "Enter a YouTube video URL.");
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
}

function normalizeCanonicalUrl(url) {
  const network = detectNetwork(url);

  switch (network) {
    case "x":
      return { canonicalUrl: normalizeXPath(url), network };
    case "bluesky":
      return { canonicalUrl: normalizeBlueskyUrl(url), network };
    case "instagram":
      return { canonicalUrl: normalizeInstagramUrl(url), network };
    case "facebook":
      return { canonicalUrl: normalizeFacebookUrl(url), network };
    case "threads":
      return { canonicalUrl: normalizeThreadsUrl(url), network };
    case "tiktok":
      return { canonicalUrl: normalizeTikTokUrl(url), network };
    case "youtube":
      return { canonicalUrl: normalizeYouTubeUrl(url), network };
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

async function fetchInstagramEmbed(canonicalUrl, env, options = {}) {
  const accessToken = getMetaToken(env);
  let html = buildIframeHtml(`${canonicalUrl.replace(/\/$/, "")}/embed/captioned/`, "Instagram post");
  let text = "";

  if (accessToken) {
    try {
      const payload = await fetchJson(
        buildMetaGraphOEmbedUrl("instagram_oembed", canonicalUrl, accessToken),
        {
          signal: options.signal
        }
      );
      html = payload.html ?? html;
      text = payload.title ?? "";
    } catch {
      text = "";
    }
  }

  try {
    const embedHtml = await fetchText(`${canonicalUrl.replace(/\/$/, "")}/embed/captioned/`, {
      signal: options.signal
    });
    text =
      text ||
      extractInstagramContextText(embedHtml) ||
      pickBestMetaText("instagram", embedHtml);
  } catch {
    text = text || "";
  }

  return {
    canonicalUrl,
    html,
    network: "instagram",
    text
  };
}

function looksLikeFacebookVideoUrl(canonicalUrl) {
  const url = new URL(canonicalUrl);
  return /\/videos\//.test(url.pathname) || url.pathname === "/watch" || url.searchParams.has("v");
}

async function fetchFacebookEmbed(canonicalUrl, env, options = {}) {
  const accessToken = getMetaToken(env);
  const isVideo = looksLikeFacebookVideoUrl(canonicalUrl);
  const pluginUrl = new URL(
    `https://www.facebook.com/plugins/${isVideo ? "video.php" : "post.php"}`
  );
  pluginUrl.searchParams.set("href", canonicalUrl);
  if (!isVideo) {
    pluginUrl.searchParams.set("show_text", "true");
  }
  pluginUrl.searchParams.set("width", "500");

  let html = buildIframeHtml(pluginUrl.toString(), "Facebook post", isVideo ? 420 : 760);
  let text = "";

  if (accessToken) {
    try {
      const payload = await fetchJson(
        buildMetaGraphOEmbedUrl(isVideo ? "oembed_video" : "oembed_post", canonicalUrl, accessToken),
        {
          signal: options.signal
        }
      );
      html = payload.html ?? html;
      text = payload.title ?? "";
    } catch {
      text = "";
    }
  }

  try {
    const pluginHtml = await fetchText(pluginUrl.toString(), {
      signal: options.signal
    });
    text = text || pickBestMetaText("facebook", pluginHtml);
  } catch {
    text = text || "";
  }

  return {
    canonicalUrl,
    html,
    network: "facebook",
    text
  };
}

async function fetchThreadsEmbed(canonicalUrl, options = {}) {
  const embedUrl = `${canonicalUrl.replace(/\/$/, "")}/embed`;
  let text = "";

  try {
    const embedHtml = await fetchText(embedUrl, {
      signal: options.signal
    });
    text = pickBestMetaText("threads", embedHtml);
  } catch {
    text = "";
  }

  return {
    canonicalUrl,
    html: buildIframeHtml(embedUrl, "Threads post", 760),
    network: "threads",
    text
  };
}

async function fetchTikTokOEmbed(canonicalUrl, options = {}) {
  const endpoint = new URL("https://www.tiktok.com/oembed");
  endpoint.searchParams.set("url", canonicalUrl);

  const payload = await fetchJson(endpoint, {
    signal: options.signal
  });
  return {
    canonicalUrl,
    html: payload.html,
    network: "tiktok",
    text: combineText(payload.title, extractSocialTextFromHtml(payload.html))
  };
}

async function fetchYouTubeEmbed(canonicalUrl, options = {}) {
  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", canonicalUrl);
  endpoint.searchParams.set("format", "json");

  const payload = await fetchJson(endpoint, {
    signal: options.signal
  });

  return {
    canonicalUrl,
    html: payload.html,
    network: "youtube",
    text: compactWhitespace(payload.title ?? "")
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
    case "instagram":
      return fetchInstagramEmbed(canonicalUrl, options.env, options);
    case "facebook":
      return fetchFacebookEmbed(canonicalUrl, options.env, options);
    case "threads":
      return fetchThreadsEmbed(canonicalUrl, options);
    case "tiktok":
      return fetchTikTokOEmbed(canonicalUrl, options);
    case "youtube":
      return fetchYouTubeEmbed(canonicalUrl, options);
    default:
      throw new SocialEmbedError(400, "Unsupported post URL.");
  }
}
