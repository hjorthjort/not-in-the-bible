import { parseCommonCliOptions, runAdapters } from "../shared/runtime.js";
import { createBlueskyAdapter } from "../bluesky/adapter.js";
import { BlueskyClient } from "../bluesky/client.js";
import { createRedditAdapter } from "../reddit/adapter.js";
import { RedditClient } from "../reddit/client.js";
import { createXAdapter } from "../x/adapter.js";
import { XClient } from "../x/client.js";

const cli = parseCommonCliOptions(process.argv.slice(2));

await runAdapters(
  [
    createXAdapter(XClient.fromEnv(process.env)),
    createBlueskyAdapter(BlueskyClient.fromEnv(process.env)),
    createRedditAdapter(RedditClient.fromEnv(process.env))
  ],
  cli
);
