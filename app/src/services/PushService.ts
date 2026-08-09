import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { authFetch } from './authFetch';

/**
 * Push notifications, via Expo's push service.
 *
 * The device gets a token from Expo, hands it to our API, and the notification
 * dispatcher sends to it. Nothing here talks to FCM or APNs directly — EAS
 * already holds those credentials for the project, which is the whole reason
 * for going through Expo rather than SNS mobile push.
 *
 * Every call is best-effort. Push is a convenience on top of the feed, so a
 * denied permission, a simulator, or an offline registration must all leave the
 * app perfectly usable.
 */

/** Android needs a channel before anything will display as a heads-up alert. */
const CHANNEL_ID = 'default';

/**
 * How a notification behaves while the app is already open.
 *
 * Banners stay on, deliberately. The events that push are the ones that need
 * someone to act — it is your turn, you owe a punishment — and those matter
 * just as much when the person is sitting on the Grog tab as when their phone
 * is in a pocket.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * The Expo push token for this device, or null if we cannot have one.
 *
 * Null is an ordinary outcome, not a failure: simulators have no push
 * capability at all, and declining the permission prompt is a choice we have to
 * honour. Callers should carry on regardless.
 */
async function getToken(): Promise<string | null> {
  // A simulator will happily ask for permission and then never receive
  // anything, so there is no point registering a token for one.
  if (!Device.isDevice) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'SlapWise',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  // Only prompt if we have not already been answered. Asking again after a
  // denial is a no-op on both platforms anyway — the OS remembers.
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') return null;

  // The project id has to be passed explicitly in a bare build; app.json's
  // extra.eas.projectId is the same one EAS uses to route the push.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('[PushService] no EAS project id; skipping push registration');
    return null;
  }

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

/**
 * Registers this device for push. Safe to call on every launch — the API keys
 * on the token, so re-registering the same device is an idempotent write that
 * also pushes the record's TTL out.
 */
export async function registerForPush(): Promise<string | null> {
  try {
    const token = await getToken();
    if (!token) return null;

    const res = await authFetch('/players/me/push-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });

    if (!res.ok) {
      console.error('[PushService] register failed:', res.status, await res.text());
      return null;
    }

    return token;
  } catch (err: unknown) {
    console.error('[PushService] register:', err);
    return null;
  }
}

/**
 * Drops this device's token, so a signed-out phone stops hearing about the
 * group. Called before the Cognito sign-out, while the request can still
 * authenticate.
 */
export async function unregisterFromPush(): Promise<void> {
  try {
    if (!Device.isDevice) return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;

    // Ask for the token rather than caching one: this has to work on a launch
    // where the user signs straight out without the app having registered.
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await authFetch('/players/me/push-token', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    });
  } catch (err: unknown) {
    // Logging out must never fail because of this. A token left behind gets
    // reaped by its TTL, and the dispatcher drops it the moment Expo reports
    // the device as unregistered.
    console.error('[PushService] unregister:', err);
  }
}
