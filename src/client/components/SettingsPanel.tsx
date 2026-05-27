import { useMemo, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  type Settings,
  type SeverityTier,
} from '../../shared/types';

type SettingsPanelProps = {
  initialSettings: Settings;
  saving: boolean;
  status?: string | undefined;
  onSave: (settings: Settings) => Promise<void>;
  onReset: () => Promise<void>;
};

const WEIGHT_LABELS: Record<keyof Settings['weights'], string> = {
  humanReportBoost: 'Human reports',
  reportVolume: 'Report volume',
  reasonSeverity: 'Reason severity',
  authorRisk: 'Author risk',
  staleness: 'Queue age',
};

const WEIGHT_KEYS = Object.keys(WEIGHT_LABELS) as (keyof Settings['weights'])[];
const SEVERITY_TIERS: SeverityTier[] = ['high', 'medium', 'low'];

const cloneSettings = (settings: Settings): Settings => ({
  weights: { ...settings.weights },
  severityMap: { ...settings.severityMap },
});

const tierClass = (tier: SeverityTier, active: boolean): string => {
  if (!active) {
    return 'border-[var(--reddit-border-strong)] bg-[var(--reddit-surface)] text-[var(--reddit-text-secondary)] hover:bg-[var(--reddit-bg)]';
  }

  if (tier === 'high') {
    return 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100';
  }

  if (tier === 'medium') {
    return 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100';
  }

  return 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-100';
};

export const SettingsPanel = ({
  initialSettings,
  saving,
  status,
  onSave,
  onReset,
}: SettingsPanelProps) => {
  const [draft, setDraft] = useState<Settings>(() =>
    cloneSettings(initialSettings)
  );

  const reasons = useMemo(
    () => Object.keys(draft.severityMap).sort((a, b) => a.localeCompare(b)),
    [draft.severityMap]
  );

  const totalWeight = WEIGHT_KEYS.reduce(
    (total, key) => total + draft.weights[key],
    0
  );

  const updateWeight = (key: keyof Settings['weights'], value: number) => {
    setDraft((current) => ({
      ...current,
      weights: {
        ...current.weights,
        [key]: Math.max(0, Math.min(100, value)),
      },
    }));
  };

  const updateSeverity = (reason: string, tier: SeverityTier) => {
    setDraft((current) => ({
      ...current,
      severityMap: {
        ...current.severityMap,
        [reason]: tier,
      },
    }));
  };

  const handleReset = async () => {
    setDraft(cloneSettings(DEFAULT_SETTINGS));
    await onReset();
  };

  return (
    <section className="grid gap-3">
      <div className="rounded-xl border border-[var(--reddit-border)] bg-[var(--reddit-surface)] p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[var(--reddit-text-main)]">
              Scoring weights
            </h2>
            <p className="mt-1 text-sm text-[var(--reddit-text-secondary)]">
              Total active weight: {Math.round(totalWeight * 100) / 100}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border border-[var(--reddit-border-strong)] px-4 py-2 text-sm font-bold text-[var(--reddit-text-main)] transition hover:bg-[var(--reddit-bg)] disabled:cursor-wait disabled:opacity-60"
              disabled={saving}
              onClick={handleReset}
            >
              Reset
            </button>
            <button
              type="button"
              className="rounded-full bg-[var(--reddit-blue)] px-4 py-2 text-sm font-bold text-white transition hover:bg-[var(--reddit-blue-hover)] disabled:cursor-wait disabled:opacity-60"
              disabled={saving}
              onClick={() => onSave(draft)}
            >
              Save
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          {WEIGHT_KEYS.map((key) => (
            <label
              key={key}
              className="grid gap-2 rounded-lg border border-[var(--reddit-border)] bg-[var(--reddit-subtle)] p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-[var(--reddit-text-main)]">
                  {WEIGHT_LABELS[key]}
                </span>
                <input
                  className="w-20 rounded-md border border-[var(--reddit-border-strong)] bg-[var(--reddit-surface)] px-2 py-1 text-right font-mono text-sm text-[var(--reddit-text-main)]"
                  min={0}
                  max={100}
                  step={1}
                  type="number"
                  value={draft.weights[key]}
                  onChange={(event) =>
                    updateWeight(key, Number(event.currentTarget.value))
                  }
                />
              </div>
              <input
                className="h-2 w-full accent-[var(--reddit-blue)]"
                min={0}
                max={100}
                step={1}
                type="range"
                value={draft.weights[key]}
                onChange={(event) =>
                  updateWeight(key, Number(event.currentTarget.value))
                }
              />
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--reddit-border)] bg-[var(--reddit-surface)] p-5 shadow-sm">
        <h2 className="text-lg font-bold text-[var(--reddit-text-main)]">
          Report severity map
        </h2>
        <div className="mt-4 grid gap-2">
          {reasons.map((reason) => (
            <div
              key={reason}
              className="grid gap-2 rounded-lg border border-[var(--reddit-border)] bg-[var(--reddit-subtle)] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0 font-mono text-sm text-[var(--reddit-text-main)]">
                {reason}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {SEVERITY_TIERS.map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs font-bold capitalize transition ${tierClass(
                      tier,
                      draft.severityMap[reason] === tier
                    )}`}
                    onClick={() => updateSeverity(reason, tier)}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {status ? (
          <p className="mt-3 text-sm font-medium text-[var(--reddit-text-secondary)]">
            {status}
          </p>
        ) : null}
      </div>
    </section>
  );
};
