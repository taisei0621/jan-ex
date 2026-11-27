import {
  HandDecomposition,
  Mentsu,
  ScoreResult,
  TileInstance,
  TileTypeId,
  WaitingTileInfo,
  YakuResult,
} from '../types/mahjong';
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

export interface EvaluateOptions {
  winningTile: TileTypeId; // ツモ牌（または仮の待ち牌）
  redDoraCount?: number;
  doraIndicators?: TileTypeId[];
  turn?: number;           // 1巡目なら天和判定
  isParent?: boolean;      // 親（東家）なら1.5倍
  roundWind?: TileTypeId;  // 場風 (27=東)
  seatWind?: TileTypeId;   // 自風 (27=東)
}

/**
 * ドラ表示牌から実際のドラ牌IDを取得
 */
export function getDoraFromIndicator(indicator: TileTypeId): TileTypeId {
  if (indicator < 27) {
    const suitBase = Math.floor(indicator / 9) * 9;
    return suitBase + ((indicator % 9 + 1) % 9);
  }
  if (indicator <= 30) {
    // 東(27) -> 南(28) -> 西(29) -> 北(30) -> 東(27)
    return 27 + ((indicator - 27 + 1) % 4);
  }
  // 白(31) -> 發(32) -> 中(33) -> 白(31)
  return 31 + ((indicator - 31 + 1) % 3);
}

/**
 * スート枚数のパリティ枝刈り（4面子1雀頭になり得るか O(1) チェック）
 */
function passesSuitParityCheck(counts: number[]): boolean {
  let headSuitFound = false;
  for (let s = 0; s < 3; s++) {
    let sum = 0;
    const base = s * 9;
    for (let i = 0; i < 9; i++) {
      sum += counts[base + i];
    }
    const mod = sum % 3;
    if (mod === 1) return false;
    if (mod === 2) {
      if (headSuitFound) return false;
      headSuitFound = true;
    }
  }
  // 字牌チェック: 順子が作れないので各牌 0, 2, 3 のみ許可（1, 4 は不可）
  let honorHeadCount = 0;
  for (let i = 27; i < 34; i++) {
    const c = counts[i];
    if (c === 1 || c === 4) return false;
    if (c === 2) honorHeadCount++;
  }
  if (headSuitFound && honorHeadCount > 0) return false;
  if (!headSuitFound && honorHeadCount !== 1) return false;
  return true;
}

/**
 * 12枚（4面子）をバックトラック分解して全パターンを列挙する
 */
function extractMentsu(
  counts: number[],
  currentMentsu: Mentsu[],
  results: Mentsu[][]
): void {
  // 最初の非ゼロ要素を探す
  let idx = -1;
  for (let i = 0; i < TOTAL_TILE_TYPES; i++) {
    if (counts[i] > 0) {
      idx = i;
      break;
    }
  }

  if (idx === -1) {
    results.push([...currentMentsu]);
    return;
  }

  // 1. 刻子として抜く
  if (counts[idx] >= 3) {
    counts[idx] -= 3;
    currentMentsu.push({ type: 'koutsu', tiles: [idx, idx, idx] });
    extractMentsu(counts, currentMentsu, results);
    currentMentsu.pop();
    counts[idx] += 3;
  }

  // 2. 順子として抜く（数牌かつ 7 以下: idx % 9 <= 6）
  if (idx < 27 && idx % 9 <= 6) {
    if (counts[idx + 1] > 0 && counts[idx + 2] > 0) {
      counts[idx]--;
      counts[idx + 1]--;
      counts[idx + 2]--;
      currentMentsu.push({ type: 'shuntsu', tiles: [idx, idx + 1, idx + 2] });
      extractMentsu(counts, currentMentsu, results);
      currentMentsu.pop();
      counts[idx]++;
      counts[idx + 1]++;
      counts[idx + 2]++;
    }
  }
}

/**
 * 14枚のカウント配列から、すべての和了分解パターンを列挙する
 */
