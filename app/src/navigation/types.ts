import type { NavigatorScreenParams } from '@react-navigation/native';

// Auth stack
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ConfirmEmail: { email: string };
};

// Drawer — active group stored in Zustand, not nav params.
//
// The nested NavigatorScreenParams here and below exist for one caller: a
// tapped push notification, which has to jump straight to a screen three
// navigators down from the root. Ordinary in-app navigation addresses its own
// level and ignores them.
export type DrawerParamList = {
  GroupHome: NavigatorScreenParams<GroupStackParamList> | undefined;
};

// Bottom tabs — each tab reads activeGroup from Zustand
export type GroupTabParamList = {
  Feed: undefined;
  MySlate: undefined;
  Grog: undefined;
  Group: undefined;
};

// Stack screens pushed on top of the tab navigator
export type GroupStackParamList = {
  GroupTabs: NavigatorScreenParams<GroupTabParamList> | undefined;
  CreateChallenge: { groupId: string; groupName: string };
  PendingDebts: { groupId: string; groupName: string };
  ResolutionConfirmation: { debtId: string; groupId: string; groupName: string };
  Ledger: { groupId: string; groupName: string };
  CallGame: { groupId: string; groupName: string };
  GameCall: { groupId: string; groupName: string; callId: string };
  GameRules: { groupId: string; groupName: string; justReadIn?: boolean };
  ReadIn: { groupId: string; groupName: string };
  ReadInPlayers: { groupId: string; groupName: string };
  ReadInGameName: { groupId: string; groupName: string };
  /** Without a debtId it is a free shot: no Manchester, an optional reason. */
  InfinityGrogSentence: { debtId?: string; groupId: string; groupName: string };
  CreateGroup: undefined;
  JoinGroup: undefined;
};

// Root — switches between auth, welcome (no groups), and app (drawer+tabs)
export type RootStackParamList = {
  Auth: undefined;
  Welcome: undefined;
  App: NavigatorScreenParams<DrawerParamList> | undefined;
  CreateGroup: undefined;
  JoinGroup: undefined;
};
