'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  RotateCcw,
  Sparkles,
  Zap,
  CheckCircle2,
  Trophy,
  Flame,
  Eye,
  SkipForward,
} from 'lucide-react';
import { ScoreResult, TileInstance, WaitingTileInfo } from '@/types/mahjong';
import { createWildcardTile, TILE_NAMES, TILE_SHORT_NAMES } from '@/engine/tiles';
import { getDoraFromIndicator, getMightyWaitingTiles } from '@/engine/mightyEngine';
import {
  applyAgari,
  chooseCpuDiscard,
  evaluatePlayerMightyWin,
  executeDiscard,
  getSeatWind,
  getSeatWindLabel,
  initMightyMatch,
  MightyMatchState,
  proceedToNextRound,
  advanceToNextDraw,
  SeatIndex,
} from '@/engine/mightyMatchEngine';
import { MahjongTile } from './MahjongTile';
import { LeaderboardPanel } from './LeaderboardPanel';

export const MightyMatchGame: React.FC = () => {
  const [match, setMatch] = useState<MightyMatchState | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [riichiArmed, setRiichiArmed] = useState(false);
  const [oneClickDiscard, setOneClickDiscard] = useState(true);

  const wildcardTile = useMemo(() => createWildcardTile(), []);

  useEffect(() => {
    setMatch(initMightyMatch());
  }, []);

  const doraTileId = useMemo(
    () => (match ? getDoraFromIndicator(match.doraIndicator) : 0),
    [match]
  );

  // CPUの手番を自動進行
  useEffect(() => {
    if (!match || match.phase !== 'cpu_thinking') return;
    const seat = match.currentTurnSeat;
    if (seat === 0) return;

    const timer = setTimeout(() => {
      setMatch((prev) => {
        if (!prev || prev.phase !== 'cpu_thinking' || !prev.currentTsumo) return prev;
        const curSeat = prev.currentTurnSeat;

        // CPUツモ和了チェック
        const tsumoWin = evaluatePlayerMightyWin(
          prev,
          curSeat,
          prev.currentTsumo,
          true
        );
        if (tsumoWin) {
          return applyAgari(prev, curSeat, null, prev.currentTsumo, tsumoWin);
        }

        // CPU打牌
        const { discardUid, shouldRiichi } = chooseCpuDiscard(prev, curSeat);
        return executeDiscard(prev, curSeat, discardUid, shouldRiichi);
      });
    }, 420);

    return () => clearTimeout(timer);
  }, [match]);

  // 自分のツモ和了判定
  const humanTsumoWin: ScoreResult | null = useMemo(() => {
    if (
      !match ||
      match.phase !== 'player_action' ||
      match.currentTurnSeat !== 0 ||
      !match.currentTsumo
    ) {
      return null;
    }
    return evaluatePlayerMightyWin(match, 0, match.currentTsumo, true);
  }, [match]);

  // 自分の待ち牌（12枚、または選択牌を切った後の12枚）
  const waitPreview: { label: string; waits: WaitingTileInfo[] } = useMemo(() => {
    if (!match) return { label: '現在の待ち', waits: [] };
    const human = match.players[0];
    const opts = {
      doraIndicators: [match.doraIndicator],
      isParent: match.dealerSeat === 0,
      roundWind: match.roundWind,
      seatWind: getSeatWind(0, match.dealerSeat),
    };

    if (
      match.phase === 'player_action' &&
      match.currentTurnSeat === 0 &&
      match.currentTsumo &&
      selectedUid
    ) {
      const all13 = [...human.hand, match.currentTsumo];
      const rem12 = all13.filter((t) => t.uid !== selectedUid);
      const picked = all13.find((t) => t.uid === selectedUid);
      if (rem12.length === 12 && picked) {
        return {
          label: `「${TILE_NAMES[picked.typeId]}」を切った場合の待ち`,
          waits: getMightyWaitingTiles(rem12, [], opts),
        };
      }
    }

    return {
      label: '現在の待ち',
      waits: getMightyWaitingTiles(human.hand, [], opts),
    };
  }, [match, selectedUid]);

  // 打牌したときにテンパイになる牌があるか（リーチボタン表示用）
  const canDeclareRiichiNow = useMemo(() => {
    if (
      !match ||
      match.phase !== 'player_action' ||
      match.currentTurnSeat !== 0 ||
      !match.currentTsumo
    ) {
      return false;
    }
    const human = match.players[0];
    if (human.isRiichi || human.score < 1000) return false;
    const all13 = [...human.hand, match.currentTsumo];
    return all13.some((c) => {
      const rem12 = all13.filter((t) => t.uid !== c.uid);
      const w = getMightyWaitingTiles(rem12, [], {
        doraIndicators: [match.doraIndicator],
      });
      return w.length > 0;
    });
  }, [match]);

  const handleRestartMatch = useCallback(() => {
    setMatch(initMightyMatch());
    setSelectedUid(null);
    setRiichiArmed(false);
  }, []);

  const handleDiscardTile = (uid: string) => {
    if (!match || match.phase !== 'player_action' || match.currentTurnSeat !== 0) return;
    const human = match.players[0];
    if (human.isRiichi && match.currentTsumo && uid !== match.currentTsumo.uid) return;

    setMatch((prev) =>
      prev ? executeDiscard(prev, 0, uid, riichiArmed) : prev
    );
    setSelectedUid(null);
    setRiichiArmed(false);
  };

  const handleTileClick = (uid: string) => {
    if (!match || match.phase !== 'player_action' || match.currentTurnSeat !== 0) return;
    const human = match.players[0];
    if (human.isRiichi && match.currentTsumo && uid !== match.currentTsumo.uid) return;

    if (oneClickDiscard && !riichiArmed) {
      handleDiscardTile(uid);
      return;
    }
    if (selectedUid === uid) {
      handleDiscardTile(uid);
    } else {
      setSelectedUid(uid);
    }
  };

  const handleHumanTsumo = () => {
    if (!match || !humanTsumoWin || !match.currentTsumo) return;
    confetti({ particleCount: 110, spread: 75, origin: { y: 0.6 } });
    setMatch(applyAgari(match, 0, null, match.currentTsumo, humanTsumoWin));
  };

  const handleHumanRon = () => {
    if (!match || match.phase !== 'ron_prompt' || !match.humanCanRon || !match.lastDiscard) {
      return;
    }
    confetti({ particleCount: 110, spread: 75, origin: { y: 0.6 } });
    setMatch(
      applyAgari(
        match,
        0,
        match.lastDiscard.seat,
        match.lastDiscard.tile,
        match.humanCanRon
      )
    );
  };

  const handleSkipRon = () => {
    if (!match || match.phase !== 'ron_prompt' || !match.lastDiscard) return;
    const nextSeat = ((match.lastDiscard.seat + 1) % 4) as SeatIndex;
    setMatch(advanceToNextDraw(match, nextSeat));
  };

  const handleNextRound = () => {
    if (!match) return;
    setSelectedUid(null);
    setRiichiArmed(false);
    setMatch(proceedToNextRound(match));
  };

  if (!match) return null;

  const human = match.players[0];
  const remainingDraws = Math.max(0, match.deadWallEndIndex - match.wallIndex);

  const sortedStandings = [...match.players].sort((a, b) => b.score - a.score);
  const humanRank = sortedStandings.findIndex((p) => p.seat === 0) + 1;

  return (
    <div className="space-y-5">
      {/* 上部バー */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-black/35 border border-emerald-800/50 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm font-bold">
          <span className="px-3 py-1 rounded-lg bg-amber-400/20 border border-amber-400/40 text-amber-300 font-black">
            東{match.kyoku}局 {match.honba}本場
          </span>
          <span className="text-emerald-200">
            残牌: <strong className="text-white">{remainingDraws}</strong>枚
          </span>
          {match.riichiSticks > 0 && (
            <span className="text-rose-300">
              供託リーチ棒: {match.riichiSticks}本
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
            onClick={handleRestartMatch}
            className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1.5 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            対局をやり直す
          </button>
        </div>
      </div>

      {/* 4人麻雀卓 */}
      <div className="mahjong-table-bg border-2 border-emerald-700/60 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-5">
        {/* CPU 3人ステータス＆河 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {([3, 2, 1] as SeatIndex[]).map((seat) => {
            const p = match.players[seat];
            const isTurn =
              match.phase === 'cpu_thinking' && match.currentTurnSeat === seat;
            const wind = getSeatWindLabel(seat, match.dealerSeat);
            return (
              <div
                key={seat}
                className={`rounded-2xl p-3 border transition ${
                  isTurn
                    ? 'bg-emerald-950/80 border-amber-400 shadow-lg shadow-amber-500/10'
                    : 'bg-black/35 border-emerald-800/50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-5 h-5 rounded text-[11px] font-black flex items-center justify-center ${
                        seat === match.dealerSeat
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-slate-800 text-emerald-200'
                      }`}
                    >
                      {wind}
                    </span>
                    <span className="text-xs font-black text-white">{p.name}</span>
                    {p.isRiichi && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-black">
                        リーチ
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-black text-amber-300">
                    {p.score.toLocaleString()}点
                  </span>
                </div>

                {/* CPUの捨て牌（河） */}
                <div className="flex flex-wrap gap-1 min-h-[42px] bg-black/25 rounded-xl p-1.5">
                  {p.discards.length === 0 ? (
                    <span className="text-[10px] text-slate-500 m-auto">河なし</span>
                  ) : (
                    p.discards.map((d, idx) => (
                      <MahjongTile
                        key={`${d.tile.uid}-${idx}`}
                        tile={d.tile}
                        size="xs"
                        isYoko={Boolean(d.isRiichiDeclare)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 中央情報：ドラ＆自分の河 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
          <div className="bg-black/35 border border-emerald-800/50 rounded-2xl p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-amber-300">ドラ表示牌</p>
              <p className="text-[11px] text-emerald-200/80 mt-0.5">
                ドラ: <strong className="text-white">{TILE_NAMES[doraTileId]}</strong>
              </p>
              <p className="text-[10px] text-emerald-300/60 mt-1">
                フリテンなし・★マイティ全員所持
              </p>
            </div>
            <MahjongTile tile={{ typeId: match.doraIndicator }} size="sm" isDora />
          </div>

          <div className="md:col-span-2 bg-black/30 border border-emerald-800/50 rounded-2xl p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-300/80">
                あなたの河（捨て牌）
              </span>
              <span className="text-xs font-black text-amber-300">
                自風: {getSeatWindLabel(0, match.dealerSeat)} / 持ち点:{' '}
                {human.score.toLocaleString()}点
              </span>
            </div>
            <div className="flex flex-wrap gap-1 min-h-[44px]">
              {human.discards.length === 0 ? (
                <span className="text-xs text-slate-400">まだ捨て牌はありません</span>
              ) : (
                human.discards.map((d, idx) => (
                  <MahjongTile
                    key={`${d.tile.uid}-${idx}`}
                    tile={d.tile}
                    size="sm"
                    isYoko={Boolean(d.isRiichiDeclare)}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* ロン確認バナー */}
        {match.phase === 'ron_prompt' && match.humanCanRon && match.lastDiscard && (
          <div className="bg-gradient-to-r from-rose-950/95 via-amber-950/90 to-rose-950/95 border-2 border-amber-400 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-pulse">
            <div className="flex items-center gap-3">
              <MahjongTile tile={match.lastDiscard.tile} size="sm" />
              <div>
                <p className="text-sm font-black text-amber-300">
                  {match.players[match.lastDiscard.seat].name} の「
                  {TILE_NAMES[match.lastDiscard.tile.typeId]}」でロンできます！
                </p>
                <p className="text-xs text-white">
                  {match.humanCanRon.rankName} {match.humanCanRon.points.toLocaleString()}点
                  （★マイティ→{TILE_NAMES[match.humanCanRon.substitutedTile]}）
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleHumanRon}
                className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm shadow-lg"
              >
                ロン！
              </button>
              <button
                type="button"
                onClick={handleSkipRon}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1"
              >
                <SkipForward className="w-3.5 h-3.5" /> スルー
              </button>
            </div>
          </div>
        )}

        {/* リアルタイム待ち牌 */}
        {(match.phase === 'player_action' || match.phase === 'cpu_thinking') && (
          <div className="bg-black/35 border border-emerald-800/50 rounded-2xl p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
                <Eye className="w-4 h-4" />
                {waitPreview.label}（{waitPreview.waits.length}面待ち）
              </span>
              <div className="flex items-center gap-2">
                {canDeclareRiichiNow && (
                  <button
                    type="button"
                    onClick={() => setRiichiArmed((prev) => !prev)}
                    className={`px-3.5 py-1 rounded-lg text-xs font-black transition ${
                      riichiArmed
                        ? 'bg-rose-500 text-white ring-2 ring-amber-300'
                        : 'bg-rose-500/20 hover:bg-rose-500/40 border border-rose-400 text-rose-200'
                    }`}
                  >
                    {riichiArmed ? 'リーチ宣言中（切る牌を選択）' : 'リーチ (-1,000点)'}
                  </button>
                )}
                {human.isRiichi && (
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-500/25 border border-rose-400 text-rose-200 text-xs font-black">
                    リーチ中（ツモ切り）
                  </span>
                )}
              </div>
            </div>

            {waitPreview.waits.length === 0 ? (
              <p className="text-xs text-slate-400">ノーテン</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {waitPreview.waits.map((w) => (
                  <div
                    key={w.tileId}
                    className="flex items-center gap-1 bg-emerald-950/80 border border-emerald-700/60 px-2 py-1 rounded-lg"
                  >
                    <MahjongTile tile={{ typeId: w.tileId }} size="xs" />
                    <span className="text-[11px] font-black text-amber-300">
                      {w.bestScore.rankName}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 自分の手牌（12枚＋★マイティ＋ツモ牌） */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-xs font-black ${
                  match.dealerSeat === 0
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-800 text-emerald-200'
                }`}
              >
                {getSeatWindLabel(0, match.dealerSeat)}家
              </span>
              <span className="text-xs sm:text-sm font-black text-white">
                あなたの手牌（12枚＋★マイティ）
              </span>
              {match.phase === 'player_action' && (
                <span className="text-xs text-amber-300 font-bold animate-pulse">
                  あなたのツモ番です
                </span>
              )}
            </div>

            {humanTsumoWin && match.phase === 'player_action' && (
              <button
                type="button"
                onClick={handleHumanTsumo}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black text-sm shadow-lg animate-bounce flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                ツモ！（{humanTsumoWin.rankName} {humanTsumoWin.points.toLocaleString()}点）
              </button>
            )}
          </div>

          <div className="bg-black/45 border border-emerald-700/50 rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
            {human.hand.map((tile) => (
              <MahjongTile
                key={tile.uid}
                tile={tile}
                size="md"
                isDora={tile.typeId === doraTileId}
                selected={selectedUid === tile.uid}
                disabled={
                  match.phase !== 'player_action' ||
                  match.currentTurnSeat !== 0 ||
                  human.isRiichi
                }
                onClick={() => handleTileClick(tile.uid)}
              />
            ))}
            <MahjongTile tile={wildcardTile} size="md" />
            {match.currentTurnSeat === 0 && match.currentTsumo && (
              <MahjongTile
                key={match.currentTsumo.uid}
                tile={match.currentTsumo}
                size="md"
                isTsumo
                isDora={match.currentTsumo.typeId === doraTileId}
                selected={selectedUid === match.currentTsumo.uid}
                disabled={match.phase !== 'player_action'}
                onClick={() => handleTileClick(match.currentTsumo!.uid)}
              />
            )}
          </div>
        </div>

        {/* 局終了結果 */}
        {match.phase === 'round_end' && match.roundResult && (
          <div className="bg-gradient-to-br from-slate-900/95 via-emerald-950/90 to-slate-900/95 border-2 border-amber-400 rounded-2xl p-5 space-y-4">
            {match.roundResult.type === 'agari' && match.roundResult.agari ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-6 h-6 text-amber-400" />
                    <h3 className="text-lg sm:text-xl font-black text-amber-300">
                      {match.players[match.roundResult.agari.winnerSeat].name} の
                      {match.roundResult.agari.loserSeat === null ? 'ツモ' : 'ロン'}和了！
                      （{match.roundResult.agari.scoreResult.rankName}{' '}
                      {match.roundResult.agari.scoreResult.points.toLocaleString()}点）
                    </h3>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-amber-400/20 text-amber-200 font-bold">
                    ★マイティ →{' '}
                    {TILE_NAMES[match.roundResult.agari.scoreResult.substitutedTile]}
                  </span>
                </div>

                {/* 和了者の手牌公開 */}
                <div className="flex flex-wrap items-center gap-1 bg-black/35 p-3 rounded-xl">
                  {match.players[match.roundResult.agari.winnerSeat].hand.map((t) => (
                    <MahjongTile key={t.uid} tile={t} size="sm" />
                  ))}
                  <MahjongTile
                    tile={wildcardTile}
                    size="sm"
                    substitutedLabel={
                      TILE_SHORT_NAMES[match.roundResult.agari.scoreResult.substitutedTile]
                    }
                  />
                  <MahjongTile
                    tile={match.roundResult.agari.winningTile}
                    size="sm"
                    isTsumo
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {match.roundResult.agari.scoreResult.yaku.map((y, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-black/40 border border-emerald-700/50 text-xs font-bold text-emerald-100"
                    >
                      {y.name} ({y.han}翻)
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-amber-300 font-black text-lg">
                <Flame className="w-5 h-5" />
                <span>流局（荒牌平局）</span>
              </div>
            )}

            {/* 点数移動 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {match.players.map((p, idx) => {
                const delta = match.roundResult!.pointDeltas[idx];
                return (
                  <div
                    key={p.seat}
                    className="bg-black/40 border border-emerald-800/60 rounded-xl p-2.5 text-xs"
                  >
                    <p className="font-bold text-white">{p.name}</p>
                    <p className="text-amber-300 font-black">
                      {p.score.toLocaleString()}点
                    </p>
                    <p
                      className={`font-bold ${
                        delta > 0
                          ? 'text-emerald-400'
                          : delta < 0
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {delta > 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString()}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleNextRound}
                className="px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm transition"
              >
                次の局へ進む
              </button>
            </div>
          </div>
        )}

        {/* 終局結果 */}
        {match.phase === 'match_end' && (
          <div className="bg-gradient-to-br from-amber-950/90 via-slate-900 to-emerald-950/90 border-2 border-amber-400 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-amber-300 font-black text-xl">
              <Trophy className="w-6 h-6" />
              <span>東風戦 終局！ あなたは第{humanRank}位</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {sortedStandings.map((p, idx) => (
                <div
                  key={p.seat}
                  className={`rounded-xl p-3 border ${
                    p.seat === 0
                      ? 'bg-amber-500/20 border-amber-400'
                      : 'bg-black/40 border-emerald-800/50'
                  }`}
                >
                  <p className="text-xs text-amber-300 font-black">#{idx + 1}</p>
                  <p className="text-sm font-black text-white">{p.name}</p>
                  <p className="text-base font-black text-amber-200">
                    {p.score.toLocaleString()}点
                  </p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleRestartMatch}
              className="px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm transition"
            >
              もう一戦打つ
            </button>
          </div>
        )}
      </div>

      {/* Supabase 全国ランキング（終局時に最終持ち点を登録可能） */}
      <LeaderboardPanel
        ruleId="mighty"
        ruleName="少牌マイティ"
        scoreUnit="点"
        latestScore={
          match.phase === 'match_end'
            ? {
                score: Math.max(0, human.score),
                rankName: `東風戦 第${humanRank}位`,
                detailSummary: `最終持ち点 ${human.score.toLocaleString()}点（CPU3人戦）`,
                turnsUsed: match.turnCount,
              }
            : null
        }
      />
    </div>
  );
};
