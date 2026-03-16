# None Of These Words Are In The Bible

Static site for checking whether words in a public tweet appear in the Bible.

## Stack

- Plain HTML, CSS, and browser-side JavaScript
- Local Bible index generated from the public-domain World English Bible
- No X API keys

## Routes

- `/` home page
- `/:username/status/:statusId` tweet analysis page
- `/word/:word` verse list page

## Setup

1. Download the World English Bible HTML archive to `data/source/eng-web_html.zip`.
2. Build the local Bible index and static fallback file:

   ```bash
   npm run build
   ```

3. Serve the site locally:

   ```bash
   npm start
   ```

4. Open `http://localhost:4173`.

## Bible Source

- Translation: World English Bible
- Source: `https://ebible.org/web/`
- Archive used by this project: `https://ebible.org/eng-web/eng-web_html.zip`
- License: Public Domain
- Copyright page: `https://ebible.org/eng-web/copyright.htm`

This project currently indexes the HTML archive distributed by eBible.org and links verse references out to Bible Hub.

## Project License

This software is licensed under the MIT License. See [LICENSE](/Users/hjort/code/wods-in-the-bible/LICENSE).

## Notes

- Tweet embedding uses X's public oEmbed endpoint at `publish.twitter.com/oembed`.
- Tweet text extraction currently parses the returned oEmbed HTML blockquote text. This is more stable than traversing the fully rendered embed DOM, but it still depends on X continuing to expose that text in oEmbed responses.
- Build output writes `data/bible-words.json`, `data/bible-verses.json`, and `data/bible-meta.json` so the main tweet page can load the smaller word index first.
