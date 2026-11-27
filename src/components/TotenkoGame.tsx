'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Coins,
  RotateCcw,
  Trophy,
  Flame,
  Zap,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { TileInstance, TileTypeId } from '@/types/mahjong';
import { sortTiles, TILE_NAMES } from '@/engine/tiles';
import {
  createTotenkoWall,
  evaluateTotenkoAgari,
  getTotenkoDora,
  getTotenkoWaitingTiles,
  TotenkoScoreResult,
  TotenkoWaitingInfo,
} from '@/engine/totenkoScoring';
import { MahjongTile } from './MahjongTile';
import { LeaderboardPanel } from './LeaderboardPanel';

const MAX_TURNS = 12;
const STORAGE_KEY = 'jan_ex_totenko_highscores_v1';
const NORTH_ID = 30;

interface TotenkoHighScore {
  points: number;
  title: string;
  turnsUsed: number;
  date: string;
}

interface TotenkoState {
  wall: TileInstance[];
  wallIndex: number;
  hand: TileInstance[]; // 13枚
  tsumo: TileInstance | null; // ツモ牌
  garis: TileInstance[]; // 抜いた北牌
  discards: TileInstance[];
  doraIndicator: TileTypeId;
  turn: number;
  isRiichi: boolean;
  status: 'playing' | 'agari' | 'ryuukyoku';
  agariResult: TotenkoScoreResult | null;
}

/**
 * 配列から北（ガリ）を自動抜きし、嶺上牌を補充する
 */
function extractNorthTiles(
  initialTiles: TileInstance[],
  wall: TileInstance[],
  startIdx: number
): { cleanTiles: TileInstance[]; extracted: TileInstance[]; nextIdx: number } {
  const cleanTiles: TileInstance[] = [];
  const extracted: TileInstance[] = [];
  let idx = startIdx;

  const queue = [...initialTiles];
  while (queue.length > 0) {
    const t = queue.shift()!;
    if (t.typeId === NORTH_ID) {
      extracted.push(t);
      if (idx < wall.length) {
        queue.push(wall[idx]);
        idx++;
      }
    } else {
      cleanTiles.push(t);
    }
  }
  return { cleanTiles, extracted, nextIdx: idx };
}

function initTotenkoGame(): TotenkoState {
  const wall = createTotenkoWall(true);
  const doraIndicator = wall[0].typeId;
  const rawHand = wall.slice(1, 14);
  const { cleanTiles: handClean, extracted: handGaris, nextIdx } = extractNorthTiles(
    rawHand,
    wall,
    14
  );

  let tsumo: TileInstance | null = null;
  let allGaris = [...handGaris];
  let wallIdx = nextIdx;

  if (wallIdx < wall.length) {
    const { cleanTiles: tsumoClean, extracted: tsumoGaris, nextIdx: afterTsumoIdx } =
      extractNorthTiles([wall[wallIdx]], wall, wallIdx + 1);
    tsumo = tsumoClean[0] ?? null;
    allGaris = [...allGaris, ...tsumoGaris];
    wallIdx = afterTsumoIdx;
  }

  return {
    wall,
    wallIndex: wallIdx,
    hand: sortTiles(handClean),
    tsumo,
    garis: allGaris,
    discards: [],
    doraIndicator,
    turn: 1,
    isRiichi: false,
    status: 'playing',
    agariResult: null,
  };
}

