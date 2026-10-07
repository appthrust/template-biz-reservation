CREATE TABLE IF NOT EXISTS resources (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  kind TEXT NOT NULL CHECK (kind IN ('room', 'equipment')),
  location VARCHAR(200) NOT NULL DEFAULT '',
  notes VARCHAR(1000) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservations (
  id SERIAL PRIMARY KEY,
  resource_id INTEGER NOT NULL REFERENCES resources(id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  user_name VARCHAR(100) NOT NULL CHECK (btrim(user_name) <> ''),
  purpose VARCHAR(500) NOT NULL CHECK (btrim(purpose) <> ''),
  cancelled_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at),
  CHECK (returned_at IS NULL OR (checked_out_at IS NOT NULL AND returned_at >= checked_out_at)),
  CHECK (cancelled_at IS NULL OR checked_out_at IS NULL)
);

CREATE INDEX IF NOT EXISTS reservations_schedule ON reservations(resource_id, starts_at, ends_at) WHERE cancelled_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reservations_one_open_loan ON reservations(resource_id) WHERE checked_out_at IS NOT NULL AND returned_at IS NULL;

INSERT INTO resources (name, kind, location, notes) VALUES
  ('会議室 A', 'room', '2階', '定員6名・モニターあり'),
  ('会議室 B', 'room', '3階', '定員10名・ホワイトボードあり'),
  ('プロジェクター', 'equipment', '総務カウンター', 'HDMIケーブルも一緒に返却してください'),
  ('貸出ノートPC', 'equipment', '総務カウンター', '電源アダプター付き')
ON CONFLICT (name) DO NOTHING;

-- 初期ひな形のメッセージ画面は予約・貸出に置き換える。
DROP TABLE IF EXISTS appthrust_demo_messages;
