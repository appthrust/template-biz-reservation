"use client";

import { useActionState, useId, useState } from "react";
import { cancelReservation, checkOut, createReservation, returnEquipment, saveResource } from "./actions";
import { type ActionState, type Resource } from "@/lib/reservation";

function Result({ state, id }: { state: ActionState; id: string }) {
  return <div id={id} aria-live="polite">{state.error && <p className="notice error" role="alert">{state.error}</p>}{state.success && <p className="notice success">{state.success}</p>}</div>;
}

export function ResourceForm({ resource }: { resource?: Resource }) {
  const [state, action, pending] = useActionState(saveResource, {});
  const id = useId();
  const [values, setValues] = useState({ name: resource?.name ?? "", kind: resource?.kind ?? "room", location: resource?.location ?? "", notes: resource?.notes ?? "" });
  return <form action={action} className="form-stack" aria-describedby={id}>
    {resource && <input type="hidden" name="id" value={resource.id} />}
    <label>資源名<input name="name" required maxLength={100} value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} /></label>
    <label>種類<select name="kind" value={values.kind} onChange={(e) => setValues({ ...values, kind: e.target.value as Resource["kind"] })}><option value="room">会議室</option><option value="equipment">備品</option></select></label>
    <label>場所<input name="location" maxLength={200} value={values.location} onChange={(e) => setValues({ ...values, location: e.target.value })} /></label>
    <label>メモ<textarea name="notes" rows={2} maxLength={1000} value={values.notes} onChange={(e) => setValues({ ...values, notes: e.target.value })} /></label>
    <button className="button primary" disabled={pending}>{pending ? "保存しています…" : resource ? "変更を保存" : "資源を追加"}</button>
    <Result state={state} id={id} />
  </form>;
}

export function ReservationForm({ resource, start, end }: { resource: Resource; start: string; end: string }) {
  const [state, action, pending] = useActionState(createReservation, {});
  const id = useId();
  const [values, setValues] = useState({ starts_at: start, ends_at: end, user_name: "", purpose: "" });
  return <form action={action} className="form-stack" aria-describedby={id}>
    <input type="hidden" name="resource_id" value={resource.id} />
    <p className="selected-name">{resource.name}</p>
    <label>開始日時<input type="datetime-local" name="starts_at" required value={values.starts_at} onChange={(e) => setValues({ ...values, starts_at: e.target.value })} /></label>
    <label>終了日時{resource.kind === "equipment" ? "・返却期限" : ""}<input type="datetime-local" name="ends_at" required value={values.ends_at} onChange={(e) => setValues({ ...values, ends_at: e.target.value })} /></label>
    <label>利用者名<input name="user_name" autoComplete="name" required maxLength={100} value={values.user_name} onChange={(e) => setValues({ ...values, user_name: e.target.value })} /></label>
    <label>目的<textarea name="purpose" rows={2} required maxLength={500} value={values.purpose} onChange={(e) => setValues({ ...values, purpose: e.target.value })} /></label>
    <p className="hint">日時は日本時間です。同じ資源の重なる時間には予約できません。</p>
    <button className="button primary" disabled={pending}>{pending ? "予約しています…" : "予約を作成"}</button>
    <Result state={state} id={id} />
  </form>;
}

export function ReservationAction({ id, kind }: { id: number; kind: "cancel" | "out" | "return" }) {
  const fn = kind === "cancel" ? cancelReservation : kind === "out" ? checkOut : returnEquipment;
  const [state, action, pending] = useActionState(fn, {});
  const resultId = useId();
  const label = kind === "cancel" ? "キャンセル" : kind === "out" ? "貸出を記録" : "返却を記録";
  return <form action={action} aria-describedby={resultId} onSubmit={(event) => {
    if (kind === "cancel" && !window.confirm("この予約をキャンセルしますか？予約の時間が空きます。")) event.preventDefault();
  }}>
    <input type="hidden" name="id" value={id} />
    <button className={`button small ${kind === "cancel" ? "quiet" : "secondary"}`} disabled={pending}>{pending ? "保存中…" : label}</button>
    <Result state={state} id={resultId} />
  </form>;
}
