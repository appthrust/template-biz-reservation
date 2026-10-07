import assert from "node:assert/strict";
import test from "node:test";
import { csv, csvCell, localDateTime, parseDateTime, positiveId, reservationStatus, text, weekStart } from "../lib/reservation.ts";

test("日本時間は実行環境に依存せず往復する", () => {
  assert.equal(parseDateTime("2026-10-07T09:30").toISOString(), "2026-10-07T00:30:00.000Z");
  assert.equal(localDateTime(new Date("2026-10-07T00:30:00Z")), "2026-10-07T09:30");
});

test("存在しない日付・時刻・古い年を拒否する", () => {
  for (const value of ["2026-02-30T10:00", "2026-13-01T10:00", "2026-10-07T24:00", "1999-10-07T10:00", "2026-10-07"])
    assert.throws(() => parseDateTime(value));
});

test("週は日本時間の月曜00時から始まる", () => {
  assert.equal(localDateTime(weekStart("2026-10-11")), "2026-10-05T00:00");
  assert.equal(localDateTime(weekStart("2026-10-05")), "2026-10-05T00:00");
});

test("識別子は正のPostgreSQL integerのみ受け取る", () => {
  assert.equal(positiveId("42"), 42);
  for (const value of ["0", "-1", "1.2", "01", "1e3", "2147483648", "abc", null]) assert.throws(() => positiveId(value));
});

test("必須入力と文字数はサーバーで検証する", () => {
  const form = new FormData();
  form.set("name", "  会議室 A  ");
  assert.equal(text(form, "name", "資源名", 100), "会議室 A");
  assert.throws(() => text(form, "name", "資源名", 2));
  form.set("name", "  ");
  assert.throws(() => text(form, "name", "資源名", 100));
});

test("未返却だけを期限超過とし、返却・キャンセル履歴を残す", () => {
  const row = { ends_at: new Date("2026-10-07T01:00Z"), checked_out_at: new Date("2026-10-07T00:00Z"), cancelled_at: null, returned_at: null };
  assert.equal(reservationStatus(row, new Date("2026-10-07T00:30Z")), "貸出中");
  assert.equal(reservationStatus(row, new Date("2026-10-07T02:00Z")), "返却期限超過");
  assert.equal(reservationStatus({ ...row, returned_at: new Date("2026-10-07T02:00Z") }), "返却済み");
  assert.equal(reservationStatus({ ...row, checked_out_at: null, cancelled_at: new Date() }), "キャンセル済み");
});

test("CSVは引用符・改行を保持し数式実行を防ぐ", () => {
  assert.equal(csvCell('会議, "A"\n予約'), '"会議, ""A""\n予約"');
  for (const value of ["=1+1", " +SUM(A1)", "-1+2", "@SUM(A1)", "\tcalc", "\ncalc"]) assert.ok(csvCell(value).startsWith('"\''));
  assert.equal(csv([["資源", "利用者"], ["会議室", "山田"]]), '\uFEFF"資源","利用者"\r\n"会議室","山田"\r\n');
});
