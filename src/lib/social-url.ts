export type SocialNetworkId = "x" | "instagram" | "bluesky" | "facebook" | "threads" | "tiktok";

export const SOCIAL_NETWORK_LABELS: Record<SocialNetworkId, string> = {
  x: "X",
  instagram: "Instagram",
  bluesky: "Bluesky",
  facebook: "Facebook",
  threads: "Threads",
  tiktok: "TikTok"
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

    if (host === "threads.net" || host === "threads.com") {
      return "threads";
    }

    if (host === "tiktok.com") {
      return "tiktok";
    }

    return null;
  } catch {
    return null;
  }
}

export function isSupportedSocialUrl(value: string): boolean {
  return getSocialNetworkFromUrl(value) !== null;
}
