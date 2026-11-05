import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { Game, LINE_CLEAR_MS, MARATHON_LINES } from '../src/core/game';

/** 右端だけ空いた行を rows 段作り、I を縦に落として rows ライン消す */
function clearWithI(game: Game, rows: number): void {
  game.board = Board.fromStrings(Array.from({ length: rows }, () => 'XXXXXXXXX.'));
  game.setActive('I', 1, 7, 10); // 向き1の I は枠の左から3列目（x=9）に縦に並ぶ
  game.hardDrop();
}

const types = (g: Game) => g.drainEvents().map((e) => e.type);

describe('マラソン（150ラインでクリア）', () => {
  it('150ラインに届くと、消去演出のあとでクリアになり次のミノは出ない', () => {
    const game = new Game({ autoStart: false, goalLines: MARATHON_LINES });
    game.lines = 149;
    clearWithI(game, 1);
    expect(game.lines).toBe(150);
    expect(game.status).toBe('playing'); // 演出中はまだクリアにしない
    types(game);
    game.update(LINE_CLEAR_MS);
    expect(game.status).toBe('cleared');
    expect(game.active).toBe(null);
    expect(types(game)).toEqual(['gameClear']);
  });

  it('148ラインからテトリスで152ラインになってもクリア', () => {
    const game = new Game({ autoStart: false, goalLines: MARATHON_LINES });
    game.lines = 148;
    clearWithI(game, 4);
    game.update(LINE_CLEAR_MS);
    expect(game.lines).toBe(152);
    expect(game.status).toBe('cleared');
  });

  it('エンドレスは150ラインを超えても続く', () => {
    const game = new Game({ autoStart: false });
    game.lines = 149;
    clearWithI(game, 4);
    game.update(LINE_CLEAR_MS);
    expect(game.status).toBe('playing');
    expect(game.active).not.toBe(null);
  });

  it('プレイ時間はプレイ中だけ進み、クリア後は止まる', () => {
    const game = new Game({ autoStart: false, goalLines: MARATHON_LINES });
    game.lines = 149;
    game.update(1000);
    clearWithI(game, 1);
    game.update(LINE_CLEAR_MS);
    expect(game.playTimeMs).toBe(1000 + LINE_CLEAR_MS);
    game.update(5000);
    expect(game.playTimeMs).toBe(1000 + LINE_CLEAR_MS);
  });
});
