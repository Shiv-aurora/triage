import { realtime } from '@devvit/web/server';
import {
  TRIAGE_REALTIME_CHANNEL,
  type TriageRealtimeMessage,
} from '../shared/types';

export const publishTriageEvent = async (
  message: TriageRealtimeMessage
): Promise<void> => {
  try {
    await realtime.send(TRIAGE_REALTIME_CHANNEL, message);
  } catch (error) {
    console.warn('Failed to publish triage realtime event:', error);
  }
};
