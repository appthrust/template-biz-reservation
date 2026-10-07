export type Resource = {
  id: number;
  name: string;
  kind: "room" | "equipment";
  location: string;
  notes: string;
};

export type Reservation = {
  id: number;
  resource_id: number;
  resource_name: string;
  kind: Resource["kind"];
  starts_at: Date;
  ends_at: Date;
  user_name: string;
  purpose: string;
  cancelled_at: Date | null;
  checked_out_at: Date | null;
  returned_at: Date | null;
};

export type ActionState = { error?: string; success?: string };
export class InputError extends Error {}

export function text(form: FormData, key: string, label: string, max: number, required = true): string {
  const value = form.get(key);
  if (typeof value !== "string") throw new InputError(`${label}を入力してください。`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new InputError(`${label}を入力してください。`);
  if (trimmed.length > max) throw new InputError(`${label}は${max}文字以内で入力してください。`);
  return trimmed;
}

export function positiveId(value: unknown): number {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647) {
    throw new InputError("対象が見つかりません。画面を開き直してください。");
  }
  return Number(value);
}

// 入力と表示は日本時間に統一し、サーバー・ブラウザのタイムゾーンに依存させない。
export function localDateTime(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function parseDateTime(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || Number(value.slice(0, 4)) < 2000) {
    throw new InputError("日時を正しく入力してください（2000年以降）。");
  }
  const date = new Date(`${value}:00+09:00`);
  if (Number.isNaN(date.getTime()) || localDateTime(date) !== value) throw new InputError("日時を正しく入力してください。");
  return date;
}

export function weekStart(value?: string): Date {
  let date: Date;
  try {
    date = parseDateTime(`${value ?? localDateTime(new Date()).slice(0, 10)}T00:00`);
  } catch {
    date = parseDateTime(`${localDateTime(new Date()).slice(0, 10)}T00:00`);
  }
  const day = new Date(date.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
  return new Date(date.getTime() - ((day + 6) % 7) * 86_400_000);
}

export function dateLabel(date: Date, includeTime = true): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
  }).format(date);
}

export function reservationStatus(row: Reservation, now = new Date()): string {
  if (row.cancelled_at) return "キャンセル済み";
  if (row.returned_at) return "返却済み";
  if (row.checked_out_at) return row.ends_at < now ? "返却期限超過" : "貸出中";
  return row.ends_at <= now ? "終了" : "予約済み";
}

export function csvCell(value: unknown): string {
  let string = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(string) || /^[\t\r\n]/.test(string)) string = `'${string}`;
  return `"${string.replaceAll('"', '""')}"`;
}

export function csv(rows: unknown[][]): string {
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
