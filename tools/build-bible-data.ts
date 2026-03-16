import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { BIBLE_SOURCES, DEFAULT_SOURCE_ID, type BibleSource } from "./bible-sources.js";

const OUTPUT_DIR = path.resolve("data");
const SOURCE_DIR = path.join(OUTPUT_DIR, "source");
const DOWNLOAD_RETRY_COUNT = 4;
const DOWNLOAD_RETRY_DELAY_MS = 1_000;
const LEGACY_OUTPUT_FILES = [
  path.join(OUTPUT_DIR, "bible-index.json"),
  path.join(OUTPUT_DIR, "bible-words.json"),
  path.join(OUTPUT_DIR, "bible-verses.json"),
  path.join(OUTPUT_DIR, "bible-meta.json")
];

const BOOKS: Record<string, { name: string }> = {
  GEN: { name: "Genesis" },
  EXO: { name: "Exodus" },
  LEV: { name: "Leviticus" },
  NUM: { name: "Numbers" },
  DEU: { name: "Deuteronomy" },
  JOS: { name: "Joshua" },
  JDG: { name: "Judges" },
  RUT: { name: "Ruth" },
  "1SA": { name: "1 Samuel" },
  "2SA": { name: "2 Samuel" },
  "1KI": { name: "1 Kings" },
  "2KI": { name: "2 Kings" },
  "1CH": { name: "1 Chronicles" },
  "2CH": { name: "2 Chronicles" },
  EZR: { name: "Ezra" },
  NEH: { name: "Nehemiah" },
  EST: { name: "Esther" },
  JOB: { name: "Job" },
  PSA: { name: "Psalms" },
  PRO: { name: "Proverbs" },
  ECC: { name: "Ecclesiastes" },
  SNG: { name: "Song of Solomon" },
  ISA: { name: "Isaiah" },
  JER: { name: "Jeremiah" },
  LAM: { name: "Lamentations" },
  EZK: { name: "Ezekiel" },
  DAN: { name: "Daniel" },
  HOS: { name: "Hosea" },
  JOL: { name: "Joel" },
  AMO: { name: "Amos" },
  OBA: { name: "Obadiah" },
  JON: { name: "Jonah" },
  MIC: { name: "Micah" },
  NAM: { name: "Nahum" },
  HAB: { name: "Habakkuk" },
  ZEP: { name: "Zephaniah" },
  HAG: { name: "Haggai" },
  ZEC: { name: "Zechariah" },
  MAL: { name: "Malachi" },
  MAT: { name: "Matthew" },
  MRK: { name: "Mark" },
  LUK: { name: "Luke" },
  JHN: { name: "John" },
  ACT: { name: "Acts" },
  ROM: { name: "Romans" },
  "1CO": { name: "1 Corinthians" },
  "2CO": { name: "2 Corinthians" },
  GAL: { name: "Galatians" },
  EPH: { name: "Ephesians" },
  PHP: { name: "Philippians" },
  COL: { name: "Colossians" },
  "1TH": { name: "1 Thessalonians" },
  "2TH": { name: "2 Thessalonians" },
  "1TI": { name: "1 Timothy" },
  "2TI": { name: "2 Timothy" },
  TIT: { name: "Titus" },
  PHM: { name: "Philemon" },
  HEB: { name: "Hebrews" },
  JAS: { name: "James" },
  "1PE": { name: "1 Peter" },
  "2PE": { name: "2 Peter" },
  "1JN": { name: "1 John" },
  "2JN": { name: "2 John" },
  "3JN": { name: "3 John" },
  JUD: { name: "Jude" },
  REV: { name: "Revelation" },
  TOB: { name: "Tobit" },
  JDT: { name: "Judith" },
  ESG: { name: "Esther (Greek)" },
  WIS: { name: "Wisdom" },
  SIR: { name: "Sirach" },
  BAR: { name: "Baruch" },
  LJE: { name: "Letter of Jeremiah" },
  SUS: { name: "Susanna" },
  BEL: { name: "Bel and the Dragon" },
  "1MA": { name: "1 Maccabees" },
  "2MA": { name: "2 Maccabees" },
  "3MA": { name: "3 Maccabees" },
  MAN: { name: "Prayer of Manasseh" },
  "1ES": { name: "1 Esdras" },
  "2ES": { name: "2 Esdras" },
  DAG: { name: "Daniel (Greek)" },
  PS: { name: "Psalm 151" }
};

