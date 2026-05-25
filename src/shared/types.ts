export type ScoreBreakdown = {
  humanReportBoost: number;
  reportVolume: number;
  reasonSeverity: number;
  authorRisk: number;
  staleness: number;
};

export type SeverityTier = 'high' | 'medium' | 'low';

export type Settings = {
  weights: ScoreBreakdown;
  severityMap: Record<string, SeverityTier>;
};

export const TRIAGE_REALTIME_CHANNEL = 'triage_live';

export type TriageRealtimeMessage =
  | {
      type: 'item_updated';
      item: TriageItem;
    }
  | {
      type: 'item_resolved';
      thingId: string;
    }
  | {
      type: 'claim_updated';
      thingId: string;
      claimedBy: string;
      claimedAt: number;
    }
  | {
      type: 'claim_cleared';
      thingId: string;
    };

export const DEFAULT_SETTINGS: Settings = {
  weights: {
    humanReportBoost: 40,
    reportVolume: 15,
    reasonSeverity: 25,
    authorRisk: 10,
    staleness: 10,
  },
  severityMap: {
    violence: 'high',
    threats: 'high',
    threat: 'high',
    harassment: 'high',
    hate: 'high',
    'minor-safety': 'high',
    minor: 'high',
    spam: 'medium',
    misinformation: 'medium',
    'off-topic': 'low',
    "i don't like this": 'low',
  },
};

export type TriageItem = {
  thingId: string;
  kind: 'post' | 'comment';
  author: string;
  permalink: string;
  title?: string;
  bodyPreview?: string;
  reportReasons: string[];
  reportReasonCounts?: Record<string, number>;
  communityReportReasons?: string[];
  communityReportReasonCounts?: Record<string, number>;
  moderatorReportReasons?: string[];
  moderatorReportReasonCounts?: Record<string, number>;
  reportCount: number;
  humanReports: number;
  automodReports: number;
  authorRemovalCount: number;
  createdAt: number;
  lastSeenAt: number;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  claimedBy?: string;
  claimedAt?: number;
};
