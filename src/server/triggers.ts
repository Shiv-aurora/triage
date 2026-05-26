import { Hono } from 'hono';
import type {
  OnAppInstallRequest,
  OnCommentReportRequest,
  OnModActionRequest,
  OnPostReportRequest,
  TriggerResponse,
} from '@devvit/web/shared';
import { reddit } from '@devvit/web/server';
import { T1, T3 } from '@devvit/shared-types/tid.js';
import {
  bumpAuthorRemoval,
  getItem,
  resolveItem,
  upsertItem,
  type ReportInput,
} from './queue';
import { seedDefaultSettings } from './settings';

export const triggers = new Hono();

const RESOLVING_ACTIONS = new Set([
  'approvelink',
  'approvecomment',
  'removelink',
  'removecomment',
  'spamlink',
  'spamcomment',
]);

const REMOVAL_ACTIONS = new Set([
  'removelink',
  'removecomment',
  'spamlink',
  'spamcomment',
]);

triggers.post('/on-app-install', async (c) => {
  try {
    await c.req.json<OnAppInstallRequest>();
    await seedDefaultSettings();
    console.log('Seeded default triage settings on AppInstall');

    return c.json<TriggerResponse>({}, 200);
  } catch (error) {
    console.error('AppInstall trigger failed:', error);
    return c.json<TriggerResponse>({}, 500);
  }
});

const preview = (text: string): string =>
  text.length > 240 ? `${text.slice(0, 237)}...` : text;

const reportCounts = (
  userReportReasons: readonly string[] | undefined,
  modReportReasons: readonly string[] | undefined,
  fallbackReason: string
) => {
  const userReasons = userReportReasons ?? [];
  const modReasons = modReportReasons ?? [];
  const reasons = [...userReasons, ...modReasons];
  const fallbackReasons = reasons.length > 0 ? [] : [fallbackReason];

  return {
    reasons: reasons.length > 0 ? reasons : fallbackReasons,
    communityReasons: userReasons.length > 0 ? userReasons : fallbackReasons,
    moderatorReasons: modReasons,
    reason: reasons[0] ?? fallbackReason,
    reportCount: reasons.length > 0 ? reasons.length : 1,
    humanReports: userReasons.length > 0 ? userReasons.length : 1,
    automodReports: modReasons.length,
  };
};

triggers.post('/on-post-report', async (c) => {
  try {
    const input = await c.req.json<OnPostReportRequest>();
    const post = input.post;
    const thingId = post?.id;

    if (!thingId) {
      console.warn('PostReport trigger received without a post id');
      return c.json<TriggerResponse>({}, 200);
    }

    let report: ReportInput = {
      thingId,
      kind: 'post',
      author: post.authorId || 'unknown',
      permalink: post.permalink || '',
      title: post.title,
      reason: input.reason,
      reportCount: post.numReports || 1,
      humanReports: 1,
      automodReports: 0,
    };

    try {
      const hydratedPost = await reddit.getPostById(T3(thingId));
      const counts = reportCounts(
        hydratedPost.userReportReasons,
        hydratedPost.modReportReasons,
        input.reason
      );

      report = {
        ...report,
        author: hydratedPost.authorName || report.author,
        permalink: hydratedPost.permalink || report.permalink,
        title: hydratedPost.title || report.title,
        ...counts,
      };
    } catch (error) {
      console.warn(`Could not hydrate reported post ${thingId}:`, error);
    }

    const item = await upsertItem(report);

    console.log(`Stored PostReport triage item ${thingId} score=${item.score}`);

    return c.json<TriggerResponse>({}, 200);
  } catch (error) {
    console.error('PostReport trigger failed:', error);
    return c.json<TriggerResponse>({}, 500);
  }
});

triggers.post('/on-comment-report', async (c) => {
  try {
    const input = await c.req.json<OnCommentReportRequest>();
    const comment = input.comment;
    const thingId = comment?.id;

    if (!thingId) {
      console.warn('CommentReport trigger received without a comment id');
      return c.json<TriggerResponse>({}, 200);
    }

    let report: ReportInput = {
      thingId,
      kind: 'comment',
      author: comment.author || 'unknown',
      permalink: comment.permalink || '',
      bodyPreview: preview(comment.body || ''),
      reason: input.reason,
      reportCount: comment.numReports || 1,
      humanReports: 1,
      automodReports: 0,
    };

    try {
      const hydratedComment = await reddit.getCommentById(T1(thingId));
      const counts = reportCounts(
        hydratedComment.userReportReasons,
        hydratedComment.modReportReasons,
        input.reason
      );

      report = {
        ...report,
        author: hydratedComment.authorName || report.author,
        permalink: hydratedComment.permalink || report.permalink,
        bodyPreview: preview(hydratedComment.body || ''),
        ...counts,
      };
    } catch (error) {
      console.warn(`Could not hydrate reported comment ${thingId}:`, error);
    }

    const item = await upsertItem(report);

    console.log(
      `Stored CommentReport triage item ${thingId} score=${item.score}`
    );

    return c.json<TriggerResponse>({}, 200);
  } catch (error) {
    console.error('CommentReport trigger failed:', error);
    return c.json<TriggerResponse>({}, 500);
  }
});

triggers.post('/on-mod-action', async (c) => {
  try {
    const input = await c.req.json<OnModActionRequest>();
    const action = input.action;

    if (!action || !RESOLVING_ACTIONS.has(action)) {
      return c.json<TriggerResponse>({}, 200);
    }

    const thingId = input.targetPost?.id ?? input.targetComment?.id;

    if (!thingId) {
      console.warn(`ModAction ${action} received without a target thing id`);
      return c.json<TriggerResponse>({}, 200);
    }

    const queuedItem = await getItem(thingId);
    await resolveItem(thingId);

    if (REMOVAL_ACTIONS.has(action)) {
      const author =
        input.targetUser?.name ??
        input.targetComment?.author ??
        queuedItem?.author ??
        'unknown';
      await bumpAuthorRemoval(author);
    }

    console.log(`Resolved triage item ${thingId} from ModAction ${action}`);

    return c.json<TriggerResponse>({}, 200);
  } catch (error) {
    console.error('ModAction trigger failed:', error);
    return c.json<TriggerResponse>({}, 500);
  }
});