export const TotenkoGame: React.FC = () => {
  const [game, setGame] = useState<TotenkoState | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [oneClickDiscard, setOneClickDiscard] = useState(true);
  const [highScores, setHighScores] = useState<TotenkoHighScore[]>([]);
  const [isNewRecord, setIsNewRecord] = useState(false);

  useEffect(() => {
    setGame(initTotenkoGame());
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setHighScores(JSON.parse(saved));
    } catch {
      // ignore
    }
  }, []);

  const doraTileId = useMemo(
    () => (game ? getTotenkoDora(game.doraIndicator) : 0),
    [game]
  );

  // 14枚でのアガリ判定
  const currentAgari: TotenkoScoreResult | null = useMemo(() => {
    if (!game || game.status !== 'playing' || !game.tsumo) return null;
    return evaluateTotenkoAgari([...game.hand, game.tsumo], {
      doraTileId,
      gariCount: game.garis.length,
      isRiichi: game.isRiichi,
      isTsumo: true,
    });
  }, [game, doraTileId]);

  // 13枚での待ち牌（ツモ前 or 打牌候補確認用）
  const currentWaits: TotenkoWaitingInfo[] = useMemo(() => {
    if (!game || game.status !== 'playing') return [];
    return getTotenkoWaitingTiles(game.hand, {
      doraTileId,
      gariCount: game.garis.length,
      isRiichi: game.isRiichi,
    });
  }, [game, doraTileId]);

  // 選択中の牌を捨てた場合の待ち牌プレビュー
  const previewWaits: TotenkoWaitingInfo[] = useMemo(() => {
    if (!game || game.status !== 'playing' || !selectedUid || !game.tsumo) return [];
    const all14 = [...game.hand, game.tsumo];
    const remaining13 = all14.filter((t) => t.uid !== selectedUid);
    if (remaining13.length !== 13) return [];
    return getTotenkoWaitingTiles(remaining13, {
      doraTileId,
      gariCount: game.garis.length,
      isRiichi: game.isRiichi,
    });
  }, [game, selectedUid, doraTileId]);

  const handleRestart = useCallback(() => {
    setGame(initTotenkoGame());
    setSelectedUid(null);
    setIsNewRecord(false);
  }, []);

  const handleDiscard = useCallback(
    (uid: string) => {
      if (!game || game.status !== 'playing' || !game.tsumo) return;
      if (game.isRiichi && uid !== game.tsumo.uid) return; // リーチ後はツモ切りのみ

      const all14 = [...game.hand, game.tsumo];
      const discarded = all14.find((t) => t.uid === uid);
      if (!discarded) return;

      const nextHand = sortTiles(all14.filter((t) => t.uid !== uid));
      const nextDiscards = [...game.discards, discarded];

      if (game.turn >= MAX_TURNS || game.wallIndex >= game.wall.length) {
        setGame({
          ...game,
          hand: nextHand,
          tsumo: null,
          discards: nextDiscards,
          status: 'ryuukyoku',
        });
        setSelectedUid(null);
        return;
      }

      const { cleanTiles, extracted, nextIdx } = extractNorthTiles(
        [game.wall[game.wallIndex]],
        game.wall,
        game.wallIndex + 1
      );

      if (cleanTiles.length === 0) {
        setGame({
          ...game,
          hand: nextHand,
          tsumo: null,
          garis: [...game.garis, ...extracted],
          discards: nextDiscards,
          wallIndex: nextIdx,
          status: 'ryuukyoku',
        });
        setSelectedUid(null);
        return;
      }

      setGame({
        ...game,
        hand: nextHand,
        tsumo: cleanTiles[0],
        garis: [...game.garis, ...extracted],
        discards: nextDiscards,
        wallIndex: nextIdx,
        turn: game.turn + 1,
      });
      setSelectedUid(null);
    },
    [game]
  );

  const handleTileClick = (uid: string) => {
    if (!game || game.status !== 'playing') return;
    if (game.isRiichi && game.tsumo && uid !== game.tsumo.uid) return;

    if (oneClickDiscard) {
      handleDiscard(uid);
      return;
    }
    if (selectedUid === uid) {
      handleDiscard(uid);
    } else {
      setSelectedUid(uid);
    }
  };

  const handleDeclareRiichi = () => {
    if (!game || game.status !== 'playing' || game.isRiichi || !game.tsumo) return;
    setGame({ ...game, isRiichi: true });
  };

  const handleAgari = () => {
    if (!game || !currentAgari) return;
    setGame({
      ...game,
      status: 'agari',
      agariResult: currentAgari,
    });

    const record: TotenkoHighScore = {
      points: currentAgari.totalPoints,
      title: currentAgari.title,
      turnsUsed: game.turn,
      date: new Date().toLocaleDateString('ja-JP'),
    };
    const prevBest = highScores[0]?.points ?? 0;
    if (currentAgari.totalPoints > prevBest) {
      setIsNewRecord(true);
    }
    const updated = [...highScores, record]
      .sort((a, b) => b.points - a.points)
      .slice(0, 5);
    setHighScores(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }

    confetti({
      particleCount: 110,
      spread: 75,
      origin: { y: 0.6 },
    });
  };

  if (!game) return null;

  const displayedWaits = selectedUid ? previewWaits : currentWaits;

  return (
    <div className="space-y-5">
      {/* 上部ステータスバー */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-black/35 border border-amber-700/40 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm font-bold">
          <div className="flex items-center gap-1.5 text-amber-300">
            <Flame className="w-4 h-4" />
            <span>
              巡目: {game.turn} / {MAX_TURNS}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-300">
            <Coins className="w-4 h-4" />
            <span>ガリ（北抜き）: {game.garis.length}枚 (+{game.garis.length}点)</span>
          </div>
          {game.garis.length === 0 && (
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-amber-200 border border-amber-500/30 text-[11px]">
              カラス圏内 (+3点)
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-emerald-200/80 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={oneClickDiscard}
              onChange={(e) => {
                setOneClickDiscard(e.target.checked);
                setSelectedUid(null);
              }}
              className="accent-amber-400"
            />
            1クリック打牌
          </label>
          <button
            type="button"
            onClick={handleRestart}
            className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1.5 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            新規局
          </button>
        </div>
      </div>

      {/* 麻雀卓 */}
      <div className="mahjong-table-bg border-2 border-amber-600/40 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-6">
        {/* ドラ・ガリ・待ち情報 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-black/30 border border-emerald-800/50 rounded-2xl p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-amber-300">ドラ表示牌</p>
              <p className="text-[11px] text-emerald-200/70 mt-0.5">
                ドラ: <strong className="text-white">{TILE_NAMES[doraTileId]}</strong>
                （1m⇔9m）
              </p>
            </div>
            <MahjongTile tile={{ typeId: game.doraIndicator }} size="sm" isDora />
          </div>

          <div className="md:col-span-2 bg-black/30 border border-emerald-800/50 rounded-2xl p-3.5 space-y-2">
            <p className="text-xs font-bold text-emerald-300">
              抜いたガリ（北）※引いた瞬間に自動抜き＆嶺上ツモ
            </p>
            {game.garis.length === 0 ? (
              <p className="text-xs text-slate-400">
                まだ北を抜いていません（0枚のままアガると「カラス +3点」！）
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {game.garis.map((g) => (
                  <MahjongTile key={g.uid} tile={g} size="xs" isDora />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 捨て牌（河） */}
        <div className="bg-black/25 border border-emerald-800/40 rounded-2xl p-3.5 space-y-2">
          <p className="text-xs font-bold text-emerald-300/80">自分の捨て牌（河）</p>
          {game.discards.length === 0 ? (
            <p className="text-xs text-slate-400">まだ捨て牌はありません</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {game.discards.map((d) => (
                <MahjongTile key={d.uid} tile={d} size="sm" />
              ))}
            </div>
          )}
        </div>

        {/* リアルタイム待ち牌 */}
        {game.status === 'playing' && (
          <div className="bg-black/35 border border-amber-500/30 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                <Zap className="w-4 h-4" />
                {selectedUid ? '選択牌を切った場合の待ち:' : '現在の待ち牌（テンパイ状況）:'}
              </span>
              {currentWaits.length > 0 && !game.isRiichi && (
                <button
                  type="button"
                  onClick={handleDeclareRiichi}
                  className="px-3 py-1 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-black transition shadow"
                >
                  リーチ宣言 (+1点)
                </button>
              )}
              {game.isRiichi && (
                <span className="px-2.5 py-0.5 rounded-full bg-rose-500/25 border border-rose-400 text-rose-200 text-xs font-black">
                  リーチ中（ツモ切り）
                </span>
              )}
            </div>
            {displayedWaits.length === 0 ? (
              <p className="text-xs text-slate-400">ノーテン</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {displayedWaits.map((w) => (
                  <div
                    key={w.tileId}
                    className="flex items-center gap-1.5 bg-emerald-950/80 border border-emerald-700/60 px-2 py-1 rounded-xl"
                  >
                    <MahjongTile tile={{ typeId: w.tileId }} size="xs" />
                    <span className="text-xs font-black text-amber-300">
                      {w.bestScore.totalPoints}点
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 自分の手牌（13枚＋ツモ） */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs sm:text-sm font-black text-white">
              あなたの手牌（2m〜8m抜きのサンマ構成）
            </p>
            {currentAgari && game.status === 'playing' && (
              <button
                type="button"
                onClick={handleAgari}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/30 animate-bounce flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                ツモ！（{currentAgari.totalPoints}点）
              </button>
            )}
          </div>

          <div className="bg-black/40 border border-emerald-700/50 rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
            {game.hand.map((tile) => (
              <MahjongTile
                key={tile.uid}
                tile={tile}
                size="md"
                isDora={tile.typeId === doraTileId}
                selected={selectedUid === tile.uid}
                disabled={game.status !== 'playing' || game.isRiichi}
                onClick={() => handleTileClick(tile.uid)}
              />
            ))}
            {game.tsumo && (
              <MahjongTile
                key={game.tsumo.uid}
                tile={game.tsumo}
                size="md"
                isTsumo
                isDora={game.tsumo.typeId === doraTileId}
                selected={selectedUid === game.tsumo.uid}
                disabled={game.status !== 'playing'}
                onClick={() => handleTileClick(game.tsumo!.uid)}
              />
            )}
          </div>
        </div>

        {/* アガリ／流局結果 */}
        {game.status === 'agari' && game.agariResult && (
          <div className="bg-gradient-to-br from-amber-950/90 via-slate-900/95 to-emerald-950/90 border-2 border-amber-400 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-amber-400" />
                <h3 className="text-xl font-black text-amber-300">
                  {game.agariResult.title}
                </h3>
                {isNewRecord && (
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-500 text-white text-xs font-black">
                    NEW RECORD!
                  </span>
                )}
              </div>
              <span className="text-xs text-emerald-200 font-bold">
                {game.turn}巡目ツモ和了
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {game.agariResult.items.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-black/40 border border-amber-500/30 rounded-xl px-3 py-2 flex items-center justify-between text-xs"
                >
                  <span className="text-emerald-100 font-bold">{item.label}</span>
                  <span className="text-amber-300 font-black">+{item.points}点</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {game.status === 'ryuukyoku' && (
          <div className="bg-slate-900/90 border border-slate-700 rounded-2xl p-5 text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-slate-300 font-black">
              <AlertCircle className="w-5 h-5" />
              <span>流局（{MAX_TURNS}巡終了）</span>
            </div>
            <p className="text-xs text-slate-400">
              「新規局」ボタンから次のスコアアタックに挑戦できます。
            </p>
          </div>
        )}
      </div>

      <LeaderboardPanel
        ruleId="totenko"
        ruleName="東天紅"
        scoreUnit="点"
        latestScore={
          game.status === 'agari' && game.agariResult
            ? {
                score: game.agariResult.totalPoints,
                rankName: game.agariResult.title,
                detailSummary: game.agariResult.items.map((i) => i.label).join('・'),
                turnsUsed: game.turn,
              }
            : null
        }
      />

      {/* ハイスコア一覧 */}
      {highScores.length > 0 && (
        <div className="bg-black/35 border border-emerald-800/50 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-300 font-black text-sm">
            <Trophy className="w-4 h-4" />
            <span>東天紅 ハイスコア TOP 5</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
            {highScores.map((hs, i) => (
              <div
                key={i}
                className="bg-black/40 border border-emerald-900/60 rounded-xl p-2.5 text-xs flex flex-col gap-0.5"
              >
                <span className="font-black text-amber-300">
                  #{i + 1} {hs.points}点
                </span>
                <span className="text-emerald-200/80 truncate">{hs.title}</span>
                <span className="text-[10px] text-slate-400">
                  {hs.turnsUsed}巡 ({hs.date})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
