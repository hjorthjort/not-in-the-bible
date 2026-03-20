# Third-Party Notices

This repository includes or depends on the following third-party material.

## Fonts

No third-party font files are bundled in this repository.

The site uses system font stacks in [`styles.css`](./styles.css):

- `"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, serif`
- `Georgia, "Times New Roman", serif`

Those fonts are supplied by the operating system or browser environment, not redistributed by this repo.

## Images and Other Static Assets

No third-party image assets are bundled for the site UI.

The previous `assets/bible-wordmark.png` file was removed because its provenance was not documented in the repository. The UI now renders that lockup using first-party HTML and CSS.

## Bible Data

This repository redistributes Bible-derived data under `data/`.

- Each bundled source includes its recorded license and source URL in `data/<source-id>/meta.json`.
- The aggregate source catalog is in `data/sources.json`.
- The build-time source definitions are in `tools/bible-sources.ts`.

The currently bundled sources are recorded there as public domain, with one notable jurisdictional caveat:

- `kjv`: "Public Domain outside the UK"
- `bbe`: "Public Domain in the United States per eBible's notice"

Before distributing outside your current jurisdiction, review the recorded `licenseUrl` for the source(s) you enable and ensure that your intended use matches those terms.

## npm Dependencies

Direct dependencies currently used by this repository:

- `playwright` 1.58.2 — Apache-2.0
- `typescript` 5.9.3 — Apache-2.0
- `@types/node` 25.5.0 — MIT

Transitive packages present in the current lockfile:

- `playwright-core` — Apache-2.0
- `undici-types` — MIT
- `fsevents` — MIT

## Apache-2.0 Dependencies

### Playwright

Package: `playwright`

Copyright notice from the distributed package:

> Playwright
> Copyright (c) Microsoft Corporation
>
> This software contains code derived from the Puppeteer project (https://github.com/puppeteer/puppeteer),
> available under the Apache 2.0 license (https://github.com/puppeteer/puppeteer/blob/master/LICENSE).

License: Apache License 2.0  
Source: [microsoft/playwright LICENSE](https://raw.githubusercontent.com/microsoft/playwright/main/LICENSE)

### Playwright Core

Package: `playwright-core`

License: Apache License 2.0  
Source: [microsoft/playwright LICENSE](https://raw.githubusercontent.com/microsoft/playwright/main/LICENSE)

### TypeScript

Package: `typescript`

License: Apache License 2.0  
Source: [microsoft/TypeScript LICENSE.txt](https://raw.githubusercontent.com/microsoft/TypeScript/main/LICENSE.txt)

## MIT Dependencies

### @types/node

Package: `@types/node`

Copyright: Microsoft Corporation  
License: MIT  
Source: [DefinitelyTyped MIT license](https://raw.githubusercontent.com/DefinitelyTyped/DefinitelyTyped/master/LICENSE)

### undici-types

Package: `undici-types`

License: MIT  
Included transitively through the current dependency set.

### fsevents

Package: `fsevents`

License: MIT  
Included transitively in the current lockfile for supported platforms.

## Browser Binaries

If you install browser binaries with:

```bash
npx playwright install chromium
```

those browser binaries are separate third-party software from this repository. If you redistribute them in a container image or packaged app, review and ship the browser notices/licenses appropriate to that binary distribution as well.
