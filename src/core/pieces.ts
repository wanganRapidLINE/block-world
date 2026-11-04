// ミノの形・色・SRSの回転補正（キック）テーブル
// 座標は「右が+x、上が+y」。フィールドの一番下の行が y=0。

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export const PIECE_TYPES: readonly PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

/** 0=出現時の向き, 1=右回転後(R), 2=180度(2), 3=左回転後(L) */
export type Rotation = 0 | 1 | 2 | 3;

export interface Cell {
  x: number;
  y: number;
}

/** ワールドルールの配色 */
export const PIECE_COLORS: Record<PieceType, string> = {
  I: '#00cfcf', // 水色
  O: '#e6d200', // 黄
  T: '#9b30d9', // 紫
  S: '#00b300', // 緑
  Z: '#d91a1a', // 赤
  J: '#1f4fff', // 青
  L: '#ff8c00', // 橙
};

// 出現時の向き。見やすさのため上の行から書く（'.' は空き）
const SPAWN_SHAPES: Record<PieceType, readonly string[]> = {
  I: ['....', 'IIII', '....', '....'],
  O: ['OO', 'OO'],
  T: ['.T.', 'TTT', '...'],
  S: ['.SS', 'SS.', '...'],
  Z: ['ZZ.', '.ZZ', '...'],
  J: ['J..', 'JJJ', '...'],
  L: ['..L', 'LLL', '...'],
};

/** 正方形の箱ごと時計回りに90度回す（SRSの回転そのもの） */
function rotateRowsCW(rows: readonly string[]): string[] {
  const n = rows.length;
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => rows[n - 1 - c][r]).join(''),
  );
}

/** 上から書いた行を、箱の左下を原点とした y-up のセル座標に変換する */
function rowsToCells(rows: readonly string[]): Cell[] {
  const n = rows.length;
  const cells: Cell[] = [];
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch !== '.') cells.push({ x: c, y: n - 1 - r });
    });
  });
  return cells;
}

function buildRotations(type: PieceType): Cell[][] {
  const states: Cell[][] = [];
  let rows = [...SPAWN_SHAPES[type]];
  for (let i = 0; i < 4; i++) {
    states.push(rowsToCells(rows));
    rows = rotateRowsCW(rows);
  }
  return states;
}

const SHAPES: Record<PieceType, Cell[][]> = Object.fromEntries(
  PIECE_TYPES.map((t) => [t, buildRotations(t)]),
) as Record<PieceType, Cell[][]>;

/** 箱の左下を原点としたセル座標 */
export function cellsOf(type: PieceType, rot: Rotation): readonly Cell[] {
  return SHAPES[type][rot];
}

/** 出現位置（箱の左下）。21〜22行目（y=20,21）に出る */
export function spawnPosition(type: PieceType): Cell {
  switch (type) {
    case 'I':
      return { x: 3, y: 18 };
    case 'O':
      return { x: 4, y: 20 };
    default:
      return { x: 3, y: 19 };
  }
}

// ─── SRS キックテーブル（y-up、1番目は補正なし） ───
type Kick = readonly [number, number];
type KickTable = Record<string, readonly Kick[]>;

const KICKS_JLSTZ: KickTable = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

const KICKS_I: KickTable = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

export function kicksFor(type: PieceType, from: Rotation, to: Rotation): readonly Kick[] {
  const table = type === 'I' ? KICKS_I : KICKS_JLSTZ;
  return table[`${from}>${to}`];
}
