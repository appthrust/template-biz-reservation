import { database } from "@/lib/db";
import { csv, localDateTime, reservationStatus, type Reservation, type Resource } from "@/lib/reservation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const type = new URL(request.url).searchParams.get("type") ?? "reservations";
  if (!["resources", "reservations", "loans"].includes(type)) return new Response("書き出す種類を選んでください。", { status: 400 });
  try {
    let rows: unknown[][];
    if (type === "resources") {
      const resources = await database().query<Resource>("SELECT id, name, kind, location, notes FROM resources ORDER BY id");
      rows = [["資源番号", "資源名", "種類", "場所", "メモ"], ...resources.rows.map((row) => [row.id, row.name, row.kind === "room" ? "会議室" : "備品", row.location, row.notes])];
    } else {
      const result = await database().query<Reservation>(`SELECT r.*, s.name AS resource_name, s.kind FROM reservations r JOIN resources s ON s.id = r.resource_id ${type === "loans" ? "WHERE r.checked_out_at IS NOT NULL" : ""} ORDER BY r.starts_at, r.id`);
      rows = [["予約番号", "資源名", "種類", "開始日時（日本時間）", "終了・返却期限（日本時間）", "利用者名", "目的", "状態", "貸出日時（日本時間）", "返却日時（日本時間）", "キャンセル日時（日本時間）"], ...result.rows.map((row) => [row.id, row.resource_name, row.kind === "room" ? "会議室" : "備品", localDateTime(row.starts_at).replace("T", " "), localDateTime(row.ends_at).replace("T", " "), row.user_name, row.purpose, reservationStatus(row), row.checked_out_at ? localDateTime(row.checked_out_at).replace("T", " ") : "", row.returned_at ? localDateTime(row.returned_at).replace("T", " ") : "", row.cancelled_at ? localDateTime(row.cancelled_at).replace("T", " ") : ""])];
    }
    return new Response(csv(rows), { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}-${localDateTime(new Date()).slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    console.error("Reservation export failed", error instanceof Error ? error.message : "unknown");
    return new Response("書き出せませんでした。時間をおいて、もう一度お試しください。", { status: 503 });
  }
}
