# 開発ガイド — 予約・貸出

## 技術と配置

Next.js 16 App Router + React 19 + TypeScript + `pg`。この版には互換性のない変更があるため、編集前に `node_modules/next/dist/docs/` の該当ガイドを読んでください。フォーム更新は `app/actions.ts` の Server Actions、表示は `app/page.tsx`、接続は `lib/db.ts` を使い、別の更新 API や ORM を増やしません。

認証は AppThrust の入口に任せ、アプリ内にログイン機能を作りません。ただし到達できる人は全データを更新できます。利用者名を認証済みの人物として扱わないでください。

## データモデルと守ること

- `resources`: `id`, 一意な `name`, `kind`（`room` / `equipment`）, `location`, `notes`, `created_at`。
- `reservations`: `id`, `resource_id`, `starts_at`, `ends_at`, `user_name`, `purpose`, `cancelled_at`, `checked_out_at`, `returned_at`, `created_at`。
- 貸出は予約の状態。別の貸出台帳に複製しません。備品の `ends_at` が返却期限です。
- 同じ資源の更新では最初に資源行を `FOR UPDATE`。その後に予約行をロック・検査します。ロック順を逆にしないでください。
- 時間重複は未取消の予約に対し `existing.starts_at < new.ends_at AND existing.ends_at > new.starts_at`。同時送信でもチェックと INSERT を1トランザクションにします。
- 二重貸出は未返却の部分一意インデックスでも防止。取消と貸出履歴は両立不可。返却後も予約枠と履歴を維持します。
- 時刻は日本時間で入力・表示し、`TIMESTAMPTZ` に保存。ブラウザやサーバーのローカルタイムに依存させないでください。
- CSV は `lib/reservation.ts` の引用・数式無効化を通す。SQL は必ずパラメーター化。入力検証は Server Action 側でも行います。

## マイグレーション

`db/migrations/0002_reservation.sql` が業務スキーマと資源種データです。アプリ起動時には実行せず、AppThrust の `DatabaseChange` が適用します。既存の適用済み SQL の意味を変更せず、変更は次の番号の SQL にします。再実行可能なテーブル・インデックス作成と、重複しない種データにしてください。ローカルへの適用方法は README 参照。

## UI・確認

利用者向け文言は日本語。390px 幅でも横スクロールせず、入力ラベル・送信中・失敗後の修正手段を保ちます。予約がない状態、重複エラー、期限超過、キャンセル・返却後も確認してください。

確認コマンドは `npm ci && npm run build` と `node --test tests/reservation.test.mjs`。Dockerfile と deploy.yml は基本ひな形の配送規約なので変更しません。データモデル・利用手順を変えたら README も更新してください。
