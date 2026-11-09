import { ACTIONS, emptyFrame, type Action, type InputFrame, type InputSource } from './actions';
import type { PadBinding, Settings } from './bindings';

export const AXIS_THRESHOLD = 0.5;
const BUTTON_THRESHOLD = 0.5;

/** 接続中のゲームパッド一覧（null を除く） */
export function connectedPads(): Gamepad[] {
  if (!navigator.getGamepads) return [];
  return navigator.getGamepads().filter((p): p is Gamepad => p !== null && p.connected);
}

/** Android は DS4 のタッチパッドを別のゲームパッドとして登録する。操作には使わない */
const isTouchpad = (p: Gamepad) => /touchpad/i.test(p.id);

/** 8BitDo 製か（ベンダーID 2dc8） */
export const is8BitDo = (id: string) => /8bitdo|2dc8/i.test(id);

// ─── 実際に使っているパッドの選択 ───

let activeIndex = -1;

const rawPressed = (b: GamepadButton | undefined) => !!b && (b.pressed || b.value > BUTTON_THRESHOLD);

function isBusy(p: Gamepad): boolean {
  return p.buttons.some(rawPressed) || Math.abs(p.axes[0] ?? 0) > AXIS_THRESHOLD || Math.abs(p.axes[1] ?? 0) > AXIS_THRESHOLD;
}

/**
 * 操作に使うパッド。複数つながっているときは、最後にボタンやスティックを動かしたパッドを選ぶ。
 * まだ何も触っていなければタッチパッド以外を優先する。
 */
export function activePad(): Gamepad | null {
  const pads = connectedPads();
  if (pads.length === 0) return null;
  for (const p of pads) {
    if (p.index !== activeIndex && !isTouchpad(p) && isBusy(p)) {
      activeIndex = p.index;
      break;
    }
  }
  return pads.find((p) => p.index === activeIndex) ?? pads.find((p) => !isTouchpad(p)) ?? pads[0];
}

// ─── ボタンの読み取り（位置基準に揃える） ───

/**
 * 8BitDo は印字どおりの番号を送ってくる（右のA=0、下のB=1、上のX=2、左のY=3）。
 * standard mapping の位置基準（下=0、右=1、左=2、上=3）に揃えるため 0⇔1、2⇔3 を入れ替える。
 * 入れ替えは自分自身の逆なので、生の番号→位置、位置→生の番号のどちらにも使える。
 */
export function toPosition(id: string, index: number): number {
  if (!is8BitDo(id) || index > 3) return index;
  return index ^ 1;
}

/** 十字キーがハットスイッチ（軸9、-1〜1を 2/7 刻み）で届くパッド用。中立値（約3.29）を一度見るまでは読まない */
const hatSeen = new Set<string>();

/** ハットスイッチの向き → 十字キーのボタン番号（上12 下13 左14 右15） */
function hatButtons(p: Gamepad): number[] {
  const v = p.axes[9];
  if (v === undefined) return [];
  if (v > 1.05) {
    hatSeen.add(p.id);
    return [];
  }
  if (!hatSeen.has(p.id)) return [];
  const k = Math.round((v + 1) * 3.5); // 0..7 = 上, 右上, 右, 右下, 下, 左下, 左, 左上
  if (Math.abs((v + 1) * 3.5 - k) > 0.2) return [];
  return ([[12], [12, 15], [15], [13, 15], [13], [13, 14], [14], [12, 14]] as number[][])[k] ?? [];
}

/** 位置基準のボタン状態（8BitDo の入れ替えとハットスイッチを反映済み） */
export function positionButtons(p: Gamepad): boolean[] {
  const out: boolean[] = [];
  p.buttons.forEach((b, i) => {
    if (rawPressed(b)) out[toPosition(p.id, i)] = true;
  });
  for (const i of hatButtons(p)) out[i] = true;
  return out;
}

export function isBindingActive(pad: Gamepad, b: PadBinding, buttons = positionButtons(pad)): boolean {
  if (b.kind === 'button') return !!buttons[b.index];
  const v = pad.axes[b.index];
  return v !== undefined && v * b.dir > AXIS_THRESHOLD;
}

// ─── ボタン表示 ───

/** PS: ○×□△ / nin: 8BitDo・Nintendo の ABXY / xbox: Xbox とその他 / none: パッドなし */
export type PadStyle = 'ps' | 'nin' | 'xbox' | 'none';

export function padStyleOf(id: string | null | undefined): PadStyle {
  if (!id) return 'none';
  if (/xbox|045e|xinput/i.test(id)) return 'xbox';
  if (/054c|sony|wireless controller|dualshock|dualsense/i.test(id)) return 'ps';
  if (/8bitdo|2dc8|057e|nintendo|switch|pro controller|joy-con/i.test(id)) return 'nin';
  return 'xbox';
}

/** Gamepad API は毎フレーム状態を読みに行く方式 */
export class GamepadSource implements InputSource {
  private prevHeld = new Set<Action>();
  private lastId: string | null = null;
  suspended = false;
  /** 操作に使うパッドが変わったとき（つないだ・外した・持ち替えた） */
  onPadChange: ((pad: Gamepad | null) => void) | null = null;

  constructor(private readonly settings: Settings) {}

  poll(): InputFrame {
    const frame = emptyFrame();
    const pad = activePad();
    const id = pad?.id ?? null;
    if (id !== this.lastId) {
      this.lastId = id;
      this.prevHeld.clear();
      this.onPadChange?.(pad);
    }
    if (this.suspended || !pad) {
      this.prevHeld.clear();
      return frame;
    }
    const buttons = positionButtons(pad);
    for (const a of ACTIONS) {
      if (this.settings.pad[a].some((b) => isBindingActive(pad, b, buttons))) frame.held.add(a);
    }
    frame.held.forEach((a) => {
      if (!this.prevHeld.has(a)) frame.pressed.add(a);
    });
    this.prevHeld = new Set(frame.held);
    return frame;
  }
}
