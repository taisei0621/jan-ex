export type Suit = 'm' | 'p' | 's' | 'z';

/**
 * 0-8: 1m-9m (萬子)
 * 9-17: 1p-9p (筒子)
 * 18-26: 1s-9s (索子)
 * 27-33: 東, 南, 西, 北, 白, 發, 中 (字牌)
 */
export type TileTypeId = number;

export interface TileInstance {
  uid: string;          // 個体識別用ユニークID
  typeId: TileTypeId;   // 0..33 (-1 は仮想マイティ牌用)
  isRed?: boolean;      // 赤ドラ (5m, 5p, 5s)
  isWildcard?: boolean; // ★マイティ牌
  isGlass?: boolean;    // 鷲巣麻雀用：透明ガラス牌
  isBack?: boolean;     // 裏向き／黒牌（非公開）
  isGold?: boolean;     // マーチャオ用：金牌
  isWhitePocchi?: boolean; // マーチャオ用：白ポッチ
}

export interface MahjongRuleConfig {
  id: 'mighty' | 'washizu' | 'totenko' | 'marchao' | 'standard';
  name: string;
  subtitle: string;
  description: string;
  playerCount: 3 | 4;

  // 手牌・枚数設定
  normalHandSize: number; // 通常13枚、少牌マイティなら12枚
  hasWildcard: boolean;   // 少牌マイティ（常に1枚何でもあり）

  // 牌の可視性設定（鷲巣麻雀）
  isGlassMahjong: boolean; // 透明牌ルール
  glassTileRatio: number;  // 0.75 (4枚中3枚が透明)

  // 点数・祝儀計算システム
  scoringType: 'standard_fu_han' | 'totenko_points';
  hasGoldTiles: boolean;   // マーチャオ金牌
  hasWhitePocchi: boolean; // リーチ後ツモ時オールマイティ白牌
}

export type MentsuType = 'shuntsu' | 'koutsu';

export interface Mentsu {
  type: MentsuType;
  tiles: [TileTypeId, TileTypeId, TileTypeId];
}

export interface HandDecomposition {
  kind: 'standard' | 'chiitoitsu' | 'kokushi';
  head?: TileTypeId;
  mentsu?: Mentsu[];
  pairs?: TileTypeId[]; // 七対子用
}

export interface YakuResult {
  name: string;
  han: number; // 役満は 13 以上、または isYakuman で区別
  isYakuman?: boolean;
}

export interface ScoreResult {
  isAgari: boolean;
  substitutedTile: TileTypeId; // マイティ牌が化けた牌
  yaku: YakuResult[];
  totalHan: number;
  fu: number;
  points: number; // 子ツモ/親ツモ相当の合計点 (スコアアタック用)
  rankName: string; // 満貫, 跳満, 倍満, 三倍満, 役満, ダブル役満...
  decomposition?: HandDecomposition;
}

export interface WaitingTileInfo {
  tileId: TileTypeId;
  remainingCount: number; // 山・見え牌から推定される残り枚数 (参考)
  bestScore: ScoreResult;
}

export interface HighScoreRecord {
  score: number;
  rankName: string;
  yakuNames: string[];
  turnsUsed: number;
  date: string;
}
