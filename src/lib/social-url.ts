export type SocialNetworkId =
  | "x"
  | "instagram"
  | "bluesky"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "reddit"
  | "hackernews"
  | "lobsters"
  | "quora"
  | "github";

export const SOCIAL_NETWORK_LABELS: Record<SocialNetworkId, string> = {
  x: "X",
  instagram: "Instagram",
  bluesky: "Bluesky",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  reddit: "Reddit",
  hackernews: "Hacker News",
  lobsters: "Lobsters",
  quora: "Quora",
  github: "GitHub"
};

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
}

export function getSocialNetworkFromUrl(value: string): SocialNetworkId | null {
  try {
    const url = new URL(value.trim());
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
      const itemId = url.searchParams.get("id")?.trim() ?? "";
      if (url.pathname === "/item" && /^\d+$/.test(itemId)) {
        return "hackernews";
      }
    }

    if (host === "lobste.rs" && /^\/s\/[^/]+/.test(url.pathname)) {
      return "lobsters";
    }

    if (host === "quora.com" && url.pathname !== "/") {
      return "quora";
    }

    if (host === "github.com" && /^\/[^/]+\/[^/]+\/(?:issues|pull)\/\d+/.test(url.pathname)) {
      return "github";
    }

    return null;
  } catch {
    return null;
  }
}

export function isSupportedSocialUrl(value: string): boolean {
  return getSocialNetworkFromUrl(value) !== null;
}