export function findAllDecompositions(counts: number[]): HandDecomposition[] {
  const decompositions: HandDecomposition[] = [];

  // 1. 国士無双チェック
  let isKokushi = true;
  let hasKokushiPair = false;
  for (let i = 0; i < TOTAL_TILE_TYPES; i++) {
    if (isYaochuhai(i)) {
      if (counts[i] === 0) {
        isKokushi = false;
        break;
      }
      if (counts[i] === 2) hasKokushiPair = true;
    } else if (counts[i] > 0) {
      isKokushi = false;
      break;
    }
  }
  if (isKokushi && hasKokushiPair) {
    decompositions.push({ kind: 'kokushi' });
  }

  // 2. 七対子チェック
  let pairCount = 0;
  const pairs: TileTypeId[] = [];
  let isChiitoitsu = true;
  for (let i = 0; i < TOTAL_TILE_TYPES; i++) {
    if (counts[i] === 2) {
      pairCount++;
      pairs.push(i);
    } else if (counts[i] !== 0) {
      isChiitoitsu = false;
      break;
    }
  }
  if (isChiitoitsu && pairCount === 7) {
    decompositions.push({ kind: 'chiitoitsu', pairs });
  }

  // 3. 通常手（4面子1雀頭）チェック
  if (passesSuitParityCheck(counts)) {
    const work = [...counts];
    for (let head = 0; head < TOTAL_TILE_TYPES; head++) {
      if (work[head] >= 2) {
        work[head] -= 2;
        const mentsuPatterns: Mentsu[][] = [];
        extractMentsu(work, [], mentsuPatterns);
        for (const mentsu of mentsuPatterns) {
          decompositions.push({
            kind: 'standard',
            head,
            mentsu,
          });
        }
        work[head] += 2;
      }
    }
  }

  return decompositions;
}

/**
 * 翻数と符から点数とランク名を計算する
 */
function calculatePoints(
  han: number,
  fu: number,
  yakumanMultiplier: number,
  isParent: boolean
): { points: number; rankName: string } {
  if (yakumanMultiplier > 0) {
    const base = isParent ? 48000 : 32000;
    const names = ['', '役満', 'ダブル役満', 'トリプル役満', '四倍役満'];
    const rankName =
      yakumanMultiplier < names.length
        ? names[yakumanMultiplier]
        : `${yakumanMultiplier}倍役満`;
    return { points: base * yakumanMultiplier, rankName };
  }

  if (han >= 13) return { points: isParent ? 48000 : 32000, rankName: '数え役満' };
  if (han >= 11) return { points: isParent ? 36000 : 24000, rankName: '三倍満' };
  if (han >= 8) return { points: isParent ? 24000 : 16000, rankName: '倍満' };
  if (han >= 6) return { points: isParent ? 18000 : 12000, rankName: '跳満' };
  if (han === 5 || (han === 4 && fu >= 40) || (han === 3 && fu >= 70)) {
    return { points: isParent ? 12000 : 8000, rankName: '満貫' };
  }

  // 通常計算 (基本点 = fu * 2^(han + 2))
  const basePoint = fu * Math.pow(2, han + 2);
  // ツモ合計点（100点単位切り上げ相当）
  const raw = isParent ? basePoint * 6 : basePoint * 4;
  const points = Math.ceil(raw / 100) * 100;
  return { points, rankName: `${han}翻${fu}符` };
}

/**
 * 1つの分解パターンに対して役と点数を評価する
 */
