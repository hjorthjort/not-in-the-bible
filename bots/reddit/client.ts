type RedditTokenResponse = {
  access_token: string;
  expires_in: number;
};

type RedditListing<T> = {
  data?: {
    children?: Array<{
      data: T;
      kind: string;
    }>;
  };
};

export type RedditMessage = {
  body?: string;
  context?: string;
  id: string;
  name: string;
  parent_id?: string;
  subject?: string;
  was_comment?: boolean;
};

export type RedditThing = {
  body?: string;
  id: string;
  name: string;
  permalink?: string;
  selftext?: string;
  title?: string;
};

type RedditCredentials = {
  clientId: string;
  clientSecret: string;
  password: string;
  userAgent: string;
  username: string;
};

export class RedditClient {
  readonly #credentials: RedditCredentials;

  readonly #fetchImpl: typeof fetch;

  #token: { accessToken: string; expiresAt: number } | null = null;

  constructor(credentials: RedditCredentials, fetchImpl: typeof fetch = fetch) {
    this.#credentials = credentials;
    this.#fetchImpl = fetchImpl;
  }

  static fromEnv(env: NodeJS.ProcessEnv): RedditClient {
    const clientId = env.REDDIT_CLIENT_ID?.trim();
    const clientSecret = env.REDDIT_CLIENT_SECRET?.trim();
    const password = env.REDDIT_PASSWORD?.trim();
    const username = env.REDDIT_USERNAME?.trim();
    const userAgent = env.REDDIT_USER_AGENT?.trim();

    if (!clientId || !clientSecret || !password || !username || !userAgent) {
      throw new Error(
        "Missing Reddit credentials. Expected REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD, and REDDIT_USER_AGENT."
      );
    }

    return new RedditClient({
      clientId,
      clientSecret,
      password,
      userAgent,
      username
    });
  }

  async #getAccessToken(): Promise<string> {
    if (this.#token && this.#token.expiresAt > Date.now() + 30_000) {
      return this.#token.accessToken;
    }

    const response = await this.#fetchImpl("https://www.reddit.com/api/v1/access_token", {
      body: new URLSearchParams({
        grant_type: "password",
        password: this.#credentials.password,
        username: this.#credentials.username
      }),
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${this.#credentials.clientId}:${this.#credentials.clientSecret}`
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": this.#credentials.userAgent
      },
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(`Reddit token request failed with ${response.status}`);
    }

    const payload = (await response.json()) as RedditTokenResponse;
    this.#token = {
      accessToken: payload.access_token,
      expiresAt: Date.now() + payload.expires_in * 1000
    };
    return this.#token.accessToken;
  }

  async #requestJson<T>(input: {
    body?: BodyInit;
    method?: "GET" | "POST";
    path: string;
  }): Promise<T> {
    const accessToken = await this.#getAccessToken();
    const response = await this.#fetchImpl(`https://oauth.reddit.com${input.path}`, {
      body: input.body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": input.body ? "application/x-www-form-urlencoded" : "application/json",
        "User-Agent": this.#credentials.userAgent
      },
      method: input.method ?? "GET"
    });

    if (!response.ok) {
      throw new Error(`Reddit request failed with ${response.status} for ${input.path}`);
    }

    return (await response.json()) as T;
  }

  async listUnreadMentions(): Promise<RedditMessage[]> {
    const payload = await this.#requestJson<RedditListing<RedditMessage>>({
      path: "/message/unread.json?limit=100&mark=false"
    });

    return (payload.data?.children ?? [])
      .map((child) => child.data)
      .filter((message) => Boolean(message.parent_id));
  }

  async getThing(fullname: string): Promise<RedditThing | null> {
    const payload = await this.#requestJson<RedditListing<RedditThing>>({
      path: `/api/info.json?id=${encodeURIComponent(fullname)}`
    });

    return payload.data?.children?.[0]?.data ?? null;
  }

  async replyToThing(thingName: string, text: string): Promise<void> {
    await this.#requestJson({
      body: new URLSearchParams({
        api_type: "json",
        text,
        thing_id: thingName
      }),
      method: "POST",
      path: "/api/comment"
    });
  }

  async markRead(messageNames: string[]): Promise<void> {
    if (!messageNames.length) {
      return;
    }

    await this.#requestJson({
      body: new URLSearchParams({
        id: messageNames.join(",")
      }),
      method: "POST",
      path: "/api/read_message"
    });
  }
}
