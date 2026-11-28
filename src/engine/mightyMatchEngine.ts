import { ScoreResult, TileInstance, TileTypeId } from '@/types/mahjong';
import {
  createShuffledWall,
  getNumber,
  isHonor,
  sortTiles,
  toCountArray,
  TOTAL_TILE_TYPES,
} from './tiles';
import {
  evaluateMightyAgari,
  getDoraFromIndicator,
  getMightyWaitingTiles,
} from './mightyEngine';

export type SeatIndex = 0 | 1 | 2 | 3; // 0: あなた(南/東...), 1: 下家(CPU), 2: 対面(CPU), 3: 上家(CPU)

export interface MatchPlayerState {
  seat: SeatIndex;
  name: string;
  isHuman: boolean;
  score: number;
  hand: TileInstance[]; // 通常牌12枚（★マイティは全員が仮想的に1枚所持）
  discards: { tile: TileInstance; isRiichiDeclare?: boolean }[];
  isRiichi: boolean;
  riichiTurn: number | null;
}

export interface RoundAgariInfo {
  winnerSeat: SeatIndex;
  loserSeat: SeatIndex | null; // null = ツモ, number = ロン放銃者
  winningTile: TileInstance;
  scoreResult: ScoreResult;
  pointDeltas: [number, number, number, number];
}

export interface MightyMatchState {
  roundWind: TileTypeId; // 27 = 東
  kyoku: number; // 1..4 (東1局..東4局)
  honba: number;
  riichiSticks: number; // 供託リーチ棒の本数
  dealerSeat: SeatIndex; // 親の席 (0..3)
  players: [MatchPlayerState, MatchPlayerState, MatchPlayerState, MatchPlayerState];
  wall: TileInstance[];
  wallIndex: number;
  deadWallEndIndex: number; // 王牌14枚を除いたツモ可能上限
  doraIndicator: TileTypeId;
  currentTurnSeat: SeatIndex;
  currentTsumo: TileInstance | null; // 現在の手番プレイヤーがツモった牌
  lastDiscard: { seat: SeatIndex; tile: TileInstance } | null;
  humanCanRon: ScoreResult | null; // 他家の打牌に対して自分がロン可能か
  phase: 'player_action' | 'cpu_thinking' | 'ron_prompt' | 'round_end' | 'match_end';
  roundResult: {
    type: 'agari' | 'ryuukyoku';
    agari?: RoundAgariInfo;
    tenpaiSeats?: SeatIndex[];
    pointDeltas: [number, number, number, number];
  } | null;
  turnCount: number;
}

export const SEAT_NAMES = ['あなた', 'CPU東風', 'CPU南風', 'CPU西風'] as const;
export const WIND_LABELS = ['東', '南', '西', '北'] as const;

export function getSeatWind(seat: SeatIndex, dealerSeat: SeatIndex): TileTypeId {
  const offset = (seat - dealerSeat + 4) % 4;
  return 27 + offset; // 27=東, 28=南, 29=西, 30=北
}

export function getSeatWindLabel(seat: SeatIndex, dealerSeat: SeatIndex): string {
  const offset = (seat - dealerSeat + 4) % 4;
  return WIND_LABELS[offset];
}

/**
 * 新しい対局（東風戦 25,000点持ち）を初期化
 */
export function initMightyMatch(): MightyMatchState {
  const players: [
    MatchPlayerState,
    MatchPlayerState,
    MatchPlayerState,
    MatchPlayerState
  ] = [
    { seat: 0, name: 'あなた', isHuman: true, score: 25000, hand: [], discards: [], isRiichi: false, riichiTurn: null },
    { seat: 1, name: 'CPU 下家', isHuman: false, score: 25000, hand: [], discards: [], isRiichi: false, riichiTurn: null },
    { seat: 2, name: 'CPU 対面', isHuman: false, score: 25000, hand: [], discards: [], isRiichi: false, riichiTurn: null },
    { seat: 3, name: 'CPU 上家', isHuman: false, score: 25000, hand: [], discards: [], isRiichi: false, riichiTurn: null },
  ];

  return setupRound({
    roundWind: 27,
    kyoku: 1,
    honba: 0,
    riichiSticks: 0,
    dealerSeat: 0,
    players,
  });
}

/**
 * 1局を開始する（全員に12枚配牌＋親が1枚ツモ）
 */
