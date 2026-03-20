import { parseCommonCliOptions, runAdapter } from "../shared/runtime.js";
import { createXAdapter } from "./adapter.js";
import { XClient } from "./client.js";

const cli = parseCommonCliOptions(process.argv.slice(2));
await runAdapter(createXAdapter(XClient.fromEnv(process.env)), cli);
