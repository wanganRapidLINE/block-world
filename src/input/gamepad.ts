import { ACTIONS, emptyFrame, type Action, type InputFrame, type InputSource } from './actions';
import type { PadBinding, Settings } from './bindings';

export const AXIS_THRESHOLD = 0.5;
const BUTTON_THRESHOLD = 0.5;

/** 接続中のゲームパッド一覧（null を除く） */
export function connectedPads(): Gamepad[] {
  if (!navigator.getGamepads) return [];
  return navigator.getGamepads().filter((p): p is Gamepad => p !== null && p.connected);
}

export function isBindingActive(pad: Gamepad, b: PadBinding): boolean {
  if (b.kind === 'button') {
    const button = pad.buttons[b.index];
    return !!button && (button.pressed || button.value > BUTTON_THRESHOLD);
  }
  const v = pad.axes[b.index];
  return v !== undefined && v * b.dir > AXIS_THRESHOLD;
}

/** Gamepad API は毎フレーム状態を読みに行く方式 */
export class GamepadSource implements InputSource {
  private prevHeld = new Set<Action>();
  suspended = false;

  constructor(private readonly settings: Settings) {}

  poll(): InputFrame {
    const frame = emptyFrame();
    if (this.suspended) {
      this.prevHeld.clear();
      return frame;
    }
    for (const pad of connectedPads()) {
      for (const a of ACTIONS) {
        if (this.settings.pad[a].some((b) => isBindingActive(pad, b))) frame.held.add(a);
      }
    }
    frame.held.forEach((a) => {
      if (!this.prevHeld.has(a)) frame.pressed.add(a);
    });
    this.prevHeld = new Set(frame.held);
    return frame;
  }
}
