export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ConfirmEmail: { email: string };
  GroupList: undefined;
  GroupDetail: { groupId: string; groupName: string };
  CreateGroup: undefined;
  JoinGroup: undefined;
  CreateChallenge: { groupId: string; groupName: string };
  PendingDebts: { groupId: string; groupName: string };
};
