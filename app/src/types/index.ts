export interface Player {
  PK: string;
  SK: string;
  playerId: string;
  username: string;
  email: string;
  createdAt: string;
  pinpointEndpointId: string | null;
  pushEnabled: boolean;
  GSI1PK: string;
  GSI1SK: string;
}

export interface Group {
  PK: string;
  SK: string;
  groupId: string;
  name: string;
  creatorId: string;
  adminIds: string[];
  inviteCode: string;
  readInGameName: string | null;
  createdAt: string;
}

export interface Member {
  PK: string;
  SK: string;
  playerId: string;
  groupId: string;
  joinedAt: string;
  isReadIn: boolean;
  readInConfirmedAt: string | null;
  GSI1PK: string;
  GSI1SK: string;
}

export type DebtStatus = 'pending' | 'pending_confirmation' | 'resolved' | 'disputed' | 'delivered' | 'voided';
export type GameType = 'manchester' | 'custom' | 'read_in';
export type ResolutionOutcome = 'followed_through' | 'did_not_follow_through';

export interface ResolutionConfirmation {
  outcome: ResolutionOutcome;
  submittedAt: string;
}

export interface SlapDebt {
  PK: string;
  SK: string;
  debtId: string;
  groupId: string;
  gameType: GameType;
  customGameId: string | null;
  status: DebtStatus;
  shameStatus: boolean;
  debtorId: string | null;
  creditorId: string | null;
  challengerId: string | null;
  statementMakerId: string | null;
  statement: string | null;
  reason: string | null;
  createdAt: string;
  resolvedAt: string | null;
  deliveredAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  challengerConfirmation: ResolutionConfirmation | null;
  statementMakerConfirmation: ResolutionConfirmation | null;
  debtorDeliveryConfirmed: boolean;
  creditorDeliveryConfirmed: boolean;
  GSI2PK: string;
  GSI2SK: string;
  GSI3PK: string;
  GSI3SK: string;
}

export interface CustomGame {
  PK: string;
  SK: string;
  gameId: string;
  groupId: string;
  name: string;
  rules: string;
  createdBy: string;
  createdAt: string;
}

export interface ChugEvent {
  PK: string;
  SK: string;
  eventId: string;
  groupId: string;
  callerId: string;
  chuggedPlayerIds: string[];
  createdAt: string;
}

export type FeedEntryType = 'manchester_created' | 'manchester_resolved' | 'custom_debt_created' | 'custom_debt_resolved' | 'chug_event';

export interface FeedEntry {
  PK: string;
  SK: string;
  entryId: string;
  groupId: string;
  type: FeedEntryType;
  readInOnly: boolean;
  refId: string;
  summary: string;
  createdAt: string;
}

export interface Notification {
  PK: string;
  SK: string;
  notifId: string;
  playerId: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  refId: string | null;
}

export interface InviteCode {
  PK: string;
  SK: string;
  code: string;
  groupId: string;
  createdAt: string;
  active: boolean;
  TTL: number | null;
}

export interface NetSummary {
  playerId: string;
  username: string;
  netSlaps: number;
}

export interface DebtFilters {
  gameType?: GameType;
  playerId?: string;
  status?: DebtStatus;
}
