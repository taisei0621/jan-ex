'use client';

import React, { useState } from 'react';
import { Sparkles, Layers, ShieldAlert, Coins } from 'lucide-react';
import { RULE_CONFIGS } from '@/engine/rules';
import { MahjongRuleConfig } from '@/types/mahjong';
import { MightyGame } from '@/components/MightyGame';
import { MightyMatchGame } from '@/components/MightyMatchGame';
import { WashizuGame } from '@/components/WashizuGame';
import { TotenkoGame } from '@/components/TotenkoGame';
import { MarchaoGame } from '@/components/MarchaoGame';

const DISPLAY_RULES: MahjongRuleConfig['id'][] = [
  'mighty',
  'washizu',
  'totenko',
  'marchao',
];

export default function Home() {
  const [activeRuleId, setActiveRuleId] = useState<MahjongRuleConfig['id']>('mighty');
  const [mightySubMode, setMightySubMode] = useState<'match' | 'solo'>('match');
  const activeRule = RULE_CONFIGS[activeRuleId];

  const getRuleIcon = (id: MahjongRuleConfig['id']) => {
    switch (id) {
      case 'mighty':
        return <Sparkles className="w-4 h-4" />;
      case 'washizu':
        return <Layers className="w-4 h-4" />;
      case 'totenko':
        return <Coins className="w-4 h-4" />;
      case 'marchao':
        return <ShieldAlert className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* ヘッダー */}
      <header className="border-b border-emerald-900/60 bg-black/40 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black text-xl">
              雀
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-tight text-white">
                  雀EX <span className="text-amber-400 text-sm font-bold">Jan-EX</span>
                </h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                  All 4 Modes Active
                </span>
              </div>
              <p className="text-xs text-emerald-300/70">
                普通の麻雀に飽きた全雀士へ。異次元の特殊ルール麻雀プラットフォーム
              </p>
            </div>
          </div>

          {/* ルール切り替えタブ */}
          <nav className="flex flex-wrap gap-1.5">
            {DISPLAY_RULES.map((id) => {
              const rule = RULE_CONFIGS[id];
              const isSelected = activeRuleId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveRuleId(id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'bg-black/40 text-emerald-200/80 hover:bg-emerald-950/60 border border-emerald-800/50'
                  }`}
                >
                  {getRuleIcon(id)}
                  <span>{rule.name}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 space-y-6">
        {/* ルール説明ヘッダー */}
        <section className="bg-black/30 border border-emerald-800/50 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black text-white">
                {activeRule.name}
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30 font-bold">
                {activeRule.subtitle}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-emerald-200/80 mt-1">
              {activeRule.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0 text-[11px] font-semibold text-emerald-300">
            <span className="px-2.5 py-1 rounded-md bg-emerald-950/80 border border-emerald-800/60">
              手牌: {activeRule.normalHandSize}枚
            </span>
            <span className="px-2.5 py-1 rounded-md bg-emerald-950/80 border border-emerald-800/60">
              {activeRule.playerCount}人麻雀ベース
            </span>
            {activeRule.hasWildcard && (
              <span className="px-2.5 py-1 rounded-md bg-amber-950/80 border border-amber-600/50 text-amber-300">
                ★ワイルドカード有効
              </span>
            )}
            {activeRule.isGlassMahjong && (
              <span className="px-2.5 py-1 rounded-md bg-cyan-950/80 border border-cyan-500/50 text-cyan-300">
                透明ガラス牌 75%
              </span>
            )}
            {activeRule.scoringType === 'totenko_points' && (
              <span className="px-2.5 py-1 rounded-md bg-amber-950/80 border border-amber-500/50 text-amber-300">
                完全加算式・ガリ自動抜き
              </span>
            )}
            {activeRule.hasGoldTiles && (
              <span className="px-2.5 py-1 rounded-md bg-rose-950/80 border border-rose-500/50 text-rose-300">
                金牌＆白ポッチ有効
              </span>
            )}
          </div>
        </section>

        {/* ゲームエリア */}
        {activeRuleId === 'mighty' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setMightySubMode('match')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition ${
                  mightySubMode === 'match'
                    ? 'bg-emerald-400 text-slate-950 shadow-md'
                    : 'bg-black/40 text-emerald-200 border border-emerald-800/60 hover:bg-emerald-950/60'
                }`}
              >
                4人対局（CPU戦・東風戦）
              </button>
              <button
                type="button"
                onClick={() => setMightySubMode('solo')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition ${
                  mightySubMode === 'solo'
                    ? 'bg-emerald-400 text-slate-950 shadow-md'
                    : 'bg-black/40 text-emerald-200 border border-emerald-800/60 hover:bg-emerald-950/60'
                }`}
              >
                一人スコアアタック（10巡）
              </button>
            </div>
            {mightySubMode === 'match' ? <MightyMatchGame /> : <MightyGame />}
          </div>
        )}
        {activeRuleId === 'washizu' && <WashizuGame />}
        {activeRuleId === 'totenko' && <TotenkoGame />}
        {activeRuleId === 'marchao' && <MarchaoGame />}
      </main>
    </div>
  );
}