export function setupRound(params: {
  roundWind: TileTypeId;
  kyoku: number;
  honba: number;
  riichiSticks: number;
  dealerSeat: SeatIndex;
  players: [MatchPlayerState, MatchPlayerState, MatchPlayerState, MatchPlayerState];
}): MightyMatchState {
  const wall = createShuffledWall(true);
  const doraIndicator = wall[0].typeId;
  let idx = 1;

  const nextPlayers = params.players.map((p): MatchPlayerState => {
    const hand = sortTiles(wall.slice(idx, idx + 12));
    idx += 12;
    return {
      ...p,
      hand,
      discards: [],
      isRiichi: false,
      riichiTurn: null,
    };
  }) as unknown as [
    MatchPlayerState,
    MatchPlayerState,
    MatchPlayerState,
    MatchPlayerState
  ];

  const firstTsumo = wall[idx++];
  const deadWallEndIndex = wall.length - 14; // 王牌14枚

  return {
    roundWind: params.roundWind,
    kyoku: params.kyoku,
    honba: params.honba,
    riichiSticks: params.riichiSticks,
    dealerSeat: params.dealerSeat,
    players: nextPlayers,
    wall,
    wallIndex: idx,
    deadWallEndIndex,
    doraIndicator,
    currentTurnSeat: params.dealerSeat,
    currentTsumo: firstTsumo,
    lastDiscard: null,
    humanCanRon: null,
    phase: params.dealerSeat === 0 ? 'player_action' : 'cpu_thinking',
    roundResult: null,
    turnCount: 1,
  };
}

/**
 * 特定プレイヤーの13枚（12枚＋ツモ/ロン牌）での和了評価
 */
export function evaluatePlayerMightyWin(
  state: MightyMatchState,
  seat: SeatIndex,
  winningTile: TileInstance,
  isTsumo: boolean
): ScoreResult | null {
  const player = state.players[seat];
  const tiles13 = [...player.hand, winningTile];
  const isParent = seat === state.dealerSeat;
  const seatWind = getSeatWind(seat, state.dealerSeat);

  const res = evaluateMightyAgari(tiles13, {
    winningTile: winningTile.typeId,
    doraIndicators: [state.doraIndicator],
    turn: state.turnCount <= 4 ? 1 : state.turnCount,
    isParent,
    roundWind: state.roundWind,
    seatWind,
  });

  if (!res) return null;

  // リーチ翻やツモ/ロン表記を補正
  const yaku = [...res.yaku];
  if (player.isRiichi && !yaku.some((y) => y.isYakuman)) {
    yaku.unshift({ name: '立直', han: 1 });
  }
  if (!isTsumo) {
    // ロン和了時は「門前清自摸和」を除外（ただし他役がなくても少牌マイティは即アガリ可／最小1翻扱い）
    const filtered = yaku.filter((y) => y.name !== '門前清自摸和');
    if (filtered.length === 0) {
      filtered.push({ name: 'マイティ栄和', han: 1 });
    }
    return {
      ...res,
      yaku: filtered,
    };
  }

  return {
    ...res,
    yaku,
  };
}

/**
 * CPU用の高速な手牌評価ヒューリスティック（孤立牌を優先して切る）
 */
function scoreHandShape(counts: number[], doraTileId: TileTypeId): number {
  let score = 0;
  for (let i = 0; i < TOTAL_TILE_TYPES; i++) {
    const c = counts[i];
    if (c === 0) continue;
    // ドラ価値
    if (i === doraTileId) score += c * 3;
    // 刻子・対子
    if (c >= 3) score += 28;
    else if (c === 2) score += 14;

    if (!isHonor(i)) {
      const n = getNumber(i);
      // 順子・両面・嵌張のつながり
      if (n <= 7 && counts[i + 1] > 0 && counts[i + 2] > 0) score += 18;
      if (n <= 8 && counts[i + 1] > 0) score += 8;
      if (n <= 7 && counts[i + 2] > 0) score += 4;
      // 中張牌はやや残しやすい
      if (n >= 3 && n <= 7) score += c * 2;
    }
  }
  return score;
}

/**
 * CPUが13枚（12枚手牌＋ツモ牌）から捨てる牌を選ぶ
 */
export function chooseCpuDiscard(
  state: MightyMatchState,
  seat: SeatIndex
): { discardUid: string; shouldRiichi: boolean } {
  const player = state.players[seat];
  const tsumo = state.currentTsumo!;
  if (player.isRiichi) {
    return { discardUid: tsumo.uid, shouldRiichi: false };
  }

  const all13 = [...player.hand, tsumo];
  const doraTileId = getDoraFromIndicator(state.doraIndicator);

  let bestUid = tsumo.uid;
  let bestHeuristic = -Infinity;

  for (const candidate of all13) {
    const remaining12 = all13.filter((t) => t.uid !== candidate.uid);
    const counts = toCountArray(remaining12);
    let h = scoreHandShape(counts, doraTileId);
    // 赤ドラはなるべく切らない
    if (candidate.isRed) h -= 5;
    if (candidate.typeId === doraTileId) h -= 4;

    if (h > bestHeuristic) {
      bestHeuristic = h;
      bestUid = candidate.uid;
    }
  }

  // リーチ判定：最善打牌後の12枚でテンパイしているか確認
  let shouldRiichi = false;
  if (player.score >= 1000 && state.wallIndex < state.deadWallEndIndex - 4) {
    const remaining12 = all13.filter((t) => t.uid !== bestUid);
    const waits = getMightyWaitingTiles(remaining12, [], {
      doraIndicators: [state.doraIndicator],
      isParent: seat === state.dealerSeat,
      roundWind: state.roundWind,
      seatWind: getSeatWind(seat, state.dealerSeat),
    });
    if (waits.length > 0) {
      shouldRiichi = true;
    }
  }

  return { discardUid: bestUid, shouldRiichi };
}

