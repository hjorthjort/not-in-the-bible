const DEFAULT_TIMEOUT_MS = 15000;
const META_EMBED_API_VERSION = "v25.0";
const REDDIT_JSON_USER_AGENT =
  "words-in-the-bible/0.1 (+https://github.com/hjort/wods-in-the-bible)";
const GITHUB_API_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": REDDIT_JSON_USER_AGENT
};

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
  const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  const searchableHtml = headMatch?.[1] ?? html.slice(0, 200000);
  const metaTags = searchableHtml.match(/<meta\b[^>]*>/gi) ?? [];
  const normalizedKey = key.toLowerCase();

  for (const tag of metaTags) {
    const property = tag.match(/\bproperty=(["'])(.*?)\1/i)?.[2]?.toLowerCase() ?? "";
    const name = tag.match(/\bname=(["'])(.*?)\1/i)?.[2]?.toLowerCase() ?? "";

    if (property !== normalizedKey && name !== normalizedKey) {
      continue;
    }

    const rawValue = tag.match(/\bcontent=(["'])([\s\S]*?)\1/i)?.[2] ?? "";
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

    if (network === "instagram" && /^create an account or log in to instagram/i.test(normalized)) {
      continue;
    }

    if (network === "facebook" && /^facebook$/i.test(normalized)) {
      continue;
    }

    if (network === "facebook" && /^log (?:in|into) facebook/i.test(normalized)) {
      continue;
    }

    if (
      network === "facebook" &&
      /(isn['’]t available|not available|nicht mehr verf[üu]gbar|privatsph[aä]re|removed)/i.test(normalized)
    ) {
      continue;
    }

    if (network === "tiktok" && /^please wait/i.test(normalized)) {
      continue;
    }

    if (network === "tiktok" && /^tiktok\b/i.test(normalized) && normalized.length < 40) {
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

function truncateText(text, maxLength = 280) {
  const normalized = compactWhitespace(text);
  if (!normalized || normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}\u2026`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function extractQuotedMetaText(value) {
  const colonMatch = value.match(/:\s*["“]([\s\S]+?)["”](?:\s*\.)?$/);
  if (colonMatch?.[1]) {
    return compactWhitespace(colonMatch[1]);
  }

  const quotedMatch = value.match(/["“]([\s\S]+?)["”](?:\s*\.)?$/);
  return compactWhitespace(quotedMatch?.[1] ?? "");
}

function extractSocialMetaText(network, html) {
  const candidates = [
    extractQuotedMetaText(extractMetaContent(html, "og:title")),
    extractQuotedMetaText(extractMetaContent(html, "og:description")),
    extractQuotedMetaText(extractMetaContent(html, "description")),
    pickBestMetaText(network, html)
  ].filter(Boolean);

  return compactWhitespace(candidates[0] ?? "");
}

function getInstagramCommentReference(url) {
  const pathMatch = url.pathname.match(/^\/(?:p|reel|reels)\/[^/]+\/c\/([^/]+)\/?$/);
  const pathCommentId = pathMatch?.[1]?.trim() ?? "";
  const commentId = url.searchParams.get("comment_id")?.trim() ?? "";
  const replyCommentId = url.searchParams.get("reply_comment_id")?.trim() ?? "";

  if (!pathCommentId && !commentId && !replyCommentId) {
    return null;
  }

  return {
    commentId: pathCommentId || commentId || null,
    replyCommentId: replyCommentId || null
  };
}

function getFacebookCommentReference(url) {
  const commentId = url.searchParams.get("comment_id")?.trim() ?? "";
  const replyCommentId = url.searchParams.get("reply_comment_id")?.trim() ?? "";

  if (!commentId && !replyCommentId) {
    return null;
  }

  return {
    commentId: commentId || null,
    replyCommentId: replyCommentId || null
  };
}

function buildInstagramMediaUrl(url) {
  return `https://www.instagram.com${url.pathname.replace(/\/+$/, "")}/`;
}

function buildInstagramPublicOEmbedUrl(targetUrl) {
  const endpoint = new URL("https://www.instagram.com/api/v1/oembed/");
  endpoint.searchParams.set("url", targetUrl);
  return endpoint;
}

function buildIframeHtml(src, title, height = 760) {
  return `<iframe src="${escapeAttribute(src)}" title="${escapeAttribute(title)}" width="100%" height="${height}" style="border:0;display:block;margin:0 auto;max-width:600px;width:100%;" loading="lazy" referrerpolicy="origin-when-cross-origin" allowfullscreen></iframe>`;
}

function extractTextFromHtmlFragment(html) {
  if (typeof html !== "string" || !html.trim()) {
    return "";
  }

  const normalizedHtml = html
    .replace(/<p\b[^>]*>/gi, "\n\n")
    .replace(/<\/p>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<(?:pre|blockquote)\b[^>]*>/gi, "\n")
    .replace(/<\/(?:pre|blockquote)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
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

function buildMetaGraphOEmbedUrl(pathname, canonicalUrl, accessToken) {
  const endpoint = new URL(`https://graph.facebook.com/${META_EMBED_API_VERSION}/${pathname}`);
  endpoint.searchParams.set("url", canonicalUrl);
  endpoint.searchParams.set("access_token", accessToken);
  return endpoint;
}

function getTikTokCommentReference(url) {
  const commentId = url.searchParams.get("comment_id")?.trim() ?? "";
  const replyCommentId = url.searchParams.get("reply_comment_id")?.trim() ?? "";

  if (!commentId && !replyCommentId) {
    return null;
  }

  return {
    commentId: commentId || null,
    replyCommentId: replyCommentId || null
  };
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

  if (host === "tiktok.com") {
    return "tiktok";
  }

  if (host === "youtube.com" || host === "youtu.be") {
    return "youtube";
  }

  if (host === "reddit.com" || host === "old.reddit.com") {
    return "reddit";
  }

  if (host === "news.ycombinator.com") {
    return "hackernews";
  }

  if (host === "lobste.rs") {
    return "lobsters";
  }

  if (host === "quora.com") {
    return "quora";
  }

  if (host === "github.com") {
    return "github";
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
  const match = url.pathname.match(/^\/(p|reel|reels)\/([^/]+)(?:\/c\/([^/]+))?/);
  if (!match) {
    throw new SocialEmbedError(400, "Enter an Instagram post or reel URL.");
  }

  const [, kind, shortcode, pathCommentId] = match;
  const canonical = new URL(`https://www.instagram.com/${kind}/${shortcode}/`);
  const commentId = pathCommentId?.trim() || url.searchParams.get("comment_id")?.trim();
  const replyCommentId = url.searchParams.get("reply_comment_id")?.trim();

  if (commentId) {
    canonical.searchParams.set("comment_id", commentId);
  }

  if (replyCommentId) {
    canonical.searchParams.set("reply_comment_id", replyCommentId);
  }

  return canonical.toString();
}

function normalizeFacebookUrl(url) {
  const normalized = new URL(`https://www.facebook.com${url.pathname}`);
  const searchKeys = ["id", "story_fbid", "fbid", "v", "comment_id", "reply_comment_id"];

  for (const key of searchKeys) {
    const value = url.searchParams.get(key);
    if (value) {
      normalized.searchParams.set(key, value);
    }
  }

  return normalized.toString();
}

function normalizeTikTokUrl(url) {
  const match = url.pathname.match(/^\/@([^/]+)\/video\/(\d+)/);
  if (!match) {
    throw new SocialEmbedError(400, "Enter a TikTok video URL.");
  }

  const [, username, videoId] = match;
  const canonical = new URL(`https://www.tiktok.com/@${username}/video/${videoId}`);
  const commentId = url.searchParams.get("comment_id")?.trim();
  const replyCommentId = url.searchParams.get("reply_comment_id")?.trim();

  if (commentId) {
    canonical.searchParams.set("comment_id", commentId);
  }

  if (replyCommentId) {
    canonical.searchParams.set("reply_comment_id", replyCommentId);
  }

  return canonical.toString();
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

function getYouTubeCommentId(url) {
  const commentId = url.searchParams.get("lc")?.trim();
  return commentId || null;
}

function normalizeYouTubeUrl(url) {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    throw new SocialEmbedError(400, "Enter a YouTube video URL.");
  }

  const canonical = new URL("https://www.youtube.com/watch");
  canonical.searchParams.set("v", videoId);

  const commentId = getYouTubeCommentId(url);
  if (commentId) {
    canonical.searchParams.set("lc", commentId);
  }

  return canonical.toString();
}

function normalizeRedditUrl(url) {
  const path = url.pathname.replace(/\/+$/, "");
  if (!/\/comments\//.test(path)) {
    throw new SocialEmbedError(400, "Enter a Reddit post URL.");
  }

  return `https://www.reddit.com${path}/`;
}

function getHackerNewsItemId(url) {
  const itemId = url.searchParams.get("id")?.trim() ?? "";
  return /^\d+$/.test(itemId) ? itemId : null;
}

function buildHackerNewsItemUrl(itemId) {
  return `https://news.ycombinator.com/item?id=${itemId}`;
}

function normalizeHackerNewsUrl(url) {
  if (url.pathname !== "/item") {
    throw new SocialEmbedError(400, "Enter a Hacker News item URL.");
  }

  const itemId = getHackerNewsItemId(url);
  if (!itemId) {
    throw new SocialEmbedError(400, "Enter a Hacker News item URL.");
  }

  return buildHackerNewsItemUrl(itemId);
}

function getLobstersCommentId(url) {
  const commentMatch = url.hash.match(/^#c_([a-z0-9]+)/i);
  return commentMatch?.[1] ?? null;
}

function normalizeLobstersUrl(url) {
  const match = url.pathname.match(/^\/s\/([^/]+)(?:\/([^/]+))?/);
  if (!match) {
    throw new SocialEmbedError(400, "Enter a Lobsters story URL.");
  }

  const [, shortId, slug] = match;
  const canonical = new URL(`https://lobste.rs/s/${shortId}${slug ? `/${slug}` : ""}`);
  const commentId = getLobstersCommentId(url);

  if (commentId) {
    canonical.hash = `c_${commentId}`;
  }

  return canonical.toString();
}

function humanizeSlug(value) {
  return compactWhitespace(decodeURIComponent(value).replace(/[-_+]+/g, " "));
}

function normalizeQuoraUrl(url) {
  const pathname = url.pathname.replace(/\/+$/, "");
  const segments = pathname.split("/").filter(Boolean);

  if (!segments.length) {
    throw new SocialEmbedError(400, "Enter a Quora question URL.");
  }

  return `https://www.quora.com/${segments.join("/")}`;
}

function getGitHubCommentReference(url) {
  const hash = url.hash.replace(/^#/, "");

  if (!hash) {
    return null;
  }

  const issueCommentMatch = hash.match(/^issuecomment-(\d+)$/i);
  if (issueCommentMatch) {
    return {
      commentId: issueCommentMatch[1],
      type: "issuecomment"
    };
  }

  const reviewCommentMatch = hash.match(/^discussion_r(\d+)$/i);
  if (reviewCommentMatch) {
    return {
      commentId: reviewCommentMatch[1],
      type: "reviewcomment"
    };
  }

  const reviewMatch = hash.match(/^pullrequestreview-(\d+)$/i);
  if (reviewMatch) {
    return {
      commentId: reviewMatch[1],
      type: "review"
    };
  }

  return null;
}

function getGitHubResource(url) {
  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)(?:\/files)?/);
  if (!match) {
    return null;
  }

  const [, owner, repo, kind, number] = match;
  return {
    owner,
    repo,
    kind,
    number
  };
}

function normalizeGitHubUrl(url) {
  const resource = getGitHubResource(url);
  if (!resource) {
    throw new SocialEmbedError(400, "Enter a GitHub issue or pull request URL.");
  }

  const canonical = new URL(
    `https://github.com/${resource.owner}/${resource.repo}/${resource.kind}/${resource.number}`
  );
  const commentReference = getGitHubCommentReference(url);

  if (commentReference) {
    canonical.hash = `#${url.hash.replace(/^#/, "")}`;
  }

  return canonical.toString();
}

function getRedditCommentId(url) {
  const segments = url.pathname.split("/").filter(Boolean);
  const commentsIndex = segments.indexOf("comments");
  if (commentsIndex === -1) {
    return null;
  }

  const commentId = segments[commentsIndex + 3];
  return commentId ? commentId.trim() : null;
}

function findRedditComment(children, commentId) {
  for (const child of children ?? []) {
    if (child?.kind !== "t1") {
      continue;
    }

    const data = child.data;
    if (data?.id === commentId || data?.name === `t1_${commentId}`) {
      return data;
    }

    const nested = findRedditComment(data?.replies?.data?.children, commentId);
    if (nested) {
      return nested;
    }
  }

  return null;
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
    case "tiktok":
      return { canonicalUrl: normalizeTikTokUrl(url), network };
    case "youtube":
      return { canonicalUrl: normalizeYouTubeUrl(url), network };
    case "reddit":
      return { canonicalUrl: normalizeRedditUrl(url), network };
    case "hackernews":
      return { canonicalUrl: normalizeHackerNewsUrl(url), network };
    case "lobsters":
      return { canonicalUrl: normalizeLobstersUrl(url), network };
    case "quora":
      return { canonicalUrl: normalizeQuoraUrl(url), network };
    case "github":
      return { canonicalUrl: normalizeGitHubUrl(url), network };
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
  const canonical = new URL(canonicalUrl);
  const mediaUrl = buildInstagramMediaUrl(canonical);
  const commentReference = getInstagramCommentReference(canonical);
  let html = buildIframeHtml(`${mediaUrl.replace(/\/$/, "")}/embed/captioned/`, "Instagram post");
  let text = "";

  try {
    const publicOEmbedUrl = buildInstagramPublicOEmbedUrl(commentReference ? canonicalUrl : mediaUrl);
    const payload = await fetchJson(publicOEmbedUrl, {
      signal: options.signal
    });
    html = payload.html ?? html;
    text = compactWhitespace(payload.title ?? "");
  } catch {
    text = "";
  }

  if (accessToken && (!html || !text || !commentReference)) {
    try {
      const payload = await fetchJson(
        buildMetaGraphOEmbedUrl("instagram_oembed", mediaUrl, accessToken),
        {
          signal: options.signal
        }
      );
      html = payload.html ?? html;
      if (!text || !commentReference) {
        text = compactWhitespace(payload.title ?? text);
      }
    } catch {
      text = text || "";
    }
  }

  try {
    if (commentReference) {
      const commentHtml = await fetchText(canonicalUrl, {
        signal: options.signal
      });
      text = extractSocialMetaText("instagram", commentHtml) || text;
    }
  } catch {
    text = text || "";
  }

  try {
    const embedHtml = await fetchText(`${mediaUrl.replace(/\/$/, "")}/embed/captioned/`, {
      signal: options.signal
    });
    text = text || extractInstagramContextText(embedHtml) || extractSocialMetaText("instagram", embedHtml);
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
  const commentReference = getFacebookCommentReference(new URL(canonicalUrl));
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
    if (commentReference) {
      const commentHtml = await fetchText(canonicalUrl, {
        signal: options.signal
      });
      text = extractSocialMetaText("facebook", commentHtml) || text;
    }
  } catch {
    text = text || "";
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

async function fetchTikTokOEmbed(canonicalUrl, options = {}) {
  const endpoint = new URL("https://www.tiktok.com/oembed");
  endpoint.searchParams.set("url", canonicalUrl);

  const payload = await fetchJson(endpoint, {
    signal: options.signal
  });
  const commentReference = getTikTokCommentReference(new URL(canonicalUrl));
  let text = combineText(payload.title, extractSocialTextFromHtml(payload.html));

  try {
    if (commentReference) {
      const pageHtml = await fetchText(canonicalUrl, {
        signal: options.signal
      });
      text = extractSocialMetaText("tiktok", pageHtml) || text;
    }
  } catch {
    text = text || combineText(payload.title, extractSocialTextFromHtml(payload.html));
  }

  return {
    canonicalUrl,
    html: payload.html,
    network: "tiktok",
    text
  };
}

async function fetchYouTubeEmbed(canonicalUrl, options = {}) {
  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", canonicalUrl);
  endpoint.searchParams.set("format", "json");

  const payload = await fetchJson(endpoint, {
    signal: options.signal
  });
  const url = new URL(canonicalUrl);
  let text = compactWhitespace(payload.title ?? "");

  if (getYouTubeCommentId(url)) {
    try {
      const pageHtml = await fetchText(canonicalUrl, {
        signal: options.signal
      });
      text =
        compactWhitespace(extractMetaContent(pageHtml, "og:description")) ||
        compactWhitespace(extractMetaContent(pageHtml, "description")) ||
        text;
    } catch {
      text = text || compactWhitespace(payload.title ?? "");
    }
  }

  return {
    canonicalUrl,
    html: payload.html,
    network: "youtube",
    text
  };
}

function buildRedditJsonUrl(canonicalUrl) {
  const url = new URL(canonicalUrl);
  const normalizedPath = url.pathname.replace(/\/+$/, "");
  return `https://old.reddit.com${normalizedPath}.json?raw_json=1`;
}

function buildHackerNewsItemApiUrl(itemId) {
  return `https://hacker-news.firebaseio.com/v0/item/${itemId}.json`;
}

async function fetchHackerNewsItem(itemId, options = {}) {
  const payload = await fetchJson(buildHackerNewsItemApiUrl(itemId), {
    signal: options.signal
  });

  if (!payload || typeof payload !== "object" || payload.id == null || payload.dead || payload.deleted) {
    throw new SocialEmbedError(404, "This Hacker News item is unavailable.");
  }

  return payload;
}

async function findHackerNewsStory(item, options = {}) {
  let current = item;

  for (let depth = 0; depth < 20; depth += 1) {
    if (!current?.parent) {
      return current?.type === "story" ? current : null;
    }

    current = await fetchHackerNewsItem(String(current.parent), options);
    if (current.type !== "comment") {
      return current;
    }
  }

  return null;
}

function getHostnameLabel(value) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function buildSocialCardHtml({
  actions = [],
  canonicalUrl,
  context = null,
  eyebrow,
  metaParts = [],
  networkClass,
  previewText = "",
  title
}) {
  const contextHtml = context?.label
    ? `<p class="social-card__context">${
        context.href
          ? `<a href="${escapeAttribute(context.href)}" target="_blank" rel="noreferrer">${escapeHtml(context.label)}</a>`
          : escapeHtml(context.label)
      }</p>`
    : "";
  const safePreview = truncateText(previewText, 320);
  const previewHtml =
    safePreview && safePreview.toLowerCase() !== title.toLowerCase()
      ? `<p class="social-card__preview">${escapeHtml(safePreview)}</p>`
      : "";
  const actionHtml = actions
    .filter((action) => action?.href && action?.label)
    .map(
      (action) =>
        `<a class="social-card__action" href="${escapeAttribute(action.href)}" target="_blank" rel="noreferrer">${escapeHtml(action.label)}</a>`
    )
    .join("");

  return `
    <article class="social-card social-card--${escapeAttribute(networkClass)}">
      <p class="social-card__eyebrow">${escapeHtml(eyebrow)}</p>
      <h3 class="social-card__title">
        <a href="${escapeAttribute(canonicalUrl)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>
      </h3>
      ${contextHtml}
      ${previewHtml}
      ${metaParts.length ? `<p class="social-card__meta">${escapeHtml(metaParts.join(" · "))}</p>` : ""}
      ${actionHtml ? `<div class="social-card__actions">${actionHtml}</div>` : ""}
    </article>
  `;
}

function buildHackerNewsEmbedHtml(item, canonicalUrl, bodyText, story) {
  const isComment = item.type === "comment";
  const storyTitle = compactWhitespace(story?.title ?? "");
  const title = isComment ? `Comment by ${item.by ?? "unknown"}` : compactWhitespace(item.title ?? "Hacker News post");
  const storyUrl = story?.id ? buildHackerNewsItemUrl(String(story.id)) : canonicalUrl;
  const linkedUrl = !isComment && item.url ? item.url : story?.url ?? null;
  const linkedHost = linkedUrl ? getHostnameLabel(linkedUrl) : "";
  const metaParts = [];

  if (item.by) {
    metaParts.push(`by ${item.by}`);
  }

  if (!isComment && typeof item.score === "number") {
    metaParts.push(`${item.score} points`);
  }

  const commentCount = isComment ? story?.descendants : item.descendants;
  if (typeof commentCount === "number") {
    metaParts.push(`${commentCount} comments`);
  }

  return buildSocialCardHtml({
    actions: [
      {
        href: canonicalUrl,
        label: "Open on Hacker News"
      },
      ...(linkedUrl
        ? [
            {
              href: linkedUrl,
              label: isComment ? "Open linked story" : "Open linked page"
            }
          ]
        : [])
    ],
    canonicalUrl,
    context: isComment ? (storyTitle ? { href: storyUrl, label: `On ${storyTitle}` } : null) : linkedHost ? { href: linkedUrl, label: linkedHost } : null,
    eyebrow: `Hacker News ${isComment ? "comment" : "post"}`,
    metaParts,
    networkClass: "hackernews",
    previewText: bodyText,
    title
  });
}

function buildLobstersJsonUrl(canonicalUrl) {
  const url = new URL(canonicalUrl);
  const normalizedPath = url.pathname.replace(/\/+$/, "");
  return `https://lobste.rs${normalizedPath}.json`;
}

function findLobstersComment(comments, shortId) {
  for (const comment of comments ?? []) {
    if (comment?.short_id === shortId) {
      return comment;
    }

    const nested = findLobstersComment(comment?.comments, shortId);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function buildLobstersEmbedHtml(story, canonicalUrl, bodyText, comment) {
  const isComment = Boolean(comment);
  const title = isComment
    ? `Comment by ${comment.commenting_user ?? "unknown"}`
    : compactWhitespace(story.title ?? "Lobsters story");
  const linkedUrl = story.url ?? null;
  const linkedHost = linkedUrl ? getHostnameLabel(linkedUrl) : "";
  const storyUrl = story.comments_url ?? canonicalUrl.split("#")[0];
  const metaParts = [];
  const author = isComment ? comment.commenting_user : story.submitter_user;
  const score = isComment ? comment.score : story.score;
  const commentCount = story.comment_count;

  if (author) {
    metaParts.push(`by ${author}`);
  }

  if (typeof score === "number") {
    metaParts.push(`${score} points`);
  }

  if (typeof commentCount === "number") {
    metaParts.push(`${commentCount} comments`);
  }

  return buildSocialCardHtml({
    actions: [
      {
        href: canonicalUrl,
        label: "Open on Lobsters"
      },
      ...(linkedUrl
        ? [
            {
              href: linkedUrl,
              label: isComment ? "Open linked story" : "Open linked page"
            }
          ]
        : [])
    ],
    canonicalUrl,
    context: isComment
      ? story.title
        ? { href: storyUrl, label: `On ${story.title}` }
        : null
      : linkedHost
        ? { href: linkedUrl, label: linkedHost }
        : null,
    eyebrow: `Lobsters ${isComment ? "comment" : "story"}`,
    metaParts,
    networkClass: "lobsters",
    previewText: bodyText,
    title
  });
}

async function fetchRedditEmbed(canonicalUrl, options = {}) {
  const endpoint = new URL("https://www.reddit.com/oembed");
  endpoint.searchParams.set("url", canonicalUrl);
  const payload = await fetchJson(endpoint, {
    signal: options.signal
  });
  const commentId = getRedditCommentId(new URL(canonicalUrl));

  let text = payload.title ?? "";

  try {
    const listing = await fetchJson(buildRedditJsonUrl(canonicalUrl), {
      headers: {
        "User-Agent": REDDIT_JSON_USER_AGENT
      },
      signal: options.signal
    });
    const post = listing?.[0]?.data?.children?.[0]?.data;
    if (commentId) {
      const comment = findRedditComment(listing?.[1]?.data?.children, commentId);
      text = compactWhitespace(comment?.body ?? "") || (payload.title ?? "");
    } else {
      text = combineText(post?.title ?? payload.title ?? "", post?.selftext ?? "");
    }
  } catch {
    text = payload.title ?? "";
  }

  return {
    canonicalUrl,
    html: payload.html,
    network: "reddit",
    text
  };
}

async function fetchHackerNewsEmbed(canonicalUrl, options = {}) {
  const itemId = getHackerNewsItemId(new URL(canonicalUrl));
  if (!itemId) {
    throw new SocialEmbedError(400, "Enter a Hacker News item URL.");
  }

  const item = await fetchHackerNewsItem(itemId, options);
  const story = item.type === "comment" ? await findHackerNewsStory(item, options) : item;
  const bodyText = extractTextFromHtmlFragment(item.text ?? "");
  const text = item.type === "comment" ? bodyText : combineText(item.title ?? "", bodyText);

  return {
    canonicalUrl,
    html: buildHackerNewsEmbedHtml(item, canonicalUrl, bodyText, story),
    network: "hackernews",
    text
  };
}

async function fetchLobstersEmbed(canonicalUrl, options = {}) {
  const story = await fetchJson(buildLobstersJsonUrl(canonicalUrl), {
    signal: options.signal
  });
  const commentId = getLobstersCommentId(new URL(canonicalUrl));
  const comment = commentId ? findLobstersComment(story.comments, commentId) : null;

  if (commentId && !comment) {
    throw new SocialEmbedError(404, "This Lobsters comment could not be found.");
  }

  const bodyText = comment
    ? extractTextFromHtmlFragment(comment.comment ?? "")
    : compactWhitespace(story.description_plain ?? extractTextFromHtmlFragment(story.description ?? ""));
  const text = comment ? bodyText : combineText(story.title ?? "", bodyText);

  return {
    canonicalUrl,
    html: buildLobstersEmbedHtml(story, canonicalUrl, bodyText, comment),
    network: "lobsters",
    text
  };
}

function extractQuoraContext(canonicalUrl) {
  const url = new URL(canonicalUrl);
  const segments = url.pathname.split("/").filter(Boolean);
  const questionTitle = segments[0] ? humanizeSlug(segments[0]) : "";
  const answerAuthor = segments[1] === "answer" && segments[2] ? humanizeSlug(segments[2]) : "";

  return {
    answerAuthor,
    questionTitle
  };
}

function buildQuoraEmbedHtml(canonicalUrl, questionTitle, answerAuthor) {
  return buildSocialCardHtml({
    actions: [
      {
        href: canonicalUrl,
        label: "Open on Quora"
      }
    ],
    canonicalUrl,
    eyebrow: `Quora ${answerAuthor ? "answer" : "question"}`,
    metaParts: [
      ...(answerAuthor ? [`answer by ${answerAuthor}`] : []),
      "question title derived from URL"
    ],
    networkClass: "quora",
    previewText: "Quora blocks public server-side text extraction here, so this view uses the question title from the URL.",
    title: questionTitle
  });
}

async function fetchQuoraEmbed(canonicalUrl) {
  const { answerAuthor, questionTitle } = extractQuoraContext(canonicalUrl);
  if (!questionTitle) {
    throw new SocialEmbedError(400, "Enter a Quora question URL.");
  }

  return {
    canonicalUrl,
    html: buildQuoraEmbedHtml(canonicalUrl, questionTitle, answerAuthor),
    network: "quora",
    text: questionTitle
  };
}

function buildGitHubIssueApiUrl({ owner, repo, number }) {
  return `https://api.github.com/repos/${owner}/${repo}/issues/${number}`;
}

function buildGitHubIssueCommentApiUrl({ owner, repo }, commentId) {
  return `https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}`;
}

function buildGitHubReviewCommentApiUrl({ owner, repo }, commentId) {
  return `https://api.github.com/repos/${owner}/${repo}/pulls/comments/${commentId}`;
}

function buildGitHubReviewApiUrl({ owner, repo, number }, reviewId) {
  return `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/reviews/${reviewId}`;
}

async function fetchGitHubApiJson(url, options = {}) {
  return fetchJson(url, {
    headers: GITHUB_API_HEADERS,
    signal: options.signal
  });
}

function buildGitHubEmbedHtml(resource, canonicalUrl, parent, bodyText, comment, commentReference) {
  const isPull = Boolean(parent.pull_request) || resource.kind === "pull";
  const numberLabel = `${isPull ? "PR" : "Issue"} #${resource.number}`;
  const repoLabel = `${resource.owner}/${resource.repo}`;
  const metaParts = [repoLabel, numberLabel, parent.state].filter(Boolean);
  const isComment = Boolean(comment);
  const title = isComment
    ? `${commentReference?.type === "review" ? "Review" : "Comment"} by ${comment.user?.login ?? "unknown"}`
    : compactWhitespace(parent.title ?? `${isPull ? "Pull request" : "Issue"} ${resource.number}`);

  return buildSocialCardHtml({
    actions: [
      {
        href: canonicalUrl,
        label: "Open on GitHub"
      }
    ],
    canonicalUrl,
    context: isComment && parent.title ? { href: parent.html_url, label: `On ${parent.title}` } : null,
    eyebrow: `GitHub ${isComment ? "comment" : isPull ? "pull request" : "issue"}`,
    metaParts,
    networkClass: "github",
    previewText: bodyText,
    title
  });
}

async function fetchGitHubEmbed(canonicalUrl, options = {}) {
  const parsedUrl = new URL(canonicalUrl);
  const resource = getGitHubResource(parsedUrl);
  if (!resource) {
    throw new SocialEmbedError(400, "Enter a GitHub issue or pull request URL.");
  }

  const parent = await fetchGitHubApiJson(buildGitHubIssueApiUrl(resource), options);
  const commentReference = getGitHubCommentReference(parsedUrl);
  let comment = null;
  let text = combineText(parent.title ?? "", compactWhitespace(parent.body ?? ""));

  if (commentReference) {
    switch (commentReference.type) {
      case "issuecomment":
        comment = await fetchGitHubApiJson(buildGitHubIssueCommentApiUrl(resource, commentReference.commentId), options);
        break;
      case "reviewcomment":
        comment = await fetchGitHubApiJson(buildGitHubReviewCommentApiUrl(resource, commentReference.commentId), options);
        break;
      case "review":
        comment = await fetchGitHubApiJson(buildGitHubReviewApiUrl(resource, commentReference.commentId), options);
        break;
      default:
        comment = null;
    }

    text = compactWhitespace(comment?.body ?? "");
  }

  return {
    canonicalUrl,
    html: buildGitHubEmbedHtml(resource, canonicalUrl, parent, text, comment, commentReference),
    network: "github",
    text
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
    case "tiktok":
      return fetchTikTokOEmbed(canonicalUrl, options);
    case "youtube":
      return fetchYouTubeEmbed(canonicalUrl, options);
    case "reddit":
      return fetchRedditEmbed(canonicalUrl, options);
    case "hackernews":
      return fetchHackerNewsEmbed(canonicalUrl, options);
    case "lobsters":
      return fetchLobstersEmbed(canonicalUrl, options);
    case "quora":
      return fetchQuoraEmbed(canonicalUrl);
    case "github":
      return fetchGitHubEmbed(canonicalUrl, options);
    default:
      throw new SocialEmbedError(400, "Unsupported post URL.");
  }
}
