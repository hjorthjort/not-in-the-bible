import { accessSync, constants, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const OUTPUT_DIR = path.resolve("out");
const DEPLOY_PATHS = ["404.html", "app-config.js", "assets", "data", "dist", "index.html", "styles.css"];

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
}

main();
