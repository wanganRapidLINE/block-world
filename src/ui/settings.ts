import { ACTION_LABELS, ACTIONS, type Action } from '../input/actions';
import {
  defaultSettings,
  keyIdOf,
  keyName,
  padName,
  saveSettings,
  type PadBinding,
  type Settings,
  type TouchPadMode,
} from '../input/bindings';
import { activePad, connectedPads, is8BitDo, padStyleOf, positionButtons, type PadStyle } from '../input/gamepad';

const CAPTURE_TIMEOUT_MS = 8000;

export interface SettingsHooks {
  /** 開いている間は通常の入力を止める */
  onOpenChange(open: boolean): void;
  /** DAS/ARR・仮想パッドなどが変わった */
  onChange(): void;
  /** 効果音の音量を動かしたときの試し鳴らし */
  onSfxPreview(): void;
}

/**
 * キーコンフィグ画面。
 * settings オブジェクトをその場で書き換える（入力側は同じオブジェクトを参照している）。
 */
export class SettingsScreen {
  private readonly root = el<HTMLDivElement>('settings');
  private readonly table = el<HTMLTableElement>('bind-table');
  private readonly das = el<HTMLInputElement>('das');
  private readonly arr = el<HTMLInputElement>('arr');
  private readonly bgmEnabled = el<HTMLInputElement>('bgm-enabled');
  private readonly bgmVolume = el<HTMLInputElement>('bgm-volume');
  private readonly sfxEnabled = el<HTMLInputElement>('sfx-enabled');
  private readonly sfxVolume = el<HTMLInputElement>('sfx-volume');
  private readonly touchMode = el<HTMLSelectElement>('touchpad-mode');
  private readonly captureMsg = el<HTMLDivElement>('capture-msg');
  private readonly padStatus = el<HTMLDivElement>('pad-status');
  private cancelCapture: (() => void) | null = null;
  private statusTimer = 0;
  /** ボタン名の表記（使っているパッドに合わせる） */
  private style: PadStyle = 'none';

  constructor(
    private readonly settings: Settings,
    private readonly hooks: SettingsHooks,
  ) {
    this.das.addEventListener('input', () => {
      settings.dasMs = Number(this.das.value);
      this.commit();
    });
    this.arr.addEventListener('input', () => {
      settings.arrMs = Number(this.arr.value);
      this.commit();
    });
    this.bgmEnabled.addEventListener('change', () => {
      settings.bgmEnabled = this.bgmEnabled.checked;
      this.commit();
    });
    this.bgmVolume.addEventListener('input', () => {
      settings.bgmVolume = Number(this.bgmVolume.value);
      this.commit();
    });
    this.sfxEnabled.addEventListener('change', () => {
      settings.sfxEnabled = this.sfxEnabled.checked;
      this.commit();
    });
    this.sfxVolume.addEventListener('input', () => {
      settings.sfxVolume = Number(this.sfxVolume.value);
      this.commit();
      this.hooks.onSfxPreview();
    });
    this.touchMode.addEventListener('change', () => {
      settings.touchPad = this.touchMode.value as TouchPadMode;
      this.commit();
    });
    el('settings-reset').addEventListener('click', () => {
      Object.assign(settings, defaultSettings());
      this.commit();
    });
    el('settings-close').addEventListener('click', () => this.close());
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.root.hidden = false;
    this.render();
    this.updatePadStatus();
    this.statusTimer = window.setInterval(() => this.updatePadStatus(), 1000);
    this.hooks.onOpenChange(true);
  }

  close(): void {
    this.cancelCapture?.();
    window.clearInterval(this.statusTimer);
    this.root.hidden = true;
    this.hooks.onOpenChange(false);
  }

  private commit(): void {
    saveSettings(this.settings);
    this.render();
    this.hooks.onChange();
  }

  private render(): void {
    const s = this.settings;
    this.das.value = String(s.dasMs);
    this.arr.value = String(s.arrMs);
    el('das-val').textContent = `${s.dasMs} ms`;
    el('arr-val').textContent = `${s.arrMs} ms`;
    this.bgmEnabled.checked = s.bgmEnabled;
    this.bgmVolume.disabled = !s.bgmEnabled;
    this.bgmVolume.value = String(s.bgmVolume);
    el('bgm-volume-val').textContent = `${s.bgmVolume}`;
    this.sfxEnabled.checked = s.sfxEnabled;
    this.sfxVolume.disabled = !s.sfxEnabled;
    this.sfxVolume.value = String(s.sfxVolume);
    el('sfx-volume-val').textContent = `${s.sfxVolume}`;
    this.touchMode.value = s.touchPad;

    this.table.replaceChildren();
    const head = this.table.insertRow();
    for (const t of ['操作', 'キーボード', 'ゲームパッド']) {
      const th = document.createElement('th');
      th.textContent = t;
      head.appendChild(th);
    }
    for (const action of ACTIONS) {
      const row = this.table.insertRow();
      row.insertCell().textContent = ACTION_LABELS[action];
      row.insertCell().appendChild(
        this.chipList(
          s.keys[action].map(keyName),
          (i) => s.keys[action].splice(i, 1),
          () => this.captureKey(action),
        ),
      );
      row.insertCell().appendChild(
        this.chipList(
          s.pad[action].map((b) => padName(b, this.style)),
          (i) => s.pad[action].splice(i, 1),
          () => this.capturePad(action),
        ),
      );
    }
  }

