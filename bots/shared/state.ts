import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PlatformId, StateFile } from "./types.js";

const DEFAULT_STATE: StateFile = {
  cursor: null,
  processedIds: [],
  retryCounts: {},
  updatedAt: new Date(0).toISOString()
};

async function loadStateFile(filePath: string): Promise<StateFile> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<StateFile>;
    return {
      cursor: parsed.cursor ?? null,
      processedIds: Array.isArray(parsed.processedIds) ? parsed.processedIds : [],
      retryCounts: parsed.retryCounts ?? {},
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString()
    };
  } catch {
    return {
      ...DEFAULT_STATE,
      updatedAt: new Date().toISOString()
    };
  }
}

export class StateStore {
  readonly #filePath: string;

  #state: StateFile | null = null;

  constructor(stateDir: string, platform: PlatformId) {
    this.#filePath = path.join(stateDir, `${platform}.json`);
  }

  async #ensureLoaded(): Promise<StateFile> {
    if (this.#state) {
      return this.#state;
    }

    await mkdir(path.dirname(this.#filePath), { recursive: true });
    this.#state = await loadStateFile(this.#filePath);
    return this.#state;
  }

  async #flush(): Promise<void> {
    const state = await this.#ensureLoaded();
    state.updatedAt = new Date().toISOString();
    const tempPath = `${this.#filePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(tempPath, this.#filePath);
  }

  async getCursor(): Promise<string | null> {
    return (await this.#ensureLoaded()).cursor;
  }

  async setCursor(cursor: string | null): Promise<void> {
    const state = await this.#ensureLoaded();
    state.cursor = cursor;
    await this.#flush();
  }

  async hasProcessed(id: string): Promise<boolean> {
    return (await this.#ensureLoaded()).processedIds.includes(id);
  }

  async markProcessed(id: string): Promise<void> {
    const state = await this.#ensureLoaded();
    if (!state.processedIds.includes(id)) {
      state.processedIds.push(id);
    }

    if (state.processedIds.length > 2000) {
      state.processedIds.splice(0, state.processedIds.length - 2000);
    }

    delete state.retryCounts[id];
    await this.#flush();
  }

  async incrementRetry(id: string): Promise<number> {
    const state = await this.#ensureLoaded();
    const count = (state.retryCounts[id] ?? 0) + 1;
    state.retryCounts[id] = count;
    await this.#flush();
    return count;
  }
}

export function createStateStore(stateDir: string, platform: PlatformId): StateStore {
  return new StateStore(stateDir, platform);
}
