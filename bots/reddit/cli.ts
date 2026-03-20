import { parseCommonCliOptions, runAdapter } from "../shared/runtime.js";
import { createRedditAdapter } from "./adapter.js";
import { RedditClient } from "./client.js";

const cli = parseCommonCliOptions(process.argv.slice(2));
await runAdapter(createRedditAdapter(RedditClient.fromEnv(process.env)), cli);
