export const ACTIONS = [
  'left',
  'right',
  'softDrop',
  'hardDrop',
  'rotateCW',
  'rotateCCW',
  'hold',
  'pause',
] as const;

export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  left: '左移動',
  right: '右移動',
  softDrop: 'ソフトドロップ',
  hardDrop: 'ハードドロップ',
  rotateCW: '右回転',
  rotateCCW: '左回転',
  hold: 'HOLD',
  pause: 'ポーズ / 決定',
};

export interface InputFrame {
  /** 押しっぱなしのアクション */
  held: Set<Action>;
  /** このフレームで新たに押されたアクション */
  pressed: Set<Action>;
}

export interface InputSource {
  poll(): InputFrame;
}

export function emptyFrame(): InputFrame {
  return { held: new Set(), pressed: new Set() };
}

/** 複数の入力元（キーボード・パッド・タッチ）をまとめる */
export class InputHub {
  constructor(private readonly sources: InputSource[]) {}

  poll(): InputFrame {
    const out = emptyFrame();
    for (const s of this.sources) {
      const f = s.poll();
      f.held.forEach((a) => out.held.add(a));
      f.pressed.forEach((a) => out.pressed.add(a));
    }
    return out;
  }
}
