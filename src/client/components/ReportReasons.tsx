import type { TriageItem } from '../../shared/types';

type ReportReasonsProps = {
  item: TriageItem;
};

const reasonRows = (
  reasons: string[],
  counts: Record<string, number> | undefined
) =>
  reasons.map((reason) => ({
    reason,
    count: counts?.[reason] ?? 1,
  }));

export const ReportReasons = ({ item }: ReportReasonsProps) => {
  const communityReasons =
    item.communityReportReasons && item.communityReportReasons.length > 0
      ? item.communityReportReasons
      : item.humanReports > 0
        ? item.reportReasons
        : [];
  const automatedReasons =
    item.moderatorReportReasons && item.moderatorReportReasons.length > 0
      ? item.moderatorReportReasons
      : item.automodReports > 0 && item.humanReports === 0
        ? item.reportReasons
        : [];

  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
          Reports
        </h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {item.reportCount} total
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <ReasonGroup
          label="Community"
          tone="community"
          rows={reasonRows(communityReasons, item.communityReportReasonCounts)}
          fallbackCount={item.humanReports}
        />
        <ReasonGroup
          label="Mod / automated"
          tone="automated"
          rows={reasonRows(automatedReasons, item.moderatorReportReasonCounts)}
          fallbackCount={item.automodReports}
        />
      </div>
    </section>
  );
};

type ReasonGroupProps = {
  label: string;
  tone: 'community' | 'automated';
  rows: { reason: string; count: number }[];
  fallbackCount: number;
};

const ReasonGroup = ({
  label,
  tone,
  rows,
  fallbackCount,
}: ReasonGroupProps) => {
  const color =
    tone === 'community'
      ? 'border-red-200 bg-red-50 text-red-950 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-100'
      : 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-100';

  return (
    <div className={`rounded-md border p-2 ${color}`}>
      <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.08em]">
        <span>{label}</span>
        <span>{fallbackCount}</span>
      </div>
      {rows.length > 0 ? (
        <ul className="grid gap-1">
          {rows.map(({ reason, count }) => (
            <li
              key={`${label}-${reason}`}
              className="flex items-start justify-between gap-2 text-sm"
            >
              <span className="min-w-0 break-words">{reason}</span>
              <span className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-xs dark:bg-black/20">
                x{count}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm opacity-70">No reports in this bucket.</p>
      )}
    </div>
  );
};
