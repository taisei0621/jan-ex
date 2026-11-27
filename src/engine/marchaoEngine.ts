import { ScoreResult, TileInstance, TileTypeId, WaitingTileInfo } from '@/types/mahjong';
import { TOTAL_TILE_TYPES, toCountArray } from './tiles';
import {
  evaluateMightyAgari,
  evaluateStandardAgari14,
  getDoraFromIndicator,
} from './mightyEngine';

export interface MarchaoScoreResult extends ScoreResult {
  shugiCount: number; // 祝儀枚数（赤1枚、金2枚、白ポッチアガリ+1枚など）
  shugiBreakdown: string[];
  usedWhitePocchi: boolean;
}

/**
 * マーチャオAルール用の136枚牌山を作成
 * - 赤5m, 赤5p, 赤5s 各1枚 (isRed)
 * - 金5p, 金5s 各1枚 (isGold, 祝儀2枚相当)
 * - 白ポッチ 1枚 (typeId=31, isWhitePocchi)
 */
export function createMarchaoWall(): TileInstance[] {
  const wall: TileInstance[] = [];
  for (let typeId = 0; typeId < TOTAL_TILE_TYPES; typeId++) {
    for (let copy = 0; copy < 4; copy++) {
      const isRed = copy === 0 && (typeId === 4 || typeId === 13 || typeId === 22);
      const isGold = copy === 1 && (typeId === 13 || typeId === 22);
      const isWhitePocchi = copy === 0 && typeId === 31;
      wall.push({
        uid: `marchao-${typeId}-${copy}`,
        typeId,
        isRed,
        isGold,
        isWhitePocchi,
      });
    }
  }
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wall[i], wall[j]] = [wall[j], wall[i]];
  }
  return wall;
}

/**
 * マーチャオAルール：14枚（13枚手牌＋ツモ牌）の和了・祝儀評価
 * リーチ後に白ポッチをツモった場合はオールマイティとして最高打点の待ちに化ける！
 */
export function evaluateMarchaoAgari(
  tiles14: TileInstance[],
  options: {
    doraIndicator: TileTypeId;
    isRiichi: boolean;
    tsumoTile: TileInstance | null;
  }
): MarchaoScoreResult | null {
  if (tiles14.length !== 14 || !options.tsumoTile) return null;

  const isWhitePocchiTsumo =
    options.isRiichi && Boolean(options.tsumoTile.isWhitePocchi);

  let baseResult: ScoreResult | null = null;
  let usedWhitePocchi = false;

  if (isWhitePocchiTsumo) {
    // リーチ後の白ポッチツモ：手牌13枚＋万能ワイルドカードとして最高打点を探索
    const hand13 = tiles14.filter((t) => t.uid !== options.tsumoTile!.uid);
    const result = evaluateMightyAgari(hand13, {
      winningTile: 31,
      doraIndicators: [options.doraIndicator],
      redDoraCount: hand13.filter((t) => t.isRed).length,
    });
    if (result && result.isAgari) {
      baseResult = result;
      usedWhitePocchi = true;
    }
  }

  if (!baseResult) {
    baseResult = evaluateStandardAgari14(tiles14, {
      winningTile: options.tsumoTile.typeId,
      doraIndicators: [options.doraIndicator],
    });
  }

  if (!baseResult) return null;

  // リーチ翻を追加（通常アガリ時）
  const yaku = [...baseResult.yaku];
  let totalHan = baseResult.totalHan;
  if (options.isRiichi) {
    yaku.unshift({ name: '立直', han: 1 });
    totalHan += 1;
  }

  // 祝儀計算
  const shugiBreakdown: string[] = [];
  let shugiCount = 0;

  const redCount = tiles14.filter((t) => t.isRed).length;
  const goldCount = tiles14.filter((t) => t.isGold).length;

  if (redCount > 0) {
    shugiCount += redCount;
    shugiBreakdown.push(`赤ドラ ×${redCount} (+${redCount}枚)`);
  }
  if (goldCount > 0) {
    shugiCount += goldCount * 2;
    shugiBreakdown.push(`金牌 ×${goldCount} (+${goldCount * 2}枚)`);
  }
  if (usedWhitePocchi) {
    shugiCount += 1;
    shugiBreakdown.push('白ポッチツモ (+1枚)');
  }
  if (options.isRiichi) {
    shugiCount += 1;
    shugiBreakdown.push('一発/裏ドラ祝儀 (+1枚)');
  }

  const extraGoldPoints = goldCount * 1000;

  return {
    ...baseResult,
    yaku,
    totalHan,
    points: baseResult.points + extraGoldPoints,
    shugiCount,
    shugiBreakdown,
    usedWhitePocchi,
  };
}

export function getMarchaoWaitingTiles(
  hand13: TileInstance[],
  doraIndicator: TileTypeId
): WaitingTileInfo[] {
  if (hand13.length !== 13) return [];
  const counts = toCountArray(hand13);
  const waits: WaitingTileInfo[] = [];

  for (let tileId = 0; tileId < TOTAL_TILE_TYPES; tileId++) {
    if (counts[tileId] >= 4) continue;
    const virtualTile: TileInstance = {
      uid: `marchao-wait-${tileId}`,
      typeId: tileId,
    };
    const res = evaluateStandardAgari14([...hand13, virtualTile], {
      winningTile: tileId,
      doraIndicators: [doraIndicator],
    });
    if (res && res.isAgari) {
      waits.push({
        tileId,
        remainingCount: Math.max(0, 4 - counts[tileId]),
        bestScore: res,
      });
    }
  }
  return waits.sort((a, b) => a.tileId - b.tileId);
}

export { getDoraFromIndicator };
