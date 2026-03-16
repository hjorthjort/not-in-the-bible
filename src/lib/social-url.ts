export type SocialNetworkId = "x" | "bluesky";

export const SOCIAL_NETWORK_LABELS: Record<SocialNetworkId, string> = {
  x: "X",
  bluesky: "Bluesky"
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

    return null;
  } catch {
    return null;
  }
}

export function isSupportedSocialUrl(value: string): boolean {
  return getSocialNetworkFromUrl(value) !== null;
}
