import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';

describe('ハードドロップの残像用の情報', () => {
  it('落とす前と着地した位置を記録し、落とすたびに連番が増える', () => {
    const game = new Game({ autoStart: false });
    // T の向き0は枠の一番下の行が空なので、床に着くと y=-1 になる
    game.setActive('T', 0, 3, 15);
    game.hardDrop();
    expect(game.lastHardDrop).toMatchObject({ type: 'T', rot: 0, x: 3, fromY: 15, toY: -1, seq: 1 });

    game.setActive('O', 0, 0, 10);
    game.hardDrop();
    expect(game.lastHardDrop).toMatchObject({ type: 'O', fromY: 10, toY: 0, seq: 2 });
  });

  it('1段も落ちなかったときは記録しない', () => {
    const game = new Game({ autoStart: false });
    game.setActive('O', 0, 4, 0);
    game.hardDrop();
    expect(game.lastHardDrop).toBeNull();
  });
});
