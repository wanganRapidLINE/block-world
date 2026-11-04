import { describe, expect, it } from 'vitest';
import { scoreLock } from '../src/core/scoring';

const fresh = { level: 1, b2b: false, combo: -1 };

describe('scoreLock', () => {
  it('ライン数ごとの基本点', () => {
    expect(scoreLock(fresh, 1, 'none').points).toBe(100);
    expect(scoreLock(fresh, 2, 'none').points).toBe(300);
    expect(scoreLock(fresh, 3, 'none').points).toBe(500);
    expect(scoreLock(fresh, 4, 'none').points).toBe(800);
  });

  it('T-Spin と Mini の得点', () => {
    expect(scoreLock(fresh, 0, 'full').points).toBe(400);
    expect(scoreLock(fresh, 1, 'full').points).toBe(800);
    expect(scoreLock(fresh, 2, 'full').points).toBe(1200);
    expect(scoreLock(fresh, 3, 'full').points).toBe(1600);
    expect(scoreLock(fresh, 0, 'mini').points).toBe(100);
    expect(scoreLock(fresh, 1, 'mini').points).toBe(200);
    expect(scoreLock(fresh, 2, 'mini').points).toBe(400);
  });

  it('レベルが掛かる', () => {
    expect(scoreLock({ ...fresh, level: 3 }, 4, 'none').points).toBe(2400);
  });

  it('B2B中のテトリスは1.5倍、B2Bは継続する', () => {
    const r = scoreLock({ ...fresh, b2b: true }, 4, 'none');
    expect(r.points).toBe(1200);
    expect(r.b2bBonus).toBe(true);
    expect(r.nextB2b).toBe(true);
    expect(r.labels).toContain('BACK-TO-BACK');
  });

  it('T-Spin以外の1〜3ライン消しでB2Bが途切れる', () => {
    const r = scoreLock({ ...fresh, b2b: true }, 2, 'none');
    expect(r.b2bBonus).toBe(false);
    expect(r.nextB2b).toBe(false);
  });

  it('ラインを消さないT-SpinではB2Bが変化しない', () => {
    expect(scoreLock({ ...fresh, b2b: true }, 0, 'full').nextB2b).toBe(true);
    expect(scoreLock({ ...fresh, b2b: false }, 0, 'full').nextB2b).toBe(false);
  });

  it('RENは連続して消すたびに 50×REN数×Lv 加算され、消さなければリセット', () => {
    const first = scoreLock(fresh, 1, 'none');
    expect(first.nextCombo).toBe(0);
    expect(first.points).toBe(100);
    const second = scoreLock({ ...fresh, combo: first.nextCombo }, 1, 'none');
    expect(second.nextCombo).toBe(1);
    expect(second.points).toBe(150);
    expect(second.labels).toContain('1 REN');
    expect(scoreLock({ ...fresh, combo: 3 }, 0, 'none').nextCombo).toBe(-1);
  });

  it('表示ラベル', () => {
    expect(scoreLock(fresh, 2, 'full').labels).toContain('T-SPIN DOUBLE');
    expect(scoreLock(fresh, 1, 'mini').labels).toContain('T-SPIN MINI SINGLE');
    expect(scoreLock(fresh, 4, 'none').labels).toContain('TETRIS');
    expect(scoreLock(fresh, 0, 'none').labels).toEqual([]);
  });
});
