# Bot Adapters

Cross-platform polling bots live under this directory.

## Platforms

- `bots/x/` polls X mentions and replies with a deterministic summary plus an optional screenshot.
- `bots/bluesky/` polls Bluesky mention notifications and replies with the same summary plus an optional screenshot.
- `bots/reddit/` polls Reddit unread mentions and replies with text plus a site link.
- `bots/shared/` contains shared Bible analysis, reply formatting, screenshot rendering, runtime, and state helpers.

## Commands

Run from the repo root:

```bash
npm run bot:x -- --once --dry-run
npm run bot:bluesky -- --once --dry-run
npm run bot:reddit -- --once --dry-run
npm run bot:all -- --dry-run
```

Flags:

- `--once` processes a single polling cycle and exits.
- `--dry-run` fetches events and logs the intended reply without posting.

## Required Environment

Shared:

- `SITE_ORIGIN`
- `BOT_BIBLE_SOURCE` optional, defaults to `kjv`
- `BOT_POLL_INTERVAL_SECONDS` optional, defaults to `60`
- `BOT_STATE_DIR` optional, defaults to `bots/state`

X:

- `X_API_KEY`
- `X_API_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_TOKEN_SECRET`
- `X_BOT_USER_ID`

Bluesky:

- `BLUESKY_HANDLE`
- `BLUESKY_APP_PASSWORD`
- `BLUESKY_PDS_URL` optional, defaults to `https://bsky.social`

Reddit:

- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_USERNAME`
- `REDDIT_PASSWORD`
- `REDDIT_USER_AGENT`

Screenshots:

- Install Playwright browsers on the host before enabling screenshots:

  ```bash
  npx playwright install chromium
  ```

## Continuous Operation

- Run the bot from a single always-on Node host.
- Keep `bots/state/` on persistent disk so cursor and dedupe state survive restarts.
- Use `--dry-run` first on every new credential set.
- For production, prefer a supervisor such as `systemd`, Fly, Railway, or Docker restart policies.
