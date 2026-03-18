import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT_DIR = path.resolve(".");
const OUT_DIR = path.join(ROOT_DIR, "out");
const PORT = 4174;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SITE_ORIGIN = (process.env.SITE_ORIGIN ?? "https://bible.b-useful.com").replace(/\/$/, "");

function assertExists(relativePath: string): void {
  assert.ok(existsSync(path.join(OUT_DIR, relativePath)), `Expected out/${relativePath} to exist.`);
}

function assertMissing(relativePath: string): void {
  assert.ok(!existsSync(path.join(OUT_DIR, relativePath)), `Did not expect out/${relativePath} to exist.`);
}

async function waitForServer(url: string, attempts = 40): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the server is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Timed out waiting for the static server to start.");
}

async function fetchText(pathname: string): Promise<{ status: number; body: string }> {
  const response = await fetch(`${BASE_URL}${pathname}`);
  return {
    status: response.status,
    body: await response.text()
  };
}

async function main(): Promise<void> {
  assert.ok(existsSync(OUT_DIR), "Expected out/ to exist. Run `npm run build` first.");

  assertExists("index.html");
  assertExists("404.html");
  assertExists("app-config.js");
  assertExists("robots.txt");
  assertExists("sitemap.xml");
  assertExists("styles.css");
  assertExists("assets/bible-wordmark.png");
  assertExists("dist/app.js");
  assertExists("data/sources.json");
  assertExists("data/kjv/words.json");
  assertExists("data/kjv/verses.json");
  assertMissing("data/source");
  assertMissing("src/app.ts");
  assertMissing("tools/build-static.ts");
  assertMissing("package.json");

  const sourceCatalog = JSON.parse(readFileSync(path.join(OUT_DIR, "data", "sources.json"), "utf8")) as {
    defaultSourceId: string;
    sources: Array<{ id: string }>;
  };
  assert.equal(sourceCatalog.defaultSourceId, "kjv");
  assert.ok(sourceCatalog.sources.length >= 1, "Expected at least one Bible source in the catalog.");

  const serverProcess = spawn(process.execPath, [path.join(ROOT_DIR, "server.mjs")], {
    cwd: OUT_DIR,
    env: {
      ...process.env,
      PORT: String(PORT)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const stderr: Buffer[] = [];
  serverProcess.stderr.on("data", (chunk: Buffer) => {
    stderr.push(chunk);
  });

  try {
    await waitForServer(`${BASE_URL}/`);

    const homePage = await fetchText("/");
    assert.equal(homePage.status, 200);
    assert.match(homePage.body, /<main id="app"/);
    assert.match(homePage.body, /<script src="\/app-config\.js"><\/script>/);
    assert.match(homePage.body, /<script type="module" src="\/dist\/app\.js"><\/script>/);

    const config = await fetchText("/app-config.js");
    assert.equal(config.status, 200);
    assert.match(config.body, /enableWordNormalization: true/);

    const robots = await fetchText("/robots.txt");
    assert.equal(robots.status, 200);
    assert.match(robots.body, /User-agent: \*/);
    assert.match(robots.body, /Disallow: \/api\//);
    assert.match(robots.body, new RegExp(`Sitemap: ${escapeRegExp(`${SITE_ORIGIN}/sitemap.xml`)}`));

    const sitemap = await fetchText("/sitemap.xml");
    assert.equal(sitemap.status, 200);
    assert.match(sitemap.body, /<urlset /);
    assert.match(sitemap.body, new RegExp(`<loc>${escapeRegExp(`${SITE_ORIGIN}/`)}</loc>`));

    const catalogResponse = await fetch(`${BASE_URL}/data/sources.json`);
    assert.equal(catalogResponse.status, 200);
    const catalogPayload = (await catalogResponse.json()) as { defaultSourceId: string };
    assert.equal(catalogPayload.defaultSourceId, "kjv");

    for (const pathname of ["/word/faith", "/tester/status/1234567890", "/definitely-not-a-route"]) {
      const response = await fetchText(pathname);
      assert.equal(response.status, 404);
      assert.match(response.body, /__redirect/);
      assert.match(response.body, /window\.location\.replace/);
    }
  } finally {
    serverProcess.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      serverProcess.once("exit", () => resolve());
      setTimeout(() => {
        serverProcess.kill("SIGKILL");
      }, 1_000);
    });

    if (serverProcess.exitCode && serverProcess.exitCode !== 0) {
      throw new Error(
        `Static smoke server exited with code ${serverProcess.exitCode}: ${Buffer.concat(stderr).toString("utf8")}`
      );
    }
  }
}

await main();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
