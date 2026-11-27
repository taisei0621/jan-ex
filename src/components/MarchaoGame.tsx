'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  ShieldAlert,
  RotateCcw,
  Trophy,
  Flame,
  Zap,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { TileInstance, TileTypeId, WaitingTileInfo } from '@/types/mahjong';
import { sortTiles, TILE_NAMES } from '@/engine/tiles';
import {
  createMarchaoWall,
  evaluateMarchaoAgari,
  getDoraFromIndicator,
  getMarchaoWaitingTiles,
  MarchaoScoreResult,
} from '@/engine/marchaoEngine';
import { MahjongTile } from './MahjongTile';
import { LeaderboardPanel } from './LeaderboardPanel';

const MAX_TURNS = 14;
const STORAGE_KEY = 'jan_ex_marchao_highscores_v1';

interface MarchaoHighScore {
  points: number;
  shugiCount: number;
  rankName: string;
  date: string;
}

interface MarchaoState {
  wall: TileInstance[];
  wallIndex: number;
  hand: TileInstance[]; // 13枚
  tsumo: TileInstance | null;
  discards: TileInstance[];
  doraIndicator: TileTypeId;
  turn: number;
  isRiichi: boolean;
  status: 'playing' | 'agari' | 'ryuukyoku';
  agariResult: MarchaoScoreResult | null;
}

function initMarchaoGame(): MarchaoState {
  const wall = createMarchaoWall();
  const doraIndicator = wall[0].typeId;
  const hand = sortTiles(wall.slice(1, 14));
  const tsumo = wall[14];
  return {
    wall,
    wallIndex: 15,
    hand,
    tsumo,
    discards: [],
    doraIndicator,
    turn: 1,
    isRiichi: false,
    status: 'playing',
    agariResult: null,
  };
}

