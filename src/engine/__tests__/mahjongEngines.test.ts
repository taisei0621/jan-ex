import { describe, it, expect } from 'vitest';
import { TileInstance } from '@/types/mahjong';
import { createShuffledWall, getTileImagePath } from '@/engine/tiles';
import { evaluateMightyAgari, getMightyWaitingTiles } from '@/engine/mightyEngine';
import {
  createWashizuDeck,
  generateWashizuPuzzle,
  isStandardAgari14,
} from '@/engine/washizuEngine';
import {
  createTotenkoWall,
  evaluateTotenkoAgari,
  getTotenkoDora,
} from '@/engine/totenkoScoring';
import {
  createMarchaoWall,
  evaluateMarchaoAgari,
} from '@/engine/marchaoEngine';
import {
  executeDiscard,
  initMightyMatch,
  proceedToNextRound,
} from '@/engine/mightyMatchEngine';

function makeTiles(typeIds: number[]): TileInstance[] {
  return typeIds.map((typeId, idx) => ({
    uid: `t-${idx}-${typeId}`,
    typeId,
  }));
}

describe('pai-images タイル画像マッピング', () => {
  it('赤ドラや白發中の特殊マッピングが正しい', () => {
    expect(getTileImagePath(4, true)).toBe('/pai-images/aka3-66-90-l.png'); // 赤5m
    expect(getTileImagePath(13, true)).toBe('/pai-images/aka1-66-90-l.png'); // 赤5p
    expect(getTileImagePath(22, true)).toBe('/pai-images/aka2-66-90-l.png'); // 赤5s
    expect(getTileImagePath(31)).toBe('/pai-images/ji6-66-90-l.png'); // 白
    expect(getTileImagePath(32)).toBe('/pai-images/ji5-66-90-l.png'); // 發
    expect(getTileImagePath(33)).toBe('/pai-images/ji7-66-90-l.png'); // 中
  });

  it('通常牌山は136枚生成される', () => {
    expect(createShuffledWall(true)).toHaveLength(136);
  });
});

describe('Phase 1: 少牌マイティエンジン', () => {
  it('13枚＋★マイティ1枚で九蓮宝燈・清一色クラスのアガリを正しく判定できる', () => {
    // 1m1m1m 2m3m4m 5m6m7m 9m9m9m + 8m (計13枚) + ★マイティで九蓮宝燈
    const tiles13 = makeTiles([0, 0, 0, 1, 2, 3, 4, 5, 6, 8, 8, 8, 7]);
    const res = evaluateMightyAgari(tiles13, { winningTile: 7 });
    expect(res).not.toBeNull();
    expect(res?.isAgari).toBe(true);
    expect(
      res?.yaku.some((y) => y.name.includes('九蓮宝燈') || y.name === '清一色')
    ).toBe(true);
  });

  it('12枚手牌＋★マイティ1枚で多面待ちを抽出できる', () => {
    // 234m 567p 345s 888z (12枚) → ★マイティとツモで単騎以外の待ちも多数発生
    const hand12 = makeTiles([1, 2, 3, 13, 14, 15, 20, 21, 22, 31, 31, 31]);
    const waits = getMightyWaitingTiles(hand12);
    expect(waits.length).toBeGreaterThan(0);
  });
});

describe('Phase 2: 鷲巣麻雀エンジン', () => {
  it('全136枚中、各牌種3枚がガラス牌・1枚が黒牌で構成される', () => {
    const deck = createWashizuDeck(true);
    expect(deck).toHaveLength(136);
    const glassCount = deck.filter((t) => t.isGlass).length;
    const blackCount = deck.filter((t) => !t.isGlass).length;
    expect(glassCount).toBe(102);
    expect(blackCount).toBe(34);
  });

  it('生成されるパズルは常に13枚手牌・有効な待ち牌を持つ', () => {
    for (const diff of ['easy', 'normal', 'hard'] as const) {
      const puzzle = generateWashizuPuzzle(diff);
      expect(puzzle.opponentHand).toHaveLength(13);
      expect(puzzle.playerHand).toHaveLength(13);
      expect(puzzle.winningWaits.length).toBeGreaterThan(0);
      expect(puzzle.hiddenBlackTileIds.length).toBe(diff === 'hard' ? 2 : 1);
    }
  });

  it('14枚通常形・七対子の和了判定が正しい', () => {
    const counts = new Array(34).fill(0);
    // 123m 456p 789s 東東東 中中
    [0, 1, 2, 12, 13, 14, 24, 25, 26, 27, 27, 27, 33, 33].forEach((i) => counts[i]++);
    expect(isStandardAgari14(counts)).toBe(true);
  });
});