/**
 * 和了時の点数移動を計算して適用する
 */
export function applyAgari(
  state: MightyMatchState,
  winnerSeat: SeatIndex,
  loserSeat: SeatIndex | null,
  winningTile: TileInstance,
  scoreResult: ScoreResult
): MightyMatchState {
  const deltas: [number, number, number, number] = [0, 0, 0, 0];
  const honbaBonus = state.honba * 300;
  const riichiBonus = state.riichiSticks * 1000;
  const basePoints = scoreResult.points;

  if (loserSeat === null) {
    // ツモ和了
    const isDealer = winnerSeat === state.dealerSeat;
    if (isDealer) {
      const eachPay = Math.ceil(basePoints / 3 / 100) * 100 + state.honba * 100;
      for (let s = 0; s < 4; s++) {
        if (s !== winnerSeat) {
          deltas[s] -= eachPay;
          deltas[winnerSeat] += eachPay;
        }
      }
    } else {
      const dealerPay = Math.ceil(basePoints / 2 / 100) * 100 + state.honba * 100;
      const childPay = Math.ceil(basePoints / 4 / 100) * 100 + state.honba * 100;
      for (let s = 0; s < 4; s++) {
        if (s === winnerSeat) continue;
        const pay = s === state.dealerSeat ? dealerPay : childPay;
        deltas[s] -= pay;
        deltas[winnerSeat] += pay;
      }
    }
  } else {
    // ロン和了
    const pay = basePoints + honbaBonus;
    deltas[loserSeat] -= pay;
    deltas[winnerSeat] += pay;
  }

  deltas[winnerSeat] += riichiBonus;

  const nextPlayers = state.players.map((p, idx) => ({
    ...p,
    score: p.score + deltas[idx],
  })) as [MatchPlayerState, MatchPlayerState, MatchPlayerState, MatchPlayerState];

  return {
    ...state,
    players: nextPlayers,
    riichiSticks: 0,
    currentTsumo: null,
    humanCanRon: null,
    phase: 'round_end',
    roundResult: {
      type: 'agari',
      agari: {
        winnerSeat,
        loserSeat,
        winningTile,
        scoreResult,
        pointDeltas: deltas,
      },
      pointDeltas: deltas,
    },
  };
}

/**
 * 流局処理（ノーテン罰符：合計3000点をテンパイ者で山分け）
 */
export function applyRyuukyoku(state: MightyMatchState): MightyMatchState {
  const tenpaiSeats: SeatIndex[] = [];
  for (let s = 0 as SeatIndex; s < 4; s = (s + 1) as SeatIndex) {
    const waits = getMightyWaitingTiles(state.players[s].hand, [], {
      doraIndicators: [state.doraIndicator],
    });
    if (waits.length > 0) tenpaiSeats.push(s);
  }

  const deltas: [number, number, number, number] = [0, 0, 0, 0];
  if (tenpaiSeats.length > 0 && tenpaiSeats.length < 4) {
    const gain = 3000 / tenpaiSeats.length;
    const loss = 3000 / (4 - tenpaiSeats.length);
    for (let s = 0 as SeatIndex; s < 4; s = (s + 1) as SeatIndex) {
      deltas[s] = tenpaiSeats.includes(s) ? gain : -loss;
    }
  }

  const nextPlayers = state.players.map((p, idx) => ({
    ...p,
    score: p.score + deltas[idx],
  })) as [MatchPlayerState, MatchPlayerState, MatchPlayerState, MatchPlayerState];

  return {
    ...state,
    players: nextPlayers,
    currentTsumo: null,
    humanCanRon: null,
    phase: 'round_end',
    roundResult: {
      type: 'ryuukyoku',
      tenpaiSeats,
      pointDeltas: deltas,
    },
  };
}

/**
 * 打牌を実行し、ロン判定→次の手番ツモ（または流局）へ進める
 */
