import crypto from "node:crypto";

type XCredentials = {
  accessToken: string;
  accessTokenSecret: string;
  apiKey: string;
  apiSecret: string;
  botUserId: string;
};

type XApiUser = {
  id: string;
  username: string;
};

type XApiTweet = {
  author_id?: string;
  id: string;
  referenced_tweets?: Array<{
    id: string;
    type: "quoted" | "replied_to" | "retweeted";
  }>;
  text: string;
};

type XTimelineResponse = {
  data?: XApiTweet[];
  includes?: {
    users?: XApiUser[];
  };
  meta?: {
    newest_id?: string;
  };
};

type XSingleTweetResponse = {
  data: XApiTweet;
  includes?: {
    users?: XApiUser[];
  };
};

export type XTweet = {
  authorUsername: string | null;
  id: string;
  referencedTweets: Array<{
    id: string;
    type: "quoted" | "replied_to" | "retweeted";
  }>;
  text: string;
};

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function buildSignatureBaseString(
  method: string,
  url: URL,
  oauthParams: Record<string, string>,
  formParams: URLSearchParams | null
): string {
  const baseUrl = `${url.origin}${url.pathname}`;
  const parameterEntries: Array<[string, string]> = [];

  for (const [key, value] of url.searchParams.entries()) {
    parameterEntries.push([key, value]);
  }

  if (formParams) {
    for (const [key, value] of formParams.entries()) {
      parameterEntries.push([key, value]);
    }
  }

  for (const [key, value] of Object.entries(oauthParams)) {
    parameterEntries.push([key, value]);
  }

  parameterEntries.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    if (leftKey === rightKey) {
      return leftValue.localeCompare(rightValue);
    }

    return leftKey.localeCompare(rightKey);
  });

  const normalized = parameterEntries
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");

  return [
    method.toUpperCase(),
    encodeRfc3986(baseUrl),
    encodeRfc3986(normalized)
  ].join("&");
}

function buildAuthorizationHeader(
  method: string,
  inputUrl: string,
  credentials: XCredentials,
  formParams: URLSearchParams | null = null
): string {
  const url = new URL(inputUrl);
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0"
  };

  const signatureBaseString = buildSignatureBaseString(method, url, oauthParams, formParams);
  const signingKey = `${encodeRfc3986(credentials.apiSecret)}&${encodeRfc3986(credentials.accessTokenSecret)}`;
  oauthParams.oauth_signature = crypto
    .createHmac("sha1", signingKey)
    .update(signatureBaseString)
    .digest("base64");

  return `OAuth ${Object.entries(oauthParams)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeRfc3986(key)}="${encodeRfc3986(value)}"`)
    .join(", ")}`;
}

function sortTweetsAscending(tweets: XTweet[]): XTweet[] {
  return [...tweets].sort((left, right) => {
    const leftId = BigInt(left.id);
    const rightId = BigInt(right.id);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
}

function hydrateTweet(tweet: XApiTweet, includes?: XTimelineResponse["includes"]): XTweet {
  const usersById = new Map((includes?.users ?? []).map((user) => [user.id, user.username]));

  return {
    authorUsername: tweet.author_id ? (usersById.get(tweet.author_id) ?? null) : null,
    id: tweet.id,
    referencedTweets: tweet.referenced_tweets ?? [],
    text: tweet.text
  };
}

export class XClient {
  readonly #credentials: XCredentials;

  readonly #fetchImpl: typeof fetch;

  constructor(credentials: XCredentials, fetchImpl: typeof fetch = fetch) {
    this.#credentials = credentials;
    this.#fetchImpl = fetchImpl;
  }

  static fromEnv(env: NodeJS.ProcessEnv): XClient {
    const apiKey = env.X_API_KEY?.trim();
    const apiSecret = env.X_API_SECRET?.trim();
    const accessToken = env.X_ACCESS_TOKEN?.trim();
    const accessTokenSecret = env.X_ACCESS_TOKEN_SECRET?.trim();
    const botUserId = env.X_BOT_USER_ID?.trim();

    if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret || !botUserId) {
      throw new Error(
        "Missing X credentials. Expected X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET, and X_BOT_USER_ID."
      );
    }

    return new XClient({
      accessToken,
      accessTokenSecret,
      apiKey,
      apiSecret,
      botUserId
    });
  }

  async #requestJson<T>(options: {
    body?: string;
    formParams?: URLSearchParams | null;
    method: "GET" | "POST";
    url: string;
  }): Promise<T> {
    const response = await this.#fetchImpl(options.url, {
      body: options.body,
      headers: {
        Authorization: buildAuthorizationHeader(
          options.method,
          options.url,
          this.#credentials,
          options.formParams ?? null
        ),
        ...(options.body && options.formParams
          ? { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }
          : {}),
        ...(options.body && !options.formParams ? { "Content-Type": "application/json" } : {})
      },
      method: options.method
    });

    if (!response.ok) {
      throw new Error(`X API request failed with ${response.status} for ${options.url}`);
    }

    return (await response.json()) as T;
  }

  async listMentions(sinceId: string | null): Promise<{ newestId: string | null; tweets: XTweet[] }> {
    const endpoint = new URL(
      `https://api.x.com/2/users/${encodeURIComponent(this.#credentials.botUserId)}/mentions`
    );
    endpoint.searchParams.set("expansions", "author_id");
    endpoint.searchParams.set("tweet.fields", "author_id,created_at,referenced_tweets,text");
    endpoint.searchParams.set("user.fields", "username");
    endpoint.searchParams.set("max_results", "20");
    if (sinceId) {
      endpoint.searchParams.set("since_id", sinceId);
    }

    const payload = await this.#requestJson<XTimelineResponse>({
      method: "GET",
      url: endpoint.toString()
    });

    return {
      newestId: payload.meta?.newest_id ?? null,
      tweets: sortTweetsAscending((payload.data ?? []).map((tweet) => hydrateTweet(tweet, payload.includes)))
    };
  }

  async getTweet(tweetId: string): Promise<XTweet> {
    const endpoint = new URL(`https://api.x.com/2/tweets/${encodeURIComponent(tweetId)}`);
    endpoint.searchParams.set("expansions", "author_id");
    endpoint.searchParams.set("tweet.fields", "author_id,created_at,referenced_tweets,text");
    endpoint.searchParams.set("user.fields", "username");

    const payload = await this.#requestJson<XSingleTweetResponse>({
      method: "GET",
      url: endpoint.toString()
    });

    return hydrateTweet(payload.data, payload.includes);
  }

  async #uploadPng(buffer: Buffer): Promise<string> {
    const endpoint = "https://upload.twitter.com/1.1/media/upload.json";
    const formParams = new URLSearchParams({
      media_data: buffer.toString("base64")
    });
    const payload = await this.#requestJson<{ media_id_string: string }>({
      body: formParams.toString(),
      formParams,
      method: "POST",
      url: endpoint
    });

    return payload.media_id_string;
  }

  async createReply(options: {
    inReplyToTweetId: string;
    screenshot: Buffer | null;
    text: string;
  }): Promise<void> {
    const mediaIds =
      options.screenshot && options.screenshot.length > 0 ? [await this.#uploadPng(options.screenshot)] : [];
    const payload = {
      ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}),
      reply: {
        in_reply_to_tweet_id: options.inReplyToTweetId
      },
      text: options.text
    };

    await this.#requestJson({
      body: JSON.stringify(payload),
      method: "POST",
      url: "https://api.x.com/2/tweets"
    });
  }
}
