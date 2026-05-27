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
    return 'border-orange-100 bg-orange-50 text-[#d93900] dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200';
  }

  return 'border-blue-200 bg-blue-50 text-[var(--reddit-blue)] dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200';
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
      className={`overflow-hidden rounded-xl border bg-[var(--reddit-surface)] shadow-sm transition-colors hover:border-[var(--reddit-border-strong)] ${
        isLocked
          ? 'border-[var(--reddit-blue)]'
          : 'border-[var(--reddit-border)]'
      }`}
    >
      <div className="flex flex-col sm:flex-row">
        <div className="flex w-full items-center gap-2 border-b border-[var(--reddit-border)] bg-[var(--reddit-subtle)] px-4 py-2 text-xs font-bold uppercase text-slate-400 sm:w-12 sm:flex-col sm:border-b-0 sm:border-r sm:px-2 sm:py-5">
          <span className="text-sm leading-none">{rank}</span>
          <span className="text-[10px] leading-none">{item.kind}</span>
        </div>

        <div className="min-w-0 flex-1 p-5">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={`rounded border px-2 py-1 text-[10px] font-bold uppercase leading-none ${priorityTone(item)}`}
            >
              {item.humanReports > 0
                ? `${item.humanReports} community`
                : `${item.automodReports} automated`}
            </span>
            {item.automodReports > 0 && item.humanReports > 0 ? (
              <span className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase leading-none text-[var(--reddit-blue)] dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
                {item.automodReports} automated
              </span>
            ) : null}
              <span className="text-xs text-[var(--reddit-text-secondary)]">
                • {relativeAge(item.createdAt)}
              </span>
            </div>
            <span className="shrink-0 rounded-full bg-black px-3 py-1.5 font-mono text-xs font-bold text-white dark:bg-white dark:text-black">
              {item.score.toFixed(1)}
            </span>
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-2">
            {isClaimed ? (
              <span className="rounded-full border border-[var(--reddit-blue)] bg-blue-50 px-2.5 py-1 text-xs font-bold text-[var(--reddit-blue)] dark:bg-blue-950/30">
                u/{item.claimedBy} is reviewing
              </span>
            ) : null}
          </div>

          <h2 className="break-words text-xl font-bold leading-tight text-[var(--reddit-text-main)]">
            {heading}
          </h2>

          <div className="mb-5 mt-2 flex flex-wrap items-center gap-2 text-sm">
            {item.authorRemovalCount === 0 ? (
              <span className="h-5 w-5 rounded-full bg-[var(--reddit-border-strong)]" />
            ) : null}
            <span className="font-bold text-[var(--reddit-blue)]">
              u/{item.author}
            </span>
            {item.authorRemovalCount > 0 ? (
              <span className="rounded-full bg-[var(--reddit-bg)] px-2 py-0.5 text-xs text-[var(--reddit-text-secondary)]">
                {item.authorRemovalCount} prior removals
              </span>
            ) : null}
          </div>

          <ReportReasons item={item} />
          <ScoreBreakdown breakdown={item.scoreBreakdown} />
        </div>

        <div className="border-t border-[var(--reddit-border)] bg-[var(--reddit-subtle)] p-4 sm:w-40 sm:border-l sm:border-t-0">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
            {isClaimedByViewer ? (
              <button
                type="button"
                className="rounded-full bg-[var(--reddit-blue)] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[var(--reddit-blue-hover)] disabled:cursor-wait disabled:opacity-50"
                disabled={isBusy}
                onClick={() => onUnclaim(item.thingId)}
              >
                {busyClaim === 'unclaim' ? 'Unclaiming' : 'Unclaim'}
              </button>
            ) : (
              <button
                type="button"
                className="rounded-full bg-[var(--reddit-blue)] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[var(--reddit-blue-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isBusy || isLocked}
                onClick={() => onClaim(item.thingId)}
              >
                {busyClaim === 'claim' ? 'Claiming' : 'Claim'}
              </button>
            )}
            <button
              type="button"
              className="rounded-full border border-[var(--reddit-green)] px-4 py-2.5 text-sm font-bold text-[var(--reddit-green)] transition hover:bg-green-50 disabled:cursor-wait disabled:opacity-50 dark:hover:bg-green-950/30"
              disabled={isBusy || isLocked}
              onClick={() => onModerate(item.thingId, 'approve')}
            >
              {busyAction === 'approve' ? 'Approving' : 'Approve'}
            </button>
            <button
              type="button"
              className="rounded-full border border-[var(--reddit-red)] px-4 py-2.5 text-sm font-bold text-[var(--reddit-red)] transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-50 dark:hover:bg-red-950/30"
              disabled={isBusy || isLocked}
              onClick={() => onModerate(item.thingId, 'remove')}
            >
              {busyAction === 'remove' ? 'Rejecting' : 'Reject'}
            </button>
            <a
              className="rounded-full border border-[var(--reddit-border-strong)] px-4 py-2.5 text-center text-sm font-bold text-slate-700 transition hover:bg-[var(--reddit-border)] dark:text-slate-200"
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
