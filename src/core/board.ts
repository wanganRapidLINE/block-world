import type { Cell, PieceType } from './pieces';

export const COLS = 10;
export const VISIBLE_ROWS = 20;
/** 可視範囲の上に20行の見えないバッファを持つ */
export const TOTAL_ROWS = 40;

/** 'G' はテスト用の汎用ブロック */
export type CellValue = PieceType | 'G' | null;

export class Board {
  /** rows[y][x]。y=0 が一番下 */
  readonly rows: CellValue[][];

  constructor() {
    this.rows = Array.from({ length: TOTAL_ROWS }, () => new Array<CellValue>(COLS).fill(null));
  }

  /**
   * 上の行から順に書いた文字列で盤面を作る。最後の文字列が y=0。
   * '.' が空き、それ以外の文字はブロック（ミノ名ならその色、他は 'G'）。
   */
  static fromStrings(lines: readonly string[]): Board {
    const board = new Board();
    lines.forEach((line, i) => {
      const y = lines.length - 1 - i;
      [...line].forEach((ch, x) => {
        if (ch === '.') return;
        board.rows[y][x] = 'IOTSZJL'.includes(ch) ? (ch as PieceType) : 'G';
      });
    });
    return board;
  }

  get(x: number, y: number): CellValue {
    return this.rows[y]?.[x] ?? null;
  }

  /** 壁・床・天井の外、またはブロックがあれば true */
  isBlocked(x: number, y: number): boolean {
    if (x < 0 || x >= COLS || y < 0 || y >= TOTAL_ROWS) return true;
    return this.rows[y][x] !== null;
  }

  fits(cells: readonly Cell[], ox: number, oy: number): boolean {
    return cells.every((c) => !this.isBlocked(ox + c.x, oy + c.y));
  }

  place(cells: readonly Cell[], ox: number, oy: number, type: PieceType): void {
    for (const c of cells) this.rows[oy + c.y][ox + c.x] = type;
  }

  /** そろっている行の y（下から順） */
  fullRows(): number[] {
    const ys: number[] = [];
    this.rows.forEach((row, y) => {
      if (row.every((v) => v !== null)) ys.push(y);
    });
    return ys;
  }

  /** そろった行を消して上の行を詰める。消した行数を返す */
  clearLines(): number {
    let cleared = 0;
    for (let y = 0; y < TOTAL_ROWS; ) {
      if (this.rows[y].every((v) => v !== null)) {
        this.rows.splice(y, 1);
        this.rows.push(new Array<CellValue>(COLS).fill(null));
        cleared++;
      } else {
        y++;
      }
    }
    return cleared;
  }
}
