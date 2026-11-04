// bgm/ フォルダの mp3 をファイル名順に並べたプレイリスト。ファイルを足せば自動で曲順に加わる
const TRACKS: string[] = Object.entries(
  import.meta.glob<string>('../../bgm/*.mp3', { eager: true, query: '?url', import: 'default' }),
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

const FADE_OUT_MS = 800;

/**
 * BGM再生。曲はゲーム用のループ素材ではなく「終わりのある曲」なので、
 * 1曲を繰り返さず、終わったら次の曲へ進むプレイリスト方式にしている。
 */
export class Bgm {
  private readonly audio = new Audio();
  private index = -1;
  private volume = 0.6;
  private fadeTimer = 0;
  /** ゲーム側が音楽を鳴らしたい状態か（プレイ中なら true） */
  private wantPlaying = false;
  /**
   * 設定の「BGMを流す」。OFFのときは play() を一切呼ばない。
   * Android ではページが音を鳴らすと、裏で流している音楽アプリが止まってしまうため
   */
  private enabled = true;

  constructor() {
    this.audio.preload = 'auto';
    this.audio.addEventListener('ended', () => this.playTrack(this.index + 1));
    // ブラウザは「画面のクリックやキー入力」の後でないと音を出させてくれない。
    // ゲームパッドのボタンだけで開始した場合に備え、次の操作で鳴らし直す
    const retry = () => {
      if (this.wantPlaying && this.audio.paused) this.tryPlay();
    };
    window.addEventListener('pointerdown', retry);
    window.addEventListener('keydown', retry);
  }

  /** 0〜100。0 で無音 */
  setVolume(percent: number): void {
    this.volume = Math.min(1, Math.max(0, percent / 100));
    if (!this.fadeTimer) this.audio.volume = this.volume;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.clearFade();
      this.audio.pause();
    } else if (this.wantPlaying) {
      this.tryPlay();
    }
  }

  /** 新しいゲームの開始: 次の曲を頭から流す */
  start(): void {
    this.playTrack(this.index + 1);
  }

  pause(): void {
    this.wantPlaying = false;
    this.audio.pause();
  }

  resume(): void {
    if (this.index < 0) return;
    this.wantPlaying = true;
    this.tryPlay();
  }

  /** ゲームオーバー: フェードアウトして止める */
  stop(): void {
    this.wantPlaying = false;
    this.clearFade();
    const from = this.audio.volume;
    const started = performance.now();
    this.fadeTimer = window.setInterval(() => {
      const t = (performance.now() - started) / FADE_OUT_MS;
      if (t >= 1) {
        this.audio.pause();
        this.clearFade();
        return;
      }
      this.audio.volume = from * (1 - t);
    }, 50);
  }

  private playTrack(i: number): void {
    if (TRACKS.length === 0) return;
    this.clearFade();
    this.index = i % TRACKS.length;
    this.loaded = -1;
    this.wantPlaying = true;
    this.tryPlay();
  }

  /** audio.src に読み込み済みの曲番号（OFFのときは曲を読み込まないため、index とずれることがある） */
  private loaded = -1;

  private tryPlay(): void {
    if (!this.enabled || this.index < 0) return;
    if (this.loaded !== this.index) {
      this.audio.src = TRACKS[this.index];
      this.audio.currentTime = 0;
      this.loaded = this.index;
    }
    // 再生を拒否されても（自動再生の制限）ゲームは続ける
    this.audio.play().catch(() => {});
  }

  private clearFade(): void {
    window.clearInterval(this.fadeTimer);
    this.fadeTimer = 0;
    this.audio.volume = this.volume;
  }
}
