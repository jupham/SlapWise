// Auth stack
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ConfirmEmail: { email: string };
};

// Drawer — active group stored in Zustand, not nav params
export type DrawerParamList = {
  GroupHome: undefined;
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
  GroupTabs: undefined;
  CreateChallenge: { groupId: string; groupName: string };
  PendingDebts: { groupId: string; groupName: string };
  ResolutionConfirmation: { debtId: string; groupId: string; groupName: string };
  Ledger: { groupId: string; groupName: string };
  RecordGameCall: { groupId: string; groupName: string };
  ReadIn: { groupId: string; groupName: string };
  ReadInPlayers: { groupId: string; groupName: string };
  ReadInGameName: { groupId: string; groupName: string };
  InfinityGrogSentence: { debtId: string; groupId: string; groupName: string };
  CreateGroup: undefined;
  JoinGroup: undefined;
};

// Root — switches between auth, welcome (no groups), and app (drawer+tabs)
export type RootStackParamList = {
  Auth: undefined;
  Welcome: undefined;
  App: undefined;
  CreateGroup: undefined;
  JoinGroup: undefined;
};
