import { redis } from '@devvit/web/server';
import type { ScoreBreakdown, Settings, TriageItem } from '../shared/types';
import { scoreTriageItem } from './scoring';
import { getSettings } from './settings';
import { publishTriageEvent } from './realtime';

const QUEUE_KEY = 'triage:queue';
const itemKey = (thingId: string) => `triage:item:${thingId}`;
const authorKey = (username: string) => `triage:author:${username}`;

export type ReportInput = {
  thingId: string;
  kind: 'post' | 'comment';
  author: string;
  permalink: string;
  title?: string;
  bodyPreview?: string;
  reason?: string;
  reasons?: readonly string[];
  communityReasons?: readonly string[];
  moderatorReasons?: readonly string[];
  humanReports: number;
  automodReports: number;
  reportCount?: number;
};

const emptyBreakdown = (): ScoreBreakdown => ({
  humanReportBoost: 0,
  reportVolume: 0,
  reasonSeverity: 0,
  authorRisk: 0,
  staleness: 0,
});

const parseItem = (record: Record<string, string>): TriageItem | undefined => {
  if (!record.item) {
    return undefined;
  }

  return JSON.parse(record.item) as TriageItem;
};

const uniqueReasons = (reasons: string[]): string[] => [
  ...new Set(reasons.map((reason) => reason.trim()).filter(Boolean)),
];

const countReasons = (
  existing: Record<string, number> | undefined,
  reasons: readonly string[]
): Record<string, number> => {
  const counts = { ...(existing ?? {}) };

  for (const reason of reasons.map((value) => value.trim()).filter(Boolean)) {
    counts[reason] = (counts[reason] ?? 0) + 1;
  }

  return counts;
};

export const getAuthorRemovalCount = async (
  username: string
): Promise<number> => {
  if (!username || username === 'unknown') {
    return 0;
  }

  const record = await redis.hGetAll(authorKey(username));
  return Number.parseInt(record.removalCount ?? '0', 10) || 0;
};

export const getItem = async (
  thingId: string
): Promise<TriageItem | undefined> => parseItem(await redis.hGetAll(itemKey(thingId)));

export const saveItem = async (item: TriageItem): Promise<TriageItem> => {
  await redis.hSet(itemKey(item.thingId), {
    item: JSON.stringify(item),
    thingId: item.thingId,
    score: String(item.score),
    lastSeenAt: String(item.lastSeenAt),
  });
  await redis.zAdd(QUEUE_KEY, { member: item.thingId, score: item.score });

  return item;
};

export const upsertItem = async (report: ReportInput): Promise<TriageItem> => {
  const now = Date.now();
  const existing = parseItem(await redis.hGetAll(itemKey(report.thingId)));
  const authorRemovalCount = await getAuthorRemovalCount(report.author);
  const hasAbsoluteCounts = report.reportCount !== undefined;
  const reportDelta = Math.max(1, report.humanReports + report.automodReports);
  const reportCount = hasAbsoluteCounts
    ? Number(report.reportCount)
    : existing
      ? existing.reportCount + reportDelta
      : reportDelta;
  const humanReports =
    existing && !hasAbsoluteCounts
      ? existing.humanReports + report.humanReports
      : report.humanReports;
  const automodReports =
    existing && !hasAbsoluteCounts
      ? existing.automodReports + report.automodReports
      : report.automodReports;
  const incomingReasons = [
    ...(report.reasons ?? []),
    ...(report.reason ? [report.reason] : []),
  ];
  const communityReasons = report.communityReasons ?? [];
  const moderatorReasons = report.moderatorReasons ?? [];
  const reportReasonCounts = hasAbsoluteCounts
    ? countReasons(undefined, incomingReasons)
    : countReasons(existing?.reportReasonCounts, incomingReasons);
  const communityReportReasonCounts = hasAbsoluteCounts
    ? countReasons(undefined, communityReasons)
    : countReasons(existing?.communityReportReasonCounts, communityReasons);
  const moderatorReportReasonCounts = hasAbsoluteCounts
    ? countReasons(undefined, moderatorReasons)
    : countReasons(existing?.moderatorReportReasonCounts, moderatorReasons);

  const item: TriageItem = {
    thingId: report.thingId,
    kind: report.kind,
    author: report.author,
    permalink: report.permalink,
    reportReasons: uniqueReasons([
      ...(existing?.reportReasons ?? []),
      ...incomingReasons,
    ]),
    reportReasonCounts,
    communityReportReasons: uniqueReasons([
      ...(existing?.communityReportReasons ?? []),
      ...communityReasons,
    ]),
    communityReportReasonCounts,
    moderatorReportReasons: uniqueReasons([
      ...(existing?.moderatorReportReasons ?? []),
      ...moderatorReasons,
    ]),
    moderatorReportReasonCounts,
    reportCount,
    humanReports,
    automodReports,
    authorRemovalCount,
    createdAt: existing?.createdAt ?? now,
    lastSeenAt: now,
    score: 0,
    scoreBreakdown: emptyBreakdown(),
  };

  if (report.title !== undefined) {
    item.title = report.title;
  } else if (existing?.title !== undefined) {
    item.title = existing.title;
  }

  if (report.bodyPreview !== undefined) {
    item.bodyPreview = report.bodyPreview;
  } else if (existing?.bodyPreview !== undefined) {
    item.bodyPreview = existing.bodyPreview;
  }

  if (existing?.claimedBy !== undefined) {
    item.claimedBy = existing.claimedBy;
  }

  if (existing?.claimedAt !== undefined) {
    item.claimedAt = existing.claimedAt;
  }

  const settings = await getSettings();
  const scored = scoreTriageItem(item, { settings });
  item.score = scored.score;
  item.scoreBreakdown = scored.scoreBreakdown;

  await saveItem(item);
  await publishTriageEvent({ type: 'item_updated', item });

  return item;
};

export const resolveItem = async (thingId: string): Promise<void> => {
  await redis.zRem(QUEUE_KEY, [thingId]);
  await redis.del(itemKey(thingId));
  await publishTriageEvent({ type: 'item_resolved', thingId });
};

export const getRankedQueue = async (): Promise<TriageItem[]> => {
  const ranked = await redis.zRange(QUEUE_KEY, 0, -1, {
    by: 'rank',
    reverse: true,
  });
  const records = await Promise.all(
    ranked.map(({ member }) => redis.hGetAll(itemKey(member)))
  );

  return records
    .map(parseItem)
    .filter((item): item is TriageItem => item !== undefined);
};

export const getQueuedThingIds = async (): Promise<string[]> => {
  const ranked = await redis.zRange(QUEUE_KEY, 0, -1, {
    by: 'rank',
    reverse: true,
  });

  return ranked.map(({ member }) => member);
};

export const recomputeQueue = async (
  settings: Settings
): Promise<TriageItem[]> => {
  const items = await getRankedQueue();

  await Promise.all(
    items.map(async (item) => {
      const scored = scoreTriageItem(item, { settings });
      const updated: TriageItem = {
        ...item,
        score: scored.score,
        scoreBreakdown: scored.scoreBreakdown,
      };

      await saveItem(updated);
      await publishTriageEvent({ type: 'item_updated', item: updated });
    })
  );

  return await getRankedQueue();
};

export const bumpAuthorRemoval = async (username: string): Promise<number> => {
  if (!username || username === 'unknown') {
    return 0;
  }

  await redis.hSet(authorKey(username), {
    lastRemovalAt: String(Date.now()),
  });
  return await redis.hIncrBy(authorKey(username), 'removalCount', 1);
};
