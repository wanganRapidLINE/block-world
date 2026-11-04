import { ACTIONS, emptyFrame, type Action, type InputFrame, type InputSource } from './actions';

/** 画面上の仮想ボタン（data-action 属性を持つ要素）からの入力 */
export class TouchSource implements InputSource {
  /** pointerId → 押しているアクション */
  private readonly pointers = new Map<number, Action>();
  private pending = new Set<Action>();

  constructor(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
      const action = el.dataset.action as Action;
      if (!ACTIONS.includes(action)) return;

      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, action);
        this.pending.add(action);
        el.classList.add('active');
      });
      const release = (e: PointerEvent) => {
        if (this.pointers.get(e.pointerId) !== action) return;
        this.pointers.delete(e.pointerId);
        if (![...this.pointers.values()].includes(action)) el.classList.remove('active');
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  poll(): InputFrame {
    const frame = emptyFrame();
    this.pointers.forEach((a) => frame.held.add(a));
    frame.pressed = this.pending;
    this.pending.forEach((a) => frame.held.add(a));
    this.pending = new Set();
    return frame;
  }
}
