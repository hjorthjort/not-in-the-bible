type BibleHubRoute = {
  path: string;
};

// Bible Hub covers the core canon and much of the deuterocanon, but not every
// source-specific Greek/apocryphal book we index.
const BIBLE_HUB_VERSE_ROUTES: Record<string, BibleHubRoute> = {
  GEN: { path: "genesis" },
  EXO: { path: "exodus" },
  LEV: { path: "leviticus" },
  NUM: { path: "numbers" },
  DEU: { path: "deuteronomy" },
  JOS: { path: "joshua" },
  JDG: { path: "judges" },
  RUT: { path: "ruth" },
  "1SA": { path: "1_samuel" },
  "2SA": { path: "2_samuel" },
  "1KI": { path: "1_kings" },
  "2KI": { path: "2_kings" },
  "1CH": { path: "1_chronicles" },
  "2CH": { path: "2_chronicles" },
  EZR: { path: "ezra" },
  NEH: { path: "nehemiah" },
  EST: { path: "esther" },
  JOB: { path: "job" },
  PSA: { path: "psalms" },
  PRO: { path: "proverbs" },
  ECC: { path: "ecclesiastes" },
  SNG: { path: "songs" },
  ISA: { path: "isaiah" },
  JER: { path: "jeremiah" },
  LAM: { path: "lamentations" },
  EZK: { path: "ezekiel" },
  DAN: { path: "daniel" },
  HOS: { path: "hosea" },
  JOL: { path: "joel" },
  AMO: { path: "amos" },
  OBA: { path: "obadiah" },
  JON: { path: "jonah" },
  MIC: { path: "micah" },
  NAM: { path: "nahum" },
  HAB: { path: "habakkuk" },
  ZEP: { path: "zephaniah" },
  HAG: { path: "haggai" },
  ZEC: { path: "zechariah" },
  MAL: { path: "malachi" },
  MAT: { path: "matthew" },
  MRK: { path: "mark" },
  LUK: { path: "luke" },
  JHN: { path: "john" },
  ACT: { path: "acts" },
  ROM: { path: "romans" },
  "1CO": { path: "1_corinthians" },
  "2CO": { path: "2_corinthians" },
  GAL: { path: "galatians" },
  EPH: { path: "ephesians" },
  PHP: { path: "philippians" },
  COL: { path: "colossians" },
  "1TH": { path: "1_thessalonians" },
  "2TH": { path: "2_thessalonians" },
  "1TI": { path: "1_timothy" },
  "2TI": { path: "2_timothy" },
  TIT: { path: "titus" },
  PHM: { path: "philemon" },
  HEB: { path: "hebrews" },
  JAS: { path: "james" },
  "1PE": { path: "1_peter" },
  "2PE": { path: "2_peter" },
  "1JN": { path: "1_john" },
  "2JN": { path: "2_john" },
  "3JN": { path: "3_john" },
  JUD: { path: "jude" },
  REV: { path: "revelation" },
  TOB: { path: "catholic/tobit" },
  JDT: { path: "catholic/judith" },
  WIS: { path: "catholic/wisdom" },
  SIR: { path: "catholic/sirach" },
  BAR: { path: "catholic/baruch" },
  SUS: { path: "apocrypha/susanna" },
  BEL: { path: "apocrypha/bel_and_the_dragon" },
  "1MA": { path: "catholic/1_maccabees" },
  "2MA": { path: "catholic/2_maccabees" },
  MAN: { path: "apocrypha/prayer_of_manasseh" },
  "1ES": { path: "apocrypha/1_esdras" },
  "2ES": { path: "apocrypha/2_esdras" }
};

type VerseUrlArgs = {
  bookCode: string;
  chapter: number;
  verse: number;
  fallbackUrl: string;
};

export function buildBibleHubVerseUrl(bookCode: string, chapter: number, verse: number): string | null {
  const route = BIBLE_HUB_VERSE_ROUTES[bookCode];
  if (!route) {
    return null;
  }

  return `https://biblehub.com/${route.path}/${chapter}-${verse}.htm`;
}

export function getPreferredVerseUrl({ bookCode, chapter, verse, fallbackUrl }: VerseUrlArgs): string {
  return buildBibleHubVerseUrl(bookCode, chapter, verse) ?? fallbackUrl;
}
