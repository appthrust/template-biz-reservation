-- データ画面の表・列に日本語の表示名を設定します。
COMMENT ON TABLE resources IS '会議室・備品';
COMMENT ON COLUMN resources.id IS '番号';
COMMENT ON COLUMN resources.name IS '名称';
COMMENT ON COLUMN resources.kind IS '種類';
COMMENT ON COLUMN resources.location IS '場所';
COMMENT ON COLUMN resources.notes IS '@long メモ';
COMMENT ON COLUMN resources.created_at IS '登録日時';

COMMENT ON TABLE reservations IS '予約・貸出';
COMMENT ON COLUMN reservations.id IS '番号';
COMMENT ON COLUMN reservations.resource_id IS '会議室・備品';
COMMENT ON COLUMN reservations.starts_at IS '開始日時';
COMMENT ON COLUMN reservations.ends_at IS '終了日時';
COMMENT ON COLUMN reservations.user_name IS '利用者名';
COMMENT ON COLUMN reservations.purpose IS '@long 目的';
COMMENT ON COLUMN reservations.cancelled_at IS 'キャンセル日時';
COMMENT ON COLUMN reservations.checked_out_at IS '貸出日時';
COMMENT ON COLUMN reservations.returned_at IS '返却日時';
COMMENT ON COLUMN reservations.created_at IS '登録日時';
