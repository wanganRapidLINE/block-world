import { Board, VISIBLE_ROWS } from './board';
import { cellsOf, kicksFor, spawnPosition, type PieceType, type Rotation } from './pieces';
import { SevenBag } from './randomizer';
import { gravityMs, scoreLock } from './scoring';
import { detectTSpin, type PiecePosition, type TSpin } from './tspin';

export const NEXT_COUNT = 5;
export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;
export const SOFT_DROP_FACTOR = 20;
export const MAX_LEVEL = 15;
export const LINES_PER_LEVEL = 10;
/** ライン消去の演出時間。この間はゲームの進行が止まる */
export const LINE_CLEAR_MS = 400;
/** マラソンのクリア条件 */
export const MARATHON_LINES = 150;

export type GameStatus = 'playing' | 'gameover' | 'cleared';

export interface ClearEvent {
  lines: number;
  tspin: TSpin;
  points: number;
  labels: string[];
  /** 画面側で「新しいイベントか」を見分けるための連番 */
  seq: number;
}

/** ハードドロップの残像を描くための情報 */
export interface HardDropTrail {
  type: PieceType;
  rot: Rotation;
  x: number;
  /** 落とす前の y */
  fromY: number;
  /** 着地した y */
  toY: number;
  seq: number;
}

/** 画面側（効果音など）に伝える出来事 */
export type GameEvent =
  | { type: 'move' }
  | { type: 'rotate' }
  | { type: 'hold' }
  | { type: 'hardDrop' }
  | { type: 'lock' }
  | { type: 'clear'; lines: number; tspin: TSpin; b2b: boolean }
  /** ラインを消さなかった T-Spin */
  | { type: 'tspin' }
  | { type: 'levelUp'; level: number }
  | { type: 'gameOver' }
  | { type: 'gameClear' };

export interface GameOptions {
  rng?: () => number;
  startLevel?: number;
  /** このライン数に届いたらクリア。null ならエンドレス */
  goalLines?: number | null;
  /** 20G: ミノが出た瞬間・動かした瞬間に一番下まで落ちる */
  gravity20G?: boolean;
  /** false にすると最初のミノを出さない（テスト用） */
  autoStart?: boolean;
}

/** ゲームのルール本体。画面・入力には依存しない */
export class Game {
  board = new Board();
  active: PiecePosition | null = null;
  hold: PieceType | null = null;
  holdUsed = false;
  status: GameStatus = 'playing';

  score = 0;
  lines = 0;
  level: number;
  combo = -1;
  b2b = false;
  lastClear: ClearEvent | null = null;
  lastHardDrop: HardDropTrail | null = null;
  /** プレイ時間（ポーズ中は進まない） */
  playTimeMs = 0;
  readonly goalLines: number | null;
  readonly gravity20G: boolean;

  /** 直前の回転で何番目のキックを使ったか（T-Spin Mini の例外判定用） */
  lastKickIndex = 0;

  private readonly startLevel: number;
  private readonly bag: SevenBag;
  private readonly queue: PieceType[] = [];
  private softDropping = false;
  private dropTimer = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private lowestY = Infinity;
  private touchedGround = false;
  private lastActionRotate = false;
  private clearSeq = 0;
  private dropSeq = 0;
  private events: GameEvent[] = [];
  /** 消去演出中の行と経過時間 */
  private clearing: { rows: number[]; elapsed: number } | null = null;

  constructor(opts: GameOptions = {}) {
    this.bag = new SevenBag(opts.rng);
    this.startLevel = opts.startLevel ?? 1;
    this.level = this.startLevel;
    this.goalLines = opts.goalLines ?? null;
    this.gravity20G = opts.gravity20G ?? false;
    this.fillQueue();
    if (opts.autoStart !== false) this.spawnNext();
  }

  /** 消去演出中の行（y）。演出中でなければ空 */
  get clearingRows(): readonly number[] {
    return this.clearing?.rows ?? [];
  }

  /** 消去演出の進み具合 0〜1 */
  get clearProgress(): number {
    return this.clearing ? Math.min(1, this.clearing.elapsed / LINE_CLEAR_MS) : 0;
  }

  /** たまった出来事を取り出して空にする */
  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  get next(): readonly PieceType[] {
    return this.queue.slice(0, NEXT_COUNT);
  }

  // ─── 出現 ───

