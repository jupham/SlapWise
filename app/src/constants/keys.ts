export const DDB_KEYS = {
  PLAYER_PK: (playerId: string) => `PLAYER#${playerId}`,
  PLAYER_SK_PROFILE: 'PROFILE',
  USERNAME_PK: (username: string) => `USERNAME#${username}`,
  USERNAME_SK_LOOKUP: 'LOOKUP',
  GROUP_PK: (groupId: string) => `GROUP#${groupId}`,
  GROUP_SK_METADATA: 'METADATA',
  GROUP_SK_MEMBER: (playerId: string) => `MEMBER#${playerId}`,
  GROUP_SK_INVITE: (code: string) => `INVITE#${code}`,
  GROUP_SK_DEBT: (debtId: string) => `DEBT#${debtId}`,
  GROUP_SK_GAME: (gameId: string) => `GAME#${gameId}`,
  GROUP_SK_CHUG: (eventId: string) => `CHUG#${eventId}`,
  GROUP_SK_FEED: (timestamp: string, entryId: string) => `FEED#${timestamp}#${entryId}`,
  PLAYER_SK_NOTIF: (notifId: string) => `NOTIF#${notifId}`,
} as const;

export const GSI_NAMES = {
  GSI1: 'GSI1',
  GSI2: 'GSI2',
  GSI3: 'GSI3',
} as const;

export const GSI_KEYS = {
  GSI1_PLAYER_PK: (playerId: string) => `PLAYER#${playerId}`,
  GSI1_GROUP_SK: (groupId: string) => `GROUP#${groupId}`,
  GSI2_STATUS_PK: (groupId: string, status: string) => `GROUP#${groupId}#STATUS#${status}`,
  GSI2_DEBT_SK: (debtId: string) => `DEBT#${debtId}`,
  GSI3_PLAYER_PK: (playerId: string) => `PLAYER#${playerId}`,
  GSI3_DEBT_SK: (debtId: string) => `DEBT#${debtId}`,
} as const;
