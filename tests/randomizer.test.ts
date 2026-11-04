import { describe, expect, it } from 'vitest';
import { SevenBag } from '../src/core/randomizer';
import { PIECE_TYPES } from '../src/core/pieces';

describe('SevenBag', () => {
  it('7個ごとに7種類がちょうど1個ずつ出る', () => {
    const bag = new SevenBag();
    for (let set = 0; set < 20; set++) {
      const drawn = Array.from({ length: 7 }, () => bag.next());
      expect([...drawn].sort()).toEqual([...PIECE_TYPES].sort());
    }
  });

  it('乱数関数を差し替えると順番が再現できる', () => {
    const seq = () => {
      let s = 1;
      return () => ((s = (s * 16807) % 2147483647) / 2147483647);
    };
    const a = new SevenBag(seq());
    const b = new SevenBag(seq());
    const drawA = Array.from({ length: 21 }, () => a.next());
    const drawB = Array.from({ length: 21 }, () => b.next());
    expect(drawA).toEqual(drawB);
  });
});
