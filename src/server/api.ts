import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import { T1, T3 } from '@devvit/shared-types/tid.js';
import type {
  ClaimConflictResponse,
  ClaimRequest,
  ClaimResponse,
  ModerateRequest,
  ModerateResponse,
  QueueResponse,
  ResetSettingsRequest,
  SaveSettingsRequest,
  SaveSettingsResponse,
  SettingsResponse,
  ViewerResponse,
} from '../shared/api';
import { getItem, getRankedQueue, recomputeQueue, resolveItem } from './queue';
import { getSettings, resetSettings, saveSettings } from './settings';
import { claimItem, ClaimConflictError, ClaimNotFoundError, unclaimItem } from './claims';

type ErrorResponse = {
  status: 'error';
  message: string;
};

export const api = new Hono();

const currentUsername = async (): Promise<string | undefined> =>
  context.username ?? (await reddit.getCurrentUsername());

const viewer = async (): Promise<ViewerResponse> => {
  const username = await currentUsername();
  const subredditName = context.subredditName;

  if (!username) {
    return {
      subredditName,
      isModerator: false,
    };
  }

  const moderators = await reddit
    .getModerators({
      subredditName,
      username,
      limit: 1,
    })
    .all();

  return {
    username,
    subredditName,
    isModerator: moderators.length > 0,
  };
};

const ensureModerator = async (): Promise<ViewerResponse> => {
  const currentViewer = await viewer();

  if (!currentViewer.isModerator) {
    throw new Error('Moderator access required');
  }

  return currentViewer;
};

api.get('/queue', async (c) => {
  try {
    await ensureModerator();
    const items = await getRankedQueue();
    console.log(`Loaded ${items.length} triage queue items`);

    return c.json<QueueResponse>({ items });
  } catch (error) {
    console.error('Failed to load triage queue:', error);
    const status =
      error instanceof Error && error.message === 'Moderator access required'
        ? 403
        : 500;

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      status
    );
  }
});

api.get('/viewer', async (c) => {
  try {
    return c.json<ViewerResponse>(await viewer());
  } catch (error) {
    console.error('Failed to resolve viewer:', error);
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

api.get('/settings', async (c) => {
  try {
    await ensureModerator();

    return c.json<SettingsResponse>({ settings: await getSettings() });
  } catch (error) {
    console.error('Failed to load settings:', error);
    const status =
      error instanceof Error && error.message === 'Moderator access required'
        ? 403
        : 500;

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      status
    );
  }
});

api.post('/settings', async (c) => {
  try {
    await ensureModerator();

    const body = await c.req.json<SaveSettingsRequest | ResetSettingsRequest>();
    if (!('reset' in body) && !body.settings) {
      return c.json<ErrorResponse>(
        {
          status: 'error',
          message: 'Expected settings payload or reset=true',
        },
        400
      );
    }

    const settings =
      'reset' in body && body.reset
        ? await resetSettings()
        : await saveSettings((body as SaveSettingsRequest).settings);
    const recomputed = await recomputeQueue(settings);

    console.log(
      `Saved triage settings and recomputed ${recomputed.length} queue items`
    );

    return c.json<SaveSettingsResponse>({
      status: 'ok',
      settings,
      recomputedCount: recomputed.length,
    });
  } catch (error) {
    console.error('Failed to save settings:', error);
    const status =
      error instanceof Error && error.message === 'Moderator access required'
        ? 403
        : 500;

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      status
    );
  }
});

api.post('/claim', async (c) => {
  try {
    const currentViewer = await ensureModerator();
    const body = await c.req.json<ClaimRequest>();

    if (!body.thingId || !currentViewer.username) {
      return c.json<ErrorResponse>(
        {
          status: 'error',
          message: 'Expected thingId and authenticated moderator',
        },
        400
      );
    }

    const item = await claimItem(body.thingId, currentViewer.username);
    console.log(`Claimed triage item ${body.thingId} by ${currentViewer.username}`);

    return c.json<ClaimResponse>({ status: 'ok', item });
  } catch (error) {
    if (error instanceof ClaimConflictError) {
      return c.json<ClaimConflictResponse>(
        {
          status: 'conflict',
          claimedBy: error.claimedBy,
          message: error.message,
        },
        409
      );
    }

    console.error('Claim request failed:', error);
    const status =
      error instanceof Error && error.message === 'Moderator access required'
        ? 403
        : error instanceof ClaimNotFoundError
          ? 404
          : 500;

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      status
    );
  }
});

api.post('/unclaim', async (c) => {
  try {
    const currentViewer = await ensureModerator();
    const body = await c.req.json<ClaimRequest>();

    if (!body.thingId || !currentViewer.username) {
      return c.json<ErrorResponse>(
        {
          status: 'error',
          message: 'Expected thingId and authenticated moderator',
        },
        400
      );
    }

    const item = await unclaimItem(body.thingId, currentViewer.username);
    console.log(
      `Unclaimed triage item ${body.thingId} by ${currentViewer.username}`
    );

    return c.json<ClaimResponse>({ status: 'ok', item });
  } catch (error) {
    if (error instanceof ClaimConflictError) {
      return c.json<ClaimConflictResponse>(
        {
          status: 'conflict',
          claimedBy: error.claimedBy,
          message: error.message,
        },
        409
      );
    }

    console.error('Unclaim request failed:', error);
    const status =
      error instanceof Error && error.message === 'Moderator access required'
        ? 403
        : error instanceof ClaimNotFoundError
          ? 404
          : 500;

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      status
    );
  }
});

api.post('/moderate', async (c) => {
  try {
    await ensureModerator();

    const body = await c.req.json<ModerateRequest>();

    if (
      !body.thingId ||
      (body.action !== 'approve' && body.action !== 'remove')
    ) {
      return c.json<ErrorResponse>(
        {
          status: 'error',
          message: 'Expected thingId and action approve/remove',
        },
        400
      );
    }

    const queuedItem = await getItem(body.thingId);
    const kind =
      queuedItem?.kind ?? (body.thingId.startsWith('t1_') ? 'comment' : 'post');

    if (kind === 'comment') {
      const comment = await reddit.getCommentById(T1(body.thingId));
      if (body.action === 'approve') {
        await comment.approve();
      } else {
        await comment.remove(false);
      }
    } else {
      const post = await reddit.getPostById(T3(body.thingId));
      if (body.action === 'approve') {
        await post.approve();
      } else {
        await post.remove(false);
      }
    }

    await resolveItem(body.thingId);
    console.log(`Moderated ${body.thingId} with action ${body.action}`);

    return c.json<ModerateResponse>({
      status: 'ok',
      thingId: body.thingId,
      action: body.action,
    });
  } catch (error) {
    console.error('Moderation request failed:', error);
    const status =
      error instanceof Error && error.message === 'Moderator access required'
        ? 403
        : 500;

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      status
    );
  }
});
