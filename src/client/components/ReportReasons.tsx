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
    <section className="mb-5 overflow-hidden rounded-lg border border-[var(--reddit-border)]">
      <div className="border-b border-[var(--reddit-border)] bg-[var(--reddit-subtle)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--reddit-text-secondary)]">
        Reports ({item.reportCount} total)
      </div>
      <div className="divide-y divide-[var(--reddit-border)]">
        {item.humanReports > 0 ? (
          <ReasonGroup
            label="User"
            tone="community"
            rows={reasonRows(
              communityReasons,
              item.communityReportReasonCounts
            )}
            fallbackCount={item.humanReports}
          />
        ) : null}
        {item.automodReports > 0 ? (
          <ReasonGroup
            label="Auto"
            tone="automated"
            rows={reasonRows(
              automatedReasons,
              item.moderatorReportReasonCounts
            )}
            fallbackCount={item.automodReports}
          />
        ) : null}
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
  const rowTone =
    tone === 'automated' ? 'bg-blue-50/40 dark:bg-blue-950/20' : '';

  return (
    <div className={rowTone}>
      {rows.length > 0 ? (
        <ul className="divide-y divide-[var(--reddit-border)]">
          {rows.map(({ reason, count }) => (
            <li
              key={`${label}-${reason}`}
              className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-sm"
            >
              <span className="text-[11px] font-bold uppercase text-[var(--reddit-text-secondary)]">
                {label}:
              </span>
              <span className="min-w-0 break-words font-medium text-[var(--reddit-text-main)]">
                {reason}
              </span>
              <span className="font-mono font-bold text-[var(--reddit-text-main)]">
                x{count}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-sm">
          <span className="text-[11px] font-bold uppercase text-[var(--reddit-text-secondary)]">
            {label}:
          </span>
          <span className="text-[var(--reddit-text-secondary)]">
            No reason text available
          </span>
          <span className="font-mono font-bold text-[var(--reddit-text-main)]">
            x{fallbackCount}
          </span>
        </div>
      )}
    </div>
  );
};
