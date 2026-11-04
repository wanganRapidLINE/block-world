import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { Game, LOCK_DELAY_MS, MAX_LOCK_RESETS } from '../src/core/game';
import { cellsOf } from '../src/core/pieces';

/** 最初のミノの種類を固定したいテスト用: 乱数0 → シャッフル後の並びが常に同じになる */
const fixedRng = () => 0;

function cellSet(game: Game) {
  const a = game.active!;
  return cellsOf(a.type, a.rot)
    .map((c) => `${a.x + c.x},${a.y + c.y}`)
    .sort();
}

describe('出現', () => {
  it('Tは3〜5列目、21〜22行目に出現してすぐ1段落ちる', () => {
    const game = new Game({ rng: fixedRng, autoStart: false });
    game.spawn('T');
    // 落下後: 平らな部分が y=19（可視範囲の最上段）、出っ張りが y=20
    expect(cellSet(game)).toEqual(['3,19', '4,19', '4,20', '5,19'].sort());
  });

  it('Iは3〜6列目、Oは4〜5列目に出現する', () => {
    const game = new Game({ rng: fixedRng, autoStart: false });
    game.spawn('I');
    expect(cellSet(game)).toEqual(['3,19', '4,19', '5,19', '6,19'].sort());
    game.spawn('O');
    expect(cellSet(game)).toEqual(['4,19', '4,20', '5,19', '5,20'].sort());
  });

  it('NEXTが5個見えている', () => {
    const game = new Game({ rng: fixedRng });
    expect(game.next).toHaveLength(5);
  });
});

describe('移動と重力', () => {
  it('壁の外には動かない', () => {
    const game = new Game({ autoStart: false });
    game.spawn('O');
    for (let i = 0; i < 10; i++) game.move(-1);
    expect(game.active!.x).toBe(0);
    expect(game.move(-1)).toBe(false);
  });

  it('Lv1は1秒で1段落ちる', () => {
    const game = new Game({ autoStart: false });
    game.spawn('T');
    const y = game.active!.y;
    game.update(999);
    expect(game.active!.y).toBe(y);
    game.update(1);
    expect(game.active!.y).toBe(y - 1);
  });

  it('ソフトドロップは1段1点、接地しても即固定しない', () => {
    const game = new Game({ autoStart: false });
    game.setActive('O', 0, 4, 1);
    game.setSoftDrop(true);
    game.update(50); // 1000ms / 20 = 50ms で1段
    expect(game.active!.y).toBe(0);
    expect(game.score).toBe(1);
    game.update(16);
    expect(game.active!.type).toBe('O');
    expect(game.active!.y).toBe(0);
  });

  it('ハードドロップは1段2点で即固定', () => {
    const game = new Game({ autoStart: false });
    game.setActive('O', 0, 4, 10);
    game.hardDrop();
    expect(game.score).toBe(20);
    expect(game.board.get(4, 0)).toBe('O');
    expect(game.board.get(5, 1)).toBe('O');
  });

  it('ゴーストは着地位置を指す', () => {
    const game = new Game({ autoStart: false });
    game.board = Board.fromStrings(['XXXXXXXXX.']);
    game.setActive('O', 0, 4, 10);
    expect(game.ghostY()).toBe(1);
  });
});

describe('SRS', () => {
  it('何もない場所では回転補正なしで回る', () => {
    const game = new Game({ autoStart: false });
    game.setActive('T', 0, 3, 5);
    expect(game.rotate(1)).toBe(true);
    expect(game.active).toMatchObject({ rot: 1, x: 3, y: 5 });
  });

  it('左壁に接した右向きTを右回転すると右に1マスずれる', () => {
    const game = new Game({ autoStart: false });
    game.setActive('T', 1, -1, 5);
    expect(game.rotate(1)).toBe(true);
    expect(game.active).toMatchObject({ rot: 2, x: 0, y: 5 });
    expect(game.lastKickIndex).toBe(1);
  });

  it('Oは回転しない', () => {
    const game = new Game({ autoStart: false });
    game.setActive('O', 0, 4, 5);
    expect(game.rotate(1)).toBe(false);
    expect(game.active!.rot).toBe(0);
  });

  it('Iミノ専用のキック（右壁で縦→横）', () => {
    const game = new Game({ autoStart: false });
    // 右向きIの縦棒は箱の左から3列目。右壁に付ける → 箱x=7で列9
    game.setActive('I', 1, 7, 5);
    expect(game.rotate(-1)).toBe(true); // R→0: (0,0)=列7..10はNG → (+2,0)は右にはみ出す → (-1,0)で列6..9
    expect(game.active!.rot).toBe(0);
    expect(cellSet(game)).toEqual(['6,7', '7,7', '8,7', '9,7'].sort());
  });

  it('T-Spin Triple: 5番目のキック（左1・下2）で入る（Y方向の符号の確認）', () => {
    const game = new Game({ autoStart: false });
    game.board = Board.fromStrings([
      '.X........', // y=5
      'X...XXXXXX', // y=4
      'X.XXXXXXXX', // y=3
      'X..XXXXXXX', // y=2
      'X.XXXXXXXX', // y=1
      'XXXXXXXXX.', // y=0
    ]);
    game.setActive('T', 0, 1, 3);
    expect(game.rotate(1)).toBe(true);
    expect(game.lastKickIndex).toBe(4);
    expect(game.active).toMatchObject({ rot: 1, x: 0, y: 1 });
    game.hardDrop();
    expect(game.lastClear?.lines).toBe(3);
    expect(game.lastClear?.tspin).toBe('full');
    expect(game.lastClear?.labels).toContain('T-SPIN TRIPLE');
    expect(game.score).toBe(1600);
  });

  it('T-Spin Double', () => {
    const game = new Game({ autoStart: false });
    game.board = Board.fromStrings([
      '...X......', // y=2 （屋根）
      'XXX...XXXX', // y=1
      'XXXX.XXXXX', // y=0
    ]);
    game.setActive('T', 1, 3, 0);
    expect(game.rotate(1)).toBe(true);
    game.hardDrop();
    expect(game.lastClear).toMatchObject({ lines: 2, tspin: 'full' });
    expect(game.score).toBe(1200);
  });

  it('回転後に落下したら T-Spin にならない', () => {
    const game = new Game({ autoStart: false });
    game.board = Board.fromStrings([
      '...X......',
      '..........',
      'XXX...XXXX',
      'XXXX.XXXXX',
    ]);
    game.setActive('T', 2, 3, 1);
    game.rotate(1);
    game.rotate(-1);
    game.hardDrop(); // 1段落ちる
    expect(game.lastClear?.tspin).toBe('none');
  });
});