export const MarchaoGame: React.FC = () => {
  const [game, setGame] = useState<MarchaoState | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [oneClickDiscard, setOneClickDiscard] = useState(true);
  const [highScores, setHighScores] = useState<MarchaoHighScore[]>([]);

  useEffect(() => {
    setGame(initMarchaoGame());
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setHighScores(JSON.parse(saved));
    } catch {
      // ignore
    }
  }, []);

  const doraTileId = useMemo(
    () => (game ? getDoraFromIndicator(game.doraIndicator) : 0),
    [game]
  );

  const currentAgari: MarchaoScoreResult | null = useMemo(() => {
    if (!game || game.status !== 'playing' || !game.tsumo) return null;
    return evaluateMarchaoAgari([...game.hand, game.tsumo], {
      doraIndicator: game.doraIndicator,
      isRiichi: game.isRiichi,
      tsumoTile: game.tsumo,
    });
  }, [game]);

  const currentWaits: WaitingTileInfo[] = useMemo(() => {
    if (!game || game.status !== 'playing') return [];
    return getMarchaoWaitingTiles(game.hand, game.doraIndicator);
  }, [game]);

  const previewWaits: WaitingTileInfo[] = useMemo(() => {
    if (!game || game.status !== 'playing' || !selectedUid || !game.tsumo) return [];
    const all14 = [...game.hand, game.tsumo];
    const remaining13 = all14.filter((t) => t.uid !== selectedUid);
    if (remaining13.length !== 13) return [];
    return getMarchaoWaitingTiles(remaining13, game.doraIndicator);
  }, [game, selectedUid]);

  const handleRestart = useCallback(() => {
    setGame(initMarchaoGame());
    setSelectedUid(null);
  }, []);

  const handleDiscard = useCallback(
    (uid: string) => {
      if (!game || game.status !== 'playing' || !game.tsumo) return;
      if (game.isRiichi && uid !== game.tsumo.uid) return;

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

      setGame({
        ...game,
        hand: nextHand,
        tsumo: game.wall[game.wallIndex],
        discards: nextDiscards,
        wallIndex: game.wallIndex + 1,
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
    if (selectedUid === uid) handleDiscard(uid);
    else setSelectedUid(uid);
  };

  const handleDeclareRiichi = () => {
    if (!game || game.status !== 'playing' || game.isRiichi) return;
    setGame({ ...game, isRiichi: true });
  };

  const handleAgari = () => {
    if (!game || !currentAgari) return;
    setGame({
      ...game,
      status: 'agari',
      agariResult: currentAgari,
    });
    const record: MarchaoHighScore = {
      points: currentAgari.points,
      shugiCount: currentAgari.shugiCount,
      rankName: currentAgari.rankName,
      date: new Date().toLocaleDateString('ja-JP'),
    };
    const updated = [...highScores, record]
      .sort((a, b) => b.shugiCount - a.shugiCount || b.points - a.points)
      .slice(0, 5);
    setHighScores(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
    confetti({ particleCount: 110, spread: 75, origin: { y: 0.6 } });
  };

  if (!game) return null;

  const displayedWaits = selectedUid ? previewWaits : currentWaits;
  const handGoldCount = [...game.hand, ...(game.tsumo ? [game.tsumo] : [])].filter(
    (t) => t.isGold
  ).length;
  const handRedCount = [...game.hand, ...(game.tsumo ? [game.tsumo] : [])].filter(
    (t) => t.isRed
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-black/35 border border-rose-700/40 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm font-bold">
          <div className="flex items-center gap-1.5 text-amber-300">
            <Flame className="w-4 h-4" />
            <span>
              巡目: {game.turn} / {MAX_TURNS}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-yellow-300">
            <ShieldAlert className="w-4 h-4" />
            <span>
              手牌祝儀ポテンシャル: 金{handGoldCount}枚 / 赤{handRedCount}枚
            </span>
          </div>
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

      <div className="mahjong-table-bg border-2 border-rose-600/40 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-black/30 border border-emerald-800/50 rounded-2xl p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-amber-300">ドラ表示牌</p>
              <p className="text-[11px] text-emerald-200/70 mt-0.5">
                ドラ: <strong className="text-white">{TILE_NAMES[doraTileId]}</strong>
              </p>
            </div>
            <MahjongTile tile={{ typeId: game.doraIndicator }} size="sm" isDora />
          </div>

          <div className="md:col-span-2 bg-black/30 border border-sky-700/40 rounded-2xl p-3.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-sky-300">
                マーチャオA 特殊ギミック
              </p>
              <p className="text-[11px] text-emerald-100/80 mt-0.5">
                リーチ後に「白ポッチ（青いダイヤ付の白）」をツモると、全ての待ちに化ける永久オールマイティ発動！
              </p>
            </div>
            <MahjongTile tile={{ typeId: 31, isWhitePocchi: true }} size="sm" />
          </div>
        </div>

        <div className="bg-black/25 border border-emerald-800/40 rounded-2xl p-3.5 space-y-2">
          <p className="text-xs font-bold text-emerald-300/80">捨て牌（河）</p>
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

        {game.status === 'playing' && (
          <div className="bg-black/35 border border-amber-500/30 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                <Zap className="w-4 h-4" />
                {selectedUid ? '選択牌を切った場合の待ち:' : '現在の待ち牌:'}
              </span>
              {currentWaits.length > 0 && !game.isRiichi && (
                <button
                  type="button"
                  onClick={handleDeclareRiichi}
                  className="px-3.5 py-1 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-black transition shadow"
                >
                  リーチ宣言（白ポッチ有効化！）
                </button>
              )}
              {game.isRiichi && (
                <span className="px-2.5 py-0.5 rounded-full bg-sky-500/25 border border-sky-400 text-sky-200 text-xs font-black">
                  リーチ中：白ポッチオールマイティ有効
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
                      {w.bestScore.rankName}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs sm:text-sm font-black text-white">あなたの手牌</p>
            {currentAgari && game.status === 'playing' && (
              <button
                type="button"
                onClick={handleAgari}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 hover:from-amber-300 hover:to-rose-400 text-slate-950 font-black text-sm shadow-lg animate-bounce flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                {currentAgari.usedWhitePocchi ? '白ポッチツモ！！' : 'ツモ！'}（
                {currentAgari.points.toLocaleString()}点 / 祝儀{currentAgari.shugiCount}枚）
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

        {game.status === 'agari' && game.agariResult && (
          <div className="bg-gradient-to-br from-rose-950/90 via-slate-900/95 to-amber-950/90 border-2 border-amber-400 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-amber-400" />
                <h3 className="text-xl font-black text-amber-300">
                  {game.agariResult.rankName} {game.agariResult.points.toLocaleString()}点 ＋ 祝儀
                  {game.agariResult.shugiCount}枚！
                </h3>
              </div>
              {game.agariResult.usedWhitePocchi && (
                <span className="px-3 py-1 rounded-full bg-sky-500 text-slate-950 text-xs font-black">
                  白ポッチ オールマイティ発動！
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {game.agariResult.yaku.map((y, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-lg bg-black/40 border border-emerald-700/50 text-xs font-bold text-emerald-100"
                >
                  {y.name} ({y.han}翻)
                </span>
              ))}
              {game.agariResult.shugiBreakdown.map((s, i) => (
                <span
                  key={`shugi-${i}`}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/50 text-xs font-black text-amber-300"
                >
                  {s}
                </span>
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
          </div>
        )}
      </div>

      <LeaderboardPanel
        ruleId="marchao"
        ruleName="マーチャオAルール"
        scoreUnit="点"
        latestScore={
          game.status === 'agari' && game.agariResult
            ? {
                score: game.agariResult.points,
                rankName: `${game.agariResult.rankName} / 祝儀${game.agariResult.shugiCount}枚`,
                detailSummary: game.agariResult.yaku.map((y) => y.name).join('・'),
                turnsUsed: game.turn,
              }
            : null
        }
      />

      {highScores.length > 0 && (
        <div className="bg-black/35 border border-emerald-800/50 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-300 font-black text-sm">
            <Trophy className="w-4 h-4" />
            <span>マーチャオA ハイスコア（祝儀順）</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
            {highScores.map((hs, i) => (
              <div
                key={i}
                className="bg-black/40 border border-emerald-900/60 rounded-xl p-2.5 text-xs flex flex-col gap-0.5"
              >
                <span className="font-black text-amber-300">
                  #{i + 1} 祝儀{hs.shugiCount}枚
                </span>
                <span className="text-emerald-200/80">
                  {hs.rankName} {hs.points.toLocaleString()}点
                </span>
                <span className="text-[10px] text-slate-400">{hs.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