  private chipList(names: string[], remove: (i: number) => void, add: () => void): HTMLElement {
    const box = document.createElement('div');
    box.className = 'chips';
    names.forEach((name, i) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = name;
      b.title = 'クリックで削除';
      b.addEventListener('click', () => {
        remove(i);
        this.commit();
      });
      box.appendChild(b);
    });
    const plus = document.createElement('button');
    plus.className = 'chip add';
    plus.textContent = '＋';
    plus.addEventListener('click', add);
    box.appendChild(plus);
    return box;
  }

  // ─── 割り当ての取得 ───

  private showCapture(text: string): void {
    this.captureMsg.textContent = text;
    this.captureMsg.hidden = false;
  }

  private endCapture(): void {
    this.captureMsg.hidden = true;
    this.cancelCapture = null;
  }

  private captureKey(action: Action): void {
    this.cancelCapture?.();
    this.showCapture(`「${ACTION_LABELS[action]}」に割り当てるキーを押してください（Escでキャンセル）`);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      if (e.code === 'Escape') return;
      const id = keyIdOf(e);
      if (!this.settings.keys[action].includes(id)) this.settings.keys[action].push(id);
      this.commit();
    };
    const timer = window.setTimeout(() => cleanup(), CAPTURE_TIMEOUT_MS);
    const cleanup = () => {
      window.removeEventListener('keydown', onKey, true);
      window.clearTimeout(timer);
      this.endCapture();
    };
    window.addEventListener('keydown', onKey, true);
    this.cancelCapture = cleanup;
  }

  private capturePad(action: Action): void {
    this.cancelCapture?.();
    if (connectedPads().length === 0) {
      this.showCapture('ゲームパッドが見つかりません。パッドのボタンを一度押してから、もう一度「＋」を押してください');
      const t = window.setTimeout(() => this.endCapture(), 4000);
      this.cancelCapture = () => {
        window.clearTimeout(t);
        this.endCapture();
      };
      return;
    }
    this.showCapture(`「${ACTION_LABELS[action]}」に割り当てるパッドのボタンを押してください`);

    // 押しっぱなしのボタンやスティックの初期位置を拾わないよう、開始時点の状態を覚えておく
    const baseline = new Map(connectedPads().map((p) => [p.index, snapshot(p)]));
    const started = performance.now();
    let raf = 0;
    const tick = () => {
      if (performance.now() - started > CAPTURE_TIMEOUT_MS) return cleanup();
      for (const pad of connectedPads()) {
        const found = detectNewInput(pad, baseline.get(pad.index));
        if (found) {
          cleanup();
          const list = this.settings.pad[action];
          if (!list.some((b) => samePad(b, found))) list.push(found);
          this.commit();
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    const cleanup = () => {
      cancelAnimationFrame(raf);
      this.endCapture();
    };
    this.cancelCapture = cleanup;
    raf = requestAnimationFrame(tick);
  }

  private updatePadStatus(): void {
    // 使っているパッドが変わったら、ボタン名をそのパッドの表記で出し直す
    const style = padStyleOf(activePad()?.id);
    if (style !== this.style) {
      this.style = style;
      this.render();
    }
    const pads = connectedPads();
    if (pads.length === 0) {
      this.padStatus.textContent = 'ゲームパッド: 未検出（接続済みなら、どれかボタンを押すと認識されます）';
      this.padStatus.className = 'note';
      return;
    }
    const nonStandard = pads.some((p) => p.mapping !== 'standard');
    this.padStatus.textContent =
      pads
        .map(
          (p) =>
            `ゲームパッド: ${p.id}（${p.mapping === 'standard' ? '標準配置' : '独自配置'}` +
            `${is8BitDo(p.id) ? '・A/Bの位置に合わせて自動で入れ替え' : ''}）`,
        )
        .join('\n') +
      (nonStandard ? '\n独自配置のパッドは初期の割り当てどおりに動かないことがあります。ボタンを割り当て直してください。' : '');
    this.padStatus.className = nonStandard ? 'note warn' : 'note';
  }
}

interface PadSnapshot {
  buttons: boolean[];
  axes: number[];
}

// ボタンは位置基準（8BitDo の入れ替え・ハットスイッチ反映済み）で比べる
function snapshot(p: Gamepad): PadSnapshot {
  return { buttons: positionButtons(p), axes: [...p.axes] };
}

function detectNewInput(pad: Gamepad, base: PadSnapshot | undefined): PadBinding | null {
  const buttons = positionButtons(pad);
  for (let i = 0; i < buttons.length; i++) {
    if (buttons[i] && !base?.buttons[i]) return { kind: 'button', index: i };
  }
  for (let i = 0; i < pad.axes.length; i++) {
    if (i === 9 && buttons.some((on, j) => on && j >= 12 && j <= 15)) continue; // ハットスイッチは十字キーとして拾う
    const v = pad.axes[i];
    const b0 = base?.axes[i] ?? 0;
    if (Math.abs(v) > 0.6 && Math.abs(v - b0) > 0.6) return { kind: 'axis', index: i, dir: v > 0 ? 1 : -1 };
  }
  return null;
}

function samePad(a: PadBinding, b: PadBinding): boolean {
  if (a.kind === 'button' && b.kind === 'button') return a.index === b.index;
  if (a.kind === 'axis' && b.kind === 'axis') return a.index === b.index && a.dir === b.dir;
  return false;
}

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
