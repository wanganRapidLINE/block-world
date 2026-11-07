import './style.css';
import { Bgm } from './audio/bgm';
import { Sfx } from './audio/sfx';
import { Game, MARATHON_LINES, MAX_LEVEL } from './core/game';
import { InputHub, type InputFrame } from './input/actions';
import { loadSettings, saveSettings, type GameMode } from './input/bindings';
import { HorizontalRepeater } from './input/das';
import { connectedPads, GamepadSource } from './input/gamepad';
import { KeyboardSource } from './input/keyboard';
import { TouchSource } from './input/touch';
import { Renderer } from './render/renderer';
import { SettingsScreen } from './ui/settings';

type Screen = 'title' | 'playing' | 'paused' | 'gameover' | 'cleared';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const stage = $('stage');
const overlay = $('overlay');
const overlayTitle = $('overlay-title');
const overlaySub = $('overlay-sub');
const overlayButtons = $('overlay-buttons');
const overlayHint = $('overlay-hint');
const touchpad = $('touchpad');
const toast = $('toast');

const settings = loadSettings();
const keyboard = new KeyboardSource(settings);
const gamepad = new GamepadSource(settings);
const touch = new TouchSource(touchpad);
const input = new InputHub([keyboard, gamepad, touch]);
const repeater = new HorizontalRepeater(settings.dasMs, settings.arrMs);
const renderer = new Renderer($<HTMLCanvasElement>('screen'));
const bgm = new Bgm();
bgm.setVolume(settings.bgmVolume);
bgm.setEnabled(settings.bgmEnabled);
const sfx = new Sfx();
sfx.setVolume(settings.sfxVolume);
sfx.setEnabled(settings.sfxEnabled);

let game: Game | null = null;
let screen: Screen = 'title';

const settingsScreen = new SettingsScreen(settings, {
  onOpenChange(open) {
    keyboard.suspended = open;
    gamepad.suspended = open;
  },
  onChange() {
    repeater.dasMs = settings.dasMs;
    repeater.arrMs = settings.arrMs;
    bgm.setVolume(settings.bgmVolume);
    bgm.setEnabled(settings.bgmEnabled);
    sfx.setVolume(settings.sfxVolume);
    sfx.setEnabled(settings.sfxEnabled);
    updateTouchpad();
  },
  onSfxPreview() {
    sfx.playEvents([{ type: 'rotate' }]);
  },
});

// ─── 画面遷移 ───

