import { readFile } from "node:fs/promises";
import path from "node:path";

type WordPayload = {
  words: Record<string, number[]>;
};

const wordLookupCache = new Map<string, Promise<Record<string, number[]>>>();

export async function loadWordLookup(sourceId: string): Promise<Record<string, number[]>> {
  const cached = wordLookupCache.get(sourceId);
  if (cached) {
    return cached;
  }

  const promise = readFile(path.join(process.cwd(), "data", sourceId, "words.json"), "utf8").then(
    (raw) => {
      const payload = JSON.parse(raw) as WordPayload;
      return payload.words;
    }
  );

  wordLookupCache.set(sourceId, promise);
  return promise;
}
