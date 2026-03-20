import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import { createStateStore } from "../../bots/shared/state.js";

test("state store persists cursor and processed ids", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "words-bot-state-"));

  try {
    const store = createStateStore(tempDir, "x");
    assert.equal(await store.getCursor(), null);

    await store.setCursor("200");
    await store.markProcessed("100");
    assert.equal(await store.hasProcessed("100"), true);

    const reloaded = createStateStore(tempDir, "x");
    assert.equal(await reloaded.getCursor(), "200");
    assert.equal(await reloaded.hasProcessed("100"), true);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});
