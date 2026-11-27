import { TileInstance, TileTypeId } from '@/types/mahjong';
import {
  getNumber,
  getSuit,
  isHonor,
  sortTiles,
  TILE_NAMES,
  TOTAL_TILE_TYPES,
} from './tiles';

export type WashizuDifficulty = 'easy' | 'normal' | 'hard';

export interface WashizuPuzzle {
  id: string;
  difficulty: WashizuDifficulty;
  opponentHand: TileInstance[]; // 13枚（1〜2枚が isBack: true の黒牌）
  opponentActualHand: TileInstance[]; // 正解表示用（全て表向き）
  opponentDiscards: TileInstance[]; // 相手の捨て牌（河）
  playerHand: TileInstance[]; // 自分の手牌（手がかり用）
  doraIndicator: TileInstance;
  hiddenBlackTileIds: TileTypeId[]; // 隠された黒牌のtypeId
  winningWaits: TileTypeId[]; // 相手の当たり牌（正解候補）
  waitShapeLabel: string; // 両面待ち, シャンポン待ち, 嵌張待ち, 単騎待ち, 七対子 など
  explanation: string;
}

/**
 * 鷲巣麻雀用の136枚牌山を作成（各牌種：透明ガラス牌3枚 ＋ 不透明黒牌1枚）
 */
export function createWashizuDeck(useRedDora = true): TileInstance[] {
  const deck: TileInstance[] = [];
  for (let typeId = 0; typeId < TOTAL_TILE_TYPES; typeId++) {
    for (let copy = 0; copy < 4; copy++) {
      // copy === 0 が唯一の黒牌（不透明）、copy 1..3 が透明ガラス牌
      const isGlass = copy !== 0;
      const isRed =
        useRedDora &&
        copy === 1 &&
        (typeId === 4 || typeId === 13 || typeId === 22); // 赤5m, 5p, 5s はガラス牌のうち1枚
      deck.push({
        uid: `washizu-${typeId}-${copy}`,
        typeId,
        isGlass,
        isRed,
      });
    }
  }
  return deck;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * 通常の14枚（4面子1雀頭 or 七対子）の和了判定（バックトラック）
 */
export function isStandardAgari14(counts: number[]): boolean {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total !== 14) return false;

  // 七対子チェック
  let pairs = 0;
  for (let i = 0; i < TOTAL_TILE_TYPES; i++) {
    if (counts[i] === 2) pairs++;
    else if (counts[i] !== 0) {
      pairs = -1;
      break;
    }
  }
  if (pairs === 7) return true;

  // 4面子1雀頭チェック
  for (let head = 0; head < TOTAL_TILE_TYPES; head++) {
    if (counts[head] < 2) continue;
    counts[head] -= 2;
    if (canFormMentsu(counts, 0)) {
      counts[head] += 2;
      return true;
    }
    counts[head] += 2;
  }
  return false;
}

function canFormMentsu(counts: number[], startIdx: number): boolean {
  let idx = startIdx;
  while (idx < TOTAL_TILE_TYPES && counts[idx] === 0) {
    idx++;
  }
  if (idx >= TOTAL_TILE_TYPES) return true;

  // 刻子
  if (counts[idx] >= 3) {
    counts[idx] -= 3;
    if (canFormMentsu(counts, idx)) {
      counts[idx] += 3;
      return true;
    }
    counts[idx] += 3;
  }

  // 順子（数牌かつ 1〜7）
  if (!isHonor(idx) && getNumber(idx) <= 7) {
    if (counts[idx + 1] > 0 && counts[idx + 2] > 0) {
      counts[idx]--;
      counts[idx + 1]--;
      counts[idx + 2]--;
      if (canFormMentsu(counts, idx)) {
        counts[idx]++;
        counts[idx + 1]++;
        counts[idx + 2]++;
        return true;
      }
      counts[idx]++;
      counts[idx + 1]++;
      counts[idx + 2]++;
    }
  }

  return false;
}

/**
 * 13枚の手牌に対する全ての待ち牌（当たり牌）を返す
 */
export function getStandardWaitingTiles(counts13: number[]): TileTypeId[] {
  const waits: TileTypeId[] = [];
  for (let t = 0; t < TOTAL_TILE_TYPES; t++) {
    if (counts13[t] >= 4) continue;
    counts13[t]++;
    if (isStandardAgari14(counts13)) {
      waits.push(t);
    }
    counts13[t]--;
  }
  return waits;
}

/**
 * ランダムな面子（順子 or 刻子）のtypeId配列を1つ生成
 */
