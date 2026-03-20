export type PlatformId = "x" | "bluesky" | "reddit";

export type TargetContent = {
  canonicalUrl: string;
  platform: PlatformId;
  replyTargetId: string;
  sourceId: string;
  text: string;
};

export type AnalysisResult = TargetContent & {
  extractedTextSnippet: string;
  inBibleCount: number;
  missingCount: number;
  missingWords: string[];
  presentWords: string[];
  replyText: string;
  siteUrl: string;
  totalWords: number;
};

export type BotAction = {
  analysis: AnalysisResult;
  dedupeKey: string;
  screenshotFileStem: string;
};

export type StateFile = {
  cursor: string | null;
  processedIds: string[];
  retryCounts: Record<string, number>;
  updatedAt: string;
};

export type SharedRuntimeOptions = {
  dryRun: boolean;
  pollIntervalMs: number;
  siteOrigin: string;
  sourceId: string;
  stateDir: string;
};

export type AdapterRuntimeContext = {
  log: Pick<Console, "error" | "info" | "warn">;
  options: SharedRuntimeOptions;
};
