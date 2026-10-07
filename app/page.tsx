import Link from "next/link";
import { database } from "@/lib/db";
import { dateLabel, localDateTime, reservationStatus, weekStart, type Reservation, type Resource } from "@/lib/reservation";
import { ReservationAction, ReservationForm, ResourceForm } from "./forms";

export const dynamic = "force-dynamic";

type Params = { view?: string; resource?: string; week?: string };

export default async function Home({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const view = params.view === "loans" || params.view === "resources" ? params.view : "calendar";
  const week = weekStart(params.week);
  const weekEnd = new Date(week.getTime() + 7 * 86_400_000);
  const now = new Date();
  let resources: Resource[];
  let bookings: Reservation[];
  let loans: Reservation[];
  let history: Reservation[];
  let selected: Resource | undefined;
  try {
    resources = (await database().query<Resource>("SELECT id, name, kind, location, notes FROM resources ORDER BY kind DESC, id")).rows;
    selected = resources.find((row) => String(row.id) === params.resource) ?? resources[0];
    const columns = "SELECT r.*, s.name AS resource_name, s.kind FROM reservations r JOIN resources s ON s.id = r.resource_id";
    [bookings, loans, history] = await Promise.all([
      database().query<Reservation>(`${columns} WHERE r.resource_id = $1 AND r.cancelled_at IS NULL AND r.starts_at < $3 AND r.ends_at > $2 ORDER BY r.starts_at`, [selected?.id ?? 0, week, weekEnd]).then((result) => result.rows),
      database().query<Reservation>(`${columns} WHERE r.checked_out_at IS NOT NULL AND r.returned_at IS NULL ORDER BY r.ends_at`).then((result) => result.rows),
      database().query<Reservation>(`${columns} WHERE r.returned_at IS NOT NULL ORDER BY r.returned_at DESC LIMIT 20`).then((result) => result.rows),
    ]);
  } catch (error) {
    console.error("Reservation data unavailable", error instanceof Error ? error.message : "unknown");
    return <main className="container"><header className="page-header"><h1>予約・貸出</h1></header><section className="panel unavailable"><h2>いま予約を読み込めません</h2><p>時間をおいて、もう一度お試しください。初めて使う場合は、基盤の担当者に準備が終わっているか確認してください。</p><a href="/" className="button primary">もう一度読み込む</a></section></main>;
  }
  const overdue = loans.filter((row) => row.ends_at < now).length;
  const query = (resource: number | undefined, day: Date) => `/?resource=${resource ?? ""}&week=${localDateTime(day).slice(0, 10)}`;
  const days = Array.from({ length: 7 }, (_, index) => new Date(week.getTime() + index * 86_400_000));
  const defaultStart = now >= week && now < weekEnd ? new Date(Math.floor(now.getTime() / 60_000) * 60_000) : new Date(week.getTime() + 9 * 3_600_000);

  return <>
    <a className="skip-link" href="#main">本文へ移動</a>
    <div className="container">
      <header className="page-header">
        <div><h1>予約・貸出</h1><p>会議室も、みんなの備品も。空きを見つけて、気持ちよく使う。</p></div>
        <a href="/export?type=reservations" className="button secondary">予約を CSV 書き出し</a>
      </header>
      <nav className="tabs" aria-label="画面を選ぶ">
        <Link href={query(selected?.id, week)} aria-current={view === "calendar" ? "page" : undefined}>週カレンダー</Link>
        <Link href="/?view=loans" aria-current={view === "loans" ? "page" : undefined}>貸出・返却 <span className="count">{loans.length}</span></Link>
        <Link href="/?view=resources" aria-current={view === "resources" ? "page" : undefined}>資源を管理</Link>
      </nav>
      <main id="main">
        {view === "calendar" && <>
          <section className="resource-picker" aria-label="予約する資源">
            {resources.map((resource) => <Link key={resource.id} href={query(resource.id, week)} className={`resource-tab ${selected?.id === resource.id ? "selected" : ""}`} aria-current={selected?.id === resource.id ? "true" : undefined}><span className="hint">{resource.kind === "room" ? "会議室" : "備品"}</span><strong>{resource.name}</strong><span className="hint">{resource.location || "場所の登録なし"}</span></Link>)}
            {resources.length === 0 && <p>資源がありません。<Link href="/?view=resources">会議室や備品を追加する</Link></p>}
          </section>
          {selected && <div className="calendar-layout">
            <section className="calendar-section" aria-label={`${selected.name}の週カレンダー`}>
              <div className="section-header"><div><h2>{selected.name}</h2><p className="hint">{selected.notes}</p></div><a href="#new-reservation" className="button primary mobile-book">予約を作成</a></div>
              <div className="week-toolbar"><h3>{dateLabel(week, false)} − {dateLabel(days[6], false)}</h3><div className="button-group"><Link className="button secondary small" href={query(selected.id, new Date(week.getTime() - 7 * 86_400_000))}>前の週</Link><Link className="button secondary small" href={query(selected.id, weekStart())}>今週</Link><Link className="button secondary small" href={query(selected.id, weekEnd)}>次の週</Link></div></div>
              <p className="hint calendar-note">日本時間・月曜始まり。備品は予約の開始後に「貸出を記録」を押してください。</p>
              <div className="week-grid">
                {days.map((day) => {
                  const date = localDateTime(day).slice(0, 10);
                  const next = new Date(day.getTime() + 86_400_000);
                  const rows = bookings.filter((row) => row.starts_at < next && row.ends_at > day);
                  return <section className={`day ${date === localDateTime(now).slice(0, 10) ? "today" : ""}`} key={date}>
                    <h3>{dateLabel(day, false)}{date === localDateTime(now).slice(0, 10) && <span>今日</span>}</h3>
                    {rows.length === 0 ? <p className="free">予約なし</p> : rows.map((row) => <article className="booking" key={row.id}>
                      <p className="booking-time">{row.starts_at < day ? "前日から" : localDateTime(row.starts_at).slice(11)} − {row.ends_at > next ? "翌日へ" : row.ends_at.getTime() === next.getTime() ? "24:00" : localDateTime(row.ends_at).slice(11)}</p>
                      <strong>{row.purpose}</strong><p>{row.user_name}</p>
                      <span className={`status ${reservationStatus(row, now) === "返却期限超過" ? "overdue" : ""}`}>{reservationStatus(row, now)}</span>
                      <div className="booking-actions">
                        {row.checked_out_at && !row.returned_at && <ReservationAction id={row.id} kind="return" />}
                        {row.kind === "equipment" && !row.checked_out_at && row.starts_at <= now && row.ends_at > now && <ReservationAction id={row.id} kind="out" />}
                        {!row.checked_out_at && <ReservationAction id={row.id} kind="cancel" />}
                      </div>
                    </article>)}
                  </section>;
                })}
              </div>
            </section>
            <aside className="panel booking-form" id="new-reservation"><h2>予約を作成</h2><ReservationForm key={`${selected.id}:${week.toISOString()}`} resource={selected} start={localDateTime(defaultStart)} end={localDateTime(new Date(defaultStart.getTime() + 3_600_000))} /></aside>
          </div>}
        </>}

        {view === "loans" && <section className="loans-section">
          <div className="section-header"><div><h2>貸出中の備品</h2><p className="hint">予約の終了日時が返却期限です。返ってきたらここで記録します。</p></div><a className="button secondary" href="/export?type=loans">貸出履歴を CSV 書き出し</a></div>
          {overdue > 0 && <p className="notice error">返却期限を過ぎた備品が {overdue} 件あります。利用者に返却を確認してください。</p>}
          {loans.length === 0 ? <div className="empty"><h3>貸出中の備品はありません</h3><p>備品を借りるときは週カレンダーで予約し、開始後に「貸出を記録」を押してください。</p><Link href={query(resources.find((row) => row.kind === "equipment")?.id, weekStart())} className="button primary">備品を予約する</Link></div> : <div className="loan-list">{loans.map((row) => <article className={`loan-row ${row.ends_at < now ? "late" : ""}`} key={row.id}>
            <div><span className={`status ${row.ends_at < now ? "overdue" : ""}`}>{reservationStatus(row, now)}</span><h3>{row.resource_name}</h3><p>{row.user_name} · {row.purpose}</p></div><div><p className="hint">返却期限</p><strong>{dateLabel(row.ends_at)}</strong><p className="hint">貸出 {dateLabel(row.checked_out_at!)}</p></div><ReservationAction id={row.id} kind="return" />
          </article>)}</div>}
          <h2 className="history-heading">最近の返却</h2><p className="hint">最新20件。すべての履歴は CSV に書き出せます。</p>
          {history.length === 0 ? <p className="empty compact">返却の記録はまだありません。</p> : <div className="loan-list">{history.map((row) => <article className="loan-row" key={row.id}><div><h3>{row.resource_name}</h3><p>{row.user_name} · {row.purpose}</p></div><p>返却 {dateLabel(row.returned_at!)}</p><span className="status">返却済み</span></article>)}</div>}
        </section>}

        {view === "resources" && <section>
          <div className="section-header"><div><h2>資源を管理</h2><p className="hint">会議室や備品を1つずつ登録します。同じ備品が複数あるときは名前で区別してください。</p></div><a href="/export?type=resources" className="button secondary">資源を CSV 書き出し</a></div>
          <div className="resource-layout"><div className="resource-list">{resources.map((row) => <article className="resource-row" key={row.id}><div><span className="status">{row.kind === "room" ? "会議室" : "備品"}</span><h3>{row.name}</h3><p>{row.location || "場所の登録なし"}</p><p className="hint">{row.notes}</p></div><details><summary>編集する</summary><ResourceForm resource={row} /></details></article>)}</div><aside className="panel"><h2>資源を追加</h2><ResourceForm /></aside></div>
        </section>}
      </main>
      <footer>予約・貸出 <span>すべての日時は日本時間</span></footer>
    </div>
  </>;
}
