import { analyzeTarget, buildScreenshotStem } from "../shared/analysis.js";
import { runAdapter, type BotAdapter } from "../shared/runtime.js";
import { captureAnalysisScreenshot } from "../shared/screenshot.js";
import type { BotAction } from "../shared/types.js";
import { XClient, type XTweet } from "./client.js";

function buildCanonicalUrl(tweet: XTweet): string | null {
  return tweet.authorUsername ? `https://x.com/${tweet.authorUsername}/status/${tweet.id}` : null;
}

export async function buildXAction(options: {
  mention: XTweet;
  siteOrigin: string;
  sourceId: string;
  target: XTweet | null;
}): Promise<BotAction | null> {
  const repliedToTweet = options.mention.referencedTweets.find((reference) => reference.type === "replied_to");
  const analyzedTweet = repliedToTweet ? options.target : options.mention;
  if (!analyzedTweet) {
    return null;
  }

  const canonicalUrl = buildCanonicalUrl(analyzedTweet);
  if (!canonicalUrl) {
    return null;
  }

  const analysis = await analyzeTarget(
    {
      canonicalUrl,
      platform: "x",
      replyTargetId: options.mention.id,
      sourceId: options.sourceId,
      text: analyzedTweet.text
    },
    {
      maxReplyLength: 280,
      siteOrigin: options.siteOrigin
    }
  );

  return {
    analysis,
    dedupeKey: options.mention.id,
    screenshotFileStem: buildScreenshotStem("x", options.mention.id)
  };
}

export function createXAdapter(client: XClient): BotAdapter {
  return {
    platform: "x",
    async pollOnce(context) {
      const cursor = await context.state.getCursor();
      const { newestId, tweets } = await client.listMentions(cursor);
      let processedCount = 0;

      for (const mention of tweets) {
        if (await context.state.hasProcessed(mention.id)) {
          continue;
        }

        try {
          const repliedToTweet = mention.referencedTweets.find((reference) => reference.type === "replied_to");
          const target = repliedToTweet ? await client.getTweet(repliedToTweet.id) : null;
          const action = await buildXAction({
            mention,
            siteOrigin: context.options.siteOrigin,
            sourceId: context.options.sourceId,
            target
          });

          if (!action) {
            await context.state.markProcessed(mention.id);
            continue;
          }

          if (context.options.dryRun) {
            context.log.info(`[x] dry-run reply to ${mention.id}: ${action.analysis.replyText}`);
          } else {
            const screenshot = await captureAnalysisScreenshot({
              canonicalUrl: action.analysis.canonicalUrl,
              siteOrigin: context.options.siteOrigin,
              sourceId: context.options.sourceId
            });
            await client.createReply({
              inReplyToTweetId: action.analysis.replyTargetId,
              screenshot,
              text: action.analysis.replyText
            });
          }

          await context.state.markProcessed(mention.id);
          processedCount += 1;
        } catch (error) {
          await context.state.incrementRetry(mention.id);
          context.log.warn(`[x] failed to process mention ${mention.id}`, error);
        }
      }

      if (newestId) {
        await context.state.setCursor(newestId);
      }

      return processedCount;
    }
  };
}

export async function runXBot(client: XClient, argv: string[]): Promise<void> {
  await runAdapter(createXAdapter(client), {
    dryRun: argv.includes("--dry-run"),
    once: argv.includes("--once")
  });
}
