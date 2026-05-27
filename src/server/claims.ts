import type { TriageItem } from '../shared/types';
import { getItem, getRankedQueue, saveItem } from './queue';
import { publishTriageEvent } from './realtime';

export const CLAIM_STALE_MS = 10 * 60 * 1000;

export class ClaimConflictError extends Error {
  constructor(readonly claimedBy: string) {
    super(`Already claimed by u/${claimedBy}`);
  }
}

export class ClaimNotFoundError extends Error {
  constructor(thingId: string) {
    super(`Queue item ${thingId} was not found`);
  }
}

export const isClaimStale = (
  item: Pick<TriageItem, 'claimedBy' | 'claimedAt'>,
  now = Date.now()
): boolean =>
  item.claimedBy !== undefined &&
  item.claimedAt !== undefined &&
  now - item.claimedAt > CLAIM_STALE_MS;

const withoutClaim = (item: TriageItem): TriageItem => {
  const updated: TriageItem = { ...item };
  delete updated.claimedBy;
  delete updated.claimedAt;
  return updated;
};

export const claimItem = async (
  thingId: string,
  username: string
): Promise<TriageItem> => {
  const now = Date.now();
  const item = await getItem(thingId);

  if (!item) {
    throw new ClaimNotFoundError(thingId);
  }

  if (
    item.claimedBy &&
    item.claimedBy !== username &&
    !isClaimStale(item, now)
  ) {
    throw new ClaimConflictError(item.claimedBy);
  }

  const updated: TriageItem = {
    ...item,
    claimedBy: username,
    claimedAt: now,
  };

  await saveItem(updated);
  await publishTriageEvent({
    type: 'claim_updated',
    thingId,
    claimedBy: username,
    claimedAt: now,
  });

  return updated;
};

export const unclaimItem = async (
  thingId: string,
  username: string
): Promise<TriageItem> => {
  const item = await getItem(thingId);

  if (!item) {
    throw new ClaimNotFoundError(thingId);
  }

  if (
    item.claimedBy &&
    item.claimedBy !== username &&
    !isClaimStale(item)
  ) {
    throw new ClaimConflictError(item.claimedBy);
  }

  const updated = withoutClaim(item);

  await saveItem(updated);
  await publishTriageEvent({ type: 'claim_cleared', thingId });

  return updated;
};

export const releaseStaleClaims = async (): Promise<TriageItem[]> => {
  const items = await getRankedQueue();
  const released: TriageItem[] = [];

  for (const item of items) {
    if (!isClaimStale(item)) {
      continue;
    }

    const updated = withoutClaim(item);
    await saveItem(updated);
    await publishTriageEvent({ type: 'claim_cleared', thingId: item.thingId });
    released.push(updated);
  }

  return released;
};
