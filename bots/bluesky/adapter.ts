import { analyzeTarget, buildScreenshotStem } from "../shared/analysis.js";
import { type BotAdapter } from "../shared/runtime.js";
import { captureAnalysisScreenshot } from "../shared/screenshot.js";
import type { BotAction } from "../shared/types.js";
import { BlueskyClient, type BskyNotification, type BskyPost } from "./client.js";

function getPostIdFromUri(uri: string): string {
  return uri.split("/").at(-1) ?? uri;
}

function buildCanonicalUrl(post: Pick<BskyPost, "author" | "uri">): string {
  return `https://bsky.app/profile/${post.author.handle}/post/${getPostIdFromUri(post.uri)}`;
}

export async function buildBlueskyAction(options: {
  mention: BskyPost;
  siteOrigin: string;
  sourceId: string;
  target: BskyPost | null;
}): Promise<BotAction> {
  const analyzedPost = options.mention.record.reply?.parent ? options.target ?? options.mention : options.mention;
  const analysis = await analyzeTarget(
    {
      canonicalUrl: buildCanonicalUrl(analyzedPost),
      platform: "bluesky",
      replyTargetId: options.mention.uri,
      sourceId: options.sourceId,
      text: analyzedPost.record.text
    },
    {
      maxReplyLength: 300,
      siteOrigin: options.siteOrigin
    }
  );

  return {
    analysis,
    dedupeKey: options.mention.uri,
    screenshotFileStem: buildScreenshotStem("bluesky", getPostIdFromUri(options.mention.uri))
  };
}

export function createBlueskyAdapter(client: BlueskyClient): BotAdapter {
  return {
    platform: "bluesky",
    async pollOnce(context) {
      const { notifications } = await client.listMentionNotifications(null);
      let processedCount = 0;

      for (const notification of notifications) {
        if (await context.state.hasProcessed(notification.uri)) {
          continue;
        }

        try {
          const mention = await client.getPost(notification.uri);
          if (!mention) {
            await context.state.markProcessed(notification.uri);
            continue;
          }

          const parentUri = mention.record.reply?.parent.uri ?? null;
          const target = parentUri ? await client.getPost(parentUri) : null;
          const action = await buildBlueskyAction({
            mention,
            siteOrigin: context.options.siteOrigin,
            sourceId: context.options.sourceId,
            target
          });

          if (context.options.dryRun) {
            context.log.info(`[bluesky] dry-run reply to ${mention.uri}: ${action.analysis.replyText}`);
          } else {
            const screenshot = await captureAnalysisScreenshot({
              canonicalUrl: action.analysis.canonicalUrl,
              siteOrigin: context.options.siteOrigin,
              sourceId: context.options.sourceId
            });
            await client.createReply({
              parent: mention,
              screenshot,
              text: action.analysis.replyText
            });
          }

          await context.state.markProcessed(notification.uri);
          processedCount += 1;
        } catch (error) {
          await context.state.incrementRetry(notification.uri);
          context.log.warn(`[bluesky] failed to process mention ${notification.uri}`, error);
        }
      }

      return processedCount;
    }
  };
}
