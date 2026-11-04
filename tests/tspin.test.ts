import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { detectTSpin } from '../src/core/tspin';

// Board.fromStrings は上の行から書き、最後の文字列が一番下（y=0）の行になる
describe('detectTSpin', () => {
  // T（右向き、箱の左下が (0,0)、中心 (1,1)）
  // 角: 左上(0,2) 右上(2,2) 左下(0,0) 右下(2,0)
  const piece = { type: 'T' as const, rot: 1 as const, x: 0, y: 0 };

  it('最後の操作が回転でなければ T-Spin にならない', () => {
    const board = Board.fromStrings(['X.X.......', '..........', 'X.X.......']);
    expect(detectTSpin(board, piece, false, 0)).toBe('none');
  });

  it('角が2つ以下なら T-Spin にならない', () => {
    const board = Board.fromStrings(['X.........', '..........', 'X.........']);
    expect(detectTSpin(board, piece, true, 0)).toBe('none');
  });

  it('向いている側の角が2つとも埋まっていれば T-Spin', () => {
    const board = Board.fromStrings(['X.X.......', '..........', '..X.......']);
    expect(detectTSpin(board, piece, true, 0)).toBe('full');
  });

  it('向いている側の角が1つだけなら Mini', () => {
    const board = Board.fromStrings(['X.X.......', '..........', 'X.........']);
    expect(detectTSpin(board, piece, true, 0)).toBe('mini');
  });

  it('5番目のキックで入った場合は Mini ではなく T-Spin', () => {
    const board = Board.fromStrings(['X.X.......', '..........', 'X.........']);
    expect(detectTSpin(board, piece, true, 4)).toBe('full');
  });

  it('壁は埋まっている扱い', () => {
    // 左壁に接した右向きT（中心(0,1)）: 左上・左下の角が壁、右上だけブロック
    const board = Board.fromStrings(['.X........', '..........', '..........']);
    const atWall = { type: 'T' as const, rot: 1 as const, x: -1, y: 0 };
    expect(detectTSpin(board, atWall, true, 0)).toBe('mini');
  });

  it('床は埋まっている扱い', () => {
    // 床に接した上向きT（中心(1,0)）: 左下・右下の角が床、左上だけブロック
    const board = Board.fromStrings(['X.........', '..........']);
    const onFloor = { type: 'T' as const, rot: 0 as const, x: 0, y: -1 };
    expect(detectTSpin(board, onFloor, true, 0)).toBe('mini');
  });

  it('Tミノ以外は判定しない', () => {
    const board = Board.fromStrings(['X.X.......', '..........', 'X.X.......']);
    expect(detectTSpin(board, { ...piece, type: 'J' }, true, 0)).toBe('none');
  });
});
