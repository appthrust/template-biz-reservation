# 予約・貸出

会議室と備品の空き状況を週カレンダーで確認し、予約・貸出・返却を管理する AppThrust の業務ひな形です。Next.js App Router、Server Actions、PostgreSQL（`pg`）を使います。

## できること

- 会議室 A・会議室 B・プロジェクター・貸出ノートPCを初期登録。資源の追加・名前・種類・場所・メモの編集。
- 資源ごとの月曜始まりの週カレンダー、前週・今週・翌週への移動。スマートフォンでは日ごとの縦並び。
- 開始・終了日時、利用者名、目的を指定して予約。同じ資源の重複する時間帯は保存不可。終了と次の開始が同じ時刻なら予約可能。
- 備品を予約し、予約時間内に「貸出を記録」。予約の終了日時が返却期限。貸出中一覧にすべての未返却を表示し、期限超過を文字と色で強調。
- 「返却を記録」で実際の返却日時を保存。貸出済み予約のキャンセルは禁止。返却しても元の予約時間枠は維持します。
- 未貸出の予約を確認後にキャンセル。記録は削除せず、キャンセル済みとして CSV に残します。
- 資源・全予約（キャンセル含む）・全貸出履歴をそれぞれ CSV 書き出し。UTF-8 BOM、引用符・改行のエスケープ、数式の無効化付き。

時刻の入力・画面・CSV はすべて **日本時間（Asia/Tokyo）**。保存は `TIMESTAMPTZ`。利用者名は手入力です。ログイン・認証・権限管理は実装していません。AppThrust の入口で SSO と公開範囲を設定してください。直接インターネットに公開すると、到達できる全員が閲覧・更新できます。

## ローカルで動かす

Node.js 24 と PostgreSQL 17 を用意してください。

```bash
npm ci
export DATABASE_URL='postgresql://postgres:password@localhost:5432/reservation'
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0001_init.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/0002_reservation.sql
npm run dev
```

`http://localhost:3000` を開きます。予約は初期投入しません。自分で予約を作り、備品では開始日時を現在以前・終了日時を未来にすると、その場で貸出を記録できます。

**アプリは起動時にマイグレーションを実行しません。** AppThrust では `DatabaseChange` が `db/migrations/*.sql` を順番に適用します。ローカルでは上記の `psql` で適用してください。SQL は再実行可能です。`0002` は業務テーブルを追加し、未使用になった初期ひな形の `appthrust_demo_messages` を削除します。資源の種データは同名が存在しない場合だけ作成します。

接続設定またはマイグレーションが不足している場合は、画面に準備状況の確認と再読み込みを案内します。接続情報は画面には出しません。

## データモデル

### `resources` — 資源

| 列 | 内容 |
| --- | --- |
| `id` | 自動採番・主キー |
| `name` | 資源名・必須・100文字・重複不可 |
| `kind` | `room`（会議室）または `equipment`（備品） |
| `location` / `notes` | 場所200文字 / メモ1000文字 |
| `created_at` | 登録日時 |

1行で予約可能な1つの資源を表します。同じ備品が複数ある場合は「ノートPC 1」「ノートPC 2」のように別々に登録します。貸出履歴がある備品は種類を変更できません。

### `reservations` — 予約と貸出の履歴

| 列 | 内容 |
| --- | --- |
| `id` / `resource_id` | 主キー / `resources.id` への外部キー |
| `starts_at` / `ends_at` | 開始 / 終了・返却期限。終了は開始より後 |
| `user_name` / `purpose` | 利用者名100文字 / 目的500文字・どちらも必須 |
| `cancelled_at` | キャンセル日時（通常は NULL） |
| `checked_out_at` / `returned_at` | 実際の貸出 / 返却日時（未実施は NULL） |
| `created_at` | 作成日時 |

- 予約作成・取消・貸出・返却・資源編集は、同じ `resources` 行を `SELECT ... FOR UPDATE` でロックして直列化します。予約の重複チェックはロック取得後に行います。対象時間は半開区間 `[開始, 終了)`、取消済みだけを除外します。
- `checked_out_at IS NOT NULL AND returned_at IS NULL` の部分一意インデックスで、同じ備品の二重貸出も防止します。
- `未取消 → 貸出 → 返却` または `未取消・未貸出 → 取消`。貸出中・返却済みの取消は不可。返却の二重登録も拒否します。
- 過去の記録は保持。期限超過は `貸出済み AND 未返却 AND ends_at < 現在` で判定します。期限超過の備品に次の予約を入れることはできますが、先の返却が終わるまで次の貸出はできません。
- 直接 SQL で予約を作る場合も同じ資源ロックと重複確認が必要です。アプリ外の無調整な書き込みまで時間重複を防ぐ制約ではありません。

## 構成と確認

- `app/page.tsx`: 週カレンダー、貸出・返却、資源管理。
- `app/actions.ts`: 入力検証とトランザクション付き Server Actions。
- `app/forms.tsx`: 入力を保持するフォーム、送信中・成功・失敗表示。
- `app/export/route.ts`: `/export?type=resources|reservations|loans`。
- `lib/db.ts`: `pg.Pool` とトランザクション。
- `lib/reservation.ts`: 日時・状態・CSV・入力の共通規則。

```bash
npm run build
node --test tests/reservation.test.mjs
```

`Dockerfile` と `.github/workflows/deploy.yml` は `appthrust/template-nextjs` のものを変更していません。`main` に push すると Actions が `ghcr.io/appthrust/template-biz-reservation:edge-<日時>` を作成します。アプリの待受ポートは3000です。
