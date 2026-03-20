import { parseCommonCliOptions, runAdapter } from "../shared/runtime.js";
import { createBlueskyAdapter } from "./adapter.js";
import { BlueskyClient } from "./client.js";

const cli = parseCommonCliOptions(process.argv.slice(2));
await runAdapter(createBlueskyAdapter(BlueskyClient.fromEnv(process.env)), cli);
