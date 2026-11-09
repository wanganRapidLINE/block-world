import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, padName } from '../src/input/bindings';
import { activePad, GamepadSource, padStyleOf, positionButtons, toPosition } from '../src/input/gamepad';

const DS4 = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)';
const DS4_TOUCHPAD = 'Wireless Controller Touchpad';
const MICRO = '8BitDo Micro gamepad (Vendor: 2dc8 Product: 9020)';
const XBOX = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';

let nextIndex = 0;
function fakePad(id: string, pressed: number[] = [], axes: number[] = [0, 0, 0, 0]): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, i) => ({
    pressed: pressed.includes(i),
    touched: false,
    value: pressed.includes(i) ? 1 : 0,
  }));
  return { id, index: nextIndex++, connected: true, mapping: 'standard', buttons, axes, timestamp: 0 } as unknown as Gamepad;
}

function plugIn(...pads: Gamepad[]): void {
  vi.stubGlobal('navigator', { getGamepads: () => pads });
}

afterEach(() => vi.unstubAllGlobals());

describe('8BitDo の A/B 入れ替え', () => {
  it('8BitDo は 0⇔1・2⇔3 を入れ替え、それ以外の番号はそのまま', () => {
    expect([0, 1, 2, 3, 4, 9, 12].map((i) => toPosition(MICRO, i))).toEqual([1, 0, 3, 2, 4, 9, 12]);
  });

  it('DS4 は入れ替えない', () => {
    expect([0, 1, 2, 3].map((i) => toPosition(DS4, i))).toEqual([0, 1, 2, 3]);
  });

  it('8BitDo の A（生の番号0＝右の位置）で右回転になる', () => {
    const s = defaultSettings();
    plugIn(fakePad(MICRO, [0]));
    const f = new GamepadSource(s).poll();
    expect([...f.pressed]).toEqual(['rotateCW']);
  });
});

describe('十字キーがハットスイッチで届く場合', () => {
  const hat = (v: number) => [0, 0, 0, 0, 0, 0, 0, 0, 0, v];

  it('中立値を見る前は読まない（トリガーの -1 を「上」と誤読しない）', () => {
    expect(positionButtons(fakePad('hat-test-1', [], hat(-1)))[12]).toBeFalsy();
  });

  it('中立値を見たあとは 上・右下・左 を十字キーとして読む', () => {
    positionButtons(fakePad('hat-test-2', [], hat(3.2857)));
    const at = (v: number) => positionButtons(fakePad('hat-test-2', [], hat(v)));
    expect(at(-1)[12]).toBe(true); // 上
    expect(at(-1 + 3 * (2 / 7))).toMatchObject({ 13: true, 15: true }); // 右下
    expect(at(-1 + 6 * (2 / 7))[14]).toBe(true); // 左
  });
});

describe('使っているパッドの選択', () => {
  it('DS4 のタッチパッドより本体を優先する', () => {
    const touchpad = fakePad(DS4_TOUCHPAD);
    const ds4 = fakePad(DS4);
    plugIn(touchpad, ds4);
    expect(activePad()?.id).toBe(DS4);
  });

  it('あとからボタンを押したパッドに切り替わる', () => {
    const ds4 = fakePad(DS4);
    const micro = fakePad(MICRO, [1]);
    plugIn(ds4, micro);
    expect(activePad()?.id).toBe(MICRO);
  });
});

describe('ボタンの表記', () => {
  it('パッドの種類を見分ける', () => {
    expect(padStyleOf(DS4)).toBe('ps');
    expect(padStyleOf(MICRO)).toBe('nin');
    expect(padStyleOf(XBOX)).toBe('xbox');
    expect(padStyleOf('Generic USB Joystick')).toBe('xbox');
    expect(padStyleOf(null)).toBe('none');
  });

  it('右回転（位置=右）の名前がパッドに合う', () => {
    const cw = defaultSettings().pad.rotateCW[0];
    expect(padName(cw, 'ps')).toBe('○');
    expect(padName(cw, 'nin')).toBe('A');
    expect(padName(cw, 'xbox')).toBe('B');
    expect(padName(cw)).toBe('右ボタン(○/A)');
  });
});
