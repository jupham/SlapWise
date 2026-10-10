/**
 * The read-in game's rules, kept free of AWS so the app's vitest suite can
 * exercise them directly — the same arrangement as grog-resolver/logic.ts.
 *
 * A read-in player calls out one or more other read-in players. Each one called
 * answers for themselves: covered (their drink carried the group's mark) or
 * not. Once everyone has answered:
 *
 * - every called player who was NOT covered chugs, and
 * - if ANY called player WAS covered, the call backfires and the caller chugs
 *   too — alongside whoever was caught.
 *
 * So calling three people when one was covered and two were not puts four
 * drinks down: the two caught, plus the caller for the one they missed.
 */

export type GameCallAnswer = 'covered' | 'not_covered';

export interface GameCallOutcome {
  /** Everyone who drinks, caller first when the call backfired. */
  chuggerIds: string[];
  /** True when at least one called player was covered. */
  backfired: boolean;
}

/** Called players who have not answered yet. */
export function awaitingAnswers(
  calledPlayerIds: string[],
  answers: Record<string, GameCallAnswer>
): string[] {
  return calledPlayerIds.filter((id) => !(id in answers));
}

/**
 * The outcome once every called player has answered. Throws if any have not —
 * settling early would decide the caller's fate on a partial picture.
 */
export function settleGameCall(
  callerId: string,
  calledPlayerIds: string[],
  answers: Record<string, GameCallAnswer>
): GameCallOutcome {
  const missing = awaitingAnswers(calledPlayerIds, answers);
  if (missing.length > 0) throw new Error('ANSWERS_OUTSTANDING');

  const caught = calledPlayerIds.filter((id) => answers[id] === 'not_covered');
  const backfired = calledPlayerIds.some((id) => answers[id] === 'covered');
  return {
    chuggerIds: backfired ? [callerId, ...caught] : caught,
    backfired,
  };
}

/**
 * Who a caller may call: other read-in members, each named once. Returns the
 * cleaned list, or an error code the resolver surfaces as-is.
 */
export function validateCalledPlayers(
  callerId: string,
  calledPlayerIds: string[],
  readInIds: Set<string>
): { ok: true; calledPlayerIds: string[] } | { ok: false; code: string } {
  const unique = [...new Set(calledPlayerIds)];
  if (unique.length === 0) return { ok: false, code: 'NO_PLAYERS_CALLED' };
  if (unique.includes(callerId)) return { ok: false, code: 'CANNOT_CALL_YOURSELF' };
  if (unique.some((id) => !readInIds.has(id))) return { ok: false, code: 'PLAYER_NOT_READ_IN' };
  return { ok: true, calledPlayerIds: unique };
}
