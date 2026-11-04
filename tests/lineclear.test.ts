import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { Game, LINE_CLEAR_MS } from '../src/core/game';

function setup() {
  const game = new Game({ autoStart: false });
  game.board = Board.fromStrings(['X.........', 'XXXXXXXX..', 'XXXXXXXX..']);
  game.setActive('O', 0, 8, 5);
  game.hardDrop();
  return game;
}

describe('ライン消去の演出', () => {
  it('そろった行は演出のあいだ盤面に残り、操作中のミノは出ない', () => {
    const game = setup();
    expect(game.clearingRows).toEqual([0, 1]);
    expect(game.active).toBe(null);
    expect(game.board.get(0, 0)).toBe('G');
    // 得点・ライン数は固定した時点で確定する（文字表示と効果音をすぐ出すため）
    expect(game.lines).toBe(2);
  });

  it('演出中は時間が経っても操作・HOLDできない', () => {
    const game = setup();
    game.update(LINE_CLEAR_MS - 1);
    expect(game.active).toBe(null);
    expect(game.move(-1)).toBe(false);
    expect(game.holdPiece()).toBe(false);
    expect(game.clearProgress).toBeGreaterThan(0.9);
  });

  it('演出が終わると行が消えて次のミノが出る', () => {
    const game = setup();
    game.update(LINE_CLEAR_MS);
    expect(game.clearingRows).toEqual([]);
    expect(game.board.get(0, 0)).toBe('G'); // 上の行が下りてきた
    expect(game.board.get(0, 1)).toBe(null);
    expect(game.active).not.toBe(null);
  });

  it('演出の時間は重力に使われない（出てきたミノはすぐには落ちない）', () => {
    const game = setup();
    game.update(LINE_CLEAR_MS + 900);
    const y = game.active!.y;
    game.update(50);
    expect(game.active!.y).toBe(y);
  });
});
