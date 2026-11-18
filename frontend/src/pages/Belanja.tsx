import { useState } from "react";
import { api, type Ingredient, type Plan, type PlanItem, type Settings } from "../api";
import { amount, dayWithName, pct, rupiah } from "../format";
import { t, useLang } from "../i18n";
import { ErrorBox, Loading, PageHead, Segmented, toast, useApi } from "../ui";
import { StockDialog } from "./Stok";

function reasonText(p: PlanItem, service: number): string {
  if (p.buy <= 0) return t("Stok cukup sampai belanja berikutnya.");
  if (p.capped) return t("Cepat basi: beli secukupnya untuk dipakai sebelum rusak.");
  if (p.risk >= 0.5) return t("Hampir pasti habis sebelum barang baru datang.");
  return t("Supaya cukup di {p} kemungkinan sampai belanja berikutnya.", { p: pct(service) });
}

function buyText(p: PlanItem): string {
  if (p.packs > 0) {
    if (/^(kg|liter|sisir)$/.test(p.pack_name)) return `${p.packs} ${p.pack_name}`;
    return `${p.packs} × ${p.pack_name || amount(p.buy / p.packs, p.unit)}`;
  }
  return amount(p.buy, p.unit);
}

export default function Belanja({ today }: { today: string }) {
  useLang();
  const plan = useApi<Plan>("/plan");
  const settings = useApi<Settings>("/settings");
  const ings = useApi<Ingredient[]>("/ingredients");
  const [buying, setBuying] = useState<PlanItem | null>(null);

  const update = async (patch: Partial<{ cycle_days: number; service_level: number }>) => {
    await api.put("/settings", patch);
    settings.reload();
    plan.reload();
  };

  if (plan.error) return <ErrorBox message={plan.error} retry={plan.reload} />;
  if (!plan.data || !settings.data) return <Loading label={t("Menghitung kebutuhan bahan…")} />;
  const p = plan.data;
  const toBuy = p.items.filter((x) => x.buy > 0);
  const ok = p.items.filter((x) => x.buy === 0);
  const cycle = Number(settings.data.cycle_days || 1);
  const service = Number(settings.data.service_level || 0.9);

  const copy = async () => {
    const lines = [t("Belanja {day}:", { day: dayWithName(today) }), ...toBuy.map((x) => `- ${x.name}: ${buyText(x)}`),
      t("Perkiraan total {rp}", { rp: rupiah(p.total_cost) })];
    try { await navigator.clipboard.writeText(lines.join("\n")); toast(t("Daftar disalin, tinggal tempel di WhatsApp")); }
    catch { toast(t("Tidak bisa menyalin di browser ini")); }
  };

  return (
    <>
      <PageHead title={t("Daftar belanja")} sub={t("Dihitung dari prediksi penjualan, resep, stok yang ada, lama bahan datang, dan berapa lama bahan tahan.")}>
        {toBuy.length > 0 && <button className="btn" onClick={copy}>{t("Salin untuk WhatsApp")}</button>}
      </PageHead>

      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="row wrap" style={{ gap: 18 }}>
          <div className="field">
            <span className="label">{t("Belanja setiap")}</span>
            <Segmented label={t("Belanja setiap")} value={cycle} onChange={(v) => update({ cycle_days: v })}
                       options={[{ value: 1, label: t("Hari") }, { value: 2, label: t("2 hari") }, { value: 3, label: t("3 hari") }, { value: 7, label: t("Seminggu") }]} />
          </div>
          <div className="field">
            <span className="label">{t("Seberapa aman")}</span>
            <Segmented label={t("Seberapa aman")} value={service} onChange={(v) => update({ service_level: v })}
                       options={[{ value: 0.8, label: t("Hemat") }, { value: 0.9, label: t("Biasa") }, { value: 0.95, label: t("Aman") }]} />
          </div>
          <div className="grow small muted" style={{ minWidth: 220 }}>
            {t("\"{level}\" berarti bahan cukup di sekitar {p} kemungkinan sampai belanja berikutnya. Lebih aman berarti modal tertahan lebih banyak.", {
              level: service >= 0.95 ? t("Aman") : service >= 0.9 ? t("Biasa") : t("Hemat"), p: pct(service) })}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div><h2>{t("Perlu dibeli")}</h2><p className="muted small">{t("{n} bahan · perkiraan {rp}", { n: toBuy.length, rp: rupiah(p.total_cost) })}</p></div>
        </div>
        <div className="list">
          {toBuy.length === 0 && <div className="empty">{t("Semua bahan cukup sampai belanja berikutnya.")}</div>}
          {toBuy.map((x) => (
            <div key={x.id} className="list-item" style={{ flexWrap: "wrap" }}>
              <div className="grow" style={{ minWidth: 200 }}>
                <div className="row wrap" style={{ gap: 6 }}>
                  <strong>{x.name}</strong>
                  {x.risk >= 0.5 && <span className="badge bad">{t("Segera")}</span>}
                  {x.capped && <span className="badge warn">{t("Cepat basi")}</span>}
                </div>
                <div className="small muted">
                  {t("Ada {a} · butuh ± {b} sampai barang berikutnya datang", { a: amount(x.on_hand, x.unit), b: amount(x.need, x.unit) })}
                </div>
                <div className="small">{reasonText(x, service)}</div>
              </div>
              <div className="right">
                <div style={{ fontWeight: 700 }} className="num">{buyText(x)}</div>
                <div className="small muted num">{rupiah(x.cost)}</div>
              </div>
              <button className="btn small primary" onClick={() => setBuying(x)}>{t("Sudah dibeli")}</button>
            </div>
          ))}
        </div>
      </div>

      {ok.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <div><h2>{t("Stok cukup ({n})", { n: ok.length })}</h2>
              <p className="small muted">{t("Belum perlu dibeli sampai belanja berikutnya.")}</p></div>
          </div>
          <div className="list" style={{ marginTop: 8 }}>{ok.map((x) => (
            <div key={x.id} className="list-item"><span className="grow">{x.name}</span>
              <span className="small muted num">{t("ada {a}", { a: amount(x.on_hand, x.unit) })}{x.days_left !== null && ` · ${t("± {n} hari", { n: Math.round(x.days_left) })}`}</span></div>
          ))}</div>
        </div>
      )}

      {buying && ings.data && (() => {
        const ing = ings.data.find((g) => g.id === buying.id);
        return ing ? <StockDialog ing={ing} kind="beli" today={today} suggest={{ qty: buying.buy, cost: buying.cost }}
                                  onClose={() => setBuying(null)} onDone={() => { plan.reload(); ings.reload(); }} /> : null;
      })()}
    </>
  );
}
