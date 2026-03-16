const BIBLE_BOOK_ORDER = [
  "GEN",
  "EXO",
  "LEV",
  "NUM",
  "DEU",
  "JOS",
  "JDG",
  "RUT",
  "1SA",
  "2SA",
  "1KI",
  "2KI",
  "1CH",
  "2CH",
  "EZR",
  "NEH",
  "EST",
  "JOB",
  "PSA",
  "PRO",
  "ECC",
  "SNG",
  "ISA",
  "JER",
  "LAM",
  "EZK",
  "DAN",
  "HOS",
  "JOL",
  "AMO",
  "OBA",
  "JON",
  "MIC",
  "NAM",
  "HAB",
  "ZEP",
  "HAG",
  "ZEC",
  "MAL",
  "MAT",
  "MRK",
  "LUK",
  "JHN",
  "ACT",
  "ROM",
  "1CO",
  "2CO",
  "GAL",
  "EPH",
  "PHP",
  "COL",
  "1TH",
  "2TH",
  "1TI",
  "2TI",
  "TIT",
  "PHM",
  "HEB",
  "JAS",
  "1PE",
  "2PE",
  "1JN",
  "2JN",
  "3JN",
  "JUD",
  "REV",
  "TOB",
  "JDT",
  "ESG",
  "WIS",
  "SIR",
  "BAR",
  "LJE",
  "SUS",
  "BEL",
  "1MA",
  "2MA",
  "3MA",
  "MAN",
  "1ES",
  "2ES",
  "DAG",
  "PS"
] as const;

const BOOK_ORDER_INDEX = new Map<string, number>(BIBLE_BOOK_ORDER.map((bookCode, index) => [bookCode, index]));

type OrderedVerse = {
  id: number;
  bookCode: string;
  chapter: number;
  verse: number;
};

export function compareVersesByBibleOrder(left: OrderedVerse, right: OrderedVerse): number {
  const leftBookIndex = BOOK_ORDER_INDEX.get(left.bookCode) ?? Number.MAX_SAFE_INTEGER;
  const rightBookIndex = BOOK_ORDER_INDEX.get(right.bookCode) ?? Number.MAX_SAFE_INTEGER;

  if (leftBookIndex !== rightBookIndex) {
    return leftBookIndex - rightBookIndex;
  }

  if (left.bookCode !== right.bookCode) {
    return left.bookCode.localeCompare(right.bookCode);
  }

  if (left.chapter !== right.chapter) {
    return left.chapter - right.chapter;
  }

  if (left.verse !== right.verse) {
    return left.verse - right.verse;
  }

  return left.id - right.id;
}

export function sortVersesByBibleOrder<T extends OrderedVerse>(verses: T[]): T[] {
  return [...verses].sort(compareVersesByBibleOrder);
}
