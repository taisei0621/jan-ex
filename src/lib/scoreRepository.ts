import { MahjongRuleConfig } from '@/types/mahjong';
import { getSupabaseClient } from './supabase';

export type LeaderboardRuleId = Exclude<MahjongRuleConfig['id'], 'standard'>;

export interface LeaderboardEntry {
  id: string;
  rule_id: LeaderboardRuleId;
  player_name: string;
  score: number;
  rank_name: string;
  detail_summary: string;
  turns_used: number;
  created_at: string;
}

const LOCAL_STORAGE_KEY = 'jan_ex_leaderboard_fallback_v1';

function readLocalFallback(ruleId: LeaderboardRuleId): LeaderboardEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const all: LeaderboardEntry[] = JSON.parse(raw);
    return all
      .filter((e) => e.rule_id === ruleId)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  } catch {
    return [];
  }
}

function writeLocalFallback(entry: LeaderboardEntry): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const all: LeaderboardEntry[] = raw ? JSON.parse(raw) : [];
    const updated = [entry, ...all].slice(0, 100);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage errors
  }
}

export async function fetchLeaderboard(
  ruleId: LeaderboardRuleId
): Promise<{ entries: LeaderboardEntry[]; source: 'supabase' | 'local' }> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('jan_ex_scores')
      .select('*')
      .eq('rule_id', ruleId)
      .order('score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10);

    if (!error && data) {
      return { entries: data as LeaderboardEntry[], source: 'supabase' };
    }
  }

  return { entries: readLocalFallback(ruleId), source: 'local' };
}

export async function submitLeaderboardScore(input: {
  ruleId: LeaderboardRuleId;
  playerName: string;
  score: number;
  rankName: string;
  detailSummary: string;
  turnsUsed: number;
}): Promise<{ ok: boolean; source: 'supabase' | 'local' }> {
  const sanitizedName = input.playerName.trim().slice(0, 20) || '名無し雀士';
  const localEntry: LeaderboardEntry = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    rule_id: input.ruleId,
    player_name: sanitizedName,
    score: input.score,
    rank_name: input.rankName,
    detail_summary: input.detailSummary,
    turns_used: input.turnsUsed,
    created_at: new Date().toISOString(),
  };

  // ローカルにも常にバックアップ保存
  writeLocalFallback(localEntry);

  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('jan_ex_scores').insert({
      rule_id: input.ruleId,
      player_name: sanitizedName,
      score: input.score,
      rank_name: input.rankName,
      detail_summary: input.detailSummary,
      turns_used: input.turnsUsed,
    });
    if (!error) {
      return { ok: true, source: 'supabase' };
    }
  }

  return { ok: true, source: 'local' };
}