  private fillQueue(): void {
    while (this.queue.length < NEXT_COUNT) this.queue.push(this.bag.next());
  }

  private spawnNext(): void {
    const type = this.queue.shift()!;
    this.fillQueue();
    this.spawn(type);
  }

  /** 指定したミノを出現位置に出す。ふさがっていればゲームオーバー（Block Out） */
  spawn(type: PieceType): void {
    const pos = spawnPosition(type);
    const piece: PiecePosition = { type, rot: 0, x: pos.x, y: pos.y };
    if (!this.board.fits(cellsOf(type, 0), piece.x, piece.y)) {
      this.active = null;
      this.endGame();
      return;
    }
    this.setActive(type, 0, piece.x, piece.y);
    // 出現直後、下が空いていれば1段落とす
    if (this.fitsAt(0, -1)) this.active!.y--;
    this.lowestY = this.active!.y;
    this.sink20G();
  }

  /** 操作中のミノを直接置く（出現処理・テスト用）。ロック関連の状態は初期化する */
  setActive(type: PieceType, rot: Rotation, x: number, y: number): void {
    this.active = { type, rot, x, y };
    this.dropTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = y;
    this.touchedGround = false;
    this.lastActionRotate = false;
    this.lastKickIndex = 0;
  }

  // ─── 操作 ───

  move(dx: number): boolean {
    if (!this.canControl() || !this.fitsAt(dx, 0)) return false;
    this.active!.x += dx;
    this.lastActionRotate = false;
    this.onControlled();
    this.events.push({ type: 'move' });
    this.sink20G();
    return true;
  }

