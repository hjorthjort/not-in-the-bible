import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { BIBLE_SOURCES, type BibleSource } from "./bible-sources.js";

const OUTPUT_DIR = path.resolve("data");
const SOURCE_DIR = path.join(OUTPUT_DIR, "source");
const LEGACY_OUTPUT_FILES = [
  path.join(OUTPUT_DIR, "bible-index.json"),
  path.join(OUTPUT_DIR, "bible-words.json"),
  path.join(OUTPUT_DIR, "bible-verses.json"),
  path.join(OUTPUT_DIR, "bible-meta.json")
];

const BOOKS: Record<string, { name: string; slug: string }> = {
  GEN: { name: "Genesis", slug: "genesis" },
  EXO: { name: "Exodus", slug: "exodus" },
  LEV: { name: "Leviticus", slug: "leviticus" },
  NUM: { name: "Numbers", slug: "numbers" },
  DEU: { name: "Deuteronomy", slug: "deuteronomy" },
  JOS: { name: "Joshua", slug: "joshua" },
  JDG: { name: "Judges", slug: "judges" },
  RUT: { name: "Ruth", slug: "ruth" },
  "1SA": { name: "1 Samuel", slug: "1_samuel" },
  "2SA": { name: "2 Samuel", slug: "2_samuel" },
  "1KI": { name: "1 Kings", slug: "1_kings" },
  "2KI": { name: "2 Kings", slug: "2_kings" },
  "1CH": { name: "1 Chronicles", slug: "1_chronicles" },
  "2CH": { name: "2 Chronicles", slug: "2_chronicles" },
  EZR: { name: "Ezra", slug: "ezra" },
  NEH: { name: "Nehemiah", slug: "nehemiah" },
  EST: { name: "Esther", slug: "esther" },
  JOB: { name: "Job", slug: "job" },
  PSA: { name: "Psalms", slug: "psalms" },
  PRO: { name: "Proverbs", slug: "proverbs" },
  ECC: { name: "Ecclesiastes", slug: "ecclesiastes" },
  SNG: { name: "Song of Solomon", slug: "songs" },
  ISA: { name: "Isaiah", slug: "isaiah" },
  JER: { name: "Jeremiah", slug: "jeremiah" },
  LAM: { name: "Lamentations", slug: "lamentations" },
  EZK: { name: "Ezekiel", slug: "ezekiel" },
  DAN: { name: "Daniel", slug: "daniel" },
  HOS: { name: "Hosea", slug: "hosea" },
  JOL: { name: "Joel", slug: "joel" },
  AMO: { name: "Amos", slug: "amos" },
  OBA: { name: "Obadiah", slug: "obadiah" },
  JON: { name: "Jonah", slug: "jonah" },
  MIC: { name: "Micah", slug: "micah" },
  NAM: { name: "Nahum", slug: "nahum" },
  HAB: { name: "Habakkuk", slug: "habakkuk" },
  ZEP: { name: "Zephaniah", slug: "zephaniah" },
  HAG: { name: "Haggai", slug: "haggai" },
  ZEC: { name: "Zechariah", slug: "zechariah" },
  MAL: { name: "Malachi", slug: "malachi" },
  MAT: { name: "Matthew", slug: "matthew" },
  MRK: { name: "Mark", slug: "mark" },
  LUK: { name: "Luke", slug: "luke" },
  JHN: { name: "John", slug: "john" },
  ACT: { name: "Acts", slug: "acts" },
  ROM: { name: "Romans", slug: "romans" },
  "1CO": { name: "1 Corinthians", slug: "1_corinthians" },
  "2CO": { name: "2 Corinthians", slug: "2_corinthians" },
  GAL: { name: "Galatians", slug: "galatians" },
  EPH: { name: "Ephesians", slug: "ephesians" },
  PHP: { name: "Philippians", slug: "philippians" },
  COL: { name: "Colossians", slug: "colossians" },
  "1TH": { name: "1 Thessalonians", slug: "1_thessalonians" },
  "2TH": { name: "2 Thessalonians", slug: "2_thessalonians" },
  "1TI": { name: "1 Timothy", slug: "1_timothy" },
  "2TI": { name: "2 Timothy", slug: "2_timothy" },
  TIT: { name: "Titus", slug: "titus" },
  PHM: { name: "Philemon", slug: "philemon" },
  HEB: { name: "Hebrews", slug: "hebrews" },
  JAS: { name: "James", slug: "james" },
  "1PE": { name: "1 Peter", slug: "1_peter" },
  "2PE": { name: "2 Peter", slug: "2_peter" },
  "1JN": { name: "1 John", slug: "1_john" },
  "2JN": { name: "2 John", slug: "2_john" },
  "3JN": { name: "3 John", slug: "3_john" },
  JUD: { name: "Jude", slug: "jude" },
  REV: { name: "Revelation", slug: "revelation" }
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

function toBibleHubUrl(book: { slug: string }, chapter: number, verse: number): string {
  return `https://biblehub.com/${book.slug}/${chapter}-${verse}.htm`;
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

async function downloadSourceArchive(source: BibleSource): Promise<string> {
  mkdirSync(SOURCE_DIR, { recursive: true });
  const archivePath = path.join(SOURCE_DIR, `${source.id}.zip`);

  if (existsSync(archivePath)) {
    return archivePath;
  }

  const response = await fetch(source.archiveUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${source.name} from ${source.archiveUrl}.`);
  }

  await pipeline(response.body, createWriteStream(archivePath));
  return archivePath;
}

function buildIndexForSource(sourceZip: string): {
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
        url: toBibleHubUrl(book, verse.chapter, verse.verse),
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
    const { stats, verses, words } = buildIndexForSource(sourceZip);
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
      defaultSourceId: BIBLE_SOURCES[0].id,
      sources: catalog
    })
  );
}

await main();
