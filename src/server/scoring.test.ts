import { describe, expect, it } from 'vitest';
import { scoreTriageItem } from './scoring';
import { DEFAULT_SETTINGS, type Settings, type TriageItem } from '../shared/types';

const NOW = Date.UTC(2026, 4, 26);

const baseItem = (overrides: Partial<TriageItem> = {}): TriageItem => ({
  thingId: 't3_test',
  kind: 'post',
  author: 'author',
  permalink: '/r/test/comments/test',
  title: 'Test',
  reportReasons: ['off-topic'],
  reportCount: 1,
  humanReports: 1,
  automodReports: 0,
  authorRemovalCount: 0,
  createdAt: NOW,
  lastSeenAt: NOW,
  score: 0,
  scoreBreakdown: {
    humanReportBoost: 0,
    reportVolume: 0,
    reasonSeverity: 0,
    authorRisk: 0,
    staleness: 0,
  },
  ...overrides,
});

describe('scoreTriageItem', () => {
  it('boosts human reports over automod-only reports', () => {
    const human = scoreTriageItem(baseItem({ humanReports: 1 }), { now: NOW });
    const automod = scoreTriageItem(
      baseItem({ humanReports: 0, automodReports: 1 }),
      { now: NOW }
    );

    expect(human.scoreBreakdown.humanReportBoost).toBe(40);
    expect(automod.scoreBreakdown.humanReportBoost).toBe(0);
    expect(human.score).toBeGreaterThan(automod.score);
  });

  it('increases score with multiple reports using log scaling', () => {
    const one = scoreTriageItem(baseItem({ reportCount: 1 }), { now: NOW });
    const four = scoreTriageItem(baseItem({ reportCount: 4 }), { now: NOW });

    expect(four.scoreBreakdown.reportVolume).toBeGreaterThan(
      one.scoreBreakdown.reportVolume
    );
    expect(four.scoreBreakdown.reportVolume).toBeCloseTo(
      Math.log2(5) * 15,
      2
    );
  });

  it('scores high severity reasons above low severity reasons', () => {
    const high = scoreTriageItem(
      baseItem({ reportReasons: ['threats of violence'] }),
      { now: NOW }
    );
    const low = scoreTriageItem(baseItem({ reportReasons: ['off-topic'] }), {
      now: NOW,
    });

    expect(high.scoreBreakdown.reasonSeverity).toBeGreaterThan(
      low.scoreBreakdown.reasonSeverity
    );
  });

  it('adds author risk for prior removals and caps it', () => {
    const clean = scoreTriageItem(baseItem({ authorRemovalCount: 0 }), {
      now: NOW,
    });
    const risky = scoreTriageItem(baseItem({ authorRemovalCount: 10 }), {
      now: NOW,
    });

    expect(clean.scoreBreakdown.authorRisk).toBe(0);
    expect(risky.scoreBreakdown.authorRisk).toBe(10);
  });

  it('adds staleness as an item ages', () => {
    const fresh = scoreTriageItem(baseItem({ createdAt: NOW }), { now: NOW });
    const aged = scoreTriageItem(
      baseItem({ createdAt: NOW - 12 * 60 * 60 * 1000 }),
      { now: NOW }
    );

    expect(fresh.scoreBreakdown.staleness).toBe(0);
    expect(aged.scoreBreakdown.staleness).toBe(5);
  });

  it('uses non-default settings passed by the queue layer', () => {
    const customSettings: Settings = {
      weights: {
        ...DEFAULT_SETTINGS.weights,
        humanReportBoost: 5,
        reasonSeverity: 100,
      },
      severityMap: {
        ...DEFAULT_SETTINGS.severityMap,
        'off-topic': 'high',
      },
    };

    const scored = scoreTriageItem(baseItem({ reportReasons: ['off-topic'] }), {
      now: NOW,
      settings: customSettings,
    });

    expect(scored.scoreBreakdown.humanReportBoost).toBe(5);
    expect(scored.scoreBreakdown.reasonSeverity).toBe(100);
  });
});
