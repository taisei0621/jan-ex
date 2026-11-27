'use client';

import React, { useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Eye,
  Lightbulb,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Trophy,
  Flame,
  Sparkles,
} from 'lucide-react';
import { TileTypeId } from '@/types/mahjong';
import { TILE_NAMES, TOTAL_TILE_TYPES } from '@/engine/tiles';
import {
  generateWashizuPuzzle,
  getWashizuSuitHint,
  WashizuDifficulty,
  WashizuPuzzle,
} from '@/engine/washizuEngine';
import { MahjongTile } from './MahjongTile';

const STORAGE_KEY = 'jan_ex_washizu_stats_v1';

interface WashizuStats {
  solved: number;
  streak: number;
  bestStreak: number;
}

export const WashizuGame: React.FC = () => {
  const [difficulty, setDifficulty] = useState<WashizuDifficulty>('easy');
  const [puzzle, setPuzzle] = useState<WashizuPuzzle | null>(null);
  const [selectedGuess, setSelectedGuess] = useState<TileTypeId | null>(null);
  const [resultStatus, setResultStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [showHint, setShowHint] = useState(false);
  const [stats, setStats] = useState<WashizuStats>({
    solved: 0,
    streak: 0,
    bestStreak: 0,
  });

  const loadNewPuzzle = useCallback((diff: WashizuDifficulty) => {
    setPuzzle(generateWashizuPuzzle(diff));
    setSelectedGuess(null);
    setResultStatus('idle');
    setShowHint(false);
  }, []);

  useEffect(() => {
    loadNewPuzzle(difficulty);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setStats(JSON.parse(saved));
    } catch {
      // ignore
    }
  }, [difficulty, loadNewPuzzle]);

  const handleGuess = (tileId: TileTypeId) => {
    if (!puzzle || resultStatus !== 'idle') return;
    setSelectedGuess(tileId);
    const isCorrect = puzzle.winningWaits.includes(tileId);
    setResultStatus(isCorrect ? 'correct' : 'wrong');

    const nextStats: WashizuStats = isCorrect
      ? {
          solved: stats.solved + 1,
          streak: stats.streak + 1,
          bestStreak: Math.max(stats.bestStreak, stats.streak + 1),
        }
      : {
          ...stats,
          streak: 0,
        };
    setStats(nextStats);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextStats));
    } catch {
      // ignore
    }

    if (isCorrect) {
      confetti({
        particleCount: 90,
        spread: 65,
        origin: { y: 0.65 },
      });
    }
  };

  if (!puzzle) return null;

  const displayedOppHand =
    resultStatus === 'idle' ? puzzle.opponentHand : puzzle.opponentActualHand;

  return (
    <div className="space-y-5">
      {/* 上部コントロール・戦績バー */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-black/35 border border-cyan-800/50 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-cyan-300/80 mr-1">難易度:</span>
          {(
            [
              { id: 'easy', label: '初級 (黒牌1枚)' },
              { id: 'normal', label: '中級 (変則待ち)' },
              { id: 'hard', label: '上級 (黒牌2枚)' },
            ] as { id: WashizuDifficulty; label: string }[]
          ).map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDifficulty(d.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                difficulty === d.id
                  ? 'bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'bg-slate-900/80 text-cyan-200/80 hover:bg-slate-800 border border-cyan-800/50'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 text-xs font-bold">
          <div className="flex items-center gap-1.5 text-amber-300">
            <Trophy className="w-4 h-4" />
            <span>正解数: {stats.solved}</span>
          </div>
          <div className="flex items-center gap-1.5 text-orange-400">
            <Flame className="w-4 h-4" />
            <span>連続正解: {stats.streak}</span>
          </div>
          <span className="text-slate-400 hidden sm:inline">
            最高連続: {stats.bestStreak}
          </span>
        </div>
      </div>

      {/* 鷲巣麻雀卓 */}
      <div className="mahjong-table-bg border-2 border-cyan-700/50 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-6">
        {/* 相手（鷲巣）の手牌 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-cyan-300" />
              <h3 className="text-sm font-black text-cyan-100">
                相手の手牌（ガラス牌が透けて見えている！）
              </h3>
            </div>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-950/70 border border-cyan-500/40 text-cyan-300 font-bold">
              黒牌 {puzzle.hiddenBlackTileIds.length}枚 隠蔽中
            </span>
          </div>

          <div className="bg-black/35 border border-cyan-500/30 rounded-2xl p-3 sm:p-4 flex flex-wrap justify-center gap-1.5 sm:gap-2">
            {displayedOppHand.map((tile) => (
              <MahjongTile
                key={tile.uid}
                tile={tile}
                size="md"
                className={
                  resultStatus !== 'idle' && !tile.isGlass
                    ? 'ring-2 ring-amber-400'
                    : ''
                }
              />
            ))}
          </div>
        </div>

        {/* 相手の河 & ドラ表示牌 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 bg-black/25 border border-emerald-800/50 rounded-2xl p-3 sm:p-4 space-y-2">
            <p className="text-xs font-bold text-emerald-300/80">
              相手の捨て牌（河）※フリテンなし想定
            </p>
            <div className="flex flex-wrap gap-1.5">
              {puzzle.opponentDiscards.map((tile) => (
                <MahjongTile key={tile.uid} tile={tile} size="sm" />
              ))}
            </div>
          </div>

          <div className="bg-black/25 border border-emerald-800/50 rounded-2xl p-3 sm:p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-amber-300">ドラ表示牌</p>
              <p className="text-[11px] text-emerald-200/70 mt-0.5">
                見えている枚数の参考に
              </p>
            </div>
            <MahjongTile tile={puzzle.doraIndicator} size="sm" isDora />
          </div>
        </div>

        {/* 自分（アカギ側）の手牌 */}
        <div className="bg-black/25 border border-emerald-800/50 rounded-2xl p-3 sm:p-4 space-y-2">
          <p className="text-xs font-bold text-emerald-200/80">
            あなたの手牌（残り枚数の推理に活用）
          </p>
          <div className="flex flex-wrap gap-1 sm:gap-1.5">
            {puzzle.playerHand.map((tile) => (
              <MahjongTile key={tile.uid} tile={tile} size="sm" />
            ))}
          </div>
        </div>

        {/* ヒント＆結果表示 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowHint((prev) => !prev)}
            className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-amber-200 text-xs font-bold flex items-center gap-1.5 transition"
          >
            <Lightbulb className="w-4 h-4 text-amber-400" />
            {showHint ? 'ヒントを隠す' : '推理ヒントを見る'}
          </button>

          <button
            type="button"
            onClick={() => loadNewPuzzle(difficulty)}
            className="px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black flex items-center gap-1.5 transition shadow-lg shadow-cyan-500/20"
          >
            <RotateCcw className="w-4 h-4" />
            次の問題へ
          </button>
        </div>

        {showHint && (
          <div className="bg-amber-950/50 border border-amber-500/40 rounded-xl p-3 text-xs text-amber-100 flex flex-wrap gap-4">
            <span>
              <strong className="text-amber-300">待ちの形:</strong>{' '}
              {puzzle.waitShapeLabel}
            </span>
            <span>
              <strong className="text-amber-300">当たり牌の系統:</strong>{' '}
              {getWashizuSuitHint(puzzle.winningWaits)}
            </span>
          </div>
        )}

        {resultStatus !== 'idle' && (
          <div
            className={`rounded-2xl p-4 border space-y-3 ${
              resultStatus === 'correct'
                ? 'bg-emerald-950/80 border-emerald-400/60 text-emerald-100'
                : 'bg-rose-950/80 border-rose-400/60 text-rose-100'
            }`}
          >
            <div className="flex items-center gap-2 font-black text-base">
              {resultStatus === 'correct' ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>完全看破！「{TILE_NAMES[selectedGuess!]}」は当たり牌！</span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-rose-400" />
                  <span>
                    不正解…（選択: {TILE_NAMES[selectedGuess!]}）
                  </span>
                </>
              )}
            </div>
            <p className="text-xs sm:text-sm leading-relaxed opacity-90">
              {puzzle.explanation}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> 正解の当たり牌:
              </span>
              {puzzle.winningWaits.map((w) => (
                <div key={w} className="flex items-center gap-1 bg-black/30 px-2 py-1 rounded-lg">
                  <MahjongTile tile={{ typeId: w }} size="xs" />
                  <span className="text-xs font-bold">{TILE_NAMES[w]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 34牌選択パネル */}
        <div className="bg-black/40 border border-emerald-800/50 rounded-2xl p-4 space-y-3">
          <p className="text-xs sm:text-sm font-black text-white">
            相手の当たり牌（ロンされる牌）を1つ選んでください：
          </p>
          <div className="space-y-2">
            {[
              { label: '萬子', start: 0, end: 8 },
              { label: '筒子', start: 9, end: 17 },
              { label: '索子', start: 18, end: 26 },
              { label: '字牌', start: 27, end: 33 },
            ].map((group) => (
              <div key={group.label} className="flex flex-wrap items-center gap-1.5">
                <span className="w-10 text-[11px] font-bold text-emerald-300/70">
                  {group.label}
                </span>
                {Array.from(
                  { length: group.end - group.start + 1 },
                  (_, idx) => group.start + idx
                ).map((tid) => {
                  const isCorrectWait =
                    resultStatus !== 'idle' && puzzle.winningWaits.includes(tid);
                  const isPicked = selectedGuess === tid;
                  return (
                    <MahjongTile
                      key={tid}
                      tile={{ typeId: tid }}
                      size="sm"
                      disabled={resultStatus !== 'idle'}
                      onClick={() => handleGuess(tid)}
                      selected={isPicked}
                      className={
                        isCorrectWait ? 'ring-2 ring-emerald-400' : ''
                      }
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
