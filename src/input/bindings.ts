import { MAX_LEVEL } from '../core/game';
import { ACTIONS, type Action } from './actions';

export type PadBinding =
  | { kind: 'button'; index: number }
  | { kind: 'axis'; index: number; dir: 1 | -1 };

export type TouchPadMode = 'auto' | 'show' | 'hide';

/** marathon: 150ラインでクリア / endless: 終わりなし */
export type GameMode = 'marathon' | 'endless';

export interface Settings {
  /** キーの識別子（keyIdOf）の配列 */
  keys: Record<Action, string[]>;
  pad: Record<Action, PadBinding[]>;
  dasMs: number;
  arrMs: number;
  touchPad: TouchPadMode;
  /** BGMを流すか（OFFなら自分の好きな音楽をかけながら遊べる） */
  bgmEnabled: boolean;
  /** BGMの音量 0〜100（0で無音） */
  bgmVolume: number;
  sfxEnabled: boolean;
  /** 効果音の音量 0〜100 */
  sfxVolume: number;
  /** 最後に選んだモード */
  mode: GameMode;
  /** エンドレスの開始レベル 1〜15 */
  startLevel: number;
  /** 隠しモード 20G を解放したか（タイトル画面を20回タップ） */
  g20Unlocked: boolean;
  /** 20G で遊ぶか */
  g20: boolean;
}

const btn = (index: number): PadBinding => ({ kind: 'button', index });
const axis = (index: number, dir: 1 | -1): PadBinding => ({ kind: 'axis', index, dir });

// ゲームパッドは standard mapping の番号
// 0=下(×/B) 1=右(○/A) 2=左(□/Y) 3=上(△/X) 4=L1 5=R1 9=Options/+ 12〜15=十字キー上下左右
export function defaultSettings(): Settings {
  return {
    keys: {
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      softDrop: ['ArrowDown', 'KeyS'],
      hardDrop: ['ArrowUp', 'KeyW'],
      rotateCW: ['Space', 'KeyJ'],
      rotateCCW: ['KeyK'],
      hold: ['KeyU', 'ShiftLeft', 'ShiftRight'],
      pause: ['KeyP', 'Escape', 'Enter'],
    },
    pad: {
      left: [btn(14), axis(0, -1)],
      right: [btn(15), axis(0, 1)],
      softDrop: [btn(13), axis(1, 1)],
      hardDrop: [btn(12), axis(1, -1)],
      rotateCW: [btn(1)],
      rotateCCW: [btn(0)],
      hold: [btn(4), btn(5)],
      pause: [btn(9)],
    },
    dasMs: 167,
    arrMs: 33,
    touchPad: 'auto',
    bgmEnabled: true,
    bgmVolume: 60,
    sfxEnabled: true,
    sfxVolume: 60,
    mode: 'marathon',
    startLevel: 1,
    g20Unlocked: false,
    g20: false,
  };
}

const STORAGE_KEY = 'tetris-world.settings.v1';

/** 保存済みの設定を読む。壊れていたり読めなかったりしたら初期値 */
export function loadSettings(): Settings {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Settings>;
    for (const a of ACTIONS) {
      if (Array.isArray(saved.keys?.[a])) base.keys[a] = saved.keys[a].filter((k) => typeof k === 'string');
      if (Array.isArray(saved.pad?.[a])) base.pad[a] = saved.pad[a].filter(isPadBinding);
    }
    if (isValidMs(saved.dasMs)) base.dasMs = saved.dasMs;
    if (isValidMs(saved.arrMs)) base.arrMs = saved.arrMs;
    if (typeof saved.bgmEnabled === 'boolean') base.bgmEnabled = saved.bgmEnabled;
    if (typeof saved.sfxEnabled === 'boolean') base.sfxEnabled = saved.sfxEnabled;
    if (typeof saved.sfxVolume === 'number' && saved.sfxVolume >= 0 && saved.sfxVolume <= 100) {
      base.sfxVolume = saved.sfxVolume;
    }
    if (typeof saved.bgmVolume === 'number' && saved.bgmVolume >= 0 && saved.bgmVolume <= 100) {
      base.bgmVolume = saved.bgmVolume;
    }
    if (saved.mode === 'marathon' || saved.mode === 'endless') base.mode = saved.mode;
    if (Number.isInteger(saved.startLevel) && saved.startLevel! >= 1 && saved.startLevel! <= MAX_LEVEL) {
      base.startLevel = saved.startLevel!;
    }
    if (saved.g20Unlocked === true) {
      base.g20Unlocked = true;
      base.g20 = saved.g20 === true;
    }
    if (saved.touchPad === 'auto' || saved.touchPad === 'show' || saved.touchPad === 'hide') {
      base.touchPad = saved.touchPad;
    }
  } catch {
    // 読めなければ初期値のまま
  }
  return base;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // 保存できない環境（プライベートモード等）でも遊べるようにする
  }
}

function isValidMs(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000;
}

function isPadBinding(v: unknown): v is PadBinding {
  if (typeof v !== 'object' || v === null) return false;
  const b = v as PadBinding;
  if (b.kind === 'button') return Number.isInteger(b.index);
  if (b.kind === 'axis') return Number.isInteger(b.index) && (b.dir === 1 || b.dir === -1);
  return false;
}

/**
 * 割り当てに使うキーの識別子。基本は物理キー位置の KeyboardEvent.code。
 * Android でコントローラーをキーボードモードでつないだ場合など code が取れないときは key で代用する。
 */
export function keyIdOf(e: KeyboardEvent): string {
  return e.code && e.code !== 'Unidentified' ? e.code : `key=${e.key}`;
}

// ─── 表示用の名前 ───

const KEY_NAMES: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Space: 'Space',
  ShiftLeft: '左Shift',
  ShiftRight: '右Shift',
  ControlLeft: '左Ctrl',
  ControlRight: '右Ctrl',
  AltLeft: '左Alt',
  AltRight: '右Alt',
  Escape: 'Esc',
  Enter: 'Enter',
};

export function keyName(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('key=')) return code.slice(4);
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `テンキー${code.slice(6)}`;
  return code;
}

const BUTTON_NAMES: Record<number, string> = {
  0: '下ボタン(×/B)',
  1: '右ボタン(○/A)',
  2: '左ボタン(□/Y)',
  3: '上ボタン(△/X)',
  4: 'L1',
  5: 'R1',
  6: 'L2',
  7: 'R2',
  8: 'Share/−',
  9: 'Options/+',
  10: 'L3',
  11: 'R3',
  12: '十字↑',
  13: '十字↓',
  14: '十字←',
  15: '十字→',
  16: 'PS/Home',
};

export function padName(b: PadBinding): string {
  if (b.kind === 'button') return BUTTON_NAMES[b.index] ?? `ボタン${b.index}`;
  const stick = b.index <= 1 ? '左スティック' : b.index <= 3 ? '右スティック' : `軸${b.index}`;
  const dirName =
    b.index % 2 === 0 ? (b.dir < 0 ? '←' : '→') : b.dir < 0 ? '↑' : '↓';
  return `${stick}${dirName}`;
}
