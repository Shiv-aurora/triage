import {
  DEFAULT_SETTINGS,
  type ScoreBreakdown,
  type Settings,
  type SeverityTier,
  type TriageItem,
} from '../shared/types';

export const DEFAULT_WEIGHTS = DEFAULT_SETTINGS.weights;
export const DEFAULT_REASON_SEVERITY = DEFAULT_SETTINGS.severityMap;

export type ScoreInput = Pick<
  TriageItem,
  | 'reportReasons'
  | 'reportCount'
  | 'humanReports'
  | 'authorRemovalCount'
  | 'createdAt'
>;

export type ScoringOptions = {
  now?: number;
  settings?: Settings;
};

export type ScoreResult = {
  score: number;
  scoreBreakdown: ScoreBreakdown;
};

const MS_PER_HOUR = 60 * 60 * 1000;
const STALENESS_FULL_SCORE_HOURS = 24;
const SEVERITY_VALUE: Record<SeverityTier, number> = {
  high: 1,
  medium: 0.6,
  low: 0.25,
};

export const normalizeReason = (reason: string): string =>
  reason.trim().toLowerCase();

export const reasonSeverityFor = (
  reason: string,
  severityMap: Settings['severityMap'] = DEFAULT_REASON_SEVERITY
): number => {
  const normalized = normalizeReason(reason);

  for (const [needle, tier] of Object.entries(severityMap)) {
    if (normalized.includes(needle)) {
      return SEVERITY_VALUE[tier] ?? SEVERITY_VALUE.low;
    }
  }

  return SEVERITY_VALUE.low;
};

export const scoreTriageItem = (
  item: ScoreInput,
  options: ScoringOptions = {}
): ScoreResult => {
  const settings = options.settings ?? DEFAULT_SETTINGS;
  const weights = settings.weights;
  const severityMap = settings.severityMap;
  const now = options.now ?? Date.now();
  const reportCount = Math.max(0, item.reportCount);
  const ageHours = Math.max(0, (now - item.createdAt) / MS_PER_HOUR);

  const maxSeverity = item.reportReasons.reduce(
    (max, reason) => Math.max(max, reasonSeverityFor(reason, severityMap)),
    0
  );

  const scoreBreakdown: ScoreBreakdown = {
    humanReportBoost: item.humanReports > 0 ? weights.humanReportBoost : 0,
    reportVolume: Math.log2(1 + reportCount) * weights.reportVolume,
    reasonSeverity: maxSeverity * weights.reasonSeverity,
    authorRisk:
      (Math.min(Math.max(0, item.authorRemovalCount), 5) / 5) *
      weights.authorRisk,
    staleness:
      Math.min(ageHours / STALENESS_FULL_SCORE_HOURS, 1) * weights.staleness,
  };

  const score = Object.values(scoreBreakdown).reduce(
    (total, value) => total + value,
    0
  );

  return {
    score: Math.round(score * 100) / 100,
    scoreBreakdown: {
      humanReportBoost: Math.round(scoreBreakdown.humanReportBoost * 100) / 100,
      reportVolume: Math.round(scoreBreakdown.reportVolume * 100) / 100,
      reasonSeverity: Math.round(scoreBreakdown.reasonSeverity * 100) / 100,
      authorRisk: Math.round(scoreBreakdown.authorRisk * 100) / 100,
      staleness: Math.round(scoreBreakdown.staleness * 100) / 100,
    },
  };
};
