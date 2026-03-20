import { analyzeTarget, buildScreenshotStem } from "../shared/analysis.js";
import { type BotAdapter } from "../shared/runtime.js";
import type { BotAction } from "../shared/types.js";
import { RedditClient, type RedditMessage, type RedditThing } from "./client.js";

function buildCanonicalUrl(permalink: string | undefined): string | null {
  if (!permalink) {
    return null;
  }

  return new URL(permalink, "https://www.reddit.com").toString();
}

function buildTargetText(target: RedditThing): string {
  if (target.body?.trim()) {
    return target.body;
  }

  return [target.title?.trim(), target.selftext?.trim()].filter(Boolean).join("\n\n");
}

export async function buildRedditAction(options: {
  mention: RedditMessage;
  siteOrigin: string;
  sourceId: string;
  target: RedditThing | null;
}): Promise<BotAction | null> {
  if (!options.target) {
    return null;
  }

  const canonicalUrl = buildCanonicalUrl(options.target.permalink);
  const text = buildTargetText(options.target);

  if (!canonicalUrl || !text.trim()) {
    return null;
  }

  const analysis = await analyzeTarget(
    {
      canonicalUrl,
      platform: "reddit",
      replyTargetId: options.mention.name,
      sourceId: options.sourceId,
      text
    },
    {
      maxReplyLength: 10_000,
      siteOrigin: options.siteOrigin
    }
  );

  return {
    analysis,
    dedupeKey: options.mention.name,
    screenshotFileStem: buildScreenshotStem("reddit", options.mention.name)
  };
}

export function createRedditAdapter(client: RedditClient): BotAdapter {
  return {
    platform: "reddit",
    async pollOnce(context) {
      const mentions = await client.listUnreadMentions();
      let processedCount = 0;

      for (const mention of mentions) {
        if (await context.state.hasProcessed(mention.name)) {
          continue;
        }

        try {
          const target = mention.parent_id ? await client.getThing(mention.parent_id) : null;
          const action = await buildRedditAction({
            mention,
            siteOrigin: context.options.siteOrigin,
            sourceId: context.options.sourceId,
            target
          });

          if (!action) {
            await context.state.markProcessed(mention.name);
            await client.markRead([mention.name]);
            continue;
          }

          if (context.options.dryRun) {
            context.log.info(`[reddit] dry-run reply to ${mention.name}: ${action.analysis.replyText}`);
          } else {
            await client.replyToThing(action.analysis.replyTargetId, action.analysis.replyText);
            await client.markRead([mention.name]);
          }

          await context.state.markProcessed(mention.name);
          processedCount += 1;
        } catch (error) {
          await context.state.incrementRetry(mention.name);
          context.log.warn(`[reddit] failed to process mention ${mention.name}`, error);
        }
      }

      return processedCount;
    }
  };
}
