// Feature: social-slap-tracker
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  awaitingAnswers,
  settleGameCall,
  validateCalledPlayers,
  type GameCallAnswer,
} from '../../../infrastructure/lambda/game-call/logic';

describe('settleGameCall', () => {
  it('makes everyone caught drink, and not the caller, when nobody was covered', () => {
    const outcome = settleGameCall('caller', ['a', 'b'], { a: 'not_covered', b: 'not_covered' });
    expect(outcome).toEqual({ chuggerIds: ['a', 'b'], backfired: false });
  });

  it('backfires on the caller alone when everyone called was covered', () => {
    const outcome = settleGameCall('caller', ['a', 'b'], { a: 'covered', b: 'covered' });
    expect(outcome).toEqual({ chuggerIds: ['caller'], backfired: true });
  });

  it('puts the caller in with the caught when the call was a mix', () => {
    const outcome = settleGameCall('caller', ['a', 'b', 'c'], {
      a: 'covered',
      b: 'not_covered',
      c: 'not_covered',
    });
    expect(outcome).toEqual({ chuggerIds: ['caller', 'b', 'c'], backfired: true });
  });

  it('refuses to settle while anyone has not answered', () => {
    expect(() => settleGameCall('caller', ['a', 'b'], { a: 'covered' })).toThrow('ANSWERS_OUTSTANDING');
  });

  it('holds for any set of answers', () => {
    const answer = fc.constantFrom<GameCallAnswer>('covered', 'not_covered');
    fc.assert(
      fc.property(fc.array(answer, { minLength: 1, maxLength: 8 }), (picks) => {
        const called = picks.map((_, i) => `p${i}`);
        const answers = Object.fromEntries(called.map((id, i) => [id, picks[i]]));
        const { chuggerIds, backfired } = settleGameCall('caller', called, answers);

        const caught = called.filter((id) => answers[id] === 'not_covered');
        const anyCovered = picks.includes('covered');

        expect(backfired).toBe(anyCovered);
        expect(chuggerIds.includes('caller')).toBe(anyCovered);
        expect(chuggerIds.filter((id) => id !== 'caller')).toEqual(caught);
      })
    );
  });
});

describe('awaitingAnswers', () => {
  it('lists the called players who have not answered, in call order', () => {
    expect(awaitingAnswers(['a', 'b', 'c'], { b: 'covered' })).toEqual(['a', 'c']);
  });
});

describe('validateCalledPlayers', () => {
  const readIn = new Set(['caller', 'a', 'b']);

  it('accepts other read-in players and drops duplicates', () => {
    expect(validateCalledPlayers('caller', ['a', 'b', 'a'], readIn)).toEqual({
      ok: true,
      calledPlayerIds: ['a', 'b'],
    });
  });

  it('rejects an empty call, calling yourself, and anyone not read in', () => {
    expect(validateCalledPlayers('caller', [], readIn)).toEqual({ ok: false, code: 'NO_PLAYERS_CALLED' });
    expect(validateCalledPlayers('caller', ['caller'], readIn)).toEqual({ ok: false, code: 'CANNOT_CALL_YOURSELF' });
    expect(validateCalledPlayers('caller', ['a', 'z'], readIn)).toEqual({ ok: false, code: 'PLAYER_NOT_READ_IN' });
  });
});
