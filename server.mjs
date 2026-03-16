import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 4173);
const ROOT = process.cwd();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

function sendFile(response, filePath, statusCode = 200) {
  const contentType = MIME_TYPES[extname(filePath)] || "application/octet-stream";
  response.writeHead(statusCode, { "Content-Type": contentType });
  createReadStream(filePath).pipe(response);
}

function resolvePath(pathname) {
  const decodedPath = decodeURIComponent(pathname);
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const candidatePath = join(ROOT, normalizedPath);

  if (existsSync(candidatePath)) {
    return candidatePath;
  }

  return null;
}

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const candidatePath = resolvePath(pathname);

  if (candidatePath) {
    try {
      const fileStat = await stat(candidatePath);
      if (fileStat.isFile()) {
        sendFile(response, candidatePath);
        return;
      }
    } catch {
      // Fall through to the custom 404 page.
    }
  }

  sendFile(response, join(ROOT, "404.html"), 404);
}).listen(PORT, () => {
  console.log(`Serving static site on http://localhost:${PORT}`);
});
