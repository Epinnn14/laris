// The week in plain sentences, ready to send to a partner or family on WhatsApp.
import type { AppState, Summary } from "../api";
import { t, useLang } from "../i18n";
import { dayShort, dayWithName, monthName, pct, rupiah, rupiahShort, weekdayShort } from "../format";
import { ErrorBox, Icon, Loading, PageHead, toast, useApi } from "../ui";

function changeWords(x: number | null): string {
  if (x === null) return "";
  if (Math.abs(x) < 0.02) return t("hampir sama dengan minggu sebelumnya");
  return x > 0 ? t("naik {p} dari minggu sebelumnya", { p: pct(x) }) : t("turun {p} dari minggu sebelumnya", { p: pct(-x) });
}

/** Sentences shared by the page and the WhatsApp text. */
function sentences(w: Summary) {
  const headline = t("Omzet {rp}", { rp: rupiah(w.revenue) }) + (w.revenue_change !== null ? `, ${changeWords(w.revenue_change)}` : "") + ". "
    + (w.net >= 0 ? t("Untung bersih {rp}.", { rp: rupiah(w.net) }) : t("Rugi bersih {rp}.", { rp: rupiah(-w.net) }));
  const attention: string[] = [];
  if (w.missing.length) attention.push(t("{n} hari belum dicatat: {days}.", { n: w.missing.length, days: w.missing.map(dayWithName).join(", ") }));
  for (const s of w.stockouts.slice(0, 3)) attention.push(t("{name} habis duluan {n} hari. Siapkan lebih banyak.", { name: s.name, n: s.days }));
  if (w.waste > 0) attention.push(t("Bahan terbuang senilai {rp}.", { rp: rupiah(w.waste) }));
  for (const m of w.low_margin.slice(0, 2)) attention.push(t("{name} untungnya tipis ({p} dari harga). Pertimbangkan naik harga.", { name: m.name, p: pct(m.margin) }));
  if (w.expenses === 0) attention.push(t("Belum ada pengeluaran tercatat minggu ini."));
  return { headline, attention };
}