interface MenuButton {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

function showOverlay(title: string, sub: string, buttons: MenuButton[]): void {
  overlayTitle.textContent = title;
  overlayHint.textContent =
    screen === 'title'
      ? '十字キー左右でモード、上下で開始レベル（エンドレス）\nEnter / Options(+)ボタン で開始'
      : 'Enter / Options(+)ボタン でも決定できます';
  overlaySub.textContent = sub;
  overlayButtons.replaceChildren(
    ...buttons.map((b) => {
      const el = document.createElement('button');
      el.textContent = b.label;
      if (b.primary) el.className = 'primary';
      el.addEventListener('click', b.onClick);
      return el;
    }),
  );
  overlay.hidden = false;
}

const settingsButton: MenuButton = { label: '設定', onClick: () => settingsScreen.open() };

const MODES: { mode: GameMode; label: string }[] = [
  { mode: 'marathon', label: `マラソン（${MARATHON_LINES}L）` },
  { mode: 'endless', label: 'エンドレス' },
];

/**
 * タイトル画面: [モード切替] [開始レベル] [スタート] [設定] [全画面]
 * モードのボタンは選ぶだけで、ゲームは「スタート」で始める
 */
function toTitle(): void {
  screen = 'title';
  const buttons: MenuButton[] = [{ label: 'スタート', primary: true, onClick: () => startGame() }, settingsButton];
  if (document.fullscreenEnabled && !document.fullscreenElement) {
    buttons.push({ label: '全画面にする', onClick: () => void document.documentElement.requestFullscreen().catch(() => {}) });
  }
  showOverlay('BLOCK WORLD', '', buttons);
  overlayButtons.prepend(modeSelector(), levelSelector());
}

/** 「マラソン｜エンドレス」の切り替え */
function modeSelector(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'mode-row';
  for (const m of MODES) {
    const b = document.createElement('button');
    b.textContent = m.label;
    b.setAttribute('aria-pressed', String(m.mode === settings.mode));
    b.addEventListener('click', () => setMode(m.mode));
    row.append(b);
  }
  return row;
}

/** 「開始レベル − 5 ＋」の行。マラソンは必ずレベル1からなので、薄くして操作できなくする */
function levelSelector(): HTMLElement {
  const endless = settings.mode === 'endless';
  const row = document.createElement('div');
  row.className = 'level-row';
  row.classList.toggle('disabled', !endless);
  const minus = document.createElement('button');
  minus.textContent = '−';
  minus.setAttribute('aria-label', '開始レベルを下げる');
  minus.addEventListener('click', () => changeStartLevel(-1));
  const plus = document.createElement('button');
  plus.textContent = '＋';
  plus.setAttribute('aria-label', '開始レベルを上げる');
  plus.addEventListener('click', () => changeStartLevel(1));
  minus.disabled = plus.disabled = !endless;
  const label = document.createElement('span');
  label.textContent = `開始レベル ${endless ? settings.startLevel : 1}`;
  row.append(minus, label, plus);
  return row;
}

function setMode(mode: GameMode): void {
  settings.mode = mode;
  saveSettings(settings);
  toTitle();
}

/** 開始レベルを上下する（1〜15。端まで行ったら反対側へ回る） */
function changeStartLevel(dir: number): void {
  settings.startLevel = ((settings.startLevel - 1 + dir + MAX_LEVEL) % MAX_LEVEL) + 1;
  saveSettings(settings);
  toTitle();
}

/** タイトル画面で十字キー左右（←→キー）を押したらモードを切り替える */
function cycleMode(dir: number): void {
  const i = MODES.findIndex((m) => m.mode === settings.mode);
  setMode(MODES[(i + dir + MODES.length) % MODES.length].mode);
}

/** 分:秒.1/100秒 */
function formatTime(ms: number): string {
  const cs = Math.floor(ms / 10);
  const m = Math.floor(cs / 6000);
  const sec = Math.floor((cs % 6000) / 100);
  return `${m}:${String(sec).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

function startGame(): void {
  const mode = settings.mode;
  game =
    mode === 'marathon'
      ? new Game({ goalLines: MARATHON_LINES })
      : new Game({ goalLines: null, startLevel: settings.startLevel });
  // 開発サーバーのときだけ、動作確認用にゲームを外から触れるようにする（本番ビルドには含まれない）
  if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
  repeater.reset();
  screen = 'playing';
  overlay.hidden = true;
  bgm.start();
  void requestWakeLock();
}

function pauseGame(): void {
  if (screen !== 'playing') return;
  screen = 'paused';
  game?.setSoftDrop(false);
  bgm.pause();
  showOverlay('PAUSE', '', [
    { label: '再開', primary: true, onClick: resumeGame },
    { label: '最初からやり直す', onClick: () => startGame() },
    { label: 'タイトルへ', onClick: toTitle },
    settingsButton,
  ]);
}

function resumeGame(): void {
  if (screen !== 'paused') return;
  screen = 'playing';
  repeater.reset();
  overlay.hidden = true;
  bgm.resume();
  void requestWakeLock();
}

/** ゲームオーバー・クリアの結果画面 */
function toResult(): void {
  const g = game!;
  const cleared = g.status === 'cleared';
  screen = cleared ? 'cleared' : 'gameover';
  bgm.stop();
  const sub = `SCORE ${g.score}\nLINES ${g.lines} / LEVEL ${g.level}\nTIME ${formatTime(g.playTimeMs)}`;
  showOverlay(cleared ? 'GAME CLEAR' : 'GAME OVER', sub, [
    { label: 'もう一度', primary: true, onClick: () => startGame() },
    { label: 'タイトルへ', onClick: toTitle },
    settingsButton,
  ]);
  void releaseWakeLock();
}

/** オーバーレイ表示中に「ポーズ/決定」が押されたときの動作 */
function confirmAction(): void {
  if (screen === 'title' || screen === 'gameover' || screen === 'cleared') startGame();
  else if (screen === 'paused') resumeGame();
}

// ─── 1フレームの処理 ───

function applyInput(g: Game, f: InputFrame, dt: number): void {
  if (f.pressed.has('pause')) {
    pauseGame();
    return;
  }
  if (f.pressed.has('hold')) g.holdPiece();
  if (f.pressed.has('rotateCW')) g.rotate(1);
  if (f.pressed.has('rotateCCW')) g.rotate(-1);

  const steps = repeater.update(
    dt,
    { left: f.held.has('left'), right: f.held.has('right') },
    { left: f.pressed.has('left'), right: f.pressed.has('right') },
  );
  const dir = Math.sign(steps);
  for (let i = 0; i < Math.abs(steps); i++) {
    if (!g.move(dir)) break;
  }

  g.setSoftDrop(f.held.has('softDrop'));
  if (f.pressed.has('hardDrop')) g.hardDrop();
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(now - last, 100);
  last = now;

  updateTouchpad();
  const f = input.poll();

  if (!settingsScreen.isOpen) {
    if (screen === 'playing' && game) {
      applyInput(game, f, dt);
      if (screen === 'playing') game.update(dt);
      sfx.playEvents(game.drainEvents());
      if (game.status !== 'playing') toResult();
    } else if (f.pressed.has('pause')) {
      confirmAction();
    } else if (screen === 'title' && (f.pressed.has('left') || f.pressed.has('right'))) {
      cycleMode(f.pressed.has('left') ? -1 : 1);
    } else if (screen === 'title' && settings.mode === 'endless' && (f.pressed.has('hardDrop') || f.pressed.has('softDrop'))) {
      // 十字キー上下 = ハードドロップ／ソフトドロップの割り当て
      changeStartLevel(f.pressed.has('hardDrop') ? 1 : -1);
    }
  }

  renderer.draw(game, now);
  requestAnimationFrame(frame);
}

// ─── 画面サイズ・仮想パッド ───

// 横向きでは仮想パッドを左右に重ねるので、フィールドを上に寄せる必要がない（style.css と同じ条件）
const landscapePad = window.matchMedia('(orientation: landscape) and (min-aspect-ratio: 4/3)');
landscapePad.addEventListener('change', () => resize());

function resize(): void {
  const r = stage.getBoundingClientRect();
  renderer.resize(r.width, r.height, !touchpad.hidden && !landscapePad.matches);
  renderer.draw(game, performance.now());
}
new ResizeObserver(resize).observe(stage);

const coarsePointer = window.matchMedia('(pointer: coarse)');
function updateTouchpad(): void {
  const show =
    settings.touchPad === 'show' ||
    (settings.touchPad === 'auto' && coarsePointer.matches && connectedPads().length === 0);
  if (touchpad.hidden === !show) return;
  touchpad.hidden = !show;
  // ResizeObserver が stage の大きさの変化を拾って描き直す
}

// ─── ゲームパッド接続の通知 ───

let toastTimer = 0;
function showToast(text: string, ms = 3500): void {
  toast.textContent = text;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), ms);
}

window.addEventListener('gamepadconnected', (e) => {
  const p = e.gamepad;
  const note = p.mapping === 'standard' ? '' : '\n独自配置のため、設定でボタンを割り当ててください';
  showToast(`ゲームパッド接続: ${p.id}${note}`, note ? 6000 : 3500);
});
window.addEventListener('gamepaddisconnected', () => {
  showToast('ゲームパッドが切断されました');
  pauseGame();
});

// ─── 画面が隠れたら一時停止・スリープ防止 ───

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
  else if (screen === 'playing') void requestWakeLock();
});

let wakeLock: WakeLockSentinel | null = null;
async function requestWakeLock(): Promise<void> {
  // パッドだけで遊ぶと画面に触れないため、スマホが勝手にスリープしないようにする
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch {
    // 非対応・拒否されたときは何もしない
  }
}
async function releaseWakeLock(): Promise<void> {
  try {
    await wakeLock?.release();
  } catch {
    // 何もしない
  }
  wakeLock = null;
}

// ─── 起動 ───

updateTouchpad();
toTitle();
requestAnimationFrame(frame);
