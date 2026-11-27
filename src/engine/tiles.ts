import { Suit, TileInstance, TileTypeId } from '../types/mahjong';

export const TOTAL_TILE_TYPES = 34;

export const TILE_NAMES: string[] = [
  '一萬', '二萬', '三萬', '四萬', '五萬', '六萬', '七萬', '八萬', '九萬',
  '一筒', '二筒', '三筒', '四筒', '五筒', '六筒', '七筒', '八筒', '九筒',
  '一索', '二索', '三索', '四索', '五索', '六索', '七索', '八索', '九索',
  '東', '南', '西', '北', '白', '發', '中',
];

export const TILE_SHORT_NAMES: string[] = [
  '1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m',
  '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p',
  '1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s',
  '東', '南', '西', '北', '白', '發', '中',
];

export const TERMINAL_IDS = new Set<TileTypeId>([0, 8, 9, 17, 18, 26]);
export const HONOR_IDS = new Set<TileTypeId>([27, 28, 29, 30, 31, 32, 33]);
export const YAOCHUHAI_IDS = new Set<TileTypeId>([
  0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33,
]);
export const GREEN_TILE_IDS = new Set<TileTypeId>([19, 20, 21, 23, 25, 32]); // 2s, 3s, 4s, 6s, 8s, 發

export function getSuit(typeId: TileTypeId): Suit {
  if (typeId < 9) return 'm';
  if (typeId < 18) return 'p';
  if (typeId < 27) return 's';
  return 'z';
}

export function getNumber(typeId: TileTypeId): number {
  if (typeId >= 27) return typeId - 26; // 1..7 (東南西北白發中)
  return (typeId % 9) + 1; // 1..9
}

export function isHonor(typeId: TileTypeId): boolean {
  return typeId >= 27;
}

export function isTerminal(typeId: TileTypeId): boolean {
  return TERMINAL_IDS.has(typeId);
}

export function isYaochuhai(typeId: TileTypeId): boolean {
  return YAOCHUHAI_IDS.has(typeId);
}

export function isSimple(typeId: TileTypeId): boolean {
  return !isYaochuhai(typeId);
}

export function createWildcardTile(): TileInstance {
  return {
    uid: 'wildcard-mighty',
    typeId: -1,
    isWildcard: true,
  };
}

/**
 * 136枚の牌山を作成しシャッフルする（赤ドラ5m, 5p, 5s各1枚を含む）
 */
export function createShuffledWall(useRedDora = true): TileInstance[] {
  const wall: TileInstance[] = [];
  for (let typeId = 0; typeId < TOTAL_TILE_TYPES; typeId++) {
    for (let copy = 0; copy < 4; copy++) {
      const isRed =
        useRedDora &&
        copy === 0 &&
        (typeId === 4 || typeId === 13 || typeId === 22); // 5m, 5p, 5s
      wall.push({
        uid: `tile-${typeId}-${copy}`,
        typeId,
        isRed,
      });
    }
  }
  // Fisher-Yates shuffle
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wall[i], wall[j]] = [wall[j], wall[i]];
  }
  return wall;
}

export function sortTiles(tiles: TileInstance[]): TileInstance[] {
  return [...tiles].sort((a, b) => {
    if (a.isWildcard && !b.isWildcard) return 1;
    if (!a.isWildcard && b.isWildcard) return -1;
    if (a.typeId !== b.typeId) return a.typeId - b.typeId;
    return (a.isRed ? 1 : 0) - (b.isRed ? 1 : 0);
  });
}

/**
 * 牌インスタンス配列から各牌種(0..33)の枚数カウント配列を生成
 */
export function toCountArray(tiles: TileInstance[]): number[] {
  const counts = new Array(TOTAL_TILE_TYPES).fill(0);
  for (const t of tiles) {
    if (!t.isWildcard && t.typeId >= 0 && t.typeId < TOTAL_TILE_TYPES) {
      counts[t.typeId]++;
    }
  }
  return counts;
}

// pai-images の字牌番号は 東=1, 南=2, 西=3, 北=4, 發=5, 白=6, 中=7
const JI_IMAGE_NUMBERS = [1, 2, 3, 4, 6, 5, 7];

/**
 * public/pai-images/ 内の牌画像パスを返す
 * 注意: aka1=赤5p, aka2=赤5s, aka3=赤5m, ji5=發, ji6=白
 */
export function getTileImagePath(
  typeId: TileTypeId,
  isRed = false,
  variant: 'l' | 's' = 'l',
  isYoko = false
): string {
  const suffix = `66-90-${variant}${isYoko ? '-yoko' : ''}.png`;

  if (typeId >= 0 && typeId < 9) {
    const num = typeId + 1;
    if (isRed && num === 5) return `/pai-images/aka3-${suffix}`;
    return `/pai-images/man${num}-${suffix}`;
  }
  if (typeId >= 9 && typeId < 18) {
    const num = typeId - 8;
    if (isRed && num === 5) return `/pai-images/aka1-${suffix}`;
    return `/pai-images/pin${num}-${suffix}`;
  }
  if (typeId >= 18 && typeId < 27) {
    const num = typeId - 17;
    if (isRed && num === 5) return `/pai-images/aka2-${suffix}`;
    return `/pai-images/sou${num}-${suffix}`;
  }
  if (typeId >= 27 && typeId < 34) {
    const jiNum = JI_IMAGE_NUMBERS[typeId - 27];
    return `/pai-images/ji${jiNum}-${suffix}`;
  }
  return `/pai-images/ji6-${suffix}`;
}
