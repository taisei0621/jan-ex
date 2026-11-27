import { HandDecomposition, Mentsu, TileInstance, TileTypeId } from '@/types/mahjong';
import {
  getNumber,
  getSuit,
  GREEN_TILE_IDS,
  isHonor,
  isSimple,
  isTerminal,
  isYaochuhai,
  toCountArray,
  TOTAL_TILE_TYPES,
} from './tiles';

export interface TotenkoPointItem {
  label: string;
  points: number;
  category: 'base' | 'dora' | 'yaku' | 'bonus';
}

export interface TotenkoScoreResult {
  isAgari: boolean;
  items: TotenkoPointItem[];
  totalPoints: number;
  isKarasu: boolean;
  title: string; // 例: "東天紅 8点", "カラス達成 6点", "役満級 22点"
}

export interface TotenkoWaitingInfo {
  tileId: TileTypeId;
  bestScore: TotenkoScoreResult;
}

// 東天紅で使用する27種の牌ID（二萬〜八萬 1..7 を除外）
export const TOTENKO_VALID_IDS: TileTypeId[] = [
  0, 8, // 1m, 9m
  9, 10, 11, 12, 13, 14, 15, 16, 17, // 1p..9p
  18, 19, 20, 21, 22, 23, 24, 25, 26, // 1s..9s
  27, 28, 29, 30, 31, 32, 33, // 東南西北白發中
];

/**
 * 東天紅用の108枚牌山を作成（2m〜8m抜き）
 */
