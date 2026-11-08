import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { Game } from '../src/core/game';
import { cellsOf } from '../src/core/pieces';

/** 操作中のミノの一番下のブロックの y */
function bottomOf(g: Game): number {
  const a = g.active!;
  return a.y + Math.min(...cellsOf(a.type, a.rot).map((c) => c.y));
}
function leftOf(g: Game): number {
  const a = g.active!;
  return a.x + Math.min(...cellsOf(a.type, a.rot).map((c) => c.x));
}

describe('20G', () => {
  it('出現した瞬間に一番下まで落ちる', () => {
    const game = new Game({ autoStart: false, gravity20G: true });
    game.spawn('T');
    expect(bottomOf(game)).toBe(0);
  });

  it('通常の重力では出現位置に留まる', () => {
    const game = new Game({ autoStart: false });
    game.spawn('T');
    expect(bottomOf(game)).toBeGreaterThan(15);
  });

  it('横に動かして穴の上を通ると、その穴に落ちて先へは進めない', () => {
    const game = new Game({ autoStart: false, gravity20G: true });
    // x=1,2 に深さ2の穴
    game.board = Board.fromStrings(['X..XXXXXXX', 'X..XXXXXXX']);
    game.spawn('O');
    expect(bottomOf(game)).toBe(2);
    while (game.move(-1)) {
      // 左へ動けなくなるまで
    }
    expect(leftOf(game)).toBe(1);
    expect(bottomOf(game)).toBe(0);
  });

  it('落ちても得点は増えない（ソフトドロップ扱いにしない）', () => {
    const game = new Game({ autoStart: false, gravity20G: true });
    game.spawn('T');
    game.setSoftDrop(true);
    game.update(16);
    expect(game.score).toBe(0);
  });
});
