import { connectRealtime, disconnectRealtime } from '@devvit/web/client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  claim,
  getQueue,
  getSettings,
  getViewer,
  moderate,
  resetSettings,
  saveSettings,
  unclaim,
} from './api';
import type { ModerateAction, ViewerResponse } from '../shared/api';
import {
  TRIAGE_REALTIME_CHANNEL,
  type Settings,
  type TriageItem,
  type TriageRealtimeMessage,
} from '../shared/types';
import { SettingsPanel } from './components/SettingsPanel';
import { TriageCard } from './components/TriageCard';

const POLL_INTERVAL_MS = 20_000;
const THEME_KEY = 'triage:theme';

type BoardState =
  | {
      status: 'loading';
      viewer?: undefined;
      items: TriageItem[];
      settings?: undefined;
      error?: undefined;
    }
  | {
      status: 'blocked';
      viewer: ViewerResponse;
      items: TriageItem[];
      settings?: undefined;
      error?: undefined;
    }
  | {
      status: 'ready';
      viewer: ViewerResponse;
      items: TriageItem[];
      settings: Settings;
      error?: undefined;
    }
  | {
      status: 'error';
      viewer?: ViewerResponse;
      items: TriageItem[];
      settings?: Settings;
      error: string;
    };

type BusyItems = Record<string, ModerateAction>;
type BusyClaims = Record<string, 'claim' | 'unclaim'>;
type Theme = 'light' | 'dark';
type View = 'board' | 'settings' | 'analytics';
type Toast = {
  id: number;
  message: string;
  onUndo?: (() => void) | undefined;
};

type ReasonCount = {
  reason: string;
  count: number;
};

type QueueAnalytics = {
  postCount: number;
  commentCount: number;
  highPriorityCount: number;
  mediumPriorityCount: number;
  lowerPriorityCount: number;
  claimedPercent: number;
  oldestAge: string;
  topReasons: ReasonCount[];
};

const sortByScore = (items: TriageItem[]): TriageItem[] =>
  [...items].sort((a, b) => b.score - a.score || b.lastSeenAt - a.lastSeenAt);

const upsertItem = (items: TriageItem[], item: TriageItem): TriageItem[] =>
  sortByScore([
    ...items.filter((current) => current.thingId !== item.thingId),
    item,
  ]);

const applyRealtimeMessage = (
  items: TriageItem[],
  message: TriageRealtimeMessage
): TriageItem[] => {
  if (message.type === 'item_updated') {
    return upsertItem(items, message.item);
  }

  if (message.type === 'item_resolved') {
    return items.filter((item) => item.thingId !== message.thingId);
  }

  if (message.type === 'claim_updated') {
    return items.map((item) =>
      item.thingId === message.thingId
        ? {
            ...item,
            claimedBy: message.claimedBy,
            claimedAt: message.claimedAt,
          }
        : item
    );
  }

  if (message.type === 'claim_cleared') {
    return items.map((item) => {
      if (item.thingId !== message.thingId) {
        return item;
      }

      const updated = { ...item };
      delete updated.claimedBy;
      delete updated.claimedAt;
      return updated;
    });
  }

  return items;
};

const isRealtimeMessage = (value: unknown): value is TriageRealtimeMessage => {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return false;
  }

  return [
    'item_updated',
    'item_resolved',
    'claim_updated',
    'claim_cleared',
  ].includes(String(value.type));
};

const errorState = (
  current: BoardState,
  message: string
): Extract<BoardState, { status: 'error' }> => ({
  status: 'error',
  ...(current.viewer ? { viewer: current.viewer } : {}),
  ...(current.settings ? { settings: current.settings } : {}),
  items: current.items,
  error: message,
});

