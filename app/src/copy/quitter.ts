/**
 * What to call a player who has left the group.
 *
 * Leaving deletes the Member row, but feed entries, settled debts and grog
 * history keep the leaver's id — so the member list no longer has a name for
 * it. Rather than print a raw id, they are remembered for what they did.
 *
 * The pick is a hash of the id, so one leaver keeps the same name everywhere
 * and on every render, and two leavers usually get different ones. Each name
 * has to read as both subject and object: "The Deserter called Manchester on
 * you", "You slapped The Deserter".
 */
const QUITTER_NAMES = [
  'A Known Quitter',
  'The Deserter',
  'Some Coward',
  'A Former Friend',
  'The One Who Ran',
  'A Turncoat',
  'The Defector',
  'Whoever Bailed',
];

export function quitterName(playerId: string): string {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    hash = (hash * 31 + playerId.charCodeAt(i)) | 0;
  }
  return QUITTER_NAMES[Math.abs(hash) % QUITTER_NAMES.length];
}