function scoreDecomposition(
  decomp: HandDecomposition,
  counts: number[],
  substitutedTile: TileTypeId,
  options: EvaluateOptions
): ScoreResult {
  const {
    winningTile,
    redDoraCount = 0,
    doraIndicators = [],
    turn = 2,
    isParent = true,
    roundWind = 27,
    seatWind = 27,
  } = options;

  const yaku: YakuResult[] = [];
  let yakumanCount = 0;

  // 天和判定（1巡目ツモ）
  if (turn === 1) {
    yaku.push({ name: '天和', han: 13, isYakuman: true });
    yakumanCount++;
  }

  // 1. 国士無双
  if (decomp.kind === 'kokushi') {
    // 13面待ち判定: winningTile と substitutedTile を除いた時など、13種がもともと手牌にあるか
    // 実質 counts[winningTile] === 2 かつ winningTile が待ちなので、winningTileを抜いた13枚に13種全部あれば13面
    // マイティが別の么九牌を補っていた場合でも、ツモ牌を除いた残り12枚+マイティで13種揃っていれば13面待ち
    const isThirteenWait = counts[winningTile] === 2 && substitutedTile === winningTile;
    if (isThirteenWait || (counts[winningTile] === 2 && isYaochuhai(winningTile))) {
      // 正確には「winningTileを抜いた13枚（うち1枚マイティ）で13種が揃っているか」
      const temp = [...counts];
      temp[winningTile]--;
      // substitutedTileも1枚抜いて12枚にしたとき、12種すべてが1枚ずつあれば、
      // 12枚+マイティ1枚で13種揃っていた＝13面待ち！
      temp[substitutedTile]--;
      let distinctYaochu = 0;
      for (let i = 0; i < TOTAL_TILE_TYPES; i++) {
        if (isYaochuhai(i) && temp[i] === 1) distinctYaochu++;
      }
      if (distinctYaochu === 12) {
        yaku.push({ name: '国士無双十三面待ち', han: 26, isYakuman: true });
        yakumanCount += 2;
      } else {
        yaku.push({ name: '国士無双', han: 13, isYakuman: true });
        yakumanCount += 1;
      }
    } else {
      yaku.push({ name: '国士無双', han: 13, isYakuman: true });
      yakumanCount += 1;
    }

    const { points, rankName } = calculatePoints(0, 0, yakumanCount, isParent);
    return {
      isAgari: true,
      substitutedTile,
      yaku,
      totalHan: yakumanCount * 13,
      fu: 0,
      points,
      rankName,
      decomposition: decomp,
    };
  }

  // 共通の色・幺九牌判定
  let hasMan = false;
  let hasPin = false;
  let hasSou = false;
  let hasHonor = false;
  let allTanyao = true;
  let allYaochu = true;
  let allTerminals = true;
  let allGreen = true;

  for (let i = 0; i < TOTAL_TILE_TYPES; i++) {
    if (counts[i] > 0) {
      const s = getSuit(i);
      if (s === 'm') hasMan = true;
      if (s === 'p') hasPin = true;
      if (s === 's') hasSou = true;
      if (s === 'z') hasHonor = true;
      if (!isSimple(i)) allTanyao = false;
      if (!isYaochuhai(i)) allYaochu = false;
      if (!isTerminal(i)) allTerminals = false;
      if (!GREEN_TILE_IDS.has(i)) allGreen = false;
    }
  }

  const suitCount = (hasMan ? 1 : 0) + (hasPin ? 1 : 0) + (hasSou ? 1 : 0);

  // 字一色（七対子でも成立する）
  if (hasHonor && suitCount === 0) {
    yaku.push({ name: '字一色', han: 13, isYakuman: true });
    yakumanCount++;
  }

  // 2. 七対子
  if (decomp.kind === 'chiitoitsu') {
    if (yakumanCount === 0) {
      yaku.push({ name: '門前清自摸和', han: 1 });
      yaku.push({ name: '七対子', han: 2 });
      if (allTanyao) yaku.push({ name: '断幺九', han: 1 });
      if (allYaochu) yaku.push({ name: '混老頭', han: 2 });
      if (suitCount === 1) {
        if (hasHonor) yaku.push({ name: '混一色', han: 3 });
        else yaku.push({ name: '清一色', han: 6 });
      }
      // ドラ加算
      addDoraYaku(yaku, counts, doraIndicators, redDoraCount);
    }

    const totalHan = yaku.reduce((sum, y) => sum + y.han, 0);
    const { points, rankName } = calculatePoints(totalHan, 25, yakumanCount, isParent);
    return {
      isAgari: true,
      substitutedTile,
      yaku,
      totalHan,
      fu: 25,
      points,
      rankName,
      decomposition: decomp,
    };
  }

  // 3. 通常手（4面子1雀頭）
  const head = decomp.head!;
  const mentsu = decomp.mentsu!;
  const shuntsuList = mentsu.filter((m) => m.type === 'shuntsu');
  const koutsuList = mentsu.filter((m) => m.type === 'koutsu');

  // 役満判定
  // 四暗刻 / 四暗刻単騎（一人ツモなので4つすべて刻子なら必ず四暗刻）
  if (koutsuList.length === 4) {
    if (head === winningTile || head === substitutedTile) {
      // ツモ牌が頭なら単騎待ち（マイティが頭に化けた場合は単騎またはシャンポン）
      // 厳密にツモ牌が雀頭の場合を四暗刻単騎とする
      if (head === winningTile) {
        yaku.push({ name: '四暗刻単騎', han: 26, isYakuman: true });
        yakumanCount += 2;
      } else {
        yaku.push({ name: '四暗刻', han: 13, isYakuman: true });
        yakumanCount += 1;
      }
    } else {
      yaku.push({ name: '四暗刻', han: 13, isYakuman: true });
      yakumanCount += 1;
    }
  }

  // 大三元
  const dragonKoutsu = [31, 32, 33].filter((d) =>
    koutsuList.some((k) => k.tiles[0] === d)
  ).length;
  if (dragonKoutsu === 3) {
    yaku.push({ name: '大三元', han: 13, isYakuman: true });
    yakumanCount++;
  }

  // 小四喜・大四喜
  const windKoutsu = [27, 28, 29, 30].filter((w) =>
    koutsuList.some((k) => k.tiles[0] === w)
  ).length;
  const isWindHead = head >= 27 && head <= 30;
  if (windKoutsu === 4) {
    yaku.push({ name: '大四喜', han: 26, isYakuman: true });
    yakumanCount += 2;
  } else if (windKoutsu === 3 && isWindHead) {
    yaku.push({ name: '小四喜', han: 13, isYakuman: true });
    yakumanCount++;
  }

  // 緑一色
  if (allGreen) {
    yaku.push({ name: '緑一色', han: 13, isYakuman: true });
    yakumanCount++;
  }

  // 清老頭
  if (allTerminals) {
    yaku.push({ name: '清老頭', han: 13, isYakuman: true });
    yakumanCount++;
  }

  // 九蓮宝燈 / 純正九蓮宝燈
  if (suitCount === 1 && !hasHonor) {
    const base = hasMan ? 0 : hasPin ? 9 : 18;
    const isChuurenShape =
      counts[base] >= 3 &&
      counts[base + 8] >= 3 &&
      [1, 2, 3, 4, 5, 6, 7].every((offset) => counts[base + offset] >= 1);
    if (isChuurenShape) {
      // ツモ牌を引いた状態が1112345678999なら純正
      const temp = [...counts];
      temp[winningTile]--;
      const isPure =
        temp[base] === 3 &&
        temp[base + 8] === 3 &&
        [1, 2, 3, 4, 5, 6, 7].every((offset) => temp[base + offset] === 1);
      if (isPure) {
        yaku.push({ name: '純正九蓮宝燈', han: 26, isYakuman: true });
        yakumanCount += 2;
      } else {
        yaku.push({ name: '九蓮宝燈', han: 13, isYakuman: true });
        yakumanCount += 1;
      }
    }
  }

  // 役満が成立していれば通常役は加算しない
  if (yakumanCount > 0) {
    const { points, rankName } = calculatePoints(0, 0, yakumanCount, isParent);
    return {
      isAgari: true,
      substitutedTile,
      yaku,
      totalHan: yakumanCount * 13,
      fu: 0,
      points,
      rankName,
      decomposition: decomp,
    };
  }

  // --- 通常役判定 ---
  yaku.push({ name: '門前清自摸和', han: 1 });

  // 断幺九
  if (allTanyao) {
    yaku.push({ name: '断幺九', han: 1 });
  }

  // 平和判定（すべて順子、雀頭が役牌でない、待ちが両面）
  const isNonYakuhaiHead =
    head < 27 || (head !== 31 && head !== 32 && head !== 33 && head !== roundWind && head !== seatWind);
  const isRyanmenWait = shuntsuList.some((s) => {
    const first = s.tiles[0];
    const third = s.tiles[2];
    const firstNum = getNumber(first);
    const thirdNum = getNumber(third);
    // 両面待ち: 1-2-3の3(辺張は不可、123の1は4待ち側でなく1-2-3の3で1-2に3ならペンチャン)
    if (winningTile === first && firstNum !== 7) return true; // X+1, X+2 に X が入った (123の1は789の7でなければ両面)
    if (winningTile === third && thirdNum !== 3) return true; // X-2, X-1 に X が入った (123の3はペンチャン)
    return false;
  });
  const isPinfu = shuntsuList.length === 4 && isNonYakuhaiHead && isRyanmenWait;
  if (isPinfu) {
    yaku.push({ name: '平和', han: 1 });
  }

  // 一盃口・二盃口
  if (shuntsuList.length >= 2) {
    const shuntsuKeys = shuntsuList.map((s) => s.tiles[0]);
    const freq = new Map<number, number>();
    for (const k of shuntsuKeys) {
      freq.set(k, (freq.get(k) ?? 0) + 1);
    }
    let identicalPairs = 0;
    for (const count of freq.values()) {
      identicalPairs += Math.floor(count / 2);
    }
    if (identicalPairs === 2) {
      yaku.push({ name: '二盃口', han: 3 });
    } else if (identicalPairs === 1) {
      yaku.push({ name: '一盃口', han: 1 });
    }
  }

  // 役牌
  const yakuhaiNames: Record<number, string> = {
    31: '役牌 白',
    32: '役牌 發',
    33: '役牌 中',
  };
  for (const k of koutsuList) {
    const t = k.tiles[0];
    if (yakuhaiNames[t]) {
      yaku.push({ name: yakuhaiNames[t], han: 1 });
    } else if (t >= 27 && t <= 30) {
      if (t === roundWind && t === seatWind) {
        yaku.push({ name: 'ダブ東', han: 2 });
      } else if (t === roundWind) {
        yaku.push({ name: '場風牌', han: 1 });
      } else if (t === seatWind) {
        yaku.push({ name: '自風牌', han: 1 });
      }
    }
  }

  // 三色同順
  if (shuntsuList.length >= 3) {
    const byNum = new Map<number, Set<string>>();
    for (const s of shuntsuList) {
      const num = getNumber(s.tiles[0]);
      const suit = getSuit(s.tiles[0]);
      if (!byNum.has(num)) byNum.set(num, new Set());
      byNum.get(num)!.add(suit);
    }
    for (const suits of byNum.values()) {
      if (suits.has('m') && suits.has('p') && suits.has('s')) {
        yaku.push({ name: '三色同順', han: 2 });
        break;
      }
    }
  }

  // 三色同刻
  if (koutsuList.length >= 3) {
    const byNum = new Map<number, Set<string>>();
    for (const k of koutsuList) {
      const t = k.tiles[0];
      if (t < 27) {
        const num = getNumber(t);
        const suit = getSuit(t);
        if (!byNum.has(num)) byNum.set(num, new Set());
        byNum.get(num)!.add(suit);
      }
    }
    for (const suits of byNum.values()) {
      if (suits.has('m') && suits.has('p') && suits.has('s')) {
        yaku.push({ name: '三色同刻', han: 2 });
        break;
      }
    }
  }

  // 一気通貫
  if (shuntsuList.length >= 3) {
    for (const suit of ['m', 'p', 's'] as const) {
      const nums = new Set(
        shuntsuList
          .filter((s) => getSuit(s.tiles[0]) === suit)
          .map((s) => getNumber(s.tiles[0]))
      );
      if (nums.has(1) && nums.has(4) && nums.has(7)) {
        yaku.push({ name: '一気通貫', han: 2 });
        break;
      }
    }
  }

  // チャンタ / ジュンチャン / 混老頭
  if (allYaochu) {
    yaku.push({ name: '混老頭', han: 2 });
  } else {
    const isChanta =
      isYaochuhai(head) &&
      mentsu.every((m) => m.tiles.some((t) => isYaochuhai(t)));
    if (isChanta && shuntsuList.length > 0) {
      if (!hasHonor) {
        yaku.push({ name: '純全帯幺九', han: 3 });
      } else {
        yaku.push({ name: '混全帯幺九', han: 2 });
      }
    }
  }

  // 三暗刻
  if (koutsuList.length === 3) {
    yaku.push({ name: '三暗刻', han: 2 });
  }

  // 小三元
  if (dragonKoutsu === 2 && head >= 31 && head <= 33) {
    yaku.push({ name: '小三元', han: 2 });
  }

  // 混一色 / 清一色
  if (suitCount === 1) {
    if (hasHonor) yaku.push({ name: '混一色', han: 3 });
    else yaku.push({ name: '清一色', han: 6 });
  }

  // ドラ加算
  addDoraYaku(yaku, counts, doraIndicators, redDoraCount);

  // 符計算
  let fu = 20;
  if (!isPinfu) {
    fu += 2; // ツモ符
    // 雀頭符
    if (head >= 31) fu += 2;
    else if (head === roundWind && head === seatWind) fu += 4;
    else if (head === roundWind || head === seatWind) fu += 2;

    // 刻子符（すべて暗刻扱い）
    for (const k of koutsuList) {
      fu += isYaochuhai(k.tiles[0]) ? 8 : 4;
    }

    // 待ち符
    if (head === winningTile) {
      fu += 2; // 単騎
    } else if (!isRyanmenWait) {
      // 嵌張・辺張の可能性チェック
      const isKanchanOrPenchan = shuntsuList.some((s) => {
        if (s.tiles[1] === winningTile) return true;
        if (getNumber(s.tiles[0]) === 1 && winningTile === s.tiles[2]) return true;
        if (getNumber(s.tiles[2]) === 9 && winningTile === s.tiles[0]) return true;
        return false;
      });
      if (isKanchanOrPenchan) fu += 2;
    }
    fu = Math.ceil(fu / 10) * 10;
  }

  const totalHan = yaku.reduce((sum, y) => sum + y.han, 0);
  const { points, rankName } = calculatePoints(totalHan, fu, 0, isParent);

  return {
    isAgari: true,
    substitutedTile,
    yaku,
    totalHan,
    fu,
    points,
    rankName,
    decomposition: decomp,
  };
}

