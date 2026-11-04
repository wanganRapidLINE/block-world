import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { Game } from '../src/core/game';

const types = (g: Game) => g.drainEvents().map((e) => e.type);

describe('効果音用のイベント', () => {
  it('移動・回転・HOLDに成功したときだけ通知する', () => {
    const game = new Game({ rng: () => 0 });
    game.setActive('T', 0, 0, 5);
    game.drainEvents();
    game.move(-1); // 壁で動けない
    game.move(1);
    game.rotate(1);
    game.holdPiece();
    game.holdPiece(); // 2回目は不可
    expect(types(game)).toEqual(['move', 'rotate', 'hold']);
  });

  it('自然に固定されたら lock、ハードドロップなら hardDrop と lock', () => {
    const game = new Game({ autoStart: false });
    game.setActive('O', 0, 4, 0);
    game.update(500);
    expect(types(game)).toEqual(['lock']);
    game.setActive('O', 0, 0, 10);
    game.hardDrop();
    expect(types(game)).toEqual(['hardDrop', 'lock']);
  });

  it('ライン消去は消した行数・T-Spin・B2Bつきで通知する', () => {
    const game = new Game({ autoStart: false });
    game.b2b = true;
    game.board = Board.fromStrings(['...X......', 'XXX...XXXX', 'XXXX.XXXXX']);
    game.setActive('T', 1, 3, 0);
    game.rotate(1);
    game.drainEvents();
    game.hardDrop();
    const clear = game.drainEvents().find((e) => e.type === 'clear');
    expect(clear).toEqual({ type: 'clear', lines: 2, tspin: 'full', b2b: true });
  });

  it('ラインを消さない T-Spin は tspin として通知する', () => {
    const game = new Game({ autoStart: false });
    // 屋根の下（y=1）に右向きで置いて回転 → 下向きで (3,1) に収まる。角は3つ
    game.board = Board.fromStrings(['...X.X....', '..........', 'XXXX..XXXX', 'XXXXXXXXX.']);
    game.setActive('T', 1, 3, 1);
    game.rotate(1);
    game.drainEvents();
    game.hardDrop();
    expect(types(game)).toContain('tspin');
  });

  it('レベルアップとゲームオーバー', () => {
    const game = new Game({ autoStart: false });
    game.lines = 9;
    game.board = Board.fromStrings(['XXXXXXXX..']);
    game.setActive('O', 0, 8, 5);
    game.hardDrop();
    expect(types(game)).toContain('levelUp');

    const rows = Array.from({ length: 22 }, () => '..........');
    rows[0] = '...XXXX...';
    rows[1] = '...XXXX...';
    game.board = Board.fromStrings(rows);
    game.setActive('O', 0, 0, 5);
    game.hardDrop();
    expect(types(game)).toContain('gameOver');
  });
});