function pickRandomMentsu(
  availCounts: number[],
  preferShuntsu = true
): [TileTypeId, TileTypeId, TileTypeId] | null {
  const candidates: [TileTypeId, TileTypeId, TileTypeId][] = [];

  for (let t = 0; t < TOTAL_TILE_TYPES; t++) {
    if (!isHonor(t) && getNumber(t) <= 7) {
      if (availCounts[t] >= 1 && availCounts[t + 1] >= 1 && availCounts[t + 2] >= 1) {
        candidates.push([t, t + 1, t + 2]);
        if (preferShuntsu) {
          candidates.push([t, t + 1, t + 2]);
        }
      }
    }
    if (availCounts[t] >= 3) {
      candidates.push([t, t, t]);
    }
  }

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * 鷲巣麻雀・相手の当たり牌推理パズルを生成
 */
export function generateWashizuPuzzle(
  difficulty: WashizuDifficulty = 'normal'
): WashizuPuzzle {
  for (let attempt = 0; attempt < 50; attempt++) {
    const avail = new Array(TOTAL_TILE_TYPES).fill(4);
    const handIds: TileTypeId[] = [];
    let waitShapeLabel = '両面待ち';

    if (difficulty === 'normal' && Math.random() < 0.28) {
      // 七対子テンパイ（6対子 + 単騎1枚）
      const pool = shuffleArray(
        Array.from({ length: TOTAL_TILE_TYPES }, (_, i) => i)
      );
      for (let i = 0; i < 6; i++) {
        const t = pool[i];
        handIds.push(t, t);
        avail[t] -= 2;
      }
      const tanki = pool[6];
      handIds.push(tanki);
      avail[tanki] -= 1;
      waitShapeLabel = '七対子・単騎待ち';
    } else {
      // 3面子 + 1雀頭 + 1搭子（または4面子 + 単騎）
      let ok = true;
      for (let m = 0; m < 3; m++) {
        const mentsu = pickRandomMentsu(avail, true);
        if (!mentsu) {
          ok = false;
          break;
        }
        for (const t of mentsu) {
          avail[t]--;
          handIds.push(t);
        }
      }
      if (!ok) continue;

      // 4つ目のブロック：難易度によって形を変える
      const modeRoll = Math.random();
      if (difficulty === 'easy' || modeRoll < 0.55) {
        // 雀頭 + 両面 or 嵌張搭子
        const pairCandidates = Array.from({ length: TOTAL_TILE_TYPES }, (_, i) => i).filter(
          (t) => avail[t] >= 2
        );
        if (pairCandidates.length === 0) continue;
        const head = pairCandidates[Math.floor(Math.random() * pairCandidates.length)];
        avail[head] -= 2;
        handIds.push(head, head);

        // 搭子（両面優先）
        const ryanmenCandidates: [TileTypeId, TileTypeId][] = [];
        const kanchanCandidates: [TileTypeId, TileTypeId][] = [];
        for (let t = 0; t < 27; t++) {
          const n = getNumber(t);
          if (n >= 2 && n <= 7 && avail[t] >= 1 && avail[t + 1] >= 1) {
            ryanmenCandidates.push([t, t + 1]);
          }
          if (n <= 7 && avail[t] >= 1 && avail[t + 2] >= 1) {
            kanchanCandidates.push([t, t + 2]);
          }
        }
        if (ryanmenCandidates.length > 0 && (difficulty === 'easy' || Math.random() < 0.7)) {
          const [a, b] = ryanmenCandidates[Math.floor(Math.random() * ryanmenCandidates.length)];
          avail[a]--;
          avail[b]--;
          handIds.push(a, b);
          waitShapeLabel = '両面待ち';
        } else if (kanchanCandidates.length > 0) {
          const [a, b] = kanchanCandidates[Math.floor(Math.random() * kanchanCandidates.length)];
          avail[a]--;
          avail[b]--;
          handIds.push(a, b);
          waitShapeLabel = '嵌張待ち';
        } else {
          continue;
        }
      } else if (modeRoll < 0.8) {
        // シャンポン待ち（対子2つ）
        const pairCandidates = Array.from({ length: TOTAL_TILE_TYPES }, (_, i) => i).filter(
          (t) => avail[t] >= 2
        );
        if (pairCandidates.length < 2) continue;
        const shuffledPairs = shuffleArray(pairCandidates);
        const p1 = shuffledPairs[0];
        const p2 = shuffledPairs[1];
        avail[p1] -= 2;
        avail[p2] -= 2;
        handIds.push(p1, p1, p2, p2);
        waitShapeLabel = 'シャンポン待ち';
      } else {
        // 4面子 + 単騎
        const mentsu4 = pickRandomMentsu(avail, true);
        if (!mentsu4) continue;
        for (const t of mentsu4) {
          avail[t]--;
          handIds.push(t);
        }
        const tankiCandidates = Array.from({ length: TOTAL_TILE_TYPES }, (_, i) => i).filter(
          (t) => avail[t] >= 1
        );
        if (tankiCandidates.length === 0) continue;
        const tanki = tankiCandidates[Math.floor(Math.random() * tankiCandidates.length)];
        avail[tanki]--;
        handIds.push(tanki);
        waitShapeLabel = '単騎待ち';
      }
    }

    if (handIds.length !== 13) continue;

    // 待ち牌を計算
    const counts13 = new Array(TOTAL_TILE_TYPES).fill(0);
    for (const id of handIds) counts13[id]++;
    const winningWaits = getStandardWaitingTiles(counts13);
    if (winningWaits.length === 0) continue;

    // 鷲巣デッキから実牌を割り当て
    const deck = createWashizuDeck(true);
    const blackUsed = new Set<TileTypeId>();
    const blackCountTarget = difficulty === 'hard' ? 2 : 1;

    // まず手牌の最後の1〜2枚（待ちに関わる部分）を優先的に黒牌にする
    const oppActualTiles: TileInstance[] = [];
    const usedUids = new Set<string>();

    // 黒牌にするインデックスを選択（後半の待ちブロック優先）
    const hiddenIndices = new Set<number>();
    if (blackCountTarget === 1) {
      hiddenIndices.add(12);
    } else {
      hiddenIndices.add(11);
      hiddenIndices.add(12);
    }

    let assignOk = true;
    for (let i = 0; i < 13; i++) {
      const tid = handIds[i];
      const wantBlack = hiddenIndices.has(i) && !blackUsed.has(tid);
      let candidate = deck.find(
        (d) => !usedUids.has(d.uid) && d.typeId === tid && d.isGlass === !wantBlack
      );
      if (!candidate) {
        candidate = deck.find((d) => !usedUids.has(d.uid) && d.typeId === tid);
      }
      if (!candidate) {
        assignOk = false;
        break;
      }
      usedUids.add(candidate.uid);
      if (!candidate.isGlass) blackUsed.add(tid);
      oppActualTiles.push(candidate);
    }
    if (!assignOk) continue;

    // ソートしつつ、どの牌が隠された黒牌か追跡
    const hiddenUids = new Set<string>();
    const hiddenBlackTileIds: TileTypeId[] = [];
    for (const idx of hiddenIndices) {
      const t = oppActualTiles[idx];
      hiddenUids.add(t.uid);
      hiddenBlackTileIds.push(t.typeId);
    }

    const sortedActual = sortTiles(oppActualTiles);
    const opponentHand: TileInstance[] = sortedActual.map((t) =>
      hiddenUids.has(t.uid) ? { ...t, isBack: true } : t
    );

    // 残りデッキからフリテンにならない捨て牌（6〜8枚）、ドラ表示牌（1枚）、自分の手牌（13枚）を配る
    const waitSet = new Set(winningWaits);
    const remaining = shuffleArray(deck.filter((d) => !usedUids.has(d.uid)));

    const doraIndicator = remaining.find((d) => d.isGlass) || remaining[0];
    usedUids.add(doraIndicator.uid);

    const discardPool = remaining.filter(
      (d) => !usedUids.has(d.uid) && !waitSet.has(d.typeId)
    );
    const discardCount = difficulty === 'easy' ? 6 : 8;
    const opponentDiscards = discardPool.slice(0, discardCount);
    for (const d of opponentDiscards) usedUids.add(d.uid);

    const playerPool = remaining.filter((d) => !usedUids.has(d.uid));
    const playerHand = sortTiles(playerPool.slice(0, 13));

    const waitNames = winningWaits.map((w) => TILE_NAMES[w]).join('・');
    const hiddenNames = hiddenBlackTileIds.map((h) => TILE_NAMES[h]).join(' と ');
    const explanation = `相手の伏せられた黒牌は「${hiddenNames}」。残りの透明ガラス牌と組み合わせることで【${waitShapeLabel}】が完成し、当たり牌は「${waitNames}」となります！`;

    return {
      id: `washizu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      difficulty,
      opponentHand,
      opponentActualHand: sortedActual,
      opponentDiscards,
      playerHand,
      doraIndicator,
      hiddenBlackTileIds,
      winningWaits,
      waitShapeLabel,
      explanation,
    };
  }

  // フォールバック（万が一ループを抜けた場合）
  return generateWashizuPuzzle('easy');
}

export function getWashizuSuitHint(waits: TileTypeId[]): string {
  const suits = new Set(waits.map((w) => getSuit(w)));
  const labels: Record<string, string> = {
    m: '萬子',
    p: '筒子',
    s: '索子',
    z: '字牌',
  };
  return Array.from(suits)
    .map((s) => labels[s])
    .join('・');
}
