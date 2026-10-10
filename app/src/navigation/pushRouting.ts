import { createNavigationContainerRef, type NavigatorScreenParams } from '@react-navigation/native';
import type { GroupStackParamList, RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Where a tapped notification lands.
 *
 * The payload the dispatcher sends is deliberately thin — type, groupId and
 * sometimes debtId — because the notification is rendered server-side and the
 * device has to be able to act on it after a cold start, before any group data
 * is in the store.
 */
export interface PushPayload {
  type?: string;
  groupId?: string;
  debtId?: string;
  callId?: string;
}

/**
 * The events that name a specific Manchester and are somebody's turn. These get
 * taken straight to the debt; everything else goes to the feed, which threads
 * by refId and puts the freshest thread on top, so the tapped event is the
 * first thing on screen anyway.
 */
const DEBT_SCREEN_TYPES = new Set([
  'manchester_created',
  'confirmation_awaiting_you',
  'manchester_resolved',
]);

const GAME_SCREEN_TYPES = new Set(['game_called', 'game_settled']);

/**
 * Navigates to whatever the notification was about.
 *
 * Nesting is Root → Drawer → GroupStack → Tabs, so every target is three
 * `screen` levels deep. The ParamList types carry NavigatorScreenParams for
 * exactly this, so the whole path is checked rather than cast through.
 */
export function routeToNotification(payload: PushPayload, groupName: string): void {
  if (!navigationRef.isReady() || !payload.groupId) return;

  // Game pushes only ever go to people involved in the call, so the call
  // screen — which is read-in only — is safe to open directly.
  const target: NavigatorScreenParams<GroupStackParamList> =
    payload.callId && GAME_SCREEN_TYPES.has(payload.type ?? '')
      ? { screen: 'GameCall', params: { callId: payload.callId, groupId: payload.groupId, groupName } }
      : payload.debtId && DEBT_SCREEN_TYPES.has(payload.type ?? '')
      ? {
          screen: 'ResolutionConfirmation',
          params: {
            debtId: payload.debtId,
            groupId: payload.groupId,
            groupName,
          },
        }
      : { screen: 'GroupTabs', params: { screen: 'Feed' } };

  navigationRef.navigate('App', { screen: 'GroupHome', params: target });
}
