'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Sparkles,
  RotateCcw,
  Trophy,
  Flame,
  Zap,
  AlertCircle,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import {
  HighScoreRecord,
  ScoreResult,
  TileInstance,
  TileTypeId,
  WaitingTileInfo,
} from '@/types/mahjong';
import {
  createShuffledWall,
  createWildcardTile,
  sortTiles,
  TILE_NAMES,
  TILE_SHORT_NAMES,
} from '@/engine/tiles';
import {
  evaluateMightyAgari,
  getDoraFromIndicator,
  getMightyWaitingTiles,
} from '@/engine/mightyEngine';
import { MahjongTile } from './MahjongTile';
import { LeaderboardPanel } from './LeaderboardPanel';

const MAX_TURNS = 10;
const STORAGE_KEY = 'jan_ex_mighty_highscores_v1';

interface GameState {
  wall: TileInstance[];
  wallIndex: number;
  hand: TileInstance[]; // 通常牌12枚
  tsumo: TileInstance | null; // ツモ牌
  discards: TileInstance[];
  doraIndicator: TileTypeId;
  turn: number; // 1..10
  status: 'playing' | 'agari' | 'ryuukyoku';
  agariResult: ScoreResult | null;
}

function initNewGame(): GameState {
  const wall = createShuffledWall(true);
  const doraIndicator = wall[0].typeId;
  const hand = sortTiles(wall.slice(1, 13));
  const tsumo = wall[13];
  return {
    wall,
    wallIndex: 14,
    hand,
    tsumo,
    discards: [],
    doraIndicator,
    turn: 1,
    status: 'playing',
    agariResult: null,
  };
}