const CHAPTER_FILE_PATTERN = /^([1-3]?[A-Z]{2,3})(\d{2,3})\.htm$/;
const TOKEN_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

type ParsedVerse = {
  bookCode: string;
  chapter: number;
  verse: number;
  text: string;
};

type IndexedVerse = ParsedVerse & {
  id: number;
  bookName: string;
  reference: string;
  url: string;
};

function decodeHtml(input: string): string {
  return input
    .replace(/&#160;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(input: string): string {
  return decodeHtml(
    input
      .replace(/<a\b[^>]*class="notemark"[^>]*>.*?<\/a>/gis, " ")
      .replace(/<span\b[^>]*class="popup"[^>]*>.*?<\/span>/gis, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWord(word: string): string {
  return word
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase();
}

function toSourceVerseUrl(source: BibleSource, filename: string, verse: number): string {
  return `${source.sourceUrl}${filename}#V${verse}`;
}

function parseVerses(html: string, bookCode: string, chapter: number): ParsedVerse[] {
  const mainContent = html.split('<div class="footnote">')[0] ?? html;
  const matches = [
    ...mainContent.matchAll(/<span class="verse" id="V(\d+)">\d+&#160;<\/span>([\s\S]*?)(?=<span class="verse" id="V\d+">|<ul class='tnav'>)/g)
  ];

  return matches
    .map((match) => {
      const verse = Number(match[1]);
      const text = stripTags(match[2]);
      return {
        bookCode,
        chapter,
        verse,
        text
      };
    })
    .filter((entry) => entry.text);
}

function listArchiveFiles(sourceZip: string): string[] {
  const output = execFileSync("unzip", ["-Z1", sourceZip], { encoding: "utf8" });
  return output.split("\n").filter(Boolean);
}

function readArchiveFile(sourceZip: string, filename: string): string {
  return execFileSync("unzip", ["-p", sourceZip, filename], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
}

function isValidArchive(sourceZip: string): boolean {
  try {
    listArchiveFiles(sourceZip);
    return true;
  } catch {
    return false;
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function downloadSourceArchiveOnce(source: BibleSource, archivePath: string): Promise<void> {
  const tempArchivePath = `${archivePath}.${process.pid}.part`;
  rmSync(tempArchivePath, { force: true });

  const response = await fetch(source.archiveUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }

  if (!response.body) {
    throw new Error("Response body was empty.");
  }

  try {
    await pipeline(response.body, createWriteStream(tempArchivePath));
    renameSync(tempArchivePath, archivePath);

    if (!isValidArchive(archivePath)) {
      rmSync(archivePath, { force: true });
      throw new Error("Downloaded archive is not a readable zip file.");
    }
  } catch (error) {
    rmSync(tempArchivePath, { force: true });
    throw error;
  }
}

async function downloadSourceArchive(source: BibleSource): Promise<string> {
  mkdirSync(SOURCE_DIR, { recursive: true });
  const archivePath = path.join(SOURCE_DIR, `${source.id}.zip`);

  if (existsSync(archivePath)) {
    if (isValidArchive(archivePath)) {
      return archivePath;
    }

    console.warn(`Cached archive for ${source.name} is invalid. Downloading a fresh copy.`);
    rmSync(archivePath, { force: true });
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= DOWNLOAD_RETRY_COUNT; attempt += 1) {
    try {
      await downloadSourceArchiveOnce(source, archivePath);
      return archivePath;
    } catch (error) {
      lastError = error;
      rmSync(archivePath, { force: true });
      rmSync(`${archivePath}.${process.pid}.part`, { force: true });

      if (attempt === DOWNLOAD_RETRY_COUNT) {
        break;
      }

      console.warn(
        `Download failed for ${source.name} (attempt ${attempt}/${DOWNLOAD_RETRY_COUNT}): ${formatError(error)}. Retrying...`
      );
      await wait(DOWNLOAD_RETRY_DELAY_MS * attempt);
    }
  }

  throw new Error(`Failed to download ${source.name} from ${source.archiveUrl}: ${formatError(lastError)}`);
}

function buildIndexForSource(source: BibleSource, sourceZip: string): {
  stats: { verseCount: number; indexedWordCount: number };
  verses: IndexedVerse[];
  words: Record<string, number[]>;
} {
  const archiveFiles = listArchiveFiles(sourceZip);
  const chapterFiles = archiveFiles
    .map((filename) => {
      const match = filename.match(CHAPTER_FILE_PATTERN);
      if (!match) {
        return null;
      }

      const [, bookCode, chapterDigits] = match;
      if (!BOOKS[bookCode]) {
        return null;
      }

      return {
        filename,
        bookCode,
        chapter: Number(chapterDigits)
      };
    })
    .filter((entry): entry is { filename: string; bookCode: string; chapter: number } => Boolean(entry))
    .sort((left, right) => left.filename.localeCompare(right.filename));

  const verses: IndexedVerse[] = [];
  const wordIndex = new Map<string, number[]>();

  for (const chapterFile of chapterFiles) {
    const html = readArchiveFile(sourceZip, chapterFile.filename);
    const parsedVerses = parseVerses(html, chapterFile.bookCode, chapterFile.chapter);

    for (const verse of parsedVerses) {
      const book = BOOKS[verse.bookCode];
      const id = verses.length;
      const reference = `${book.name} ${verse.chapter}:${verse.verse}`;
      verses.push({
        id,
        bookCode: verse.bookCode,
        bookName: book.name,
        chapter: verse.chapter,
        verse: verse.verse,
        reference,
        url: toSourceVerseUrl(source, chapterFile.filename, verse.verse),
        text: verse.text
      });

      const seenInVerse = new Set<string>();
      const tokens = verse.text.match(TOKEN_PATTERN) ?? [];
      for (const token of tokens) {
        const normalized = normalizeWord(token);
        if (!normalized || seenInVerse.has(normalized)) {
          continue;
        }

        seenInVerse.add(normalized);
        const entries = wordIndex.get(normalized) ?? [];
        entries.push(id);
        wordIndex.set(normalized, entries);
      }
    }
  }

  const words = Object.fromEntries([...wordIndex.entries()].sort((left, right) => left[0].localeCompare(right[0])));
  const stats = {
    verseCount: verses.length,
    indexedWordCount: Object.keys(words).length
  };

  return { stats, verses, words };
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const legacyFile of LEGACY_OUTPUT_FILES) {
    rmSync(legacyFile, { force: true });
  }

  for (const entry of readdirSync(OUTPUT_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "source") {
      continue;
    }

    if (!BIBLE_SOURCES.some((source) => source.id === entry.name)) {
      rmSync(path.join(OUTPUT_DIR, entry.name), { recursive: true, force: true });
    }
  }

  const catalog: Array<BibleSource & { stats: { verseCount: number; indexedWordCount: number } }> = [];

  for (const source of BIBLE_SOURCES) {
    const sourceZip = await downloadSourceArchive(source);
    const { stats, verses, words } = buildIndexForSource(source, sourceZip);
    const outputDir = path.join(OUTPUT_DIR, source.id);
    mkdirSync(outputDir, { recursive: true });

    const metadata = {
      id: source.id,
      name: source.name,
      shortName: source.shortName,
      description: source.description,
      sourceUrl: source.sourceUrl,
      archiveUrl: source.archiveUrl,
      license: source.license,
      licenseUrl: source.licenseUrl
    };

    writeFileSync(path.join(outputDir, "words.json"), JSON.stringify({ source: metadata, stats, words }));
    writeFileSync(path.join(outputDir, "verses.json"), JSON.stringify({ source: metadata, stats, verses }));
    writeFileSync(path.join(outputDir, "meta.json"), JSON.stringify({ source: metadata, stats }));

    catalog.push({ ...metadata, stats });
    console.log(`Indexed ${source.name}: ${stats.verseCount} verses, ${stats.indexedWordCount} words.`);
  }

  writeFileSync(
    path.join(OUTPUT_DIR, "sources.json"),
    JSON.stringify({
      defaultSourceId: DEFAULT_SOURCE_ID,
      sources: catalog
    })
  );
}

await main();
