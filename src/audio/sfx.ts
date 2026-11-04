import type { GameEvent } from '../core/game';

type Wave = OscillatorType;

/** ドレミの周波数（Hz） */
const C5 = 523.25, E5 = 659.25, G5 = 783.99, B5 = 987.77;
const C6 = 1046.5, D6 = 1174.66, E6 = 1318.51, G6 = 1567.98;

/** 連続移動で音が重なりすぎないよう、同じ音はこの間隔より詰めて鳴らさない */
const MIN_INTERVAL_MS: Partial<Record<GameEvent['type'], number>> = { move: 35, rotate: 30 };

/**
 * 効果音。音声ファイルは使わず、Web Audio API でその場で電子音を作って鳴らす。
 * OFFのときは AudioContext 自体を作らない（Android で他の音楽アプリを止めないため）。
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private volume = 0.6;
  private readonly lastPlayed = new Map<string, number>();

  constructor() {
    // ブラウザは画面のクリックやキー入力の後でないと音を出させてくれないので、そのたびに再開を試みる
    const unlock = () => void this.ctx?.resume().catch(() => {});
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on && this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
      this.master = null;
    }
  }

  /** 0〜100 */
  setVolume(percent: number): void {
    this.volume = Math.min(1, Math.max(0, percent / 100));
    if (this.master) this.master.gain.value = this.volume;
  }

  /** 1フレーム分の出来事に合わせて鳴らす */
  playEvents(events: GameEvent[]): void {
    if (!this.enabled || events.length === 0) return;
    const hardDropped = events.some((e) => e.type === 'hardDrop');
    for (const e of events) {
      // ハードドロップは固定音を兼ねる
      if (e.type === 'lock' && hardDropped) continue;
      this.play(e);
    }
  }

  private play(e: GameEvent): void {
    const now = performance.now();
    const gap = MIN_INTERVAL_MS[e.type];
    if (gap !== undefined && now - (this.lastPlayed.get(e.type) ?? -Infinity) < gap) return;
    this.lastPlayed.set(e.type, now);

    switch (e.type) {
      case 'move':
        this.tone(0, 0.025, 'square', 330, 330, 0.08);
        break;
      case 'rotate':
        this.tone(0, 0.045, 'square', 520, 780, 0.08);
        break;
      case 'hold':
        this.tone(0, 0.05, 'triangle', G5, G5, 0.3);
        this.tone(0.05, 0.07, 'triangle', C6, C6, 0.3);
        break;
      case 'lock':
        this.tone(0, 0.08, 'triangle', 140, 70, 0.45);
        break;
      case 'hardDrop':
        this.noise(0, 0.07, 0.35);
        this.tone(0, 0.12, 'triangle', 120, 45, 0.6);
        break;
      case 'tspin':
        this.sweep(0);
        break;
      case 'clear': {
        let t = 0;
        if (e.tspin !== 'none') {
          this.sweep(0);
          t = 0.12;
        }
        if (e.lines >= 4) {
          this.arpeggio(t, [C5, E5, G5, C6, E6, G6], 0.045, 'square', 0.2);
          this.chord(t + 0.27, [C6, E6, G6], 0.35, 0.12);
        } else {
          const notes = [C5, E5, G5, C6].slice(0, e.lines + 1);
          this.arpeggio(t, notes, 0.055, 'square', 0.2);
        }
        if (e.b2b) this.arpeggio(t + 0.3, [E6, G6], 0.05, 'triangle', 0.25);
        break;
      }
      case 'levelUp':
        this.arpeggio(0.15, [G5, B5, D6, G6], 0.08, 'triangle', 0.3);
        break;
      case 'gameOver':
        this.arpeggio(0, [C5, 493.88, 440, 392, 349.23, 329.63, 293.66, 261.63], 0.11, 'triangle', 0.35);
        break;
    }
  }

  // ─── 音を作る部品 ───

  private context(): { ctx: AudioContext; out: GainNode } | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
    return { ctx: this.ctx, out: this.master! };
  }

  /** 1音。freqFrom→freqTo に音程を動かし、最後に向けて小さくする */
  private tone(delay: number, dur: number, wave: Wave, freqFrom: number, freqTo: number, gain: number): void {
    const c = this.context();
    if (!c) return;
    const t0 = c.ctx.currentTime + delay;
    const osc = c.ctx.createOscillator();
    const env = c.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freqFrom, t0);
    if (freqTo !== freqFrom) osc.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(env).connect(c.out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private arpeggio(delay: number, notes: number[], step: number, wave: Wave, gain: number): void {
    notes.forEach((f, i) => this.tone(delay + i * step, step * 1.6, wave, f, f, gain));
  }

  private chord(delay: number, notes: number[], dur: number, gain: number): void {
    notes.forEach((f) => this.tone(delay, dur, 'square', f, f, gain));
  }

  /** T-Spin の「シュッ」という上昇音 */
  private sweep(delay: number): void {
    this.tone(delay, 0.14, 'sawtooth', 300, 1400, 0.12);
  }

  /** ハードドロップの「ザッ」 */
  private noise(delay: number, dur: number, gain: number): void {
    const c = this.context();
    if (!c) return;
    const t0 = c.ctx.currentTime + delay;
    const len = Math.ceil(c.ctx.sampleRate * dur);
    const buf = c.ctx.createBuffer(1, len, c.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.ctx.createBufferSource();
    src.buffer = buf;
    const filter = c.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    const env = c.ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(env).connect(c.out);
    src.start(t0);
  }
}
