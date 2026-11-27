# AGENTS.md — 雀EX (Jan-EX) 開発規範定義

本リポジトリは「ソフトウェアクリエイション1・2 ソフトウェア開発演習」に基づき、AIエージェントと人間が協調して毎週本番デプロイを行うためのハーネス規範を定めます。

## 1. 技術スタックと制約
- **Framework**: Next.js (App Router) + TypeScript (`strict: true`)
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL) — 環境変数未設定時は LocalStorage スタブへ自動フォールバックし、オフライン・ローカルでもクラッシュさせないこと。
- **Testing**: Vitest (`npm test`)
- **Hosting**: GitHub + Vercel（`main` ブランチへのプッシュで自動デプロイ）

## 2. ハーネス（機械的検証）ルール
コード変更後は必ず以下の両方をパスすること：
1. `npx tsc --noEmit`（静的型検査）
2. `npm test`（牌理エンジン・点数計算ロジックの自動テスト）

## 3. アーキテクチャ境界
- `src/engine/` には React/DOM に依存しない純粋な麻雀ロジックのみを配置する。
- `src/lib/` には Supabase 通信や永続化アダプタを配置する。
- `src/components/` には UI コンポーネントを配置する。
- 秘密鍵（`.env.local` 等）は絶対にリポジトリへコミットしないこと。
