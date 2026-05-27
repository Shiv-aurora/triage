import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TriageItem } from '../shared/types';

const mockStore = vi.hoisted(() => ({
  item: undefined as TriageItem | undefined,
  events: [] as unknown[],
}));

vi.mock('./queue', () => ({
  getItem: vi.fn(async () => mockStore.item),
  getRankedQueue: vi.fn(async () => (mockStore.item ? [mockStore.item] : [])),
  saveItem: vi.fn(async (item: TriageItem) => {
    mockStore.item = item;
    return item;
  }),
}));

vi.mock('./realtime', () => ({
  publishTriageEvent: vi.fn(async (message: unknown) => {
    mockStore.events.push(message);
  }),
}));

import {
  claimItem,
  CLAIM_STALE_MS,
  ClaimConflictError,
  isClaimStale,
  unclaimItem,
} from './claims';

const baseItem = (overrides: Partial<TriageItem> = {}): TriageItem => ({
  thingId: 't3_claim',
  kind: 'post',
  author: 'author',
  permalink: '/r/test/comments/claim',
  title: 'Claim test',
  reportReasons: ['spam'],
  reportCount: 1,
  humanReports: 1,
  automodReports: 0,
  authorRemovalCount: 0,
  createdAt: Date.UTC(2026, 4, 26),
  lastSeenAt: Date.UTC(2026, 4, 26),
  score: 80,
  scoreBreakdown: {
    humanReportBoost: 40,
    reportVolume: 15,
    reasonSeverity: 25,
    authorRisk: 0,
    staleness: 0,
  },
  ...overrides,
});

describe('claims', () => {
  beforeEach(() => {
    mockStore.item = undefined;
    mockStore.events = [];
  });

  it('treats fresh claims as active', () => {
    const now = Date.UTC(2026, 4, 26);

    expect(
      isClaimStale(
        {
          claimedBy: 'mod-a',
          claimedAt: now - CLAIM_STALE_MS + 1,
        },
        now
      )
    ).toBe(false);
  });

  it('treats old claims as stale', () => {
    const now = Date.UTC(2026, 4, 26);

    expect(
      isClaimStale(
        {
          claimedBy: 'mod-a',
          claimedAt: now - CLAIM_STALE_MS - 1,
        },
        now
      )
    ).toBe(true);
  });

  it('does not expire missing claim state', () => {
    expect(isClaimStale({})).toBe(false);
  });

  it('rejects a conflicting fresh claim before writing', async () => {
    mockStore.item = baseItem({
      claimedBy: 'mod-a',
      claimedAt: Date.now(),
    });

    await expect(claimItem('t3_claim', 'mod-b')).rejects.toBeInstanceOf(
      ClaimConflictError
    );
    expect(mockStore.item.claimedBy).toBe('mod-a');
    expect(mockStore.events).toHaveLength(0);
  });

  it('lets the claiming moderator unclaim and publishes an event', async () => {
    mockStore.item = baseItem({
      claimedBy: 'mod-a',
      claimedAt: Date.now(),
    });

    const item = await unclaimItem('t3_claim', 'mod-a');

    expect(item.claimedBy).toBeUndefined();
    expect(item.claimedAt).toBeUndefined();
    expect(mockStore.events).toContainEqual({
      type: 'claim_cleared',
      thingId: 't3_claim',
    });
  });
});
