import { useState } from 'react';
import type { ScoreBreakdown as ScoreBreakdownType } from '../../shared/types';

type ScoreBreakdownProps = {
  breakdown: ScoreBreakdownType;
};

const LABELS: Record<keyof ScoreBreakdownType, string> = {
  humanReportBoost: 'Human report boost',
  reportVolume: 'Report volume',
  reasonSeverity: 'Reason severity',
  authorRisk: 'Author risk',
  staleness: 'Staleness',
};

const ORDER: (keyof ScoreBreakdownType)[] = [
  'humanReportBoost',
  'reportVolume',
  'reasonSeverity',
  'authorRisk',
  'staleness',
];

export const ScoreBreakdown = ({ breakdown }: ScoreBreakdownProps) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="border-t border-slate-200 pt-2 dark:border-slate-800">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        onClick={() => setExpanded((value) => !value)}
      >
        <span>Score signals</span>
        <span className="text-slate-400">{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded ? (
        <dl className="mt-2 grid gap-1.5 text-sm">
          {ORDER.map((key) => (
            <div
              key={key}
              className="flex items-center justify-between rounded bg-slate-50 px-2 py-1.5 dark:bg-slate-950"
            >
              <dt className="text-slate-600 dark:text-slate-300">
                {LABELS[key]}
              </dt>
              <dd className="font-mono text-slate-950 dark:text-white">
                +{breakdown[key].toFixed(2)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
};
