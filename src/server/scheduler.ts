import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type { Comment, Post, TaskRequest, TaskResponse } from '@devvit/web/server';
import { getItem, getQueuedThingIds, resolveItem, upsertItem } from './queue';
import { releaseStaleClaims } from './claims';

export const scheduler = new Hono();

const preview = (text: string): string =>
  text.length > 240 ? `${text.slice(0, 237)}...` : text;

const countReportReasons = (
  userReportReasons: readonly string[],
  modReportReasons: readonly string[]
) => {
  const reasons = [...userReportReasons, ...modReportReasons].filter(Boolean);
  const fallbackReasons = reasons.length > 0 ? [] : ['modqueue'];

  return {
    reasons: reasons.length > 0 ? reasons : fallbackReasons,
    communityReasons:
      userReportReasons.length > 0 ? userReportReasons : fallbackReasons,
    moderatorReasons: modReportReasons,
    reason: reasons[0] ?? 'modqueue',
    reportCount: Math.max(1, reasons.length),
    humanReports: Math.max(1, userReportReasons.length),
    automodReports: modReportReasons.length,
  };
};

const reportFromPost = (post: Post) => {
  const counts = countReportReasons(
    post.userReportReasons,
    post.modReportReasons
  );

  return {
    thingId: post.id,
    kind: 'post' as const,
    author: post.authorName || 'unknown',
    permalink: post.permalink || '',
    title: post.title,
    ...counts,
    reportCount: Math.max(post.numberOfReports || 0, counts.reportCount),
  };
};

const reportFromComment = (comment: Comment) => {
  const counts = countReportReasons(
    comment.userReportReasons,
    comment.modReportReasons
  );

  return {
    thingId: comment.id,
    kind: 'comment' as const,
    author: comment.authorName || 'unknown',
    permalink: comment.permalink || '',
    bodyPreview: preview(comment.body || ''),
    ...counts,
    reportCount: Math.max(comment.numReports || 0, counts.reportCount),
  };
};

export const reconcileModqueue = async (): Promise<{
  added: number;
  pruned: number;
  releasedClaims: number;
  active: number;
}> => {
  const subredditName = context.subredditName;
  const items = await reddit
    .getModQueue({ subreddit: subredditName, type: 'all', limit: 100 })
    .all();
  const activeThingIds = new Set<string>(items.map((item) => item.id));
  const queuedThingIds = await getQueuedThingIds();
  let added = 0;
  let pruned = 0;

  for (const item of items) {
    if (await getItem(item.id)) {
      continue;
    }

    const report = item.id.startsWith('t1_')
      ? reportFromComment(item as Comment)
      : reportFromPost(item as Post);

    await upsertItem(report);
    added += 1;
  }

  for (const thingId of queuedThingIds) {
    if (activeThingIds.has(thingId)) {
      continue;
    }

    await resolveItem(thingId);
    pruned += 1;
  }

  const releasedClaims = await releaseStaleClaims();

  return {
    added,
    pruned,
    releasedClaims: releasedClaims.length,
    active: activeThingIds.size,
  };
};

scheduler.post('/reconcile-modqueue', async (c) => {
  try {
    await c.req.json<TaskRequest>();
    const result = await reconcileModqueue();

    console.log(
      `Reconcile complete: added=${result.added} pruned=${result.pruned} releasedClaims=${result.releasedClaims} active=${result.active}`
    );

    return c.json<TaskResponse>({}, 200);
  } catch (error) {
    console.error('Scheduled modqueue reconcile failed:', error);
    return c.json<TaskResponse>({}, 500);
  }
});
