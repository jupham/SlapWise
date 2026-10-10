export interface Player {
  playerId: string;
  username: string;
  email: string;
  createdAt: string;
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

/** The read-in game. See infrastructure/lambda/game-call/logic.ts for the rules. */
export type GameCallAnswer = 'covered' | 'not_covered';

export interface GameCall {
  callId: string;
  groupId: string;
  callerId: string;
  calledPlayerIds: string[];
  /** `answeredBy` is the player themselves, or the caller answering for them. */
  answers: { playerId: string; answer: GameCallAnswer; answeredBy: string | null }[];
  status: 'open' | 'settled';
  /** Set once settled. Caller first when the call backfired. */
  chuggerIds: string[] | null;
  backfired: boolean | null;
  createdAt: string;
  settledAt: string | null;
}

export type FeedEntryType =
  | 'manchester_created'
  | 'manchester_resolved'
  | 'slap_delivered'
  /** Written by the retired recordGameCall; old rows only. */
  | 'chug_event'
  | 'member_joined'
  | 'game_called'
  | 'game_settled';

export interface FeedEntry {
  entryId: string;
  groupId: string;
  type: FeedEntryType;
  readInOnly: boolean;
  refId: string;
  actorId: string;
  /** Generic fallback text for entries written before the fields below existed. */
  summary: string;
  createdAt: string;

  // Denormalised detail, all optional — entries predating this carry none of
  // it. Ids rather than names: display names are editable, so a stored name
  // would make old entries lie after a rename. Resolved against the member
  // list at render time.
  statement?: string | null;
  challengerId?: string | null;
  statementMakerId?: string | null;
  /** The player who takes the punishment. */
  debtorId?: string | null;
  /** The player who delivers it. */
  creditorId?: string | null;
  outcome?: ResolutionOutcome | null;
  punishment?: PunishmentType | null;
  amountMl?: number | null;

  // Read-in game entries. The server nulls these and sets `redacted` for
  // anyone who is not read in, so a redacted row only says something happened.
  calledPlayerIds?: string[] | null;
  chuggerIds?: string[] | null;
  redacted?: boolean | null;
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

export interface PendingAddBack {
  debtId: string;
  debtorId: string;
  createdAt: string;
}

export interface Grog {
  groupId: string;
  bottleSize: number;
  entries: GrogEntry[];
  history: GrogHistoryEvent[];
  pendingAddBacks: PendingAddBack[];
}
