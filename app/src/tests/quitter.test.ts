// Feature: social-slap-tracker
import { describe, expect, it } from 'vitest';
import { quitterName } from '../copy/quitter';

describe('quitterName', () => {
  it('names the same leaver the same way every time', () => {
    const id = '3f2a9c1e-5b7d-4e8a-9c0f-1a2b3c4d5e6f';
    expect(quitterName(id)).toBe(quitterName(id));
  });

  it('never falls back to the raw id', () => {
    for (let i = 0; i < 200; i++) {
      const id = `player-${i}`;
      const name = quitterName(id);
      expect(name).not.toContain(id);
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('spreads leavers across more than one name', () => {
    const names = new Set(Array.from({ length: 50 }, (_, i) => quitterName(`player-${i}`)));
    expect(names.size).toBeGreaterThan(1);
  });
});
