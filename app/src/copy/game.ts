/**
 * Wording for the read-in game, shared by the feed, the call screen and the
 * call detail screen so they say the same thing.
 *
 * The game has whatever name the group's admins gave it (`readInGameName`); the
 * app falls back to "Game" until they do. Push text lives in the notification
 * dispatcher and has to track this by hand, since nothing crosses the
 * app/infrastructure boundary — and it deliberately never names the game,
 * because a lock screen is read by whoever holds the phone.
 */

export function gameName(readInGameName: string | null | undefined): string {
  const trimmed = readInGameName?.trim();
  return trimmed ? trimmed : 'Game';
}

/** "Kyle", "Kyle and Marcus", "Kyle, Marcus and Jordan". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'nobody';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "You and Kyle chug", "Marcus chugs" — the outcome of a settled call. */
export function chugLine(people: { name: string; isYou: boolean }[]): string {
  if (people.length === 0) return 'Nobody drinks';
  const youDrink = people.some((p) => p.isYou);
  const subjects = [...(youDrink ? ['You'] : []), ...people.filter((p) => !p.isYou).map((p) => p.name)];
  return `${joinNames(subjects)} ${subjects.length > 1 || youDrink ? 'chug' : 'chugs'}`;
}