export function createTotenkoWall(useRedDora = true): TileInstance[] {
  const wall: TileInstance[] = [];
  for (const typeId of TOTENKO_VALID_IDS) {
    for (let copy = 0; copy < 4; copy++) {
      const isRed =
        useRedDora && copy === 0 && (typeId === 13 || typeId === 22); // 赤5p, 赤5s
      wall.push({
        uid: `totenko-${typeId}-${copy}`,
        typeId,
        isRed,
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
 * 東天紅のドラ表示牌からドラを算出（1mの次は9m、9mの次は1m）
 */
export function getTotenkoDora(indicatorId: TileTypeId): TileTypeId {
  if (indicatorId === 0) return 8;
  if (indicatorId === 8) return 0;
  if (indicatorId >= 9 && indicatorId <= 16) return indicatorId + 1;
  if (indicatorId === 17) return 9;
  if (indicatorId >= 18 && indicatorId <= 25) return indicatorId + 1;
  if (indicatorId === 26) return 18;
  if (indicatorId >= 27 && indicatorId <= 29) return indicatorId + 1;
  if (indicatorId === 30) return 27;
  if (indicatorId >= 31 && indicatorId <= 32) return indicatorId + 1;
  if (indicatorId === 33) return 31;
  return 0;
}

function getAllStandardDecompositions(counts: number[]): HandDecomposition[] {
  const results: HandDecomposition[] = [];
  const work = [...counts];

  function searchMentsu(startIdx: number, acc: Mentsu[], head: TileTypeId) {
    let idx = startIdx;
    while (idx < TOTAL_TILE_TYPES && work[idx] === 0) idx++;
    if (idx >= TOTAL_TILE_TYPES) {
      results.push({ kind: 'standard', head, mentsu: [...acc] });
      return;
    }

    if (work[idx] >= 3) {
      work[idx] -= 3;
      acc.push({ type: 'koutsu', tiles: [idx, idx, idx] });
      searchMentsu(idx, acc, head);
      acc.pop();
      work[idx] += 3;
    }

    // 東天紅では 1m, 9m のみなので萬子の順子は存在しない（1m=0, 9m=8）
    if (!isHonor(idx) && getSuit(idx) !== 'm' && getNumber(idx) <= 7) {
      if (work[idx + 1] > 0 && work[idx + 2] > 0) {
        work[idx]--;
        work[idx + 1]--;
        work[idx + 2]--;
        acc.push({ type: 'shuntsu', tiles: [idx, idx + 1, idx + 2] });
        searchMentsu(idx, acc, head);
        acc.pop();
        work[idx]++;
        work[idx + 1]++;
        work[idx + 2]++;
      }
    }
  }

  for (let head = 0; head < TOTAL_TILE_TYPES; head++) {
    if (work[head] < 2) continue;
    work[head] -= 2;
    searchMentsu(0, [], head);
    work[head] += 2;
  }

  return results;
}

function isChiitoitsu(counts: number[]): TileTypeId[] | null {
  const pairs: TileTypeId[] = [];
  for (let i = 0; i < TOTAL_TILE_TYPES; i++) {
    if (counts[i] === 2) pairs.push(i);
    else if (counts[i] !== 0) return null;
  }
  return pairs.length === 7 ? pairs : null;
}

function isKokushi(counts: number[]): boolean {
  const yaochu = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  let hasPair = false;
  for (const id of yaochu) {
    if (counts[id] === 0) return false;
    if (counts[id] === 2) hasPair = true;
    else if (counts[id] > 2) return false;
  }
  return hasPair;
}

function scoreDecomposition(
  counts: number[],
  decomp: HandDecomposition,
  options: {
    doraTileId: TileTypeId;
    redCount: number;
    gariCount: number;
    isRiichi: boolean;
    isTsumo: boolean;
  }
): TotenkoScoreResult {
  const items: TotenkoPointItem[] = [
    { label: 'アガリ基本点', points: 1, category: 'base' },
    { label: '門清（メンゼン）', points: 2, category: 'base' },
  ];

  if (options.isRiichi) {
    items.push({ label: 'リーチ', points: 1, category: 'base' });
  }
  if (options.isTsumo) {
    items.push({ label: 'ツモ', points: 1, category: 'base' });
  }

  const doraInHand = counts[options.doraTileId] || 0;
  if (doraInHand > 0) {
    items.push({ label: `ドラ ×${doraInHand}`, points: doraInHand, category: 'dora' });
  }
  if (options.redCount > 0) {
    items.push({ label: `赤ドラ ×${options.redCount}`, points: options.redCount, category: 'dora' });
  }
  if (options.gariCount > 0) {
    items.push({ label: `ガリ（北抜き）×${options.gariCount}`, points: options.gariCount, category: 'dora' });
  }

  const isKarasu = doraInHand === 0 && options.redCount === 0 && options.gariCount === 0;
  if (isKarasu) {
    items.push({ label: 'カラス（ドラ・ガリなし）', points: 3, category: 'bonus' });
  }

  // 役判定
  const presentIds = [];
  for (let i = 0; i < TOTAL_TILE_TYPES; i++) {
    if (counts[i] > 0) presentIds.push(i);
  }

  const allTanyao = presentIds.every((id) => isSimple(id));
  const suits = new Set(presentIds.filter((id) => !isHonor(id)).map((id) => getSuit(id)));
  const hasHonors = presentIds.some((id) => isHonor(id));

  if (decomp.kind === 'kokushi') {
    items.push({ label: '国士無双', points: 15, category: 'yaku' });
  } else if (decomp.kind === 'chiitoitsu') {
    items.push({ label: '七対子', points: 3, category: 'yaku' });
    if (allTanyao) items.push({ label: 'タンヤオ', points: 1, category: 'yaku' });
    if (suits.size === 1 && hasHonors) items.push({ label: 'ホンイツ', points: 3, category: 'yaku' });
    if (suits.size === 1 && !hasHonors) items.push({ label: 'チンイツ', points: 6, category: 'yaku' });
    if (suits.size === 0 && hasHonors) items.push({ label: '字一色', points: 15, category: 'yaku' });
  } else if (decomp.kind === 'standard' && decomp.mentsu && decomp.head !== undefined) {
    const mentsu = decomp.mentsu;
    const head = decomp.head;
    const koutsuList = mentsu.filter((m) => m.type === 'koutsu');
    const shuntsuList = mentsu.filter((m) => m.type === 'shuntsu');

    // 役満級チェック
    if (koutsuList.length === 4) {
      items.push({ label: '四暗刻', points: 15, category: 'yaku' });
    }
    const sangenKoutsu = koutsuList.filter((m) => m.tiles[0] >= 31 && m.tiles[0] <= 33).length;
    if (sangenKoutsu === 3) {
      items.push({ label: '大三元', points: 15, category: 'yaku' });
    } else if (sangenKoutsu === 2 && head >= 31 && head <= 33) {
      items.push({ label: '小三元', points: 4, category: 'yaku' });
    }
    if (suits.size === 0 && hasHonors) {
      items.push({ label: '字一色', points: 15, category: 'yaku' });
    }
    if (presentIds.every((id) => isTerminal(id))) {
      items.push({ label: '清老頭', points: 15, category: 'yaku' });
    }
    if (presentIds.every((id) => GREEN_TILE_IDS.has(id))) {
      items.push({ label: '緑一色', points: 15, category: 'yaku' });
    }

    // 通常役
    if (allTanyao) {
      items.push({ label: 'タンヤオ', points: 1, category: 'yaku' });
    }
    if (shuntsuList.length === 4 && !isHonor(head)) {
      items.push({ label: 'ピンフ', points: 1, category: 'yaku' });
    }
    if (koutsuList.length === 4) {
      items.push({ label: '対々和', points: 3, category: 'yaku' });
    } else if (koutsuList.length === 3) {
      items.push({ label: '三暗刻', points: 3, category: 'yaku' });
    }

    // 役牌（東=27, 白=31, 發=32, 中=33）
    for (const k of koutsuList) {
      const t = k.tiles[0];
      if (t === 27) items.push({ label: '役牌・東', points: 1, category: 'yaku' });
      if (t === 31) items.push({ label: '役牌・白', points: 1, category: 'yaku' });
      if (t === 32) items.push({ label: '役牌・發', points: 1, category: 'yaku' });
      if (t === 33) items.push({ label: '役牌・中', points: 1, category: 'yaku' });
    }

    // 一盃口
    const shuntsuKeys = shuntsuList.map((s) => s.tiles.join(','));
    const uniqKeys = new Set(shuntsuKeys);
    if (shuntsuKeys.length - uniqKeys.size >= 1) {
      items.push({ label: '一盃口', points: 1, category: 'yaku' });
    }

    // チャンタ / 混老頭
    const allBlocksYaochu =
      isYaochuhai(head) && mentsu.every((m) => m.tiles.some((t) => isYaochuhai(t)));
    if (presentIds.every((id) => isYaochuhai(id)) && hasHonors && koutsuList.length > 0) {
      items.push({ label: '混老頭', points: 4, category: 'yaku' });
    } else if (allBlocksYaochu && shuntsuList.length > 0) {
      items.push({ label: 'チャンタ', points: 2, category: 'yaku' });
    }

    // ホンイツ / チンイツ
    if (suits.size === 1 && hasHonors) {
      items.push({ label: 'ホンイツ', points: 3, category: 'yaku' });
    } else if (suits.size === 1 && !hasHonors) {
      items.push({ label: 'チンイツ', points: 6, category: 'yaku' });
    }
  }

  const totalPoints = items.reduce((sum, item) => sum + item.points, 0);
  const title = isKarasu ? `カラス達成！ ${totalPoints}点` : `東天紅 ${totalPoints}点`;

  return {
    isAgari: true,
    items,
    totalPoints,
    isKarasu,
    title,
  };
}

/**
 * 14枚（13枚手牌＋ツモ牌）の東天紅和了・点数評価
 */
export function evaluateTotenkoAgari(
  tiles14: TileInstance[],
  options: {
    doraTileId: TileTypeId;
    gariCount: number;
    isRiichi?: boolean;
    isTsumo?: boolean;
  }
): TotenkoScoreResult | null {
  if (tiles14.length !== 14) return null;
  const counts = toCountArray(tiles14);
  const redCount = tiles14.filter((t) => t.isRed).length;

  const candidates: TotenkoScoreResult[] = [];
  const evalOpts = {
    doraTileId: options.doraTileId,
    redCount,
    gariCount: options.gariCount,
    isRiichi: Boolean(options.isRiichi),
    isTsumo: options.isTsumo ?? true,
  };

  if (isKokushi(counts)) {
    candidates.push(scoreDecomposition(counts, { kind: 'kokushi' }, evalOpts));
  }
  const pairs = isChiitoitsu(counts);
  if (pairs) {
    candidates.push(scoreDecomposition(counts, { kind: 'chiitoitsu', pairs }, evalOpts));
  }
  const stdDecomps = getAllStandardDecompositions(counts);
  for (const d of stdDecomps) {
    candidates.push(scoreDecomposition(counts, d, evalOpts));
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.totalPoints - a.totalPoints);
  return candidates[0];
}

/**
 * 13枚手牌に対する東天紅の待ち牌一覧と予想点数を計算
 */
export function getTotenkoWaitingTiles(
  hand13: TileInstance[],
  options: {
    doraTileId: TileTypeId;
    gariCount: number;
    isRiichi?: boolean;
  }
): TotenkoWaitingInfo[] {
  if (hand13.length !== 13) return [];
  const counts = toCountArray(hand13);
  const waits: TotenkoWaitingInfo[] = [];

  for (const tid of TOTENKO_VALID_IDS) {
    if (counts[tid] >= 4) continue;
    const testHand: TileInstance[] = [
      ...hand13,
      { uid: `sim-${tid}`, typeId: tid },
    ];
    const res = evaluateTotenkoAgari(testHand, {
      ...options,
      isTsumo: true,
    });
    if (res) {
      waits.push({ tileId: tid, bestScore: res });
    }
  }

  return waits.sort((a, b) => b.bestScore.totalPoints - a.bestScore.totalPoints);
}
