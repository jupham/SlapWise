export interface Player {
  playerId: string;
  username: string;
  email: string;
  createdAt: string;
  pinpointEndpointId: string | null;
  pushEnabled: boolean;
}

export interface Group {
  groupId: string;
  name: string;
  creatorId: string;
  adminIds: string[];
  inviteCode: string;
  readInGameName: string | null;
  createdAt: string;
}

export interface Member {
  playerId: string;
  groupId: string;
  username: string;
  joinedAt: string;
  isReadIn: boolean;
  readInConfirmedAt: string | null;
}

export type DebtStatus = 'pending' | 'pending_confirmation' | 'resolved' | 'delivered';
export type GameType = 'manchester' | 'read_in';
export type ResolutionOutcome = 'followed_through' | 'did_not_follow_through';
export type PunishmentType = 'slap' | 'infinity_grog';

export interface ResolutionConfirmation {
  outcome: ResolutionOutcome;
  punishment: PunishmentType;
  submittedAt: string;
}

export interface SlapDebt {
  debtId: string;
  groupId: string;
  gameType: GameType;
  status: DebtStatus;
  challengerId: string;
  statementMakerId: string;
  statement: string;
  debtorId: string | null;
  creditorId: string | null;
  debtPunishment: PunishmentType | null;
  challengerConfirmation: ResolutionConfirmation | null;
  statementMakerConfirmation: ResolutionConfirmation | null;
  debtorDeliveryConfirmed: boolean;
  creditorDeliveryConfirmed: boolean;
  createdAt: string;
  resolvedAt: string | null;
  deliveredAt: string | null;
}

// GSI4 denormalized index item — one per player per debt, sufficient to render My Slate cards
export interface PlayerDebtIndex {
  debtId: string;
  groupId: string;
  playerId: string;
  role: 'challenger' | 'statementMaker';
  status: DebtStatus;
  gameType: GameType;
  statement: string;
  challengerId: string;
  statementMakerId: string;
  debtorId: string | null;
  creditorId: string | null;
  debtPunishment: PunishmentType | null;
  createdAt: string;
}

export interface ChugEvent {
  eventId: string;
  groupId: string;
  callerId: string;
  chuggedPlayerIds: string[];
  createdAt: string;
}

export type FeedEntryType =
  | 'manchester_created'
  | 'manchester_resolved'
  | 'slap_delivered'
  | 'chug_event'
  | 'member_joined';

export interface FeedEntry {
  entryId: string;
  groupId: string;
  type: FeedEntryType;
  readInOnly: boolean;
  refId: string;
  actorId: string;
  summary: string;
  createdAt: string;
}


// --- Infinity Grog ---

export type LiquorCategory =
  | 'vodka'
  | 'whiskey'
  | 'bourbon'
  | 'scotch'
  | 'irish_whiskey'
  | 'canadian_whiskey'
  | 'rum'
  | 'gin'
  | 'tequila'
  | 'brandy'
  | 'other';

export type GrogHistoryEventType = 'addition' | 'shot_taken';

export interface GrogEntry {
  entryId: string;
  category: LiquorCategory;
  brand: string;
  amountMl: number;
}

export interface GrogHistoryEvent {
  eventId: string;
  type: GrogHistoryEventType;
  actorPlayerId: string;
  occurredAt: string;
  sourceDebtId: string | null;
  brand: string | null;
  category: LiquorCategory | null;
  amountMl: number | null;
}

export interface Grog {
  groupId: string;
  bottleSize: number;
  entries: GrogEntry[];
  history: GrogHistoryEvent[];
}
