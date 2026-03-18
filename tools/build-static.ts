import { accessSync, constants, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUTPUT_DIR = path.resolve("out");
const DEPLOY_PATHS = ["404.html", "app-config.js", "assets", "data", "dist", "index.html", "styles.css"];
const DEFAULT_SITE_ORIGIN = "https://bible.b-useful.com";

function assertRequiredInput(relativePath: string): void {
  accessSync(relativePath, constants.F_OK);
}

function main(): void {
  for (const deployPath of DEPLOY_PATHS) {
    assertRequiredInput(deployPath);
  }

  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const deployPath of DEPLOY_PATHS) {
    cpSync(deployPath, path.join(OUTPUT_DIR, deployPath), { recursive: true });
  }

  const sourceArchiveDir = path.join(OUTPUT_DIR, "data", "source");
  if (existsSync(sourceArchiveDir)) {
    rmSync(sourceArchiveDir, { recursive: true, force: true });
  }

  writeGeneratedMetadata(OUTPUT_DIR);
}

main();

function writeGeneratedMetadata(outputDir: string): void {
  const siteOrigin = normalizeOrigin(process.env.SITE_ORIGIN ?? DEFAULT_SITE_ORIGIN);
  const homepageUrl = new URL("/", `${siteOrigin}/`).toString();

  writeFileSync(
    path.join(outputDir, "robots.txt"),
    ["User-agent: *", "Allow: /", "Disallow: /api/", "", `Sitemap: ${siteOrigin}/sitemap.xml`, ""].join("\n"),
    "utf8",
  );

  writeFileSync(
    path.join(outputDir, "sitemap.xml"),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      "  <url>",
      `    <loc>${homepageUrl}</loc>`,
      "  </url>",
      "</urlset>",
      "",
    ].join("\n"),
    "utf8",
  );
}

function normalizeOrigin(value: string): string {
  const url = new URL(value);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
