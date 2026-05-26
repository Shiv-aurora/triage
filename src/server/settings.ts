import { redis } from '@devvit/web/server';
import {
  DEFAULT_SETTINGS,
  type ScoreBreakdown,
  type Settings,
  type SeverityTier,
} from '../shared/types';

export const SETTINGS_KEY = 'triage:settings';

const WEIGHT_KEYS: (keyof ScoreBreakdown)[] = [
  'humanReportBoost',
  'reportVolume',
  'reasonSeverity',
  'authorRisk',
  'staleness',
];

const SEVERITY_TIERS = new Set<SeverityTier>(['high', 'medium', 'low']);

const clampWeight = (value: unknown, fallback: number): number => {
  const numeric =
    typeof value === 'number' ? value : Number.parseFloat(String(value));

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, Math.round(numeric * 100) / 100));
};

export const normalizeSettings = (settings: Partial<Settings>): Settings => {
  const weights = { ...DEFAULT_SETTINGS.weights };

  for (const key of WEIGHT_KEYS) {
    weights[key] = clampWeight(settings.weights?.[key], weights[key]);
  }

  const severityMap: Record<string, SeverityTier> = {
    ...DEFAULT_SETTINGS.severityMap,
  };

  for (const [reason, tier] of Object.entries(settings.severityMap ?? {})) {
    const normalizedReason = reason.trim().toLowerCase();

    if (normalizedReason && SEVERITY_TIERS.has(tier)) {
      severityMap[normalizedReason] = tier;
    }
  }

  return { weights, severityMap };
};

const readSettingsRecord = async (): Promise<Settings | undefined> => {
  const record = await redis.hGetAll(SETTINGS_KEY);

  if (!record.settings) {
    return undefined;
  }

  try {
    return normalizeSettings(JSON.parse(record.settings) as Settings);
  } catch (error) {
    console.warn('Could not parse stored triage settings:', error);
    return undefined;
  }
};

export const saveSettings = async (settings: Settings): Promise<Settings> => {
  const normalized = normalizeSettings(settings);

  await redis.hSet(SETTINGS_KEY, {
    settings: JSON.stringify(normalized),
    updatedAt: String(Date.now()),
  });

  return normalized;
};

export const getSettings = async (): Promise<Settings> => {
  const settings = await readSettingsRecord();

  if (settings) {
    return settings;
  }

  return await saveSettings(DEFAULT_SETTINGS);
};

export const resetSettings = async (): Promise<Settings> =>
  await saveSettings(DEFAULT_SETTINGS);

export const seedDefaultSettings = async (): Promise<Settings> => {
  const existing = await readSettingsRecord();

  if (existing) {
    return existing;
  }

  return await saveSettings(DEFAULT_SETTINGS);
};
