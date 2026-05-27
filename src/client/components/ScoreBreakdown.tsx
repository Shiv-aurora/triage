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
    <section>
      <button
        type="button"
        className="flex items-center gap-1 text-sm font-bold uppercase text-[var(--reddit-blue)] transition hover:underline"
        onClick={() => setExpanded((value) => !value)}
      >
        <span>Score signals</span>
        <span className="text-xs">{expanded ? '⌃' : '⌄'}</span>
      </button>
      {expanded ? (
        <dl className="mt-3 overflow-hidden rounded-lg border border-[var(--reddit-border)] text-sm">
          {ORDER.map((key) => (
            <div
              key={key}
              className="flex items-center justify-between border-b border-[var(--reddit-border)] bg-[var(--reddit-subtle)] px-4 py-2 last:border-b-0"
            >
              <dt className="text-[var(--reddit-text-secondary)]">
                {LABELS[key]}
              </dt>
              <dd className="font-mono font-bold text-[var(--reddit-text-main)]">
                +{breakdown[key].toFixed(2)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
};