export function executeDiscard(
  state: MightyMatchState,
  seat: SeatIndex,
  discardUid: string,
  declareRiichi = false
): MightyMatchState {
  if (!state.currentTsumo) return state;

  const player = state.players[seat];
  const all13 = [...player.hand, state.currentTsumo];
  const discarded = all13.find((t) => t.uid === discardUid);
  if (!discarded) return state;

  const nextHand = sortTiles(all13.filter((t) => t.uid !== discardUid));
  let nextScore = player.score;
  let nextRiichiSticks = state.riichiSticks;
  let nextIsRiichi = player.isRiichi;
  let nextRiichiTurn = player.riichiTurn;

  if (declareRiichi && !player.isRiichi && player.score >= 1000) {
    nextScore -= 1000;
    nextRiichiSticks += 1;
    nextIsRiichi = true;
    nextRiichiTurn = player.discards.length;
  }

  const nextPlayers = state.players.map((p, idx) =>
    idx === seat
      ? {
          ...p,
          score: nextScore,
          hand: nextHand,
          discards: [
            ...p.discards,
            { tile: discarded, isRiichiDeclare: declareRiichi },
          ],
          isRiichi: nextIsRiichi,
          riichiTurn: nextRiichiTurn,
        }
      : p
  ) as [MatchPlayerState, MatchPlayerState, MatchPlayerState, MatchPlayerState];

  const baseAfterDiscard: MightyMatchState = {
    ...state,
    players: nextPlayers,
    riichiSticks: nextRiichiSticks,
    currentTsumo: null,
    lastDiscard: { seat, tile: discarded },
  };

  // 他家のロン判定（下家優先でチェック、人間がロン可能ならプロンプト表示）
  for (let offset = 1; offset <= 3; offset++) {
    const checkSeat = ((seat + offset) % 4) as SeatIndex;
    const ronScore = evaluatePlayerMightyWin(
      baseAfterDiscard,
      checkSeat,
      discarded,
      false
    );
    if (ronScore) {
      if (checkSeat === 0) {
        return {
          ...baseAfterDiscard,
          humanCanRon: ronScore,
          phase: 'ron_prompt',
        };
      }
      // CPUがリーチ中なら即ロン（リーチしていないCPUも高打点ならロン）
      if (baseAfterDiscard.players[checkSeat].isRiichi || ronScore.points >= 8000) {
        return applyAgari(baseAfterDiscard, checkSeat, seat, discarded, ronScore);
      }
    }
  }

  return advanceToNextDraw(baseAfterDiscard, ((seat + 1) % 4) as SeatIndex);
}

/**
 * 次のプレイヤーのツモへ進める（山が尽きたら流局）
 */
export function advanceToNextDraw(
  state: MightyMatchState,
  nextSeat: SeatIndex
): MightyMatchState {
  if (state.wallIndex >= state.deadWallEndIndex) {
    return applyRyuukyoku(state);
  }

  const nextTsumo = state.wall[state.wallIndex];
  return {
    ...state,
    wallIndex: state.wallIndex + 1,
    currentTurnSeat: nextSeat,
    currentTsumo: nextTsumo,
    humanCanRon: null,
    phase: nextSeat === 0 ? 'player_action' : 'cpu_thinking',
    turnCount: state.turnCount + 1,
  };
}

/**
 * 次局へ進む（連荘・オーラス終了判定を含む）
 */
export function proceedToNextRound(state: MightyMatchState): MightyMatchState {
  if (!state.roundResult) return state;

  let dealerContinues = false;
  if (state.roundResult.type === 'agari' && state.roundResult.agari) {
    dealerContinues = state.roundResult.agari.winnerSeat === state.dealerSeat;
  } else if (state.roundResult.type === 'ryuukyoku') {
    dealerContinues =
      state.roundResult.tenpaiSeats?.includes(state.dealerSeat) ?? false;
  }

  const nextHonba = dealerContinues
    ? state.honba + 1
    : state.roundResult.type === 'ryuukyoku'
    ? state.honba + 1
    : 0;
  const nextKyoku = dealerContinues ? state.kyoku : state.kyoku + 1;
  const nextDealer = dealerContinues
    ? state.dealerSeat
    : (((state.dealerSeat + 1) % 4) as SeatIndex);

  // トビ（誰かが0点未満）または東4局終了で終局
  const someoneBusted = state.players.some((p) => p.score < 0);
  if (someoneBusted || nextKyoku > 4) {
    return {
      ...state,
      phase: 'match_end',
    };
  }

  return setupRound({
    roundWind: state.roundWind,
    kyoku: nextKyoku,
    honba: nextHonba,
    riichiSticks: state.riichiSticks,
    dealerSeat: nextDealer,
    players: state.players,
  });
}
