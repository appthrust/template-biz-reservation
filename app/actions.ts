"use server";

import { revalidatePath } from "next/cache";
import type { PoolClient } from "pg";
import { database, transaction } from "@/lib/db";
import { InputError, parseDateTime, positiveId, text, type ActionState, type Reservation, type Resource } from "@/lib/reservation";

async function perform(operation: () => Promise<void>, success: string): Promise<ActionState> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof InputError) return { error: error.message };
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return { error: "同じ名前の資源、または貸出中の記録があります。一覧を確認してください。" };
    }
    console.error("Reservation update failed", error instanceof Error ? error.message : "unknown");
    return { error: "保存できませんでした。時間をおいて、もう一度お試しください。" };
  }
  revalidatePath("/");
  return { success };
}

export async function saveResource(_state: ActionState, form: FormData): Promise<ActionState> {
  return perform(async () => {
    const name = text(form, "name", "資源名", 100);
    const kind = text(form, "kind", "種類", 20);
    if (kind !== "room" && kind !== "equipment") throw new InputError("種類を選んでください。");
    const location = text(form, "location", "場所", 200, false);
    const notes = text(form, "notes", "メモ", 1000, false);
    const rawId = form.get("id");
    if (!rawId) {
      await database().query("INSERT INTO resources (name, kind, location, notes) VALUES ($1, $2, $3, $4)", [name, kind, location, notes]);
      return;
    }
    const id = positiveId(rawId);
    await transaction(async (client) => {
      const resource = await client.query<Resource>("SELECT * FROM resources WHERE id = $1 FOR UPDATE", [id]);
      if (!resource.rows[0]) throw new InputError("資源が見つかりません。画面を開き直してください。");
      if (resource.rows[0].kind !== kind) {
        const used = await client.query("SELECT 1 FROM reservations WHERE resource_id = $1 AND checked_out_at IS NOT NULL LIMIT 1", [id]);
        if (used.rowCount) throw new InputError("貸出履歴のある備品は種類を変更できません。新しい資源を追加してください。");
      }
      await client.query("UPDATE resources SET name = $1, kind = $2, location = $3, notes = $4 WHERE id = $5", [name, kind, location, notes, id]);
    });
  }, "資源を保存しました。");
}

export async function createReservation(_state: ActionState, form: FormData): Promise<ActionState> {
  return perform(async () => {
    const resourceId = positiveId(form.get("resource_id"));
    const start = parseDateTime(text(form, "starts_at", "開始日時", 16));
    const end = parseDateTime(text(form, "ends_at", "終了日時", 16));
    if (end <= start) throw new InputError("終了日時は開始日時より後にしてください。");
    if (end <= new Date()) throw new InputError("終了日時は現在より後にしてください。");
    const userName = text(form, "user_name", "利用者名", 100);
    const purpose = text(form, "purpose", "目的", 500);
    await transaction(async (client) => {
      // 同じ資源の変更を直列化。ロック取得後の最新スナップショットで重複を調べる。
      const resource = await client.query("SELECT id FROM resources WHERE id = $1 FOR UPDATE", [resourceId]);
      if (!resource.rowCount) throw new InputError("資源が見つかりません。選び直してください。");
      const conflict = await client.query(
        "SELECT 1 FROM reservations WHERE resource_id = $1 AND cancelled_at IS NULL AND starts_at < $3 AND ends_at > $2 LIMIT 1",
        [resourceId, start, end],
      );
      if (conflict.rowCount) throw new InputError("この時間には別の予約があります。開始・終了日時を変更してください。");
      await client.query("INSERT INTO reservations (resource_id, starts_at, ends_at, user_name, purpose) VALUES ($1, $2, $3, $4, $5)", [resourceId, start, end, userName, purpose]);
    });
  }, "予約を作成しました。");
}

async function lockedReservation(client: PoolClient, id: number): Promise<Reservation> {
  const found = await client.query<{ resource_id: number }>("SELECT resource_id FROM reservations WHERE id = $1", [id]);
  if (!found.rows[0]) throw new InputError("予約が見つかりません。画面を開き直してください。");
  await client.query("SELECT id FROM resources WHERE id = $1 FOR UPDATE", [found.rows[0].resource_id]);
  const result = await client.query<Reservation>("SELECT r.*, s.kind FROM reservations r JOIN resources s ON s.id = r.resource_id WHERE r.id = $1 FOR UPDATE OF r", [id]);
  return result.rows[0];
}

export async function cancelReservation(_state: ActionState, form: FormData): Promise<ActionState> {
  return perform(async () => {
    const id = positiveId(form.get("id"));
    await transaction(async (client) => {
      const row = await lockedReservation(client, id);
      if (row.cancelled_at) throw new InputError("この予約はすでにキャンセルされています。");
      if (row.checked_out_at) throw new InputError("貸出済みの予約はキャンセルできません。貸出中なら返却を記録してください。");
      await client.query("UPDATE reservations SET cancelled_at = NOW() WHERE id = $1", [id]);
    });
  }, "予約をキャンセルしました。");
}

export async function checkOut(_state: ActionState, form: FormData): Promise<ActionState> {
  return perform(async () => {
    const id = positiveId(form.get("id"));
    await transaction(async (client) => {
      const row = await lockedReservation(client, id);
      if (row.kind !== "equipment" || row.cancelled_at || row.checked_out_at) throw new InputError("この予約では貸出できません。一覧を確認してください。");
      const now = new Date();
      if (row.starts_at > now || row.ends_at <= now) throw new InputError("貸出は予約の開始日時から終了日時までの間に記録できます。");
      const open = await client.query("SELECT 1 FROM reservations WHERE resource_id = $1 AND checked_out_at IS NOT NULL AND returned_at IS NULL", [row.resource_id]);
      if (open.rowCount) throw new InputError("この備品はまだ貸出中です。先の貸出の返却を記録してください。");
      await client.query("UPDATE reservations SET checked_out_at = NOW() WHERE id = $1", [id]);
    });
  }, "貸出を記録しました。終了日時までに返却してください。");
}

export async function returnEquipment(_state: ActionState, form: FormData): Promise<ActionState> {
  return perform(async () => {
    const id = positiveId(form.get("id"));
    await transaction(async (client) => {
      const row = await lockedReservation(client, id);
      if (!row.checked_out_at || row.returned_at) throw new InputError("この備品は貸出中ではありません。一覧を確認してください。");
      await client.query("UPDATE reservations SET returned_at = NOW() WHERE id = $1", [id]);
    });
  }, "返却を記録しました。");
}
