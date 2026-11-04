import type { TSpin } from './tspin';

export interface ScoreState {
  level: number;
  b2b: boolean;
  /** 直前までのREN数。消していない状態は -1 */
  combo: number;
}

export interface ScoreResult {
  points: number;
  b2bBonus: boolean;
  nextB2b: boolean;
  nextCombo: number;
  /** 画面に出す文字（例: 'T-SPIN DOUBLE', 'BACK-TO-BACK', '2 REN'） */
  labels: string[];
}

const BASE: Record<TSpin, readonly number[]> = {
  none: [0, 100, 300, 500, 800],
  mini: [100, 200, 400, 400, 400],
  full: [400, 800, 1200, 1600, 1600],
};

const LINE_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];

/** ミノ1個を固定したときの得点計算 */
export function scoreLock(state: ScoreState, lines: number, tspin: TSpin): ScoreResult {
  const labels: string[] = [];
  let points = BASE[tspin][lines] * state.level;

  // Tetris と、ラインを消した T-Spin（Mini含む）が「難しい消し方」
  const difficult = lines > 0 && (lines === 4 || tspin !== 'none');
  const b2bBonus = difficult && state.b2b;
  if (b2bBonus) points = Math.floor(points * 1.5);
  const nextB2b = lines > 0 ? difficult : state.b2b;

  const nextCombo = lines > 0 ? state.combo + 1 : -1;
  if (nextCombo > 0) points += 50 * nextCombo * state.level;

  if (tspin !== 'none') {
    const head = tspin === 'mini' ? 'T-SPIN MINI' : 'T-SPIN';
    labels.push(lines > 0 ? `${head} ${LINE_NAMES[lines]}` : head);
  } else if (lines > 0) {
    labels.push(LINE_NAMES[lines]);
  }
  if (b2bBonus) labels.push('BACK-TO-BACK');
  if (nextCombo > 0) labels.push(`${nextCombo} REN`);

  return { points, b2bBonus, nextB2b, nextCombo, labels };
}

/** Lvごとの1段落下にかかるミリ秒（ガイドラインの式） */
export function gravityMs(level: number): number {
  const lv = Math.min(level, 20);
  return Math.pow(0.8 - (lv - 1) * 0.007, lv - 1) * 1000;
}
