/**
 * Push notification setup using Expo Notifications
 * Call `registerForPushNotifications()` on app launch.
 */
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { registerDevice } from './api';

// Configure how notifications appear while the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device.');
    return null;
  }

  // Request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification permission denied.');
    return null;
  }

  // Android channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('flight-alerts', {
      name: 'Flight Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00AEEF',
    });
  }

  // Get Expo push token
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
  });
  const pushToken = tokenData.data;

  // Cache and register with backend
  await SecureStore.setItemAsync('push_token', pushToken);
  const deviceId = Device.modelId ?? 'unknown-device';

  try {
    await registerDevice({
      push_token: pushToken,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      device_id: deviceId,
    });
  } catch (err) {
    console.error('Failed to register push token with backend:', err);
  }

  return pushToken;
}

// Helper to add foreground notification listener
export function addNotificationListener(
  onNotification: (notification: Notifications.Notification) => void
): () => void {
  const subscription = Notifications.addNotificationReceivedListener(onNotification);
  return () => subscription.remove();
}

// Helper to handle notification taps (app opened from notification)
export function addNotificationResponseListener(
  onResponse: (response: Notifications.NotificationResponse) => void
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(onResponse);
  return () => subscription.remove();
}
