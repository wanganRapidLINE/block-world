import type { Board } from './board';
import type { PieceType, Rotation } from './pieces';

export type TSpin = 'none' | 'mini' | 'full';

export interface PiecePosition {
  type: PieceType;
  rot: Rotation;
  x: number;
  y: number;
}

/**
 * 3コーナー判定。
 * - 最後の操作が回転で、Tの中心の斜め4マスのうち3つ以上が埋まっていれば T-Spin 系
 * - Tが向いている側の2マスが両方埋まっていれば T-Spin、そうでなければ Mini
 * - ただし5番目のキック（index 4）で入った場合は Mini にしない
 */
export function detectTSpin(
  board: Board,
  piece: PiecePosition,
  lastActionRotate: boolean,
  lastKickIndex: number,
): TSpin {
  if (piece.type !== 'T' || !lastActionRotate) return 'none';

  const cx = piece.x + 1;
  const cy = piece.y + 1;
  const tl = board.isBlocked(cx - 1, cy + 1);
  const tr = board.isBlocked(cx + 1, cy + 1);
  const bl = board.isBlocked(cx - 1, cy - 1);
  const br = board.isBlocked(cx + 1, cy - 1);

  const count = [tl, tr, bl, br].filter(Boolean).length;
  if (count < 3) return 'none';

  const front: Record<Rotation, [boolean, boolean]> = {
    0: [tl, tr],
    1: [tr, br],
    2: [bl, br],
    3: [tl, bl],
  };
  const [f1, f2] = front[piece.rot];
  if ((f1 && f2) || lastKickIndex === 4) return 'full';
  return 'mini';
}