  /** dir: 1=右回転, -1=左回転 */
  rotate(dir: 1 | -1): boolean {
    if (!this.canControl()) return false;
    const a = this.active!;
    if (a.type === 'O') return false;

    const to = ((a.rot + (dir === 1 ? 1 : 3)) % 4) as Rotation;
    const kicks = kicksFor(a.type, a.rot, to);
    const cells = cellsOf(a.type, to);
    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      if (this.board.fits(cells, a.x + kx, a.y + ky)) {
        a.rot = to;
        a.x += kx;
        a.y += ky;
        this.lastActionRotate = true;
        this.lastKickIndex = i;
        this.onControlled();
        this.checkNewLowest();
        this.events.push({ type: 'rotate' });
        this.sink20G();
        return true;
      }
    }
    return false;
  }

  setSoftDrop(on: boolean): void {
    this.softDropping = on;
  }

  hardDrop(): void {
    if (!this.canControl()) return;
    const a = this.active!;
    const fromY = a.y;
    let dist = 0;
    while (this.fitsAt(0, -1)) {
      this.active!.y--;
      dist++;
    }
    if (dist > 0) this.lastActionRotate = false;
    this.score += dist * 2;
    this.events.push({ type: 'hardDrop' });
    if (dist > 0) {
      this.lastHardDrop = { type: a.type, rot: a.rot, x: a.x, fromY, toY: a.y, seq: ++this.dropSeq };
    }
    this.lock();
  }

  holdPiece(): boolean {
    if (!this.canControl() || this.holdUsed) return false;
    const current = this.active!.type;
    const held = this.hold;
    this.hold = current;
    this.holdUsed = true;
    this.events.push({ type: 'hold' });
    if (held === null) this.spawnNext();
    else this.spawn(held);
    return true;
  }

  /** 着地予定の y（箱の左下） */
  ghostY(): number {
    const a = this.active;
    if (!a) return 0;
    let y = a.y;
    while (this.board.fits(cellsOf(a.type, a.rot), a.x, y - 1)) y--;
    return y;
  }

  // ─── 時間経過 ───

  update(dtMs: number): void {
    if (this.status === 'playing') this.playTimeMs += dtMs;
    if (this.status === 'playing' && this.clearing) {
      this.clearing.elapsed += dtMs;
      if (this.clearing.elapsed >= LINE_CLEAR_MS) this.finishClear();
      // 演出に使った時間は重力・固定には回さない
      return;
    }
    if (!this.canControl()) return;

    if (this.gravity20G) {
      this.sink20G();
    } else {
      this.applyGravity(dtMs);
    }

    if (this.fitsAt(0, -1)) {
      this.lockTimer = 0;
      return;
    }
    // 接地中
    this.touchedGround = true;
    if (this.lockResets >= MAX_LOCK_RESETS) {
      this.lock();
      return;
    }
    this.lockTimer += dtMs;
    if (this.lockTimer >= LOCK_DELAY_MS) this.lock();
  }

  /** 通常の重力。レベルに応じた間隔で1段ずつ落とす */
  private applyGravity(dtMs: number): void {
    const a = this.active!;
    const interval = gravityMs(this.level) / (this.softDropping ? SOFT_DROP_FACTOR : 1);
    this.dropTimer += dtMs;
    while (this.dropTimer >= interval) {
      if (!this.fitsAt(0, -1)) {
        this.dropTimer = 0;
        break;
      }
      this.dropTimer -= interval;
      a.y--;
      this.lastActionRotate = false;
      if (this.softDropping) this.score += 1;
      this.checkNewLowest();
    }
  }

  /** 20G のとき、操作中のミノを一番下まで落とす（得点なし）。横移動で穴の上を通れば穴に落ちる */
  private sink20G(): void {
    if (!this.gravity20G || !this.active) return;
    let fell = false;
    while (this.fitsAt(0, -1)) {
      this.active.y--;
      fell = true;
    }
    if (fell) {
      // 回転のあとに落ちたら、最後の操作は回転ではない（T-Spin にならない）
      this.lastActionRotate = false;
      this.checkNewLowest();
    }
  }

  // ─── 内部処理 ───

  private canControl(): boolean {
    return this.status === 'playing' && this.active !== null;
  }

  private fitsAt(dx: number, dy: number): boolean {
    const a = this.active!;
    return this.board.fits(cellsOf(a.type, a.rot), a.x + dx, a.y + dy);
  }

  /** 移動・回転に成功したとき: 接地を経験していれば操作回数を数え、上限までは固定タイマーを戻す */
  private onControlled(): void {
    if (!this.touchedGround) return;
    this.lockResets++;
    if (this.lockResets <= MAX_LOCK_RESETS) this.lockTimer = 0;
  }

  /** これまでより低い段に来たら操作回数をリセット */
  private checkNewLowest(): void {
    const y = this.active!.y;
    if (y < this.lowestY) {
      this.lowestY = y;
      this.lockResets = 0;
      this.touchedGround = false;
    }
  }

  private lock(): void {
    const a = this.active!;
    const cells = cellsOf(a.type, a.rot);
    const tspin = detectTSpin(this.board, a, this.lastActionRotate, this.lastKickIndex);
    const lockOut = cells.every((c) => a.y + c.y >= VISIBLE_ROWS);

    this.board.place(cells, a.x, a.y, a.type);
    this.active = null;
    this.events.push({ type: 'lock' });

    if (lockOut) {
      this.endGame();
      return;
    }

    const fullRows = this.board.fullRows();
    const lines = fullRows.length;
    const result = scoreLock({ level: this.level, b2b: this.b2b, combo: this.combo }, lines, tspin);
    this.score += result.points;
    this.b2b = result.nextB2b;
    this.combo = result.nextCombo;
    this.lines += lines;
    const prevLevel = this.level;
    this.level = Math.min(MAX_LEVEL, this.startLevel + Math.floor(this.lines / LINES_PER_LEVEL));
    if (lines > 0) this.events.push({ type: 'clear', lines, tspin, b2b: result.b2bBonus });
    else if (tspin !== 'none') this.events.push({ type: 'tspin' });
    if (this.level > prevLevel) this.events.push({ type: 'levelUp', level: this.level });
    if (result.labels.length > 0 || lines > 0 || tspin !== 'none') {
      this.lastClear = { lines, tspin, points: result.points, labels: result.labels, seq: ++this.clearSeq };
    }

    if (lines > 0) {
      // 行はすぐには消さず、演出が終わってから消して次のミノを出す
      this.clearing = { rows: fullRows, elapsed: 0 };
      return;
    }
    this.holdUsed = false;
    this.spawnNext();
  }

  private finishClear(): void {
    this.board.clearLines();
    this.clearing = null;
    if (this.goalLines !== null && this.lines >= this.goalLines) {
      this.status = 'cleared';
      this.events.push({ type: 'gameClear' });
      return;
    }
    this.holdUsed = false;
    this.spawnNext();
  }

  private endGame(): void {
    this.status = 'gameover';
    this.events.push({ type: 'gameOver' });
  }
}
