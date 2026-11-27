'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Trophy, Database, HardDrive, Send, RefreshCw } from 'lucide-react';
import {
  fetchLeaderboard,
  LeaderboardEntry,
  LeaderboardRuleId,
  submitLeaderboardScore,
} from '@/lib/scoreRepository';

interface LeaderboardPanelProps {
  ruleId: LeaderboardRuleId;
  ruleName: string;
  scoreUnit?: string; // 例: '点', '問', '枚'
  latestScore?: {
    score: number;
    rankName: string;
    detailSummary: string;
    turnsUsed: number;
  } | null;
}

export const LeaderboardPanel: React.FC<LeaderboardPanelProps> = ({
  ruleId,
  ruleName,
  scoreUnit = '点',
  latestScore = null,
}) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [source, setSource] = useState<'supabase' | 'local'>('local');
  const [loading, setLoading] = useState(false);
  const [playerName, setPlayerName] = useState('名無しの雀士');
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchLeaderboard(ruleId);
    setEntries(res.entries);
    setSource(res.source);
    setLoading(false);
  }, [ruleId]);

  useEffect(() => {
    load();
    try {
      const savedName = localStorage.getItem('jan_ex_player_name');
      if (savedName) setPlayerName(savedName);
    } catch {
      // ignore
    }
  }, [load]);

  const currentScoreKey = latestScore
    ? `${ruleId}-${latestScore.score}-${latestScore.rankName}-${latestScore.turnsUsed}`
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!latestScore || submitting || currentScoreKey === submittedKey) return;
    setSubmitting(true);
    try {
      localStorage.setItem('jan_ex_player_name', playerName.trim() || '名無しの雀士');
    } catch {
      // ignore
    }
    await submitLeaderboardScore({
      ruleId,
      playerName,
      score: latestScore.score,
      rankName: latestScore.rankName,
      detailSummary: latestScore.detailSummary,
      turnsUsed: latestScore.turnsUsed,
    });
    setSubmittedKey(currentScoreKey);
    setSubmitting(false);
    await load();
  };

  return (
    <section className="bg-black/35 border border-emerald-800/50 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm sm:text-base font-black text-white">
            {ruleName} 全国ランキング TOP 10
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 border ${
              source === 'supabase'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800 text-slate-300 border-slate-600'
            }`}
          >
            {source === 'supabase' ? (
              <>
                <Database className="w-3 h-3" /> Supabase 接続中
              </>
            ) : (
              <>
                <HardDrive className="w-3 h-3" /> ローカルモード（ENV未設定時フォールバック）
              </>
            )}
          </span>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-800/60 text-emerald-200 transition"
            title="ランキングを再読み込み"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 最新スコア登録フォーム */}
      {latestScore && (
        <form
          onSubmit={handleSubmit}
          className="bg-amber-950/35 border border-amber-500/40 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="text-xs">
            <span className="text-amber-300 font-black">
              今回の記録: {latestScore.score.toLocaleString()}
              {scoreUnit}（{latestScore.rankName}）
            </span>
            <p className="text-emerald-200/75 mt-0.5 truncate max-w-md">
              {latestScore.detailSummary}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={20}
              placeholder="雀士名"
              className="px-2.5 py-1.5 rounded-lg bg-black/50 border border-emerald-700/60 text-xs text-white focus:outline-none focus:border-amber-400 w-32"
            />
            <button
              type="submit"
              disabled={submitting || currentScoreKey === submittedKey}
              className="px-3.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 text-xs font-black flex items-center gap-1 transition"
            >
              <Send className="w-3.5 h-3.5" />
              {currentScoreKey === submittedKey ? '登録済み' : 'ランキング登録'}
            </button>
          </div>
        </form>
      )}

      {/* ランキング一覧 */}
      {entries.length === 0 ? (
        <p className="text-xs text-slate-400 py-2">
          まだランキング記録がありません。アガリを達成して最初の記録を登録しましょう！
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-emerald-800/60 text-emerald-300/70">
                <th className="py-2 pr-3">順位</th>
                <th className="py-2 pr-3">雀士名</th>
                <th className="py-2 pr-3">スコア</th>
                <th className="py-2 pr-3">役・詳細</th>
                <th className="py-2">登録日</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-900/40">
              {entries.map((entry, idx) => (
                <tr key={entry.id} className="hover:bg-white/5">
                  <td className="py-2 pr-3 font-black text-amber-300">#{idx + 1}</td>
                  <td className="py-2 pr-3 font-bold text-white">{entry.player_name}</td>
                  <td className="py-2 pr-3 font-black text-amber-200">
                    {entry.score.toLocaleString()}
                    {scoreUnit}{' '}
                    <span className="text-[10px] font-semibold text-emerald-300">
                      ({entry.rank_name})
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-emerald-200/80 max-w-xs truncate">
                    {entry.detail_summary}
                  </td>
                  <td className="py-2 text-slate-400">
                    {new Date(entry.created_at).toLocaleDateString('ja-JP')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
