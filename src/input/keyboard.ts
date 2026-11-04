import { ACTIONS, emptyFrame, type Action, type InputFrame, type InputSource } from './actions';
import { keyIdOf, type Settings } from './bindings';

export class KeyboardSource implements InputSource {
  private readonly down = new Set<string>();
  private pending = new Set<Action>();
  /** キー割り当て画面が入力を横取りしている間は true */
  suspended = false;

  constructor(private readonly settings: Settings) {
    window.addEventListener('keydown', (e) => this.onDown(e));
    window.addEventListener('keyup', (e) => this.down.delete(keyIdOf(e)));
    // ウィンドウ外に出たら押しっぱなし扱いを解除
    window.addEventListener('blur', () => this.down.clear());
  }

  private onDown(e: KeyboardEvent): void {
    if (this.suspended) return;
    const id = keyIdOf(e);
    const actions = this.actionsFor(id);
    if (actions.length === 0) return;
    // Space でのスクロールや矢印キーでのページ移動を止める
    e.preventDefault();
    if (e.repeat) return;
    this.down.add(id);
    actions.forEach((a) => this.pending.add(a));
  }

  private actionsFor(code: string): Action[] {
    return ACTIONS.filter((a) => this.settings.keys[a].includes(code));
  }

  poll(): InputFrame {
    const frame = emptyFrame();
    if (this.suspended) {
      this.pending.clear();
      return frame;
    }
    for (const code of this.down) this.actionsFor(code).forEach((a) => frame.held.add(a));
    frame.pressed = this.pending;
    // 押してすぐ離したキーも、そのフレームでは押されている扱いにする
    this.pending.forEach((a) => frame.held.add(a));
    this.pending = new Set();
    return frame;
  }
}
