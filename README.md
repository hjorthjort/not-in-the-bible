# None Of These Words Are In The Bible

Static site for checking whether words in a public tweet appear in different Bible translations.

## Stack

- Plain HTML and CSS, with TypeScript compiled to browser-side JavaScript
- Local Bible indexes generated from public-domain sources
- No X API keys

## Routes

- `/` home page
- `/:username/status/:statusId` tweet analysis page
- `/word/:word` verse list page

## Setup

1. Build the local Bible indexes and static fallback file:

   ```bash
   npm install
   npm run build
   ```

2. Serve the site locally:

   ```bash
   npm start
   ```

3. Open `http://localhost:4173`.

The local server intentionally serves the custom `404.html` for unknown paths so hard-refreshing deep links like `/:username/status/:statusId` works during development too, and the static fallback redirects those requests back into the app shell.

## Bible Source

Enabled sources are downloaded from eBible.org during `npm run build` and indexed into per-translation datasets.

- Default: King James Version
  Source: `https://ebible.org/eng-kjv2006/`
  Archive: `https://ebible.org/eng-kjv2006/eng-kjv2006_html.zip`
  License: Public Domain outside the UK
  License page: `https://ebible.org/eng-kjv2006/copyright.htm`
- World English Bible
  Source: `https://ebible.org/eng-web/`
  Archive: `https://ebible.org/eng-web/eng-web_html.zip`
  License: Public Domain
  License page: `https://ebible.org/eng-web/copyright.htm`
- Bible in Basic English
  Source: `https://ebible.org/engBBE/`
  Archive: `https://ebible.org/engBBE/engBBE_html.zip`
  License: Public domain in the United States per eBible's notice
  License page: `https://ebible.org/engBBE/copyright.htm`

Researched but not enabled:

- Open English Bible (U.S. spelling)
  Source: `https://ebible.org/engoebus/`
  License page: `https://ebible.org/engoebus/copyright.htm`
  As of 2026-03-16, the downloadable eBible HTML archive appears incomplete for full-Bible indexing, so it is not enabled in the selector.

## Project License

This software is licensed under the MIT License. See [LICENSE](/Users/hjort/code/wods-in-the-bible/LICENSE).

## Notes

- Tweet embedding uses X's public oEmbed endpoint at `publish.twitter.com/oembed`.
- Tweet text extraction currently parses the returned oEmbed HTML blockquote text. This is more stable than traversing the fully rendered embed DOM, but it still depends on X continuing to expose that text in oEmbed responses.
- Build output writes `data/sources.json` plus per-source `words.json`, `verses.json`, and `meta.json` files under `data/<source-id>/`.