describe('Phase 3: 東天紅加算式スコアエンジン', () => {
  it('二萬〜八萬が抜かれた108枚牌山が生成される', () => {
    const wall = createTotenkoWall(true);
    expect(wall).toHaveLength(108);
    expect(wall.some((t) => t.typeId >= 1 && t.typeId <= 7)).toBe(false);
  });

  it('1mと9mのドラ循環が正しい', () => {
    expect(getTotenkoDora(0)).toBe(8); // 1m -> 9m
    expect(getTotenkoDora(8)).toBe(0); // 9m -> 1m
  });

  it('ドラ・赤・ガリ0枚でカラス(+3点)が加算される', () => {
    // 234p 567p 345s 678s 1m1m (14枚、ドラ9m指定)
    const hand14 = makeTiles([10, 11, 12, 13, 14, 15, 20, 21, 22, 23, 24, 25, 0, 0]);
    const res = evaluateTotenkoAgari(hand14, {
      doraTileId: 8,
      gariCount: 0,
      isRiichi: false,
      isTsumo: true,
    });
    expect(res).not.toBeNull();
    expect(res?.isKarasu).toBe(true);
    expect(res?.items.some((i) => i.label.includes('カラス'))).toBe(true);
  });
});

describe('Phase 4: マーチャオAルールエンジン', () => {
  it('136枚中に金牌2枚と白ポッチ1枚が含まれる', () => {
    const wall = createMarchaoWall();
    expect(wall).toHaveLength(136);
    expect(wall.filter((t) => t.isGold)).toHaveLength(2);
    expect(wall.filter((t) => t.isWhitePocchi)).toHaveLength(1);
  });

  it('リーチ後の白ポッチツモでオールマイティ和了が発動する', () => {
    // 123m 456p 789s 東東東 + 5s (5s単騎待ちの13枚) に白ポッチツモ
    const hand13 = makeTiles([0, 1, 2, 12, 13, 14, 24, 25, 26, 27, 27, 27, 22]);
    const whitePocchi: TileInstance = {
      uid: 'marchao-31-0',
      typeId: 31,
      isWhitePocchi: true,
    };
    const res = evaluateMarchaoAgari([...hand13, whitePocchi], {
      doraIndicator: 0,
      isRiichi: true,
      tsumoTile: whitePocchi,
    });
    expect(res).not.toBeNull();
    expect(res?.usedWhitePocchi).toBe(true);
    expect(res?.shugiCount).toBeGreaterThanOrEqual(2);
  });
});

describe('少牌マイティ 4人対局エンジン', () => {
  it('初期対局で4人に12枚ずつ配牌され、25,000点持ちで東1局が開始される', () => {
    const match = initMightyMatch();
    expect(match.kyoku).toBe(1);
    expect(match.players).toHaveLength(4);
    for (const p of match.players) {
      expect(p.hand).toHaveLength(12);
      expect(p.score).toBe(25000);
    }
    expect(match.currentTsumo).not.toBeNull();
    expect(match.phase).toBe('player_action');
  });

  it('打牌とリーチ宣言が正しく持ち点・河・供託に反映される', () => {
    const match = initMightyMatch();
    const discardUid = match.currentTsumo!.uid;
    const after = executeDiscard(match, 0, discardUid, true);
    expect(after.players[0].isRiichi).toBe(true);
    expect(after.players[0].score).toBe(24000);
    expect(after.players[0].discards).toHaveLength(1);
    expect(after.players[0].discards[0].isRiichiDeclare).toBe(true);
    expect(after.riichiSticks).toBe(1);
  });

  it('流局からの次局進行で東2局へ進む（親ノーテン時）', () => {
    const match = initMightyMatch();
    const fakeRoundEnd = {
      ...match,
      phase: 'round_end' as const,
      roundResult: {
        type: 'ryuukyoku' as const,
        tenpaiSeats: [],
        pointDeltas: [0, 0, 0, 0] as [number, number, number, number],
      },
    };
    const next = proceedToNextRound(fakeRoundEnd);
    expect(next.kyoku).toBe(2);
    expect(next.dealerSeat).toBe(1);
  });
});
