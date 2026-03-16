export const DEFAULT_SOURCE_ID = "kjv-apocrypha";

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
    id: "kjv-apocrypha",
    name: "King James Version + Apocrypha",
    shortName: "KJVA",
    description: "1769 standardized text with Apocrypha/Deuterocanon",
    archiveUrl: "https://ebible.org/eng-kjv/eng-kjv_html.zip",
    sourceUrl: "https://ebible.org/eng-kjv/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/eng-kjv/copyright.htm"
  },
  {
    id: "kjv-cambridge",
    name: "KJV Cambridge Paragraph Bible",
    shortName: "KJV-CPB",
    description: "paragraph KJV edition with Apocrypha/Deuterocanon",
    archiveUrl: "https://ebible.org/engkjvcpb/engkjvcpb_html.zip",
    sourceUrl: "https://ebible.org/engkjvcpb/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/engkjvcpb/copyright.htm"
  },
  {
    id: "web",
    name: "World English Bible Classic",
    shortName: "WEB",
    description: "modern English WEB classic with Deuterocanon",
    archiveUrl: "https://ebible.org/eng-web/eng-web_html.zip",
    sourceUrl: "https://ebible.org/eng-web/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/eng-web/copyright.htm"
  },
  {
    id: "web-be",
    name: "World English Bible British Edition",
    shortName: "WEB-BE",
    description: "modern English WEB with British spelling",
    archiveUrl: "https://ebible.org/engwebpb/engwebpb_html.zip",
    sourceUrl: "https://ebible.org/engwebpb/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/engwebpb/copyright.htm"
  },
  {
    id: "web-c",
    name: "World English Bible Catholic",
    shortName: "WEB-C",
    description: "WEB with Deuterocanon in Catholic book order",
    archiveUrl: "https://ebible.org/eng-web-c/eng-web-c_html.zip",
    sourceUrl: "https://ebible.org/eng-web-c/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/eng-web-c/copyright.htm"
  },
  {
    id: "web-be-deut",
    name: "World English Bible British Edition with Deuterocanon",
    shortName: "WEB-BE+DC",
    description: "British WEB with Deuterocanon",
    archiveUrl: "https://ebible.org/eng-webbe/eng-webbe_html.zip",
    sourceUrl: "https://ebible.org/eng-webbe/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/eng-webbe/copyright.htm"
  },
  {
    id: "web-updated",
    name: "World English Bible Updated",
    shortName: "WEBU",
    description: "updated WEB text with Deuterocanon",
    archiveUrl: "https://ebible.org/engwebu/engwebu_html.zip",
    sourceUrl: "https://ebible.org/engwebu/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/engwebu/copyright.htm"
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
  },
  {
    id: "asv",
    name: "American Standard Version",
    shortName: "ASV",
    description: "1901 American revision in formal, archaic English",
    archiveUrl: "https://ebible.org/eng-asv/eng-asv_html.zip",
    sourceUrl: "https://ebible.org/eng-asv/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/eng-asv/copyright.htm"
  },
  {
    id: "dby",
    name: "Darby Translation",
    shortName: "DBY",
    description: "literal 19th-century translation by J. N. Darby",
    archiveUrl: "https://ebible.org/engDBY/engDBY_html.zip",
    sourceUrl: "https://ebible.org/engDBY/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/engDBY/copyright.htm"
  },
  {
    id: "dra",
    name: "Douay-Rheims 1899",
    shortName: "DRA",
    description: "Catholic English translation from the Vulgate",
    archiveUrl: "https://ebible.org/engDRA/engDRA_html.zip",
    sourceUrl: "https://ebible.org/engDRA/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/engDRA/copyright.htm"
  },
  {
    id: "geneva",
    name: "Geneva Bible 1599",
    shortName: "GNV",
    description: "Reformation-era English with older spelling",
    archiveUrl: "https://ebible.org/enggnv/enggnv_html.zip",
    sourceUrl: "https://ebible.org/enggnv/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/enggnv/copyright.htm"
  },
  {
    id: "jps1917",
    name: "JPS TaNaKH 1917",
    shortName: "JPS1917",
    description: "Jewish Publication Society translation of the Tanakh",
    archiveUrl: "https://ebible.org/engjps/engjps_html.zip",
    sourceUrl: "https://ebible.org/engjps/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/engjps/copyright.htm"
  },
  {
    id: "leeser",
    name: "Leeser Tanakh",
    shortName: "LEESER",
    description: "19th-century Jewish English translation of the Tanakh",
    archiveUrl: "https://ebible.org/englee/englee_html.zip",
    sourceUrl: "https://ebible.org/englee/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/englee/copyright.htm"
  },
  {
    id: "oeb-us",
    name: "Open English Bible (US)",
    shortName: "OEB-US",
    description: "partial Open English Bible corpus with U.S. spelling",
    archiveUrl: "https://ebible.org/engoebus/engoebus_html.zip",
    sourceUrl: "https://ebible.org/engoebus/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/engoebus/copyright.htm"
  },
  {
    id: "oeb-cw",
    name: "Open English Bible (Commonwealth)",
    shortName: "OEB-CW",
    description: "partial Open English Bible corpus with Commonwealth spelling",
    archiveUrl: "https://ebible.org/engoebcw/engoebcw_html.zip",
    sourceUrl: "https://ebible.org/engoebcw/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/engoebcw/copyright.htm"
  },
  {
    id: "rv",
    name: "Revised Version with Apocrypha",
    shortName: "RV",
    description: "1895 British revision with Apocrypha",
    archiveUrl: "https://ebible.org/eng-rv/eng-rv_html.zip",
    sourceUrl: "https://ebible.org/eng-rv/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/eng-rv/copyright.htm"
  },
  {
    id: "webster",
    name: "Noah Webster Bible",
    shortName: "WEBSTER",
    description: "Webster's update of the King James wording",
    archiveUrl: "https://ebible.org/engwebster/engwebster_html.zip",
    sourceUrl: "https://ebible.org/engwebster/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/engwebster/copyright.htm"
  },
  {
    id: "ylt",
    name: "Young's Literal Translation",
    shortName: "YLT",
    description: "literal 19th-century English translation",
    archiveUrl: "https://ebible.org/engylt/engylt_html.zip",
    sourceUrl: "https://ebible.org/engylt/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/engylt/copyright.htm"
  },
  {
    id: "brenton",
    name: "Brenton Septuagint Translation",
    shortName: "BRENTON",
    description: "English Septuagint with Apocrypha",
    archiveUrl: "https://ebible.org/eng-Brenton/eng-Brenton_html.zip",
    sourceUrl: "https://ebible.org/eng-Brenton/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/eng-Brenton/copyright.htm"
  },
  {
    id: "lxx2012-us",
    name: "LXX2012 American English",
    shortName: "LXX2012-US",
    description: "modernized American English Septuagint with Apocrypha",
    archiveUrl: "https://ebible.org/eng-lxx2012/eng-lxx2012_html.zip",
    sourceUrl: "https://ebible.org/eng-lxx2012/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/eng-lxx2012/copyright.htm"
  },
  {
    id: "lxx2012-uk",
    name: "LXX2012 British English",
    shortName: "LXX2012-UK",
    description: "modernized British English Septuagint with Apocrypha",
    archiveUrl: "https://ebible.org/eng-uk-lxx2012/eng-uk-lxx2012_html.zip",
    sourceUrl: "https://ebible.org/eng-uk-lxx2012/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/eng-uk-lxx2012/copyright.htm"
  },
  {
    id: "lxxup",
    name: "Updated Brenton English Septuagint",
    shortName: "LXXUP",
    description: "updated spelling and formatting of Brenton's Septuagint",
    archiveUrl: "https://ebible.org/englxxup/englxxup_html.zip",
    sourceUrl: "https://ebible.org/englxxup/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/englxxup/copyright.htm"
  },
  {
    id: "wmb",
    name: "World Messianic Bible",
    shortName: "WMB",
    description: "Messianic adaptation of the World English Bible",
    archiveUrl: "https://ebible.org/engwmb/engwmb_html.zip",
    sourceUrl: "https://ebible.org/engwmb/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/engwmb/copyright.htm"
  },
  {
    id: "wmb-be",
    name: "World Messianic Bible British Edition",
    shortName: "WMB-BE",
    description: "Messianic adaptation with British spelling",
    archiveUrl: "https://ebible.org/engwmbb/engwmbb_html.zip",
    sourceUrl: "https://ebible.org/engwmbb/",
    license: "Public Domain",
    licenseUrl: "https://ebible.org/engwmbb/copyright.htm"
  }
];
