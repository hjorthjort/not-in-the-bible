export const DEFAULT_SOURCE_ID = "kjv";

export type BibleSource = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  archiveUrl: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
};

export const BIBLE_SOURCES: BibleSource[] = [
  {
    id: "kjv",
    name: "King James Version",
    shortName: "KJV",
    description: "1769 standardized text, archaic English",
    archiveUrl: "https://ebible.org/eng-kjv2006/eng-kjv2006_html.zip",
    sourceUrl: "https://ebible.org/eng-kjv2006/",
    license: "Public Domain outside the UK",
    licenseUrl: "https://ebible.org/eng-kjv2006/copyright.htm"
  },
  {
    id: "web",
    name: "World English Bible",
    shortName: "WEB",
    description: "modern English, ecumenical book set",
    archiveUrl: "https://ebible.org/eng-web/eng-web_html.zip",
    sourceUrl: "https://ebible.org/eng-web/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/eng-web/copyright.htm"
  },
  {
    id: "bbe",
    name: "Bible in Basic English",
    shortName: "BBE",
    description: "simplified English",
    archiveUrl: "https://ebible.org/engBBE/engBBE_html.zip",
    sourceUrl: "https://ebible.org/engBBE/",
    license: "Public Domain in the United States per eBible's notice",
    licenseUrl: "https://ebible.org/engBBE/copyright.htm"
  }
];
