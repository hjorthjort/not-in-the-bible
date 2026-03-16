export type FixtureExpectation = {
  sourceId: string;
  presentWords: string[];
  missingWords: string[];
};

export type TweetFixture = {
  id: string;
  title: string;
  sourceUrl: string | null;
  sourceDate: string | null;
  note: string;
  html: string;
  expectedText: string;
  expectedWords: string[];
  expectations: FixtureExpectation[];
};

export const tweetFixtures: TweetFixture[] = [
  {
    id: "same-word-several-times",
    title: "Repeated word in natural text",
    sourceUrl: "https://x.com/PriyankaLahiri_/status/1598966813333020672",
    sourceDate: "2022-12-03",
    note: 'Based on the public tweet surfaced in search with the closing text "Go go go!!".',
    html: `<blockquote><p>Guess the weight difference. The first one to guess it correctly will win 1kg whey protein. Go go go!! <a href="https://t.co/mL2QeFt0IB">https://t.co/mL2QeFt0IB</a></p></blockquote>`,
    expectedText:
      "Guess the weight difference. The first one to guess it correctly will win 1kg whey protein. Go go go!! [...]",
    expectedWords: [
      "guess",
      "the",
      "weight",
      "difference",
      "the",
      "first",
      "one",
      "to",
      "guess",
      "it",
      "correctly",
      "will",
      "win",
      "1kg",
      "whey",
      "protein",
      "go",
      "go",
      "go"
    ],
    expectations: [
      {
        sourceId: "kjv",
        presentWords: ["the", "weight", "difference", "the", "first", "one", "to", "it", "will", "win", "go", "go", "go"],
        missingWords: ["guess", "guess", "correctly", "1kg", "whey", "protein"]
      }
    ]
  },
  {
    id: "no-words-link-only",
    title: "Link-only tweet produces no tokens",
    sourceUrl: "https://x.com/panyiszabolcs/status/2001231555390238737",
    sourceDate: "2025-12-17",
    note: "Based on a public tweet whose visible text is only a link.",
    html: `<blockquote><p><a href="https://t.co/pqiMkSLZCC">https://t.co/pqiMkSLZCC</a></p></blockquote>`,
    expectedText: "[...]",
    expectedWords: [],
    expectations: [
      {
        sourceId: "kjv",
        presentWords: [],
        missingWords: []
      }
    ]
  },
  {
    id: "weird-utf8-and-emojis",
    title: "Diacritics and emoji normalization",
    sourceUrl: null,
    sourceDate: null,
    note: "Synthetic fixture for deterministic coverage of accents and emoji.",
    html: `<blockquote><p>Caf&eacute; authors 😅😇 baggage</p></blockquote>`,
    expectedText: "Café authors 😅😇 baggage",
    expectedWords: ["cafe", "authors", "baggage"],
    expectations: [
      {
        sourceId: "kjv",
        presentWords: [],
        missingWords: ["cafe", "authors", "baggage"]
      },
      {
        sourceId: "kjv-apocrypha",
        presentWords: ["authors", "baggage"],
        missingWords: ["cafe"]
      }
    ]
  },
  {
    id: "multiple-links",
    title: "Multiple links collapse to placeholders",
    sourceUrl: "https://x.com/kardashevscale1/status/2025270342386942137",
    sourceDate: "2026-02-21",
    note: "Based on a public tweet surfaced in search that includes more than one X link.",
    html: `<blockquote><p>Bottom line: Sam Altman&rsquo;s statement is false. <a href="https://t.co/a">https://t.co/a</a> Source: <a href="https://t.co/b">https://t.co/b</a></p></blockquote>`,
    expectedText: "Bottom line: Sam Altman's statement is false. [...] Source: [...]",
    expectedWords: ["bottom", "line", "sam", "altmans", "statement", "is", "false", "source"],
    expectations: [
      {
        sourceId: "kjv",
        presentWords: ["bottom", "line", "is", "false"],
        missingWords: ["sam", "altmans", "statement", "source"]
      }
    ]
  },
  {
    id: "deuterocanon-only-words",
    title: "Words only in the deuterocanon source",
    sourceUrl: null,
    sourceDate: null,
    note: "Synthetic fixture for source-specific matching with deuterocanon-only words.",
    html: "<blockquote><p>Baggage, authors, baggage.</p></blockquote>",
    expectedText: "Baggage, authors, baggage.",
    expectedWords: ["baggage", "authors", "baggage"],
    expectations: [
      {
        sourceId: "kjv",
        presentWords: [],
        missingWords: ["baggage", "authors", "baggage"]
      },
      {
        sourceId: "kjv-apocrypha",
        presentWords: ["baggage", "authors", "baggage"],
        missingWords: []
      }
    ]
  },
  {
    id: "line-breaks-and-smart-apostrophes",
    title: "Line breaks and apostrophe folding",
    sourceUrl: null,
    sourceDate: null,
    note: "Synthetic fixture for `<br>` handling and smart apostrophes.",
    html: "<blockquote><p>Judas&rsquo; baggage<br>isn&rsquo;t lost.</p></blockquote>",
    expectedText: "Judas' baggage\nisn't lost.",
    expectedWords: ["judas", "baggage", "isnt", "lost"],
    expectations: [
      {
        sourceId: "kjv",
        presentWords: ["judas", "lost"],
        missingWords: ["baggage", "isnt"]
      },
      {
        sourceId: "kjv-apocrypha",
        presentWords: ["judas", "baggage", "lost"],
        missingWords: ["isnt"]
      }
    ]
  }
];
