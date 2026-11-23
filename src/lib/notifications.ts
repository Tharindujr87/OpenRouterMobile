import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getMeta, setMeta } from '../db/repository';

const DAILY_REVIEW_KEY = 'dailyReviewNotificationId';

export const REMINDER_CATEGORY = 'ormobile-reminder';
export const ACTION_SNOOZE = 'snooze';
export const ACTION_DONE = 'done';

export interface PermissionResult {
  granted: boolean;
  status: string;
  available: boolean;
}

export async function setupNotifications(): Promise<PermissionResult> {
  if (Platform.OS === 'web') {
    return { granted: false, status: 'unavailable on web', available: false };
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY, [
    {
      identifier: ACTION_SNOOZE,
      buttonTitle: 'Snooze 10 min',
      options: { opensAppToForeground: false },
    },
    {
      identifier: ACTION_DONE,
      buttonTitle: 'Got it',
      options: { opensAppToForeground: false },
    },
  ]);

  return checkNotificationPermission();
}

export async function checkNotificationPermission(): Promise<PermissionResult> {
  if (Platform.OS === 'web') {
    return { granted: false, status: 'unavailable on web', available: false };
  }
  const result = await Notifications.getPermissionsAsync();
  return {
    granted: result.granted,
    status: result.status,
    available: true,
  };
}

export async function requestNotificationPermission(): Promise<PermissionResult> {
  if (Platform.OS === 'web') {
    return { granted: false, status: 'unavailable on web', available: false };
  }
  const result = await Notifications.requestPermissionsAsync();
  return {
    granted: result.granted,
    status: result.status,
    available: true,
  };
}

export async function scheduleReminder(input: {
  title: string;
  body?: string;
  timestamp: number;
  taskId: string;
}): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const permission = await checkNotificationPermission();
  if (!permission.granted) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: input.title,
      body: input.body ?? 'Tap to open ORM.',
      sound: true,
      categoryIdentifier: REMINDER_CATEGORY,
      data: { taskId: input.taskId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(input.timestamp),
    },
  });
}

export async function cancelReminder(notificationId: string | null): Promise<void> {
  if (!notificationId || Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // Already fired or removed by the system - nothing to cancel.
  }
}

export async function sendTestReminder(): Promise<boolean> {
  const permission = await requestNotificationPermission();
  if (!permission.granted) return false;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'ORM test reminder',
      body: 'If you can read this, reminders are working.',
      sound: true,
      categoryIdentifier: REMINDER_CATEGORY,
      data: { test: true },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 8,
    },
  });
  return true;
}

export async function setDailyReview(enabled: boolean, hour: number, minute: number): Promise<void> {
  if (Platform.OS === 'web') return;
  const previous = getMeta(DAILY_REVIEW_KEY, '');
  if (previous) {
    try {
      await Notifications.cancelScheduledNotificationAsync(previous);
    } catch {
      // Already gone.
    }
  }
  if (!enabled) {
    setMeta(DAILY_REVIEW_KEY, '');
    return;
  }
  const permission = await requestNotificationPermission();
  if (!permission.granted) {
    setMeta(DAILY_REVIEW_KEY, '');
    return;
  }
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Daily review',
      body: 'Open ORM to see what is open and what is next.',
      sound: true,
      data: { dailyReview: true },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
  setMeta(DAILY_REVIEW_KEY, id);
}

export function onNotificationAction(
  listener: (action: string, taskId: string | null) => void,
): () => void {
  if (Platform.OS === 'web') return () => {};
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const action = response.actionIdentifier;
    const taskId = (response.notification.request.content.data?.taskId as string) ?? null;
    listener(action, taskId);
  });
  return () => subscription.remove();
}
