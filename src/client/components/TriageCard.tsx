import type { ModerateAction } from '../../shared/api';
import type { TriageItem } from '../../shared/types';
import { ReportReasons } from './ReportReasons';
import { ScoreBreakdown } from './ScoreBreakdown';

type TriageCardProps = {
  item: TriageItem;
  rank: number;
  viewerUsername?: string | undefined;
  busyAction?: ModerateAction | undefined;
  busyClaim?: 'claim' | 'unclaim' | undefined;
  onModerate: (thingId: string, action: ModerateAction) => void;
  onClaim: (thingId: string) => void;
  onUnclaim: (thingId: string) => void;
};

const relativeAge = (createdAt: number): string => {
  const minutes = Math.max(0, Math.floor((Date.now() - createdAt) / 60000));

  if (minutes < 1) {
    return '<1m in queue';
  }

  if (minutes < 60) {
    return `${minutes}m in queue`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 24) {
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m in queue`
      : `${hours}h in queue`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d in queue`;
};

const priorityTone = (item: TriageItem): string => {
  if (item.humanReports > 0) {
    return 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-100';
  }

  return 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-100';
};

const redditUrl = (permalink: string): string => {
  if (permalink.startsWith('http://') || permalink.startsWith('https://')) {
    return permalink;
  }

  return `https://www.reddit.com${permalink.startsWith('/') ? '' : '/'}${permalink}`;
};

export const TriageCard = ({
  item,
  rank,
  viewerUsername,
  busyAction,
  busyClaim,
  onModerate,
  onClaim,
  onUnclaim,
}: TriageCardProps) => {
  const heading =
    item.kind === 'post'
      ? item.title || 'Untitled post'
      : item.bodyPreview || 'Comment preview unavailable';
  const isClaimed = item.claimedBy !== undefined;
  const isClaimedByViewer =
    viewerUsername !== undefined && item.claimedBy === viewerUsername;
  const isLocked = isClaimed && !isClaimedByViewer;
  const isBusy = busyAction !== undefined || busyClaim !== undefined;

  return (
    <article
      className={`rounded-lg border bg-white shadow-sm shadow-slate-200/70 transition-colors dark:bg-slate-900 dark:shadow-none ${
        isLocked
          ? 'border-violet-200 dark:border-violet-900/70'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="grid gap-3 p-3 sm:grid-cols-[auto_1fr_auto] sm:items-start">
        <div className="flex items-center gap-2 sm:block">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-950 font-mono text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-950">
            {rank}
          </div>
          <div className="sm:mt-2">
            <div className="rounded-full bg-slate-100 px-2 py-1 text-center font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {item.kind}
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${priorityTone(item)}`}
            >
              {item.humanReports > 0
                ? `${item.humanReports} community`
                : `${item.automodReports} automated`}
            </span>
            {item.automodReports > 0 && item.humanReports > 0 ? (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-100">
                {item.automodReports} automated
              </span>
            ) : null}
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {relativeAge(item.createdAt)}
            </span>
            {isClaimed ? (
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-900 dark:border-violet-900/70 dark:bg-violet-950/50 dark:text-violet-100">
                u/{item.claimedBy} is reviewing
              </span>
            ) : null}
          </div>

          <h2 className="break-words text-base font-semibold leading-snug text-slate-950 dark:text-white">
            {heading}
          </h2>

          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span>u/{item.author}</span>
            {item.authorRemovalCount > 0 ? (
              <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-100">
                {item.authorRemovalCount} prior removals
              </span>
            ) : null}
          </div>

          <ReportReasons item={item} />
          <ScoreBreakdown breakdown={item.scoreBreakdown} />
        </div>

        <div className="flex flex-row items-center justify-between gap-2 sm:min-w-[9rem] sm:flex-col sm:items-end">
          <div className="rounded-full bg-slate-950 px-3 py-1.5 font-mono text-lg font-semibold text-white dark:bg-slate-100 dark:text-slate-950">
            {item.score.toFixed(1)}
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:w-full sm:grid-cols-1">
            {isClaimedByViewer ? (
              <button
                type="button"
                className="rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-900 transition hover:bg-violet-100 disabled:cursor-wait disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-100 dark:hover:bg-violet-950"
                disabled={isBusy}
                onClick={() => onUnclaim(item.thingId)}
              >
                {busyClaim === 'unclaim' ? 'Unclaiming' : 'Unclaim'}
              </button>
            ) : (
              <button
                type="button"
                className="rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-900 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-100 dark:hover:bg-violet-950"
                disabled={isBusy || isLocked}
                onClick={() => onClaim(item.thingId)}
              >
                {busyClaim === 'claim' ? 'Claiming' : 'Claim'}
              </button>
            )}
            <button
              type="button"
              className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100 dark:hover:bg-emerald-950"
              disabled={isBusy || isLocked}
              onClick={() => onModerate(item.thingId, 'approve')}
            >
              {busyAction === 'approve' ? 'Approving' : 'Approve'}
            </button>
            <button
              type="button"
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900 transition hover:bg-red-100 disabled:cursor-wait disabled:opacity-50 dark:border-red-800 dark:bg-red-950/60 dark:text-red-100 dark:hover:bg-red-950"
              disabled={isBusy || isLocked}
              onClick={() => onModerate(item.thingId, 'remove')}
            >
              {busyAction === 'remove' ? 'Removing' : 'Remove'}
            </button>
            <a
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-center text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              href={redditUrl(item.permalink)}
              target="_blank"
              rel="noreferrer"
            >
              Open
            </a>
          </div>
        </div>
      </div>
    </article>
  );
};
