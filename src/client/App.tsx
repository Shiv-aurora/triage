import { connectRealtime, disconnectRealtime } from '@devvit/web/client';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  const [view, setView] = useState<'board' | 'settings'>('board');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<string | undefined>();

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
    async (thingId: string, action: ModerateAction) => {
      setBusyItems((current) => ({ ...current, [thingId]: action }));
      setState((current) => ({
        ...current,
        items: current.items.filter((item) => item.thingId !== thingId),
      }));

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
        setBusyItems((current) => {
          const next = { ...current };
          delete next[thingId];
          return next;
        });
        void loadWithErrorState();
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
    [loadWithErrorState]
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
    };
  }, [state.items]);

  return (
    <main
      className={`${theme === 'dark' ? 'dark' : ''} min-h-screen bg-slate-100 text-slate-950 transition-colors dark:bg-slate-950 dark:text-slate-100`}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 p-3 sm:p-4">
        <header className="rounded-lg border border-slate-200 bg-white/95 px-4 py-3 shadow-sm shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-none">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                r/{state.viewer?.subredditName ?? 'triage'}
              </p>
              <h1 className="text-2xl font-semibold tracking-normal text-slate-950 dark:text-white">
                Triage board
              </h1>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Items" value={queueStats.itemCount} />
                <Stat label="Community" value={queueStats.communityReports} />
                <Stat label="Automated" value={queueStats.automatedReports} />
              </div>
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={toggleTheme}
              >
                {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
            </div>
          </div>
          {state.status === 'ready' ? (
            <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                  view === 'board'
                    ? 'border-slate-950 bg-slate-950 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
                onClick={() => setView('board')}
              >
                Board
              </button>
              <button
                type="button"
                className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                  view === 'settings'
                    ? 'border-slate-950 bg-slate-950 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
                onClick={() => setView('settings')}
              >
                Settings
              </button>
            </div>
          ) : null}
        </header>

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
        {state.status === 'ready' &&
        view === 'board' &&
        state.items.length === 0 ? (
          <EmptyState />
        ) : null}
        {state.status === 'ready' &&
        view === 'board' &&
        state.items.length > 0 ? (
          <section className="grid gap-2">
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
  );
};

type StatProps = {
  label: string;
  value: number;
};

const Stat = ({ label, value }: StatProps) => (
  <div className="min-w-[5rem] rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
    <div className="font-mono text-lg font-semibold leading-none text-slate-950 dark:text-white">
      {value}
    </div>
    <div className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
      {label}
    </div>
  </div>
);

const LoadingState = () => (
  <section className="grid gap-2">
    {[0, 1, 2].map((index) => (
      <div
        key={index}
        className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex animate-pulse gap-3">
          <div className="h-9 w-9 rounded-md bg-slate-200 dark:bg-slate-800" />
          <div className="flex-1 space-y-3">
            <div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="grid grid-cols-2 gap-2">
              <div className="h-12 rounded bg-slate-100 dark:bg-slate-800/60" />
              <div className="h-12 rounded bg-slate-100 dark:bg-slate-800/60" />
            </div>
          </div>
        </div>
      </div>
    ))}
  </section>
);

const EmptyState = () => (
  <section className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-8 text-center shadow-sm dark:border-emerald-900/70 dark:bg-emerald-950/40">
    <h2 className="text-xl font-semibold text-emerald-950 dark:text-emerald-100">Queue is clear</h2>
    <p className="mx-auto mt-2 max-w-md text-sm text-emerald-900 dark:text-emerald-200">
      No reported items are waiting in Triage. The board will keep checking for
      new reports.
    </p>
  </section>
);

const BlockedState = () => (
  <section className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
      Triage is a moderator tool
    </h2>
    <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
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
  <section className="rounded-lg border border-red-200 bg-white px-4 py-5 shadow-sm dark:border-red-900/70 dark:bg-slate-900">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-red-950 dark:text-red-100">
          Could not load Triage
        </h2>
        <p className="mt-1 text-sm text-red-800 dark:text-red-200">{message}</p>
      </div>
      <button
        type="button"
        className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-900 transition hover:bg-red-100 dark:border-red-800 dark:bg-red-950/60 dark:text-red-100 dark:hover:bg-red-950"
        onClick={onRetry}
      >
        Retry
      </button>
    </div>
  </section>
);