const formatAge = (createdAt: number): string => {
  const minutes = Math.max(0, Math.floor((Date.now() - createdAt) / 60000));

  if (minutes < 1) {
    return '<1m';
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d`;
};

export const App = () => {
  const [theme, setTheme] = useState<Theme>(() =>
    window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
  );
  const [state, setState] = useState<BoardState>({
    status: 'loading',
    items: [],
  });
  const [busyItems, setBusyItems] = useState<BusyItems>({});
  const [busyClaims, setBusyClaims] = useState<BusyClaims>({});
  const [view, setView] = useState<View>('board');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<string | undefined>();
  const [toast, setToast] = useState<Toast | undefined>();
  const toastTimeoutRef = useRef<number | undefined>(undefined);
  const pendingModerationRef = useRef<Record<string, number>>({});

  const showToast = useCallback((message: string, onUndo?: () => void) => {
    if (toastTimeoutRef.current !== undefined) {
      window.clearTimeout(toastTimeoutRef.current);
    }

    setToast({ id: Date.now(), message, onUndo });
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(undefined);
      toastTimeoutRef.current = undefined;
    }, 5000);
  }, []);

  const closeToast = useCallback(() => {
    if (toastTimeoutRef.current !== undefined) {
      window.clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = undefined;
    }

    setToast(undefined);
  }, []);

  useEffect(
    () => () => {
      if (toastTimeoutRef.current !== undefined) {
        window.clearTimeout(toastTimeoutRef.current);
      }

      Object.values(pendingModerationRef.current).forEach((timeoutId) =>
        window.clearTimeout(timeoutId)
      );
    },
    []
  );

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    const viewer = await getViewer();

    if (!viewer.isModerator) {
      setState({ status: 'blocked', viewer, items: [] });
      return;
    }

    const [items, settings] = await Promise.all([getQueue(), getSettings()]);
    setState({ status: 'ready', viewer, items: sortByScore(items), settings });
  }, []);

  const loadWithErrorState = useCallback(async () => {
    try {
      await load();
    } catch (error) {
      setState((current) =>
        errorState(
          current,
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
    }
  }, [load]);

  useEffect(() => {
    void loadWithErrorState();

    const intervalId = window.setInterval(() => {
      void loadWithErrorState();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [loadWithErrorState]);

  useEffect(() => {
    try {
      connectRealtime<TriageRealtimeMessage>({
        channel: TRIAGE_REALTIME_CHANNEL,
        onMessage: (message) => {
          if (!isRealtimeMessage(message)) {
            console.warn('Ignored malformed triage realtime message', message);
            return;
          }

          setState((current) => ({
            ...current,
            items: applyRealtimeMessage(current.items, message),
          }));
        },
        onDisconnect: () => {
          console.warn('Disconnected from triage realtime channel');
        },
      });
    } catch (error) {
      console.warn('Could not connect to triage realtime channel:', error);
    }

    return () => disconnectRealtime(TRIAGE_REALTIME_CHANNEL);
  }, []);

  const handleModerate = useCallback(
    (thingId: string, action: ModerateAction) => {
      const item = state.items.find((current) => current.thingId === thingId);
      const itemKind = item?.kind ?? 'item';
      const verb = action === 'approve' ? 'approved' : 'rejected';

      if (pendingModerationRef.current[thingId] !== undefined) {
        window.clearTimeout(pendingModerationRef.current[thingId]);
      }

      setBusyItems((current) => ({ ...current, [thingId]: action }));
      setState((current) => ({
        ...current,
        items: current.items.filter((item) => item.thingId !== thingId),
      }));

      const timeoutId = window.setTimeout(() => {
        void (async () => {
          try {
            await moderate(thingId, action);
          } catch (error) {
            setState((current) =>
              errorState(
                current,
                error instanceof Error
                  ? error.message
                  : `Could not ${action} ${thingId}`
              )
            );
          } finally {
            delete pendingModerationRef.current[thingId];
            setBusyItems((current) => {
              const next = { ...current };
              delete next[thingId];
              return next;
            });
            void loadWithErrorState();
          }
        })();
      }, 5000);

      pendingModerationRef.current[thingId] = timeoutId;
      showToast(`You ${verb} this ${itemKind}.`, () => {
        window.clearTimeout(timeoutId);
        delete pendingModerationRef.current[thingId];
        setBusyItems((current) => {
          const next = { ...current };
          delete next[thingId];
          return next;
        });
        if (item) {
          setState((current) => ({
            ...current,
            items: upsertItem(current.items, item),
          }));
        }
      });
    },
    [loadWithErrorState, showToast, state.items]
  );

  const handleUnclaim = useCallback(
    async (thingId: string) => {
      setBusyClaims((current) => ({ ...current, [thingId]: 'unclaim' }));

      try {
        const response = await unclaim(thingId);
        setState((current) => ({
          ...current,
          items: upsertItem(current.items, response.item),
        }));
      } catch (error) {
        setState((current) =>
          errorState(
            current,
            error instanceof Error
              ? error.message
              : `Could not unclaim ${thingId}`
          )
        );
        void loadWithErrorState();
      } finally {
        setBusyClaims((current) => {
          const next = { ...current };
          delete next[thingId];
          return next;
        });
      }
    },
    [loadWithErrorState]
  );

  const handleClaim = useCallback(
    async (thingId: string) => {
      setBusyClaims((current) => ({ ...current, [thingId]: 'claim' }));

      try {
        const response = await claim(thingId);
        setState((current) => ({
          ...current,
          items: upsertItem(current.items, response.item),
        }));
        const itemKind = response.item.kind;
        showToast(`You just claimed this ${itemKind}.`, () => {
          void handleUnclaim(thingId);
        });
      } catch (error) {
        setState((current) =>
          errorState(
            current,
            error instanceof Error
              ? error.message
              : `Could not claim ${thingId}`
          )
        );
        void loadWithErrorState();
      } finally {
        setBusyClaims((current) => {
          const next = { ...current };
          delete next[thingId];
          return next;
        });
      }
    },
    [handleUnclaim, loadWithErrorState, showToast]
  );

  const handleSaveSettings = useCallback(
    async (settings: Settings) => {
      setSettingsBusy(true);
      setSettingsStatus(undefined);

      try {
        const response = await saveSettings(settings);
        setState((current) =>
          current.status === 'ready'
            ? {
                ...current,
                settings: response.settings,
              }
            : current
        );
        setSettingsStatus(
          `Saved. Recomputed ${response.recomputedCount} queued items.`
        );
        await loadWithErrorState();
      } catch (error) {
        setSettingsStatus(
          error instanceof Error ? error.message : 'Could not save settings'
        );
      } finally {
        setSettingsBusy(false);
      }
    },
    [loadWithErrorState]
  );

  const handleResetSettings = useCallback(async () => {
    setSettingsBusy(true);
    setSettingsStatus(undefined);

    try {
      const response = await resetSettings();
      setState((current) =>
        current.status === 'ready'
          ? {
              ...current,
              settings: response.settings,
            }
          : current
      );
      setSettingsStatus(
        `Reset. Recomputed ${response.recomputedCount} queued items.`
      );
      await loadWithErrorState();
    } catch (error) {
      setSettingsStatus(
        error instanceof Error ? error.message : 'Could not reset settings'
      );
    } finally {
      setSettingsBusy(false);
    }
  }, [loadWithErrorState]);

  const queueStats = useMemo(() => {
    const communityReports = state.items.reduce(
      (total, item) => total + item.humanReports,
      0
    );
    const automatedReports = state.items.reduce(
      (total, item) => total + item.automodReports,
      0
    );

    return {
      itemCount: state.items.length,
      communityReports,
      automatedReports,
      claimedCount: state.items.filter((item) => item.claimedBy !== undefined)
        .length,
      averageScore:
        state.items.length > 0
          ? state.items.reduce((total, item) => total + item.score, 0) /
            state.items.length
          : 0,
      topScore:
        state.items.length > 0
          ? Math.max(...state.items.map((item) => item.score))
          : 0,
    };
  }, [state.items]);

  const queueAnalytics = useMemo<QueueAnalytics>(() => {
    const reasonCounts: Record<string, number> = {};
    let postCount = 0;
    let commentCount = 0;
    let highPriorityCount = 0;
    let mediumPriorityCount = 0;
    let lowerPriorityCount = 0;
    let oldestCreatedAt = Date.now();

    state.items.forEach((item) => {
      if (item.kind === 'post') {
        postCount += 1;
      } else {
        commentCount += 1;
      }

      if (item.score >= 90) {
        highPriorityCount += 1;
      } else if (item.score >= 70) {
        mediumPriorityCount += 1;
      } else {
        lowerPriorityCount += 1;
      }

      oldestCreatedAt = Math.min(oldestCreatedAt, item.createdAt);
      item.reportReasons.forEach((reason) => {
        reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
      });
    });

    return {
      postCount,
      commentCount,
      highPriorityCount,
      mediumPriorityCount,
      lowerPriorityCount,
      claimedPercent:
        state.items.length > 0
          ? Math.round((queueStats.claimedCount / state.items.length) * 100)
          : 0,
      oldestAge: state.items.length > 0 ? formatAge(oldestCreatedAt) : '0m',
      topReasons: Object.entries(reasonCounts)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
        .slice(0, 5),
    };
  }, [queueStats.claimedCount, state.items]);

  return (
    <div
      className={`${theme === 'dark' ? 'dark' : ''} min-h-screen bg-[var(--reddit-bg)] text-[var(--reddit-text-main)] transition-colors`}
    >
      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-[var(--reddit-border)] bg-[var(--reddit-surface)] px-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="text-xl font-bold tracking-tight text-[var(--reddit-text-main)]">
            Triage
          </span>
          <span className="hidden text-xs font-bold uppercase tracking-[0.14em] text-[var(--reddit-text-secondary)] md:block">
            Mod board
          </span>
        </div>

        <div className="mx-4 hidden max-w-2xl flex-1 md:block">
          <div className="flex h-10 items-center gap-3 rounded-full bg-[var(--reddit-bg)] px-4 text-[var(--reddit-text-secondary)]">
            <span className="text-xl leading-none">⌕</span>
            <span className="truncate text-sm">
              Search r/{state.viewer?.subredditName ?? 'triage_tool_dev'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--reddit-bg)] text-lg font-bold text-[var(--reddit-text-main)] transition hover:bg-[var(--reddit-border)]"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <div className="h-8 w-8 rounded-full bg-[var(--reddit-border-strong)]" />
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px] pt-14">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-80 shrink-0 flex-col border-r border-[var(--reddit-border)] bg-[var(--reddit-surface)] p-5 lg:flex">
          <div>
            <SidebarHeading>Workspace</SidebarHeading>
            <nav className="mt-2 space-y-1">
              <SidebarItem
                active={view === 'board'}
                icon="▤"
                label="Queue"
                onClick={() => setView('board')}
              />
              <SidebarItem
                active={view === 'settings'}
                icon="⚙"
                label="Settings"
                onClick={() => setView('settings')}
              />
              <SidebarItem
                active={view === 'analytics'}
                icon="◌"
                label="Analytics"
                onClick={() => setView('analytics')}
              />
            </nav>
          </div>

          <div className="mt-auto border-t border-[var(--reddit-border)] pt-5">
            <SidebarHeading>Account</SidebarHeading>
            <div className="mt-3 flex items-center gap-3 rounded-lg p-2 text-sm text-[var(--reddit-text-main)]">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--reddit-border-strong)] text-xs font-bold">
                {state.viewer?.username?.slice(0, 2).toUpperCase() ?? 'U/'}
              </span>
              <div className="min-w-0">
                <div className="truncate font-bold">
                  u/{state.viewer?.username ?? 'moderator'}
                </div>
                <div className="truncate text-xs text-[var(--reddit-text-secondary)]">
                  r/{state.viewer?.subredditName ?? 'triage_tool_dev'}
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-8 md:px-8 lg:px-10">
          <div className="mx-auto max-w-[1120px]">
            <div className="mb-8">
              <h1 className="mb-5 text-3xl font-bold tracking-tight text-[var(--reddit-text-main)]">
                {view === 'board'
                  ? 'Triage Board'
                  : view === 'settings'
                    ? 'Settings'
                    : 'Analytics'}
              </h1>
              <div className="flex flex-col gap-3 border-b border-[var(--reddit-border)] sm:flex-row sm:items-end sm:justify-between">
                {state.status === 'ready' ? (
                  <div className="flex gap-7 lg:hidden">
                    <button
                      type="button"
                      className={`border-b-2 pb-4 text-sm font-bold transition ${
                        view === 'board'
                          ? 'border-[var(--reddit-blue)] text-[var(--reddit-blue)]'
                          : 'border-transparent text-[var(--reddit-text-secondary)] hover:text-[var(--reddit-text-main)]'
                      }`}
                      onClick={() => setView('board')}
                    >
                      Queued Items
                    </button>
                    <button
                      type="button"
                      className={`border-b-2 pb-4 text-sm font-medium transition ${
                        view === 'settings'
                          ? 'border-[var(--reddit-blue)] text-[var(--reddit-blue)]'
                          : 'border-transparent text-[var(--reddit-text-secondary)] hover:text-[var(--reddit-text-main)]'
                      }`}
                      onClick={() => setView('settings')}
                    >
                      Settings
                    </button>
                    <button
                      type="button"
                      className={`border-b-2 pb-4 text-sm font-medium transition ${
                        view === 'analytics'
                          ? 'border-[var(--reddit-blue)] text-[var(--reddit-blue)]'
                          : 'border-transparent text-[var(--reddit-text-secondary)] hover:text-[var(--reddit-text-main)]'
                      }`}
                      onClick={() => setView('analytics')}
                    >
                      Analytics
                    </button>
                  </div>
                ) : (
                  <div className="pb-4 text-sm font-bold text-[var(--reddit-blue)]">
                    Queued Items
                  </div>
                )}

                <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2 pb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--reddit-text-secondary)]">
                  <span>Stats</span>
                  <Stat label="Items" value={queueStats.itemCount} />
                  <Stat label="User Reports" value={queueStats.communityReports} />
                  <Stat label="Auto" value={queueStats.automatedReports} />
                </div>
              </div>
            </div>

            {state.status === 'loading' ? <LoadingState /> : null}
            {state.status === 'blocked' ? <BlockedState /> : null}
            {state.status === 'error' ? (
              <ErrorState message={state.error} onRetry={loadWithErrorState} />
            ) : null}
            {state.status === 'ready' && view === 'settings' ? (
              <SettingsPanel
                key={JSON.stringify(state.settings)}
                initialSettings={state.settings}
                saving={settingsBusy}
                status={settingsStatus}
                onSave={handleSaveSettings}
                onReset={handleResetSettings}
              />
            ) : null}
            {state.status === 'ready' && view === 'analytics' ? (
              <AnalyticsPanel
                averageScore={queueStats.averageScore}
                analytics={queueAnalytics}
                automatedReports={queueStats.automatedReports}
                claimedCount={queueStats.claimedCount}
                communityReports={queueStats.communityReports}
                itemCount={queueStats.itemCount}
                topScore={queueStats.topScore}
              />
            ) : null}
            {state.status === 'ready' &&
            view === 'board' &&
            state.items.length === 0 ? (
              <EmptyState />
            ) : null}
            {state.status === 'ready' &&
            view === 'board' &&
            state.items.length > 0 ? (
              <section className="space-y-5">
                {state.items.map((item, index) => (
                  <TriageCard
                    key={item.thingId}
                    item={item}
                    rank={index + 1}
                    viewerUsername={state.viewer.username}
                    {...(busyItems[item.thingId]
                      ? { busyAction: busyItems[item.thingId] }
                      : {})}
                    {...(busyClaims[item.thingId]
                      ? { busyClaim: busyClaims[item.thingId] }
                      : {})}
                    onModerate={handleModerate}
                    onClaim={handleClaim}
                    onUnclaim={handleUnclaim}
                  />
                ))}
              </section>
            ) : null}
          </div>
        </main>
      </div>

      <button
        type="button"
        className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--reddit-blue)] text-2xl font-bold text-white shadow-lg transition hover:bg-[var(--reddit-blue-hover)] active:scale-95"
        aria-label="Quick triage"
      >
        ↯
      </button>
      {toast ? (
        <UndoToast
          key={toast.id}
          message={toast.message}
          onClose={closeToast}
          onUndo={
            toast.onUndo
              ? () => {
                  toast.onUndo?.();
                  closeToast();
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
};

type StatProps = {
  label: string;
  value: number;
};

const Stat = ({ label, value }: StatProps) => (
  <span>
    {label}: <span className="text-[var(--reddit-text-main)]">{value}</span>
  </span>
);

type SidebarItemProps = {
  icon: string;
  label: string;
  active?: boolean;
  onClick: () => void;
};

const SidebarItem = ({
  icon,
  label,
  active = false,
  onClick,
}: SidebarItemProps) => (
  <button
    type="button"
    className={`flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm transition ${
      active
        ? 'bg-[var(--reddit-bg)] font-semibold text-[var(--reddit-text-main)]'
        : 'text-[var(--reddit-text-main)] hover:bg-[var(--reddit-bg)]'
    }`}
    onClick={onClick}
  >
    <span className="w-5 text-center text-lg leading-none">{icon}</span>
    <span>{label}</span>
  </button>
);

const SidebarHeading = ({ children }: { children: string }) => (
  <h2 className="px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--reddit-text-secondary)]">
    {children}
  </h2>
);

type AnalyticsPanelProps = {
  itemCount: number;
  communityReports: number;
  automatedReports: number;
  claimedCount: number;
  averageScore: number;
  topScore: number;
  analytics: QueueAnalytics;
};

const AnalyticsPanel = ({
  itemCount,
  communityReports,
  automatedReports,
  claimedCount,
  averageScore,
  topScore,
  analytics,
}: AnalyticsPanelProps) => (
  <section className="grid gap-4">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <AnalyticsCard label="Queued items" value={itemCount.toString()} />
      <AnalyticsCard label="Claimed now" value={claimedCount.toString()} />
      <AnalyticsCard label="Top score" value={topScore.toFixed(1)} />
      <AnalyticsCard label="Oldest item" value={analytics.oldestAge} />
    </div>

    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <AnalyticsPanelCard title="Priority mix">
        <MeterRow
          label="High"
          tone="danger"
          total={itemCount}
          value={analytics.highPriorityCount}
        />
        <MeterRow
          label="Medium"
          tone="warning"
          total={itemCount}
          value={analytics.mediumPriorityCount}
        />
        <MeterRow
          label="Lower"
          tone="neutral"
          total={itemCount}
          value={analytics.lowerPriorityCount}
        />
      </AnalyticsPanelCard>

      <AnalyticsPanelCard title="Queue composition">
        <MeterRow label="Posts" tone="blue" total={itemCount} value={analytics.postCount} />
        <MeterRow
          label="Comments"
          tone="neutral"
          total={itemCount}
          value={analytics.commentCount}
        />
        <MeterRow
          label="Claimed"
          tone="green"
          total={100}
          value={analytics.claimedPercent}
          valueSuffix="%"
        />
      </AnalyticsPanelCard>
    </div>

    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <AnalyticsPanelCard title="Report sources">
        <MeterRow
          label="User reports"
          tone="danger"
          total={Math.max(communityReports + automatedReports, 1)}
          value={communityReports}
        />
        <MeterRow
          label="Auto reports"
          tone="blue"
          total={Math.max(communityReports + automatedReports, 1)}
          value={automatedReports}
        />
        <div className="pt-2 text-xs font-semibold text-[var(--reddit-text-secondary)]">
          Average score: {averageScore.toFixed(1)}
        </div>
      </AnalyticsPanelCard>

      <AnalyticsPanelCard title="Top report reasons">
        {analytics.topReasons.length > 0 ? (
          <div className="space-y-2">
            {analytics.topReasons.map((reason) => (
              <div
                key={reason.reason}
                className="flex items-center justify-between gap-3 rounded-lg bg-[var(--reddit-subtle)] px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm font-semibold text-[var(--reddit-text-main)]">
                  {reason.reason}
                </span>
                <span className="rounded-full bg-[var(--reddit-bg)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--reddit-text-secondary)]">
                  x{reason.count}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--reddit-text-secondary)]">
            No report reasons in the current queue.
          </p>
        )}
      </AnalyticsPanelCard>
    </div>
  </section>
);

const AnalyticsCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-[var(--reddit-border)] bg-[var(--reddit-surface)] p-5 shadow-sm">
    <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--reddit-text-secondary)]">
      {label}
    </div>
    <div className="mt-3 font-mono text-3xl font-bold text-[var(--reddit-text-main)]">
      {value}
    </div>
  </div>
);

const AnalyticsPanelCard = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <div className="rounded-xl border border-[var(--reddit-border)] bg-[var(--reddit-surface)] p-5 shadow-sm">
    <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.14em] text-[var(--reddit-text-secondary)]">
      {title}
    </h2>
    {children}
  </div>
);

type MeterRowProps = {
  label: string;
  value: number;
  total: number;
  tone: 'blue' | 'danger' | 'green' | 'neutral' | 'warning';
  valueSuffix?: string | undefined;
};

const meterToneClass = (tone: MeterRowProps['tone']): string => {
  if (tone === 'blue') {
    return 'bg-[var(--reddit-blue)]';
  }

  if (tone === 'danger') {
    return 'bg-[var(--reddit-red)]';
  }

  if (tone === 'green') {
    return 'bg-[var(--reddit-green)]';
  }

  if (tone === 'warning') {
    return 'bg-[var(--reddit-orange)]';
  }

  return 'bg-[var(--reddit-border-strong)]';
};

const MeterRow = ({
  label,
  value,
  total,
  tone,
  valueSuffix = '',
}: MeterRowProps) => {
  const width = total > 0 ? Math.max(4, Math.min(100, (value / total) * 100)) : 0;

  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-[var(--reddit-text-main)]">
          {label}
        </span>
        <span className="font-mono text-xs font-bold text-[var(--reddit-text-secondary)]">
          {value}
          {valueSuffix}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--reddit-bg)]">
        <div
          className={`h-full rounded-full ${meterToneClass(tone)}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
};

type UndoToastProps = {
  message: string;
  onClose: () => void;
  onUndo?: (() => void) | undefined;
};

const UndoToast = ({ message, onClose, onUndo }: UndoToastProps) => (
  <div className="fixed inset-x-4 bottom-5 z-50 mx-auto max-w-md overflow-hidden rounded-xl border border-[var(--reddit-border)] bg-[var(--reddit-surface)] text-sm font-semibold text-[var(--reddit-text-main)] shadow-2xl">
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span>{message}</span>
      <div className="flex shrink-0 items-center gap-2">
        {onUndo ? (
          <button
            type="button"
            className="rounded-full bg-[var(--reddit-blue)] px-4 py-2 text-xs font-bold text-white transition hover:bg-[var(--reddit-blue-hover)]"
            onClick={onUndo}
          >
            Undo
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-full px-2 py-1 text-xs font-bold text-[var(--reddit-text-secondary)] transition hover:bg-[var(--reddit-bg)]"
          onClick={onClose}
          aria-label="Dismiss message"
        >
          ✕
        </button>
      </div>
    </div>
    <div className="h-1 bg-[var(--reddit-bg)]">
      <div className="triage-toast-timer h-full bg-[var(--reddit-blue)]" />
    </div>
  </div>
);

const LoadingState = () => (
  <section className="space-y-5">
    {[0, 1, 2].map((index) => (
      <div
        key={index}
        className="overflow-hidden rounded-xl border border-[var(--reddit-border)] bg-[var(--reddit-surface)] shadow-sm"
      >
        <div className="flex animate-pulse">
          <div className="w-12 bg-[var(--reddit-subtle)]" />
          <div className="flex-1 space-y-4 p-5">
            <div className="h-4 w-1/3 rounded bg-[var(--reddit-border)]" />
            <div className="h-6 w-2/3 rounded bg-[var(--reddit-border)]" />
            <div className="h-24 rounded-lg bg-[var(--reddit-subtle)]" />
          </div>
          <div className="hidden w-40 border-l border-[var(--reddit-border)] bg-[var(--reddit-subtle)] p-5 sm:block">
            <div className="space-y-3">
              <div className="h-10 rounded-full bg-[var(--reddit-border)]" />
              <div className="h-10 rounded-full bg-[var(--reddit-border)]" />
              <div className="h-10 rounded-full bg-[var(--reddit-border)]" />
            </div>
          </div>
        </div>
      </div>
    ))}
  </section>
);

const EmptyState = () => (
  <section className="rounded-xl border border-[var(--reddit-border)] bg-[var(--reddit-surface)] px-4 py-10 text-center shadow-sm">
    <h2 className="text-xl font-bold text-[var(--reddit-text-main)]">
      Queue is clear
    </h2>
    <p className="mx-auto mt-2 max-w-md text-sm text-[var(--reddit-text-secondary)]">
      No reported items are waiting in Triage. The board will keep checking for
      new reports.
    </p>
  </section>
);

const BlockedState = () => (
  <section className="rounded-xl border border-[var(--reddit-border)] bg-[var(--reddit-surface)] px-4 py-10 text-center shadow-sm">
    <h2 className="text-xl font-bold text-[var(--reddit-text-main)]">
      Triage is a moderator tool
    </h2>
    <p className="mx-auto mt-2 max-w-md text-sm text-[var(--reddit-text-secondary)]">
      Only moderators of this subreddit can view the ranked queue or take
      moderation actions.
    </p>
  </section>
);

type ErrorStateProps = {
  message: string;
  onRetry: () => void;
};

const ErrorState = ({ message, onRetry }: ErrorStateProps) => (
  <section className="rounded-xl border border-red-200 bg-[var(--reddit-surface)] px-4 py-5 shadow-sm dark:border-red-900/70">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-bold text-red-950 dark:text-red-100">
          Could not load Triage
        </h2>
        <p className="mt-1 text-sm text-red-800 dark:text-red-200">{message}</p>
      </div>
      <button
        type="button"
        className="rounded-full border border-red-400 px-5 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/40"
        onClick={onRetry}
      >
        Retry
      </button>
    </div>
  </section>
);
