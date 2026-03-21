import { create } from 'zustand';
import { Player, Group, Member, SlapDebt, FeedEntry, Notification, NetSummary } from '../types';

interface AuthSlice {
  player: Player | null;
  setPlayer: (player: Player | null) => void;
}

interface GroupsSlice {
  groups: Group[];
  currentGroup: Group | null;
  members: Member[];
  setGroups: (groups: Group[]) => void;
  setCurrentGroup: (group: Group | null) => void;
  setMembers: (members: Member[]) => void;
}

interface DebtsSlice {
  debts: SlapDebt[];
  pendingDebts: SlapDebt[];
  netSummary: NetSummary[];
  setDebts: (debts: SlapDebt[]) => void;
  setPendingDebts: (debts: SlapDebt[]) => void;
  setNetSummary: (summary: NetSummary[]) => void;
}

interface FeedSlice {
  feedEntries: FeedEntry[];
  setFeedEntries: (entries: FeedEntry[]) => void;
}

interface NotificationsSlice {
  notifications: Notification[];
  unreadCount: number;
  setNotifications: (notifications: Notification[]) => void;
  setUnreadCount: (count: number) => void;
}

type AppStore = AuthSlice & GroupsSlice & DebtsSlice & FeedSlice & NotificationsSlice;

export const useStore = create<AppStore>((set) => ({
  // Auth
  player: null,
  setPlayer: (player) => set({ player }),

  // Groups
  groups: [],
  currentGroup: null,
  members: [],
  setGroups: (groups) => set({ groups }),
  setCurrentGroup: (currentGroup) => set({ currentGroup }),
  setMembers: (members) => set({ members }),

  // Debts
  debts: [],
  pendingDebts: [],
  netSummary: [],
  setDebts: (debts) => set({ debts }),
  setPendingDebts: (pendingDebts) => set({ pendingDebts }),
  setNetSummary: (netSummary) => set({ netSummary }),

  // Feed
  feedEntries: [],
  setFeedEntries: (feedEntries) => set({ feedEntries }),

  // Notifications
  notifications: [],
  unreadCount: 0,
  setNotifications: (notifications) => set({ notifications }),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
}));
