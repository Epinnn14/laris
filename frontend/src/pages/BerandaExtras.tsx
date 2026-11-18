// Dashboard pieces for the till, special orders and the notes board.
import { useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type Note, type PreOrder, type TodayTill } from "../api";
import { t } from "../i18n";
import { dec, num, rupiah, rupiahShort } from "../format";
import { ErrorBox, Loading, toast, useApi } from "../ui";
import { whenLabel } from "./Pesanan";

/** One line of live numbers from the till today; hidden for shops that do not use the till. */
export function TodayLine({ till }: { till: TodayTill | null }) {
  if (!till || (till.orders === 0 && till.history_days === 0)) return null;
  return (
    <div className="alert info" style={{ marginBottom: 16 }}>
      <div className="grow">
        <strong>{t("Hari ini dari kasir:")}</strong>{" "}
        {till.orders === 0 ? t("belum ada orderan.") : <>
          <span className="fig" style={{ fontSize: 18 }}>{rupiah(till.revenue)}</span>{" "}
          {t("dari {n} orderan · rata-rata {avg} · terakhir {time}", { n: num(till.orders), avg: rupiah(till.avg), time: till.last ?? "–" })}
          {till.top.length > 0 && <span className="small muted" style={{ display: "block" }}>
            {t("Paling banyak: {list}", { list: till.top.slice(0, 3).map((x) => `${x.name} (${num(x.qty)})`).join(", ") })}</span>}
        </>}
      </div>
      <a className="btn small primary" href="#/kasir">{t("Buka kasir")}</a>
    </div>
  );
}

/** Which hours bring the most orders: tells the owner when to have food ready and staff in. */
export function HoursCard({ till }: { till: TodayTill | null }) {
  if (!till || till.history_days < 3) return null;
  const data = till.hours.filter((h) => h.orders > 0);
  if (!data.length) return null;
  const peak = Math.max(...data.map((h) => h.orders));
  const top = data.find((h) => h.orders === peak)!;
  return (
    <section className="card" aria-labelledby="hours-h">
      <div className="card-head">
        <div>
          <h2 id="hours-h">{t("Jam berapa paling ramai?")}</h2>
          <p className="small muted">{t("Rata-rata orderan per jam, {n} hari terakhir. Paling ramai jam {h}.00 (± {o} orderan).", {
            n: till.history_days, h: String(top.hour).padStart(2, "0"), o: dec(top.orders) })}</p>
        </div>
      </div>
      <div className="card-body" style={{ height: 190 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <XAxis dataKey="hour" tickFormatter={(h: number) => String(h).padStart(2, "0")} tickLine={false} axisLine={false} interval={0} />
            <YAxis hide />
            <Tooltip cursor={{ fill: "var(--hover)" }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { hour: number; orders: number };
              return <div className="tip">{t("Jam {h}.00: ± {o} orderan", { h: String(p.hour).padStart(2, "0"), o: dec(p.orders) })}</div>;
            }} />
            <Bar dataKey="orders" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {data.map((h) => <Cell key={h.hour} fill={h.orders === peak ? "var(--accent)" : "var(--chart-ink)"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function UpcomingOrders({ today }: { today: string }) {
  const list = useApi<PreOrder[]>("/preorders?when=open");
  const rows = (list.data ?? []).slice(0, 4);
  return (
    <section className="card" aria-labelledby="po-h">
      <div className="card-head">
        <div><h2 id="po-h">{t("Pesanan")}</h2>
          <p className="small muted">{t("Di luar jualan harian, bahannya ikut masuk daftar belanja.")}</p></div>
        <a className="small" href="#/pesanan">{t("Semua")}</a>
      </div>
      <div className="card-body">
        {list.error ? <ErrorBox message={list.error} retry={list.reload} /> : !list.data ? <Loading /> : rows.length === 0 ? (
          <div className="row between wrap"><span className="muted">{t("Tidak ada pesanan yang menunggu.")}</span>
            <a className="btn small" href="#/pesanan">{t("Catat pesanan")}</a></div>
        ) : (
          <table className="ledger" style={{ fontSize: 15 }}><tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.customer}</strong>
                  <span className="note"><span className={p.due < today ? "down" : ""}>{whenLabel(p.due, today)}</span>{p.due_time && ` ${p.due_time}`} · {p.lines.map((l) => `${num(l.qty)}× ${l.name}`).join(", ")}</span></td>
                <td>{rupiahShort(p.total)}{p.rest > 0 && <span className="note">{t("sisa {rp}", { rp: rupiahShort(p.rest) })}</span>}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>
    </section>
  );
}

/** An empty board for anything: a supplier's number, an idea for a new dish, who still owes money. */
export function NotesBoard({ bare }: { bare?: boolean } = {}) {
  const notes = useApi<Note[]>("/notes");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try { await api.post("/notes", { text: draft.trim() }); setDraft(""); notes.reload(); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const save = async (n: Note, patch: Partial<Note>) => {
    try { await api.put(`/notes/${n.id}`, { text: patch.text ?? n.text, pinned: patch.pinned ?? n.pinned }); setEditing(null); notes.reload(); }
    catch (e) { toast((e as Error).message); }
  };
  const remove = async (n: Note) => {
    if (!confirm(t("Hapus catatan ini?"))) return;
    await api.del(`/notes/${n.id}`);
    notes.reload();
  };

  return (
    <section className="card" aria-labelledby="board-h">
      {bare ? <h2 id="board-h" className="sr">{t("Papan catatan")}</h2> : (
        <div className="card-head">
          <div><h2 id="board-h">{t("Papan catatan")}</h2>
            <p className="small muted">{t("Tulis apa saja: nomor pemasok, rencana menu baru, siapa yang masih utang.")}</p></div>
          <a className="small" href="#/catatan">{t("Buka")}</a>
        </div>
      )}
      <div className="card-body stack" style={{ gap: 12 }}>
        <div className="row top" style={{ gap: 8 }}>
          <textarea className="input grow" rows={2} maxLength={2000} value={draft} aria-label={t("Catatan baru")}
                    placeholder={t("Tulis catatan…")} onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) add(); }} />
          <button className="btn" onClick={add} disabled={busy || !draft.trim()}>{t("Tempel")}</button>
        </div>
        {notes.error ? <ErrorBox message={notes.error} retry={notes.reload} /> : !notes.data ? <Loading /> :
          notes.data.length === 0 ? <p className="muted">{t("Papan masih kosong.")}</p> : (
          <div className="board">
            {notes.data.map((n) => (
              <div key={n.id} className={`board-note ${n.pinned ? "pinned" : ""}`}>
                {editing === n.id ? (
                  <textarea autoFocus value={text} maxLength={2000} aria-label={t("Ubah catatan")} onChange={(e) => setText(e.target.value)} />
                ) : <div className="text">{n.text}</div>}
                <div className="tools">
                  {editing === n.id ? <>
                    <button className="btn small ghost" onClick={() => setEditing(null)}>{t("Batal")}</button>
                    <button className="btn small" onClick={() => text.trim() && save(n, { text: text.trim() })}>{t("Simpan")}</button>
                  </> : <>
                    <button className="btn small ghost" onClick={() => save(n, { pinned: !n.pinned })} aria-pressed={n.pinned}>{n.pinned ? t("Lepas") : t("Sematkan")}</button>
                    <button className="btn small ghost" onClick={() => { setEditing(n.id); setText(n.text); }}>{t("Ubah")}</button>
                    <button className="btn small ghost" onClick={() => remove(n)}>{t("Hapus")}</button>
                  </>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