export default function Ringkasan({ state }: { state: AppState }) {
  useLang();
  const s = useApi<Summary>("/summary");
  if (s.error) return <ErrorBox message={s.error} retry={s.reload} />;
  if (!s.data) return <Loading label={t("Menyusun ringkasan…")} />;
  const w = s.data;
  const { headline, attention } = sentences(w);
  const max = Math.max(1, ...w.days.map((d) => d.revenue));

  const copy = async () => {
    const lines = [
      t("Ringkasan {shop}, {a} – {b}", { shop: state.shop_name, a: dayShort(w.start), b: dayShort(w.end) }),
      headline,
      ...(w.best_day ? [t("Paling ramai {d} ({rp}).", { d: dayWithName(w.best_day.date), rp: rupiahShort(w.best_day.revenue) })] : []),
      ...(w.risers.length ? [t("Naik: {list}.", { list: w.risers.map((r) => `${r.name} +${pct(r.change)}`).join(", ") })] : []),
      ...(w.fallers.length ? [t("Turun: {list}.", { list: w.fallers.map((r) => `${r.name} −${pct(-r.change)}`).join(", ") })] : []),
      ...attention,
      ...(w.next_week ? [t("Minggu depan diperkirakan {lo} – {hi}.", { lo: rupiahShort(w.next_week.revenue[0]), hi: rupiahShort(w.next_week.revenue[2]) })] : []),
    ];
    try { await navigator.clipboard.writeText(lines.join("\n")); toast(t("Ringkasan disalin, tinggal tempel di WhatsApp")); }
    catch { toast(t("Tidak bisa menyalin di browser ini")); }
  };

  return (
    <>
      <PageHead title={t("Ringkasan minggu")} sub={t("{a} – {b}, dibanding 7 hari sebelumnya.", { a: dayWithName(w.start), b: dayWithName(w.end) })}>
        <button className="btn" onClick={copy}><Icon.copy size={18} />{t("Salin untuk WhatsApp")}</button>
      </PageHead>

      <div className="grid two">
        <section className="card" aria-labelledby="w-h">
          <div className="card-head"><h2 id="w-h">{t("Minggu ini")}</h2></div>
          <div className="card-body stack" style={{ gap: 16 }}>
            <p style={{ fontSize: 18, lineHeight: 1.45 }}>{headline}</p>
            <div className="row top" style={{ gap: 6, height: 120 }} role="img"
                 aria-label={w.days.map((d) => `${dayWithName(d.date)} ${d.closed ? t("tutup") : rupiahShort(d.revenue)}`).join(", ")}>
              {w.days.map((d) => (
                <div key={d.date} className="grow" style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", gap: 4 }}>
                  <span className="tiny muted num" style={{ textAlign: "center" }}>{d.closed ? "" : rupiahShort(d.revenue).replace("Rp", "")}</span>
                  <div style={{ height: `${d.closed ? 2 : Math.max(2, (d.revenue / max) * 80)}px`, borderRadius: 3,
                                background: w.best_day?.date === d.date ? "var(--accent)" : d.closed ? "var(--rule)" : "var(--chart-ink)" }} />
                  <span className="tiny" style={{ textAlign: "center" }}>{weekdayShort(d.date)}</span>
                </div>
              ))}
            </div>
            <div className="grid halves" style={{ gap: 12 }}>
              <Moves title={t("Yang naik")} items={w.risers} up />
              <Moves title={t("Yang turun")} items={w.fallers} />
            </div>
          </div>
        </section>

        <div className="stack" style={{ gap: 16 }}>
          <section className="card" aria-labelledby="a-h">
            <div className="card-head"><h2 id="a-h">{t("Perlu diperhatikan")}</h2></div>
            <div className="card-body">
              {attention.length === 0 ? <p className="muted">{t("Tidak ada masalah minggu ini.")}</p> : (
                <ul className="todo">{attention.map((a, i) => <li key={a}><span className="n">{i + 1}</span><span className="grow">{a}</span></li>)}</ul>
              )}
            </div>
          </section>
          <section className="card" aria-labelledby="n-h">
            <div className="card-head"><h2 id="n-h">{t("Minggu depan")}</h2></div>
            <div className="card-body stack">
              {w.next_week ? (
                <p>{t("Omzet diperkirakan")} <span className="fig" style={{ fontSize: 20 }}>{rupiahShort(w.next_week.revenue[1])}</span>{" "}
                  <span className="muted">({t("kemungkinan {lo} – {hi}", { lo: rupiahShort(w.next_week.revenue[0]), hi: rupiahShort(w.next_week.revenue[2]) })})</span>
                  {w.next_week.closed_days > 0 && <span className="muted"> · {t("{n} hari tutup", { n: w.next_week.closed_days })}</span>}</p>
              ) : <p className="muted">{t("Prediksi muncul setelah sekitar 7 hari tercatat.")}</p>}
              {w.buy.length > 0 && (
                <div>
                  <div className="small" style={{ fontWeight: 650, marginBottom: 4 }}>{t("Belanja paling mendesak")}</div>
                  <table className="ledger" style={{ fontSize: 15 }}><tbody>
                    {w.buy.map((b) => <tr key={b.name}><td>{b.name}<span className="note">{b.days_left !== null && b.days_left < 1 ? t("habis sebelum besok") : t("cukup ± {n} hari", { n: Math.round(b.days_left ?? 0) })}</span></td><td>{rupiah(b.cost)}</td></tr>)}
                  </tbody></table>
                  <a className="btn small" style={{ marginTop: 10 }} href="#/belanja">{t("Buka daftar belanja")}</a>
                </div>
              )}
              {w.target && (
                <p className="small">{t("Target {month}: sudah {done} dari {goal}.", { month: monthName(w.target.month), done: rupiahShort(w.target.done), goal: rupiahShort(w.target.goal) })}
                  {w.target.done < w.target.goal && ` ${t("Perlu rata-rata {rp} per hari buka.", { rp: rupiahShort(w.target.per_day_needed) })}`}</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function Moves({ title, items, up }: { title: string; items: Summary["risers"]; up?: boolean }) {
  return (
    <div>
      <h3 style={{ marginBottom: 6 }}>{title}</h3>
      {items.length === 0 ? <p className="small muted">{t("Tidak ada perubahan besar.")}</p> : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((m) => (
            <li key={m.id} className="row" style={{ padding: "4px 0" }}>
              <span className="grow">{m.name}</span>
              <span className={`num small ${up ? "up" : "down"}`}>{up ? "▲" : "▼"} {pct(Math.abs(m.change))}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="tiny muted" style={{ marginTop: 4 }}>{t("Porsi dibanding minggu sebelumnya")}</p>
    </div>
  );
}
