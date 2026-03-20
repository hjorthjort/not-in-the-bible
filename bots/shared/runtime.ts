import { setTimeout as sleep } from "node:timers/promises";

import { createStateStore, type StateStore } from "./state.js";
import type { AdapterRuntimeContext, PlatformId, SharedRuntimeOptions } from "./types.js";

export type CommonCliOptions = {
  dryRun: boolean;
  once: boolean;
};

export type BotAdapter = {
  platform: PlatformId;
  pollOnce: (context: AdapterRuntimeContext & { state: StateStore }) => Promise<number>;
};

function parseBooleanFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseCommonCliOptions(argv: string[]): CommonCliOptions {
  return {
    dryRun: parseBooleanFlag(argv, "--dry-run"),
    once: parseBooleanFlag(argv, "--once")
  };
}

export function createRuntimeOptions(cli: CommonCliOptions): SharedRuntimeOptions {
  const siteOrigin = process.env.SITE_ORIGIN?.trim();
  if (!siteOrigin) {
    throw new Error("Missing required SITE_ORIGIN environment variable.");
  }

  return {
    dryRun: cli.dryRun,
    pollIntervalMs: readPositiveInteger(process.env.BOT_POLL_INTERVAL_SECONDS, 60) * 1000,
    siteOrigin,
    sourceId: process.env.BOT_BIBLE_SOURCE?.trim() || "kjv",
    stateDir: process.env.BOT_STATE_DIR?.trim() || "bots/state"
  };
}

export async function runAdapter(adapter: BotAdapter, cli: CommonCliOptions): Promise<void> {
  const options = createRuntimeOptions(cli);
  const state = createStateStore(options.stateDir, adapter.platform);
  const context = {
    log: console,
    options,
    state
  };

  do {
    try {
      const processed = await adapter.pollOnce(context);
      context.log.info(`[${adapter.platform}] processed ${processed} item(s)`);
    } catch (error) {
      context.log.error(`[${adapter.platform}]`, error);
    }

    if (cli.once) {
      break;
    }

    await sleep(options.pollIntervalMs);
  } while (true);
}

export async function runAdapters(adapters: BotAdapter[], cli: CommonCliOptions): Promise<void> {
  await Promise.all(adapters.map((adapter) => runAdapter(adapter, cli)));
}
