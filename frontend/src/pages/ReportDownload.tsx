// Download the results of a week, a month or a year as a CSV for Excel or Google Sheets.
import { useState } from "react";
import { getLang, t } from "../i18n";
import { dayWithName, monthName } from "../format";
import { Icon, Segmented, useApi } from "../ui";

type Period = "week" | "month" | "year";

function monthsBetween(first: string, today: string): string[] {
  const out: string[] = [];
  let [y, m] = today.slice(0, 7).split("-").map(Number);
  const stop = first.slice(0, 7);
  for (let i = 0; i < 120; i++) {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    out.push(ym);
    if (ym <= stop) break;
    m -= 1; if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

export default function ReportDownload({ weekStart, weekEnd }: { weekStart?: string; weekEnd?: string }) {
  const opts = useApi<{ first: string | null; today: string }>("/export/options");
  const [period, setPeriod] = useState<Period>("week");
  const today = opts.data?.today;
  const months = today ? monthsBetween(opts.data?.first ?? today, today) : [];
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const pickedMonth = month || months[0] || "";
  const pickedYear = year || years[0] || "";

  const q = new URLSearchParams({ period, lang: getLang() });
  if (period === "month" && pickedMonth) q.set("month", pickedMonth);
  if (period === "year" && pickedYear) q.set("year", pickedYear);

  return (
    <section className="card" aria-labelledby="dl-h">
      <div className="card-head"><div>
        <h2 id="dl-h">{t("Unduh laporan")}</h2>
        <p className="small muted">{t("File CSV, bisa dibuka di Excel atau Google Sheets.")}</p>
      </div></div>
      <div className="card-body stack" style={{ gap: 12 }}>
        <Segmented label={t("Jangka waktu laporan")} value={period} onChange={setPeriod} options={[
          { value: "week", label: t("Seminggu") }, { value: "month", label: t("Sebulan") }, { value: "year", label: t("Setahun") }]} />
        {period === "month" && months.length > 0 && (
          <label className="field"><span className="label">{t("Bulan")}</span>
            <select className="input" value={pickedMonth} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
            </select></label>
        )}
        {period === "year" && years.length > 0 && (
          <label className="field"><span className="label">{t("Tahun")}</span>
            <select className="input" value={pickedYear} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select></label>
        )}
        <p className="small">{period === "week"
          ? (weekStart && weekEnd ? t("7 hari: {a} – {b}. Berisi ringkasan, keterangan minggu ini, hasil per hari, dan per menu.", { a: dayWithName(weekStart), b: dayWithName(weekEnd) })
                                   : t("7 hari terakhir. Berisi ringkasan, keterangan minggu ini, hasil per hari, dan per menu."))
          : period === "month" ? t("Berisi ringkasan, hasil dan keterangan per minggu, hasil per hari, dan per menu.")
          : t("Berisi ringkasan, hasil dan keterangan per bulan dan per minggu, dan per menu.")}</p>
        <a className="btn primary" style={{ alignSelf: "flex-start" }} href={`/api/export/report.csv?${q}`} download>
          <Icon.download size={18} />{t("Unduh CSV")}</a>
      </div>
    </section>
  );
}
