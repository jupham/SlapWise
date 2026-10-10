import { GroupService } from '../services/GroupService';
import { useStore } from '../store';
import { navigationRef } from './pushRouting';

/**
 * Re-reads the player's groups and puts them where they belong after their
 * membership changed — created, joined, left or deleted a group.
 *
 * Every one of those used to patch the store by hand or not at all: create and
 * join only called `goBack()`, so a first group landed you back on Welcome and
 * a second one never appeared in the drawer, and leaving your last group left
 * Group home on "No active group selected" with no Account button and so no way
 * to the drawer. Fetching and resetting the root stack from one place makes
 * every path end on either a real group or Welcome.
 *
 * `getGroups` reads GSI1, which is eventually consistent, so straight after a
 * membership change it can still return the old list. `open` is the group just
 * created or joined — fetched directly if the index has not caught up, so a
 * first group never bounces you to Welcome. `drop` is the group just left or
 * deleted, filtered out so a stale read cannot reopen it.
 */
export async function enterGroups({ open, drop }: { open?: string; drop?: string } = {}): Promise<void> {
  let groups = (await GroupService.getGroups()).filter((g) => g.groupId !== drop);
  if (open && !groups.some((g) => g.groupId === open)) {
    groups = [await GroupService.getGroup(open), ...groups];
  }

  const store = useStore.getState();
  store.setGroups(groups);

  const next = groups.find((g) => g.groupId === open) ?? groups[0] ?? null;
  store.setActiveGroup(next ? { groupId: next.groupId, groupName: next.name } : null);

  if (!navigationRef.isReady()) return;
  navigationRef.reset({ index: 0, routes: [{ name: next ? 'App' : 'Welcome' }] });
}
