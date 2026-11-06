import { COLS, VISIBLE_ROWS, type CellValue } from '../core/board';
import type { Game, HardDropTrail } from '../core/game';
import { cellsOf, PIECE_COLORS, type PieceType } from '../core/pieces';

// 配置はすべて「ブロック何個分か」で表す
const LAYOUT = {
  width: 20,
  height: 22.6,
  /** 可視範囲の上に覗かせる見えない行の数 */
  bufferRows: 2,
  holdX: 0,
  fieldX: 5,
  nextX: 15.5,
  sideW: 4.5,
};

const THEME = {
  field: '#070814',
  grid: 'rgba(255,255,255,0.05)',
  frame: '#3a4070',
  panel: '#151935',
  text: '#e4e7ff',
  dim: '#8a90b8',
  accent: '#ffd84a',
  garbage: '#6b6f86',
};

const LABEL_SHOW_MS = 1600;
/** ハードドロップの残像が消えるまでの時間 */
const TRAIL_MS = 220;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cell = 20;
  private ox = 0;
  private oy = 0;
  private cssW = 0;
  private cssH = 0;
  private labelSeq = 0;
  private labelStart = -Infinity;
  private labels: string[] = [];
  private trail: HardDropTrail | null = null;
  private trailStart = -Infinity;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** alignTop: 縦持ちで仮想パッドを出すときは、余白を下（パッド側）に寄せる */
  resize(cssW: number, cssH: number, alignTop = false): void {
    const dpr = window.devicePixelRatio || 1;
    this.cssW = cssW;
    this.cssH = cssH;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cell = Math.max(4, Math.floor(Math.min(cssW / LAYOUT.width, cssH / LAYOUT.height)));
    this.ox = Math.floor((cssW - LAYOUT.width * this.cell) / 2);
    const spareH = cssH - LAYOUT.height * this.cell;
    this.oy = Math.floor(alignTop ? Math.min(spareH, this.cell * 0.4) : spareH / 2);
  }

  draw(game: Game | null, now: number): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    this.drawField(game, now);
    this.drawHold(game);
    this.drawNext(game);
    this.drawStats(game);
    this.drawLabels(game, now);
  }

  // ─── 座標変換 ───

  /** レイアウト単位 → 画面px */
  private px(u: number): number {
    return this.ox + u * this.cell;
  }
  private py(u: number): number {
    return this.oy + u * this.cell;
  }
  /** フィールドの行 y（0=一番下）→ レイアウト上の上端 */
  private rowTop(y: number): number {
    return LAYOUT.bufferRows + (VISIBLE_ROWS - 1 - y);
  }

  // ─── フィールド ───

  private drawField(game: Game | null, now: number): void {
    const { ctx, cell } = this;
    const x0 = this.px(LAYOUT.fieldX);
    const y0 = this.py(LAYOUT.bufferRows);
    const w = COLS * cell;
    const h = VISIBLE_ROWS * cell;

    ctx.fillStyle = THEME.field;
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = THEME.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) {
      ctx.moveTo(x0 + c * cell + 0.5, y0);
      ctx.lineTo(x0 + c * cell + 0.5, y0 + h);
    }
    for (let r = 1; r < VISIBLE_ROWS; r++) {
      ctx.moveTo(x0, y0 + r * cell + 0.5);
      ctx.lineTo(x0 + w, y0 + r * cell + 0.5);
    }
    ctx.stroke();
    ctx.strokeStyle = THEME.frame;
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 - 1, y0 - 1, w + 2, h + 2);

    if (!game) return;
    const maxRow = VISIBLE_ROWS + LAYOUT.bufferRows;

    const clearing = new Set(game.clearingRows);
    for (let y = 0; y < maxRow; y++) {
      if (clearing.has(y)) continue;
      for (let x = 0; x < COLS; x++) {
        const v = game.board.get(x, y);
        if (v) this.drawBlock(LAYOUT.fieldX + x, this.rowTop(y), cell, colorOf(v), y >= VISIBLE_ROWS ? 0.5 : 1);
      }
    }
    for (const y of clearing) this.drawClearingRow(game, y, game.clearProgress);
    this.drawHardDropTrail(game, now);

    const a = game.active;
    if (!a) return;
    const cells = cellsOf(a.type, a.rot);
    const color = PIECE_COLORS[a.type];

    const gy = game.ghostY();
    for (const c of cells) {
      const y = gy + c.y;
      if (y < maxRow) this.drawGhost(LAYOUT.fieldX + a.x + c.x, this.rowTop(y), color);
    }
    for (const c of cells) {
      const y = a.y + c.y;
      if (y < maxRow) this.drawBlock(LAYOUT.fieldX + a.x + c.x, this.rowTop(y), cell, color, 1);
    }
  }

  /**
   * ハードドロップの残像。落とす前の位置から着地点まで、列ごとに
   * 上が透明・下が濃いグラデーションの帯を描き、TRAIL_MS かけて消す
   */
  private drawHardDropTrail(game: Game, now: number): void {
    const t = game.lastHardDrop;
    if (t !== this.trail) {
      this.trail = t;
      this.trailStart = now;
    }
    if (!t) return;
    const p = (now - this.trailStart) / TRAIL_MS;
    if (p >= 1) return;

    const { ctx, cell } = this;
    const maxRow = VISIBLE_ROWS + LAYOUT.bufferRows;
    // 列ごとに、ミノのいちばん上のセルの高さを求める
    const tops = new Map<number, number>();
    for (const c of cellsOf(t.type, t.rot)) {
      tops.set(c.x, Math.max(tops.get(c.x) ?? -Infinity, c.y));
    }
    const color = PIECE_COLORS[t.type];
    const fieldTop = this.py(0);
    ctx.save();
    ctx.globalAlpha = 0.45 * (1 - p) * (1 - p);
    for (const [cx, cy] of tops) {
      const startRow = Math.min(t.fromY + cy, maxRow - 1);
      const endRow = t.toY + cy;
      if (startRow <= endRow) continue;
      const yTop = Math.max(this.py(this.rowTop(startRow)), fieldTop);
      const yBottom = this.py(this.rowTop(endRow));
      if (yBottom <= yTop) continue;
      const x = this.px(LAYOUT.fieldX + t.x + cx);
      const grad = ctx.createLinearGradient(0, yTop, 0, yBottom);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(1, color);
      ctx.fillStyle = grad;
      ctx.fillRect(x + 2, yTop, cell - 4, yBottom - yTop);
    }
    ctx.restore();
  }

  /**
   * 消える行の演出。
   * 前半: 行全体が白く2回点滅する → 後半: 中央から左右へ向かってブロックが消えていく
   */
  private drawClearingRow(game: Game, y: number, p: number): void {
    const { ctx, cell } = this;
    const top = this.rowTop(y);
    const FLASH_END = 0.35;
    if (p < FLASH_END) {
      for (let x = 0; x < COLS; x++) {
        const v = game.board.get(x, y);
        if (v) this.drawBlock(LAYOUT.fieldX + x, top, cell, colorOf(v), 1);
      }
      const blink = Math.sin((p / FLASH_END) * Math.PI * 2) > -0.2 ? 0.85 : 0.25;
      ctx.globalAlpha = blink;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(this.px(LAYOUT.fieldX), this.py(top), COLS * cell, cell);
      ctx.globalAlpha = 1;
      return;
    }
    const q = (p - FLASH_END) / (1 - FLASH_END);
    for (let x = 0; x < COLS; x++) {
      // 中央からの距離 0〜1。q がこれを超えた列から消える
      const dist = Math.abs(x + 0.5 - COLS / 2) / (COLS / 2);
      if (dist < q) continue;
      ctx.globalAlpha = 0.9 * (1 - q * 0.5);
      ctx.fillStyle = '#ffffff';
      const shrink = Math.min(1, (dist - q) * 4 + 0.2);
      const h = cell * shrink;
      ctx.fillRect(this.px(LAYOUT.fieldX + x) + 1, this.py(top) + (cell - h) / 2, cell - 2, h);
    }
    ctx.globalAlpha = 1;
  }

  private drawBlock(ux: number, uy: number, size: number, color: string, alpha: number): void {
    this.blockAt(this.px(ux), this.py(uy), size, color, alpha);
  }

  /** px座標指定でブロックを1個描く（光沢と影つき） */
  private blockAt(x: number, y: number, size: number, color: string, alpha: number): void {
    const { ctx } = this;
    const bevel = Math.max(1, Math.round(size * 0.14));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x + 1, y + 1, size - 2, bevel);
    ctx.fillRect(x + 1, y + 1, bevel, size - 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x + 1, y + size - 1 - bevel, size - 2, bevel);
    ctx.fillRect(x + size - 1 - bevel, y + 1, bevel, size - 2);
    ctx.globalAlpha = 1;
  }

  private drawGhost(ux: number, uy: number, color: string): void {
    const { ctx, cell } = this;
    const x = this.px(ux);
    const y = this.py(uy);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
    ctx.globalAlpha = 1;
  }

  // ─── HOLD / NEXT ───

  private panel(ux: number, uy: number, uw: number, uh: number, title: string): void {
    const { ctx, cell } = this;
    const x = this.px(ux);
    const y = this.py(uy);
    ctx.fillStyle = THEME.panel;
    roundRect(ctx, x, y, uw * cell, uh * cell, cell * 0.25);
    ctx.fill();
    ctx.fillStyle = THEME.dim;
    ctx.font = `bold ${Math.round(cell * 0.55)}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(title, x + cell * 0.3, y + cell * 0.25);
  }

  /** 箱（レイアウト単位）の中央にミノを描く */
  private miniPiece(type: PieceType, ux: number, uy: number, uw: number, uh: number, scale: number, alpha: number): void {
    const cells = cellsOf(type, 0);
    const minX = Math.min(...cells.map((c) => c.x));
    const maxX = Math.max(...cells.map((c) => c.x));
    const minY = Math.min(...cells.map((c) => c.y));
    const maxY = Math.max(...cells.map((c) => c.y));
    const s = Math.max(3, Math.floor(this.cell * scale));
    const pw = (maxX - minX + 1) * s;
    const ph = (maxY - minY + 1) * s;
    const x0 = this.px(ux) + (uw * this.cell - pw) / 2;
    const y0 = this.py(uy) + (uh * this.cell - ph) / 2;
    for (const c of cells) {
      this.blockAt(Math.round(x0 + (c.x - minX) * s), Math.round(y0 + (maxY - c.y) * s), s, PIECE_COLORS[type], alpha);
    }
  }

  private drawHold(game: Game | null): void {
    const top = LAYOUT.bufferRows;
    this.panel(LAYOUT.holdX, top, LAYOUT.sideW, 3.6, 'HOLD');
    if (game?.hold) {
      this.miniPiece(game.hold, LAYOUT.holdX, top + 0.9, LAYOUT.sideW, 2.6, 0.72, game.holdUsed ? 0.3 : 1);
    }
  }

  /**
   * NEXT。1個目は大きな枠、2個目以降は小さめの枠に1個ずつ入れる。
   * 枠の高さとミノの大きさ（cell に対する倍率）
   */
  private drawNext(game: Game | null): void {
    const top = LAYOUT.bufferRows;
    const FIRST = { h: 3.5, scale: 0.9 };
    const REST = { h: 2.4, scale: 0.68 };
    const GAP = 0.25;
    const count = game ? game.next.length : 5;
    const slots = Array.from({ length: count }, (_, i) => (i === 0 ? FIRST : REST));
    const totalH = 0.95 + slots.reduce((sum, sl) => sum + sl.h + GAP, 0);
    this.panel(LAYOUT.nextX, top, LAYOUT.sideW, totalH, 'NEXT');

    const { ctx, cell } = this;
    const inset = 0.22;
    let uy = top + 0.95;
    slots.forEach((sl, i) => {
      ctx.fillStyle = THEME.field;
      roundRect(ctx, this.px(LAYOUT.nextX + inset), this.py(uy), (LAYOUT.sideW - inset * 2) * cell, sl.h * cell, cell * 0.2);
      ctx.fill();
      const type = game?.next[i];
      if (type) this.miniPiece(type, LAYOUT.nextX, uy, LAYOUT.sideW, sl.h, sl.scale, 1);
      uy += sl.h + GAP;
    });
  }

  // ─── スコア類 ───

  private drawStats(game: Game | null): void {
    const { ctx, cell } = this;
    const rows: [string, string][] = [
      ['SCORE', String(game?.score ?? 0)],
      ['LINES', game?.goalLines ? `${game.lines}/${game.goalLines}` : String(game?.lines ?? 0)],
      ['LEVEL', String(game?.level ?? 1)],
    ];
    let uy = LAYOUT.bufferRows + 4.2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (const [label, value] of rows) {
      ctx.fillStyle = THEME.dim;
      ctx.font = `bold ${Math.round(cell * 0.5)}px system-ui, sans-serif`;
      ctx.fillText(label, this.px(LAYOUT.holdX + 0.2), this.py(uy));
      ctx.fillStyle = THEME.text;
      ctx.font = `bold ${Math.round(cell * 0.85)}px system-ui, sans-serif`;
      ctx.fillText(value, this.px(LAYOUT.holdX + 0.2), this.py(uy + 0.6), (LAYOUT.sideW - 0.3) * cell);
      uy += 2;
    }
  }

  private drawLabels(game: Game | null, now: number): void {
    const clear = game?.lastClear;
    if (clear && clear.seq !== this.labelSeq) {
      this.labelSeq = clear.seq;
      this.labelStart = now;
      this.labels = clear.labels;
    }
    if (!game) this.labelSeq = 0;
    const t = now - this.labelStart;
    if (t > LABEL_SHOW_MS || this.labels.length === 0) return;

    const { ctx, cell } = this;
    ctx.globalAlpha = t < LABEL_SHOW_MS - 400 ? 1 : (LABEL_SHOW_MS - t) / 400;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let uy = LAYOUT.bufferRows + 10.6;
    this.labels.forEach((text, i) => {
      ctx.fillStyle = i === 0 ? THEME.accent : THEME.text;
      ctx.font = `bold ${Math.round(cell * (i === 0 ? 0.62 : 0.5))}px system-ui, sans-serif`;
      // 長いラベルは2行に分ける（例: T-SPIN / DOUBLE）
      for (const line of splitLabel(text)) {
        ctx.fillText(line, this.px(LAYOUT.holdX + 0.2), this.py(uy), (LAYOUT.sideW - 0.2) * cell);
        uy += i === 0 ? 0.8 : 0.7;
      }
      uy += 0.2;
    });
    ctx.globalAlpha = 1;
  }
}

function colorOf(v: NonNullable<CellValue>): string {
  return v === 'G' ? THEME.garbage : PIECE_COLORS[v];
}

function splitLabel(text: string): string[] {
  const m = text.match(/^(T-SPIN(?: MINI)?) (.+)$/);
  return m ? [m[1], m[2]] : [text];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
