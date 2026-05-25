import type { Settings, TriageItem } from './types';

export type ModerateAction = 'approve' | 'remove';

export type QueueResponse = {
  items: TriageItem[];
};

export type ClaimRequest = {
  thingId: string;
};

export type ClaimResponse = {
  status: 'ok';
  item: TriageItem;
};

export type ClaimConflictResponse = {
  status: 'conflict';
  message: string;
  claimedBy: string;
};

export type ModerateRequest = {
  thingId: string;
  action: ModerateAction;
};

export type ModerateResponse = {
  status: 'ok';
  thingId: string;
  action: ModerateAction;
};

export type ViewerResponse = {
  username?: string;
  subredditName: string;
  isModerator: boolean;
};

export type SettingsResponse = {
  settings: Settings;
};

export type SaveSettingsRequest = {
  settings: Settings;
};

export type ResetSettingsRequest = {
  reset: true;
};

export type SaveSettingsResponse = {
  status: 'ok';
  settings: Settings;
  recomputedCount: number;
};
