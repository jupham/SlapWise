import { create } from 'zustand';
import { Player, Group, Member, SlapDebt, FeedEntry } from '../types';

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
  setDebts: (debts: SlapDebt[]) => void;
  setPendingDebts: (debts: SlapDebt[]) => void;
}

interface FeedSlice {
  feedEntries: FeedEntry[];
  setFeedEntries: (entries: FeedEntry[]) => void;
}

type AppStore = AuthSlice & GroupsSlice & DebtsSlice & FeedSlice;

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
  setDebts: (debts) => set({ debts }),
  setPendingDebts: (pendingDebts) => set({ pendingDebts }),

  // Feed
  feedEntries: [],
  setFeedEntries: (feedEntries) => set({ feedEntries }),
}));