function addDoraYaku(
  yaku: YakuResult[],
  counts: number[],
  doraIndicators: TileTypeId[],
  redDoraCount: number
) {
  let dora = 0;
  for (const ind of doraIndicators) {
    const doraId = getDoraFromIndicator(ind);
    dora += counts[doraId];
  }
  if (dora > 0) {
    yaku.push({ name: 'ドラ', han: dora });
  }
  if (redDoraCount > 0) {
    yaku.push({ name: '赤ドラ', han: redDoraCount });
  }
}

/**
 * 少牌マイティ（通常牌13枚 + ★マイティ牌1枚）のアガリ判定と最高打点の探索
 */
export function evaluateMightyAgari(
  tiles13: TileInstance[],
  options: EvaluateOptions
): ScoreResult | null {
  const baseCounts = toCountArray(tiles13);
  const redDoraCount =
    options.redDoraCount ?? tiles13.filter((t) => t.isRed).length;

  let bestResult: ScoreResult | null = null;

  // 全34種から、★マイティが化ける牌を1つずつ代入して探索
  for (let subId = 0; subId < TOTAL_TILE_TYPES; subId++) {
    // すでに4枚使われている牌には化けられない
    if (baseCounts[subId] >= 4) continue;

    baseCounts[subId]++;
    const decomps = findAllDecompositions(baseCounts);
    for (const decomp of decomps) {
      const score = scoreDecomposition(decomp, baseCounts, subId, {
        ...options,
        redDoraCount,
      });
      if (
        !bestResult ||
        score.points > bestResult.points ||
        (score.points === bestResult.points && score.totalHan > bestResult.totalHan)
      ) {
        bestResult = score;
      }
    }
    baseCounts[subId]--;
  }

  return bestResult;
}

