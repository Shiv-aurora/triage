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
    return 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800';
  }

  if (tier === 'high') {
    return 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-100';
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
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
              Scoring weights
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Total active weight: {Math.round(totalWeight * 100) / 100}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              disabled={saving}
              onClick={handleReset}
            >
              Reset
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-950 bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
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
              className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {WEIGHT_LABELS[key]}
                </span>
                <input
                  className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-right font-mono text-sm text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
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
                className="h-2 w-full accent-slate-950 dark:accent-slate-100"
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

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
          Report severity map
        </h2>
        <div className="mt-4 grid gap-2">
          {reasons.map((reason) => (
            <div
              key={reason}
              className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="min-w-0 font-mono text-sm text-slate-800 dark:text-slate-200">
                {reason}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {SEVERITY_TIERS.map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    className={`rounded-md border px-2 py-1 text-xs font-semibold capitalize transition ${tierClass(
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
          <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">
            {status}
          </p>
        ) : null}
      </div>
    </section>
  );
};