describe('ロックダウン', () => {
  it('接地から0.5秒で固定される', () => {
    const game = new Game({ autoStart: false });
    game.setActive('O', 0, 4, 0);
    game.update(LOCK_DELAY_MS - 1);
    expect(game.board.get(4, 0)).toBe(null);
    game.update(1);
    expect(game.board.get(4, 0)).toBe('O');
  });

  it('移動・回転に成功するとタイマーが戻る', () => {
    const game = new Game({ autoStart: false });
    game.setActive('O', 0, 4, 0);
    game.update(400);
    game.move(-1);
    game.update(400);
    expect(game.board.get(3, 0)).toBe(null);
    game.update(100);
    expect(game.board.get(3, 0)).toBe('O');
  });

  it(`接地中の操作は${MAX_LOCK_RESETS}回まで。超えたら即固定`, () => {
    const game = new Game({ autoStart: false });
    game.setActive('O', 0, 4, 0);
    game.update(10);
    for (let i = 0; i < MAX_LOCK_RESETS - 1; i++) {
      game.move(i % 2 === 0 ? -1 : 1);
      game.update(10);
    }
    expect(game.active!.type).toBe('O');
    expect(game.active!.y).toBe(0);
    game.move(-1);
    game.update(1);
    expect(game.board.get(3, 0)).toBe('O');
  });

  it('より低い段に落ちたら操作回数がリセットされる', () => {
    const game = new Game({ autoStart: false });
    // 段差: 左半分は1段高い
    game.board = Board.fromStrings(['XXXX......']);
    game.setActive('O', 0, 2, 1);
    game.update(10);
    for (let i = 0; i < MAX_LOCK_RESETS - 1; i++) {
      game.move(i % 2 === 0 ? -1 : 1); // x=1 と 2 を行き来
      game.update(10);
    }
    // 右へ抜けて（ここで回数は上限を超える）段差を落ちる
    game.move(1);
    game.move(1);
    game.move(1);
    expect(game.active!.x).toBe(5);
    game.setSoftDrop(true);
    game.update(50);
    expect(game.active!.y).toBe(0);
    // 回数がリセットされていれば、まだ動かせて固定されない
    game.update(10);
    expect(game.move(1)).toBe(true);
    game.update(10);
    expect(game.board.get(6, 0)).toBe(null);
    game.hardDrop();
    expect(game.board.get(6, 0)).toBe('O');
  });
});

describe('HOLD', () => {
  it('空のHOLDに入れるとNEXTから出る。同じミノの間は2回使えない', () => {
    const game = new Game({ rng: fixedRng });
    const first = game.active!.type;
    const nextType = game.next[0];
    expect(game.holdPiece()).toBe(true);
    expect(game.hold).toBe(first);
    expect(game.active!.type).toBe(nextType);
    expect(game.holdPiece()).toBe(false);
    game.hardDrop();
    expect(game.holdUsed).toBe(false);
    const current = game.active!.type;
    expect(game.holdPiece()).toBe(true);
    expect(game.active!.type).toBe(first);
    expect(game.active!.rot).toBe(0);
    expect(game.hold).toBe(current);
  });
});

describe('ライン消去とレベル', () => {
  it('10ラインでレベルが上がる', () => {
    const game = new Game({ autoStart: false });
    game.lines = 9;
    game.board = Board.fromStrings(['XXXXXXXX..']);
    game.setActive('O', 0, 8, 5);
    game.hardDrop();
    expect(game.lines).toBe(10);
    expect(game.level).toBe(2);
  });
});

describe('ゲームオーバー', () => {
  it('出現位置がふさがっていたら Block Out', () => {
    const game = new Game({ autoStart: false });
    const rows = Array.from({ length: 22 }, () => '..........');
    rows[0] = '...XXXX...'; // y=21
    rows[1] = '...XXXX...'; // y=20
    game.board = Board.fromStrings(rows);
    game.setActive('O', 0, 0, 5);
    game.hardDrop();
    expect(game.status).toBe('gameover');
  });

  it('可視範囲より完全に上で固定したら Lock Out', () => {
    const game = new Game({ autoStart: false });
    const rows = Array.from({ length: 21 }, () => 'X.........');
    game.board = Board.fromStrings(rows); // 列0が y=0..20 まで埋まっている
    game.setActive('O', 0, 0, 22);
    game.hardDrop(); // y=21 で固定 → 20段目より上
    expect(game.status).toBe('gameover');
  });
});
