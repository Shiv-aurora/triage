import type {
  ClaimConflictResponse,
  ClaimResponse,
  ModerateAction,
  ModerateResponse,
  QueueResponse,
  SaveSettingsResponse,
  SettingsResponse,
  ViewerResponse,
} from '../shared/api';
import type { Settings, TriageItem } from '../shared/types';

const parseError = async (response: Response): Promise<Error> => {
  try {
    const body = (await response.json()) as { message?: string };
    return new Error(body.message ?? `HTTP ${response.status}`);
  } catch {
    return new Error(`HTTP ${response.status}`);
  }
};

export const getViewer = async (): Promise<ViewerResponse> => {
  const response = await fetch('/api/viewer');

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as ViewerResponse;
};

export const getQueue = async (): Promise<TriageItem[]> => {
  const response = await fetch('/api/queue');

  if (!response.ok) {
    throw await parseError(response);
  }

  const data = (await response.json()) as QueueResponse;
  return data.items;
};

export const moderate = async (
  thingId: string,
  action: ModerateAction
): Promise<ModerateResponse> => {
  const response = await fetch('/api/moderate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ thingId, action }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as ModerateResponse;
};

export const claim = async (thingId: string): Promise<ClaimResponse> => {
  const response = await fetch('/api/claim', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ thingId }),
  });

  if (!response.ok) {
    if (response.status === 409) {
      const conflict = (await response.json()) as ClaimConflictResponse;
      throw new Error(conflict.message);
    }

    throw await parseError(response);
  }

  return (await response.json()) as ClaimResponse;
};

export const unclaim = async (thingId: string): Promise<ClaimResponse> => {
  const response = await fetch('/api/unclaim', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ thingId }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as ClaimResponse;
};

export const getSettings = async (): Promise<Settings> => {
  const response = await fetch('/api/settings');

  if (!response.ok) {
    throw await parseError(response);
  }

  const data = (await response.json()) as SettingsResponse;
  return data.settings;
};

export const saveSettings = async (
  settings: Settings
): Promise<SaveSettingsResponse> => {
  const response = await fetch('/api/settings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ settings }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as SaveSettingsResponse;
};

export const resetSettings = async (): Promise<SaveSettingsResponse> => {
  const response = await fetch('/api/settings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reset: true }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as SaveSettingsResponse;
};