/**
 * 通常14枚（ワイルドカードなし）の和了判定と最高打点の探索
 */
export function evaluateStandardAgari14(
  tiles14: TileInstance[],
  options: EvaluateOptions
): ScoreResult | null {
  if (tiles14.length !== 14) return null;
  const counts = toCountArray(tiles14);
  const redDoraCount =
    options.redDoraCount ?? tiles14.filter((t) => t.isRed).length;

  let bestResult: ScoreResult | null = null;
  const decomps = findAllDecompositions(counts);
  for (const decomp of decomps) {
    const score = scoreDecomposition(decomp, counts, options.winningTile, {
      ...options,
      redDoraCount,
    });
    if (
      !bestResult ||
      score.points > bestResult.points ||
      (score.points === bestResult.points && score.totalHan > bestResult.totalHan)
    ) {
      bestResult = score;
    }
  }
  return bestResult;
}

/**
 * 12枚の手牌（＋★マイティ1枚）に対する「待ち牌」をすべて算出する
 */
export function getMightyWaitingTiles(
  hand12: TileInstance[],
  visibleTiles: TileInstance[] = [],
  options: Omit<EvaluateOptions, 'winningTile'> = {}
): WaitingTileInfo[] {
  const handOnly = hand12.filter((t) => !t.isWildcard);
  if (handOnly.length !== 12) return [];

  const handCounts = toCountArray(handOnly);
  const visibleCounts = toCountArray(visibleTiles);
  const waits: WaitingTileInfo[] = [];

  for (let tileId = 0; tileId < TOTAL_TILE_TYPES; tileId++) {
    // 手牌に既に4枚ある牌は自分で引けない
    if (handCounts[tileId] >= 4) continue;

    const virtualTile: TileInstance = {
      uid: `wait-${tileId}`,
      typeId: tileId,
    };
    const result = evaluateMightyAgari([...handOnly, virtualTile], {
      ...options,
      winningTile: tileId,
      redDoraCount: handOnly.filter((t) => t.isRed).length,
    });

    if (result && result.isAgari) {
      const used = handCounts[tileId] + visibleCounts[tileId];
      waits.push({
        tileId,
        remainingCount: Math.max(0, 4 - used),
        bestScore: result,
      });
    }
  }

  // 待ち牌を点数が高い順または牌番号順にソート（ここでは牌番号順）
  return waits.sort((a, b) => a.tileId - b.tileId);
}
