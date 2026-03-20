type BskyStrongRef = {
  cid: string;
  uri: string;
};

type BskyPostRecord = {
  reply?: {
    parent: BskyStrongRef;
    root: BskyStrongRef;
  };
  text: string;
};

export type BskyPost = {
  author: {
    handle: string;
  };
  cid: string;
  record: BskyPostRecord;
  uri: string;
};

export type BskyNotification = {
  author: {
    handle: string;
  };
  cid: string;
  indexedAt: string;
  isRead?: boolean;
  reason: string;
  record: BskyPostRecord;
  uri: string;
};

type BskySession = {
  accessJwt: string;
  did: string;
};

type BskyListNotificationsResponse = {
  cursor?: string;
  notifications?: BskyNotification[];
};

type BskyGetPostsResponse = {
  posts?: BskyPost[];
};

type BskyUploadBlobResponse = {
  blob: Record<string, unknown>;
};

export class BlueskyClient {
  readonly #appPassword: string;

  readonly #fetchImpl: typeof fetch;

  readonly #handle: string;

  readonly #pdsUrl: string;

  #session: BskySession | null = null;

  constructor(
    credentials: {
      appPassword: string;
      handle: string;
      pdsUrl: string;
    },
    fetchImpl: typeof fetch = fetch
  ) {
    this.#appPassword = credentials.appPassword;
    this.#fetchImpl = fetchImpl;
    this.#handle = credentials.handle;
    this.#pdsUrl = credentials.pdsUrl.replace(/\/$/, "");
  }

  static fromEnv(env: NodeJS.ProcessEnv): BlueskyClient {
    const handle = env.BLUESKY_HANDLE?.trim();
    const appPassword = env.BLUESKY_APP_PASSWORD?.trim();
    const pdsUrl = env.BLUESKY_PDS_URL?.trim() || "https://bsky.social";

    if (!handle || !appPassword) {
      throw new Error("Missing Bluesky credentials. Expected BLUESKY_HANDLE and BLUESKY_APP_PASSWORD.");
    }

    return new BlueskyClient({
      appPassword,
      handle,
      pdsUrl
    });
  }

  async #login(): Promise<BskySession> {
    const response = await this.#fetchImpl(`${this.#pdsUrl}/xrpc/com.atproto.server.createSession`, {
      body: JSON.stringify({
        identifier: this.#handle,
        password: this.#appPassword
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(`Bluesky login failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      accessJwt: string;
      did: string;
    };
    this.#session = {
      accessJwt: payload.accessJwt,
      did: payload.did
    };
    return this.#session;
  }

  async #getSession(): Promise<BskySession> {
    return this.#session ?? this.#login();
  }

  async #requestJson<T>(input: {
    body?: BodyInit;
    headers?: Record<string, string>;
    method?: "GET" | "POST";
    url: string;
  }): Promise<T> {
    const session = await this.#getSession();
    const response = await this.#fetchImpl(input.url, {
      body: input.body,
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
        ...input.headers
      },
      method: input.method ?? "GET"
    });

    if (response.status === 401) {
      this.#session = null;
      return this.#requestJson(input);
    }

    if (!response.ok) {
      throw new Error(`Bluesky request failed with ${response.status} for ${input.url}`);
    }

    return (await response.json()) as T;
  }

  async listMentionNotifications(cursor: string | null): Promise<{
    cursor: string | null;
    notifications: BskyNotification[];
  }> {
    const endpoint = new URL(`${this.#pdsUrl}/xrpc/app.bsky.notification.listNotifications`);
    endpoint.searchParams.set("limit", "50");
    if (cursor) {
      endpoint.searchParams.set("cursor", cursor);
    }

    const payload = await this.#requestJson<BskyListNotificationsResponse>({
      url: endpoint.toString()
    });
    const notifications = (payload.notifications ?? [])
      .filter((notification) => notification.reason === "mention")
      .sort((left, right) => left.indexedAt.localeCompare(right.indexedAt));

    return {
      cursor: payload.cursor ?? null,
      notifications
    };
  }

  async getPost(uri: string): Promise<BskyPost | null> {
    const endpoint = new URL(`${this.#pdsUrl}/xrpc/app.bsky.feed.getPosts`);
    endpoint.searchParams.append("uris", uri);

    const payload = await this.#requestJson<BskyGetPostsResponse>({
      url: endpoint.toString()
    });

    return payload.posts?.[0] ?? null;
  }

  async #uploadBlob(buffer: Buffer): Promise<Record<string, unknown>> {
    const payload = await this.#requestJson<BskyUploadBlobResponse>({
      body: new Uint8Array(buffer),
      headers: {
        "Content-Type": "image/png"
      },
      method: "POST",
      url: `${this.#pdsUrl}/xrpc/com.atproto.repo.uploadBlob`
    });

    return payload.blob;
  }

  async createReply(options: {
    parent: BskyPost;
    screenshot: Buffer | null;
    text: string;
  }): Promise<void> {
    const session = await this.#getSession();
    const root = options.parent.record.reply?.root ?? {
      cid: options.parent.cid,
      uri: options.parent.uri
    };
    const parent = {
      cid: options.parent.cid,
      uri: options.parent.uri
    };
    const record: Record<string, unknown> = {
      $type: "app.bsky.feed.post",
      createdAt: new Date().toISOString(),
      reply: {
        parent,
        root
      },
      text: options.text
    };

    if (options.screenshot && options.screenshot.length > 0) {
      record.embed = {
        $type: "app.bsky.embed.images",
        images: [
          {
            alt: "Words in the Bible analysis",
            image: await this.#uploadBlob(options.screenshot)
          }
        ]
      };
    }

    await this.#requestJson({
      body: JSON.stringify({
        collection: "app.bsky.feed.post",
        record,
        repo: session.did
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST",
      url: `${this.#pdsUrl}/xrpc/com.atproto.repo.createRecord`
    });
  }
}
