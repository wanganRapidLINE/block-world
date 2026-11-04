import { COLS } from '../core/board';

export interface LeftRight {
  left: boolean;
  right: boolean;
}

/**
 * 横移動の長押し処理。
 * 押した瞬間に1マス → DAS(ms)押し続けると1マス → 以後ARR(ms)ごとに1マス。ARR=0 は壁まで一気に。
 * 左右両方押されているときは後から押した方を優先する。
 */
export class HorizontalRepeater {
  private dir: -1 | 0 | 1 = 0;
  private timer = 0;
  private charged = false;
  private arrAcc = 0;

  constructor(
    public dasMs: number,
    public arrMs: number,
  ) {}

  /** このフレームで動かすマス数（負=左, 正=右）を返す */
  update(dtMs: number, held: LeftRight, pressed: LeftRight): number {
    if (pressed.right) return this.start(1);
    if (pressed.left) return this.start(-1);

    // 今の方向を離した: もう片方が押されていればそちらに切り替える
    if (this.dir === -1 && !held.left) return held.right ? this.start(1) : this.stop();
    if (this.dir === 1 && !held.right) return held.left ? this.start(-1) : this.stop();
    if (this.dir === 0) return 0;

    let steps = 0;
    this.timer += dtMs;
    if (!this.charged) {
      if (this.timer < this.dasMs) return 0;
      this.charged = true;
      this.arrAcc = this.timer - this.dasMs;
      steps += this.dir;
    } else {
      this.arrAcc += dtMs;
    }

    if (this.arrMs <= 0) return this.dir * COLS;
    while (this.arrAcc >= this.arrMs) {
      this.arrAcc -= this.arrMs;
      steps += this.dir;
    }
    return steps;
  }

  reset(): void {
    this.stop();
  }

  private start(dir: -1 | 1): number {
    this.dir = dir;
    this.timer = 0;
    this.charged = false;
    this.arrAcc = 0;
    return dir;
  }

  private stop(): number {
    this.dir = 0;
    this.timer = 0;
    this.charged = false;
    this.arrAcc = 0;
    return 0;
  }
}
