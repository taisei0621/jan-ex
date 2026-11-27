-- 雀EX (Jan-EX) Supabase スキーマ定義
-- Supabase の SQL Editor に貼り付けて実行してください。

create table if not exists public.jan_ex_scores (
  id uuid primary key default gen_random_uuid(),
  rule_id text not null check (rule_id in ('mighty', 'washizu', 'totenko', 'marchao')),
  player_name text not null default '名無し雀士',
  score integer not null,
  rank_name text not null,
  detail_summary text not null default '',
  turns_used integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_jan_ex_scores_rule_score
  on public.jan_ex_scores (rule_id, score desc, created_at desc);

-- 初期MVP（認証なし）用の Row Level Security (RLS) ポリシー
alter table public.jan_ex_scores enable row level security;

create policy "Anyone can read leaderboard scores"
  on public.jan_ex_scores
  for select
  using (true);

create policy "Anyone can submit leaderboard scores"
  on public.jan_ex_scores
  for insert
  with check (
    char_length(player_name) between 1 and 20
    and score >= 0
  );