export const MightyGame: React.FC = () => {
  const [game, setGame] = useState<GameState | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [oneClickDiscard, setOneClickDiscard] = useState<boolean>(true);
  const [highScores, setHighScores] = useState<HighScoreRecord[]>([]);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const wildcardTile = useMemo(() => createWildcardTile(), []);

  useEffect(() => {
    setGame(initNewGame());
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setHighScores(JSON.parse(saved));
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const doraTileId = useMemo(
    () => (game ? getDoraFromIndicator(game.doraIndicator) : 0),
    [game]
  );

  // 現在の13枚（手牌12枚＋ツモ牌1枚）でのアガリ判定
  const currentAgari: ScoreResult | null = useMemo(() => {
    if (!game || game.status !== 'playing' || !game.tsumo) return null;
    const all13 = [...game.hand, game.tsumo];
    return evaluateMightyAgari(all13, {
      winningTile: game.tsumo.typeId,
      doraIndicators: [game.doraIndicator],
      turn: game.turn,
      isParent: true,
      roundWind: 27,
      seatWind: 27,
    });
  }, [game]);

  // ホバー／選択中の牌を切った場合の待ち牌プレビュー、または選択なし時の現在12枚の待ち
  const previewWaits: {
    label: string;
    waits: WaitingTileInfo[];
  } = useMemo(() => {
    if (!game || game.status !== 'playing') return { label: '', waits: [] };

    const visible = [...game.discards, { uid: 'dora-ind', typeId: game.doraIndicator }];

    if (selectedUid && game.tsumo) {
      const all13 = [...game.hand, game.tsumo];
      const target = all13.find((t) => t.uid === selectedUid);
      const remaining12 = all13.filter((t) => t.uid !== selectedUid);
      if (target && remaining12.length === 12) {
        return {
          label: `${TILE_NAMES[target.typeId]} を切った時の待ち`,
          waits: getMightyWaitingTiles(remaining12, visible, {
            doraIndicators: [game.doraIndicator],
            turn: game.turn + 1,
            isParent: true,
          }),
        };
      }
    }

    return {
      label: '現在の12枚（ツモ牌を除く）での待ち牌',
      waits: getMightyWaitingTiles(game.hand, visible, {
        doraIndicators: [game.doraIndicator],
        turn: game.turn + 1,
        isParent: true,
      }),
    };
  }, [game, selectedUid]);

  const handleRestart = useCallback(() => {
    setGame(initNewGame());
    setSelectedUid(null);
    setIsNewRecord(false);
  }, []);

  const handleDiscard = useCallback(
    (tileToDiscard: TileInstance) => {
      if (!game || game.status !== 'playing' || !game.tsumo) return;

      const all13 = [...game.hand, game.tsumo];
      const nextHand = sortTiles(all13.filter((t) => t.uid !== tileToDiscard.uid));
      const nextDiscards = [...game.discards, tileToDiscard];

      if (game.turn >= MAX_TURNS) {
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

      const nextTsumo = game.wall[game.wallIndex];
      setGame({
        ...game,
        hand: nextHand,
        tsumo: nextTsumo,
        discards: nextDiscards,
        wallIndex: game.wallIndex + 1,
        turn: game.turn + 1,
      });
      setSelectedUid(null);
    },
    [game]
  );

  const handleTileClick = (tile: TileInstance) => {
    if (!game || game.status !== 'playing') return;
    if (oneClickDiscard) {
      handleDiscard(tile);
    } else {
      if (selectedUid === tile.uid) {
        handleDiscard(tile);
      } else {
        setSelectedUid(tile.uid);
      }
    }
  };

  const handleTsumoAgari = () => {
    if (!game || !currentAgari) return;

    confetti({
      particleCount: currentAgari.totalHan >= 13 ? 160 : 80,
      spread: 80,
      origin: { y: 0.6 },
    });

    const record: HighScoreRecord = {
      score: currentAgari.points,
      rankName: currentAgari.rankName,
      yakuNames: currentAgari.yaku.map((y) => y.name),
      turnsUsed: game.turn,
      date: new Date().toLocaleDateString('ja-JP'),
    };

    const prevTop = highScores.length > 0 ? highScores[0].score : 0;
    if (record.score > prevTop) {
      setIsNewRecord(true);
    }

    const updated = [...highScores, record]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    setHighScores(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }

    setGame({
      ...game,
      status: 'agari',
      agariResult: currentAgari,
    });
  };

  if (!game) {
    return (
      <div className="flex items-center justify-center h-96 text-emerald-300">
        牌山を生成中...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ステータス＆情報バー */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-black/40 border border-emerald-800/60 rounded-xl p-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-emerald-400 font-semibold uppercase tracking-wider">
              現在巡目
            </p>
            <p className="text-2xl font-black text-white">
              {game.turn} <span className="text-sm font-normal text-emerald-300/70">/ {MAX_TURNS} 巡</span>
            </p>
          </div>
          <Flame className={`w-6 h-6 ${game.turn >= 8 ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`} />
        </div>

        <div className="bg-black/40 border border-emerald-800/60 rounded-xl p-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-emerald-400 font-semibold uppercase tracking-wider">
              表ドラ（ドラ表示）
            </p>
            <div className="flex items-center gap-2 mt-1">
              <MahjongTile tile={{ typeId: game.doraIndicator }} size="xs" />
              <span className="text-xs text-amber-300 font-bold">
                → {TILE_NAMES[doraTileId]}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-black/40 border border-emerald-800/60 rounded-xl p-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-emerald-400 font-semibold uppercase tracking-wider">
              マイベストスコア
            </p>
            <p className="text-xl font-black text-amber-300">
              {highScores.length > 0 ? `${highScores[0].score.toLocaleString()} 点` : '---'}
            </p>
          </div>
          <Trophy className="w-6 h-6 text-amber-400" />
        </div>

        <div className="bg-black/40 border border-emerald-800/60 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-200">1クリック打牌</span>
            <button
              type="button"
              onClick={() => {
                setOneClickDiscard(!oneClickDiscard);
                setSelectedUid(null);
              }}
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold transition-colors ${
                oneClickDiscard
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-700 text-slate-300'
              }`}
            >
              {oneClickDiscard ? 'ON' : 'OFF (2段階)'}
            </button>
          </div>
          <button
            type="button"
            onClick={handleRestart}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-emerald-700/60 hover:bg-emerald-600/80 text-xs font-bold text-white transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            配牌をやり直す
          </button>
        </div>
      </div>

      {/* メイン雀卓エリア */}
      <div className="mahjong-table-bg border-2 border-emerald-700/70 rounded-2xl p-4 sm:p-6 shadow-2xl relative overflow-hidden">
        {/* 捨て牌（河）エリア */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-200/80 tracking-wider">
              捨て牌（河）
            </span>
            <span className="text-xs text-emerald-300/60">
              親（東場東家） / フリテンなし
            </span>
          </div>
          <div className="min-h-[60px] bg-black/25 border border-emerald-900/50 rounded-xl p-3 flex flex-wrap gap-1.5 items-center">
            {game.discards.length === 0 ? (
              <span className="text-xs text-emerald-400/50">
                まだ捨て牌はありません。不要な牌をクリックして打牌してください。
              </span>
            ) : (
              game.discards.map((d, idx) => (
                <div key={d.uid} className="relative">
                  <MahjongTile
                    tile={d}
                    size="sm"
                    isDora={d.typeId === doraTileId}
                  />
                  <span className="absolute -bottom-1 -right-1 text-[9px] bg-slate-900/80 text-emerald-300 px-1 rounded">
                    {idx + 1}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ツモアガリ通知バナー */}
        {currentAgari && game.status === 'playing' && (
          <div className="mb-5 bg-gradient-to-r from-amber-500/20 via-amber-400/30 to-amber-500/20 border-2 border-amber-400 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-pulse">
            <div className="flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-amber-300 shrink-0" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg sm:text-xl font-black text-amber-200">
                    ツモアガリ可能！ {currentAgari.rankName} ({currentAgari.points.toLocaleString()}点)
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/40">
                    ★マイティ → {TILE_NAMES[currentAgari.substitutedTile]}
                  </span>
                </div>
                <p className="text-xs text-amber-100/90 mt-1">
                  役: {currentAgari.yaku.map((y) => `${y.name}(${y.han}翻)`).join('・')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleTsumoAgari}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black text-base shadow-lg shadow-amber-500/30 transition transform hover:scale-105 shrink-0"
            >
              ツモ！ ({currentAgari.points.toLocaleString()}点)
            </button>
          </div>
        )}

        {/* 手牌エリア（12枚 + ツモ1枚 + ★マイティ1枚） */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-200 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              あなたの手牌（通常12枚 ＋ ツモ1枚 ＋ ★万能マイティ牌）
            </span>
            {!oneClickDiscard && selectedUid && (
              <span className="text-xs text-amber-300 font-semibold">
                もう一度クリックで打牌
              </span>
            )}
          </div>

          <div className="bg-black/30 border border-emerald-700/40 rounded-xl p-3 sm:p-4 flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
            {game.hand.map((tile) => (
              <MahjongTile
                key={tile.uid}
                tile={tile}
                size="md"
                selected={selectedUid === tile.uid}
                isDora={tile.typeId === doraTileId}
                disabled={game.status !== 'playing'}
                onClick={() => handleTileClick(tile)}
              />
            ))}

            {game.tsumo && (
              <MahjongTile
                tile={game.tsumo}
                size="md"
                isTsumo
                selected={selectedUid === game.tsumo.uid}
                isDora={game.tsumo.typeId === doraTileId}
                disabled={game.status !== 'playing'}
                onClick={() => handleTileClick(game.tsumo!)}
              />
            )}

            {/* ★マイティ牌は常に右端に固定表示 */}
            <div className="ml-2 sm:ml-4 pl-2 sm:pl-3 border-l border-amber-500/30">
              <MahjongTile
                tile={wildcardTile}
                size="md"
                substitutedLabel={
                  game.status === 'agari' && game.agariResult
                    ? TILE_SHORT_NAMES[game.agariResult.substitutedTile]
                    : currentAgari
                    ? TILE_SHORT_NAMES[currentAgari.substitutedTile]
                    : '万能'
                }
              />
            </div>
          </div>
        </div>

        {/* リザルトオーバーレイ / パネル */}
        {game.status === 'agari' && game.agariResult && (
          <div className="mt-6 bg-slate-950/90 border-2 border-amber-400 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            {isNewRecord && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/50 text-xs font-black">
                <Trophy className="w-4 h-4" /> NEW HIGH SCORE!
              </div>
            )}
            <h3 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-400 to-orange-400">
              {game.agariResult.rankName}！ {game.agariResult.points.toLocaleString()} 点
            </h3>
            <p className="text-sm text-emerald-300">
              達成巡目：{game.turn}巡目 ／ ★マイティ牌は{' '}
              <span className="font-bold text-amber-300">
                「{TILE_NAMES[game.agariResult.substitutedTile]}」
              </span>{' '}
              として和了
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
              {game.agariResult.yaku.map((y, idx) => (
                <span
                  key={idx}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border ${
                    y.isYakuman
                      ? 'bg-rose-950/80 text-rose-200 border-rose-500/60'
                      : 'bg-emerald-950/80 text-emerald-200 border-emerald-600/50'
                  }`}
                >
                  {y.name} {y.isYakuman ? '役満' : `${y.han}翻`}
                </span>
              ))}
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleRestart}
                className="px-8 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black transition inline-flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> もう一局プレイする
              </button>
            </div>
          </div>
        )}

        {game.status === 'ryuukyoku' && (
          <div className="mt-6 bg-slate-950/90 border border-slate-700 rounded-2xl p-6 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-slate-400 mx-auto" />
            <h3 className="text-2xl font-black text-slate-200">
              流局（10巡終了）
            </h3>
            <p className="text-sm text-slate-400">
              {previewWaits.waits.length > 0
                ? `テンパイしていました！（${previewWaits.waits.length}面待ち）`
                : '惜しくもノーテンでした。'}
            </p>
            <button
              type="button"
              onClick={handleRestart}
              className="px-8 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black transition inline-flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> リベンジする
            </button>
          </div>
        )}
      </div>

      {/* リアルタイム待ち牌表示パネル */}
      <div className="bg-black/40 border border-emerald-800/60 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm sm:text-base text-white">
              リアルタイム待ち牌チェッカー
            </h3>
          </div>
          <span className="text-xs text-emerald-300/80">
            {previewWaits.label}：
            {previewWaits.waits.length > 0 ? (
              <strong className="text-amber-300 ml-1">
                {previewWaits.waits.length}面待ち！
              </strong>
            ) : (
              <span className="text-slate-400 ml-1">ノーテン</span>
            )}
          </span>
        </div>

        {previewWaits.waits.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">
            まだテンパイしていません。★マイティ牌を活かし、トイツや両面ターツを残して打ち進めると驚異の多面待ちに化けます！
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
            {previewWaits.waits.map((w) => (
              <div
                key={w.tileId}
                className="flex items-center gap-2.5 bg-emerald-950/60 border border-emerald-700/50 rounded-xl p-2"
              >
                <MahjongTile
                  tile={{ typeId: w.tileId }}
                  size="xs"
                  isDora={w.tileId === doraTileId}
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-amber-300 truncate">
                    {w.bestScore.rankName}
                  </p>
                  <p className="text-[11px] text-white font-semibold">
                    {w.bestScore.points.toLocaleString()}点
                  </p>
                  <p className="text-[10px] text-emerald-300/70">
                    残{w.remainingCount}枚
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Supabase 全国ランキング */}
      <LeaderboardPanel
        ruleId="mighty"
        ruleName="少牌マイティ"
        scoreUnit="点"
        latestScore={
          game.status === 'agari' && game.agariResult
            ? {
                score: game.agariResult.points,
                rankName: game.agariResult.rankName,
                detailSummary: game.agariResult.yaku.map((y) => y.name).join('・'),
                turnsUsed: game.turn,
              }
            : null
        }
      />

      {/* ハイスコアランキング */}
      {highScores.length > 0 && (
        <div className="bg-black/30 border border-emerald-900/50 rounded-2xl p-4 sm:p-5">
          <h3 className="text-sm font-bold text-emerald-200 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
            ローカル・ハイスコア TOP5
          </h3>
          <div className="space-y-2">
            {highScores.map((rec, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs bg-black/30 px-3 py-2 rounded-lg border border-emerald-900/40"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`font-black w-5 ${
                      i === 0 ? 'text-amber-400' : 'text-slate-400'
                    }`}
                  >
                    #{i + 1}
                  </span>
                  <span className="font-bold text-white shrink-0">
                    {rec.rankName} ({rec.score.toLocaleString()}点)
                  </span>
                  <span className="text-emerald-300/70 truncate">
                    {rec.yakuNames.join('・')}
                  </span>
                </div>
                <span className="text-slate-400 shrink-0 ml-2">
                  {rec.turnsUsed}巡目
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
