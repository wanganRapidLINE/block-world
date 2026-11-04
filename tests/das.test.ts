import { describe, expect, it } from 'vitest';
import { HorizontalRepeater } from '../src/input/das';

const none = { left: false, right: false };

describe('HorizontalRepeater', () => {
  it('押した瞬間に1マス、DAS経過で1マス、以後ARRごとに1マス', () => {
    const r = new HorizontalRepeater(167, 33);
    expect(r.update(16, { left: true, right: false }, { left: true, right: false })).toBe(-1);
    expect(r.update(166, { left: true, right: false }, none)).toBe(0); // 押してから166ms
    expect(r.update(1, { left: true, right: false }, none)).toBe(-1); // 167でDAS成立
    expect(r.update(32, { left: true, right: false }, none)).toBe(0);
    expect(r.update(1, { left: true, right: false }, none)).toBe(-1);
    expect(r.update(66, { left: true, right: false }, none)).toBe(-2);
  });

  it('ARR 0 は壁まで一気に動く', () => {
    const r = new HorizontalRepeater(100, 0);
    r.update(16, { left: false, right: true }, { left: false, right: true });
    expect(r.update(100, { left: false, right: true }, none)).toBeGreaterThanOrEqual(10);
  });

  it('離すと止まる', () => {
    const r = new HorizontalRepeater(100, 20);
    r.update(16, { left: true, right: false }, { left: true, right: false });
    expect(r.update(500, none, none)).toBe(0);
  });

  it('左を押しながら右を押すと右が優先、右を離すと左に戻る', () => {
    const r = new HorizontalRepeater(100, 20);
    r.update(16, { left: true, right: false }, { left: true, right: false });
    expect(r.update(16, { left: true, right: true }, { left: false, right: true })).toBe(1);
    expect(r.update(16, { left: true, right: false }, none)).toBe(-1);
  });
});
