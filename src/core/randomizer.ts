import { PIECE_TYPES, type PieceType } from './pieces';

/** 7種1巡（7-bag）: 7種類を1セットとしてシャッフルし、使い切ったら次のセットを作る */
export class SevenBag {
  private bag: PieceType[] = [];

  constructor(private readonly rng: () => number = Math.random) {}

  next(): PieceType {
    if (this.bag.length === 0) this.bag = this.shuffled();
    return this.bag.shift()!;
  }

  private shuffled(): PieceType[] {
    const b = [...PIECE_TYPES];
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  }
}
