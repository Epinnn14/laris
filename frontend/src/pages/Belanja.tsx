import { useState } from "react";
import { api, type Ingredient, type Plan, type PlanItem, type Settings } from "../api";
import { amount, dayWithName, pct, rupiah } from "../format";
import { ErrorBox, Loading, PageHead, Segmented, toast, useApi } from "../ui";
import { StockDialog } from "./Stok";

function buyText(p: PlanItem): string {
  if (p.packs > 0) {
    if (/^(kg|liter|sisir)$/.test(p.pack_name)) return `${p.packs} ${p.pack_name}`;
    return `${p.packs} × ${p.pack_name || amount(p.buy / p.packs, p.unit)}`;
  }
  return amount(p.buy, p.unit);
}

export default function Belanja({ today }: { today: string }) {
  const plan = useApi<Plan>("/plan");
  const settings = useApi<Settings>("/settings");
  const ings = useApi<Ingredient[]>("/ingredients");
  const [buying, setBuying] = useState<PlanItem | null>(null);
  const [showOk, setShowOk] = useState(false);

  const update = async (patch: Partial<{ cycle_days: number; service_level: number }>) => {
    await api.put("/settings", patch);
    settings.reload();
    plan.reload();
  };

  if (plan.error) return <ErrorBox message={plan.error} retry={plan.reload} />;
  if (!plan.data || !settings.data) return <Loading label="Menghitung kebutuhan bahan…" />;
  const p = plan.data;
  const toBuy = p.items.filter((x) => x.buy > 0);
  const ok = p.items.filter((x) => x.buy === 0);
  const cycle = Number(settings.data.cycle_days || 1);
  const service = Number(settings.data.service_level || 0.9);

  const copy = async () => {
    const lines = [`Belanja ${dayWithName(today)}:`, ...toBuy.map((x) => `- ${x.name}: ${buyText(x)}`),
      `Perkiraan total ${rupiah(p.total_cost)}`];
    try { await navigator.clipboard.writeText(lines.join("\n")); toast("Daftar disalin, tinggal tempel di WhatsApp"); }
    catch { toast("Tidak bisa menyalin di browser ini"); }
  };

  return (
    <>
      <PageHead title="Daftar belanja" sub="Dihitung dari prediksi penjualan, resep, stok yang ada, lama bahan datang, dan berapa lama bahan tahan.">
        {toBuy.length > 0 && <button className="btn" onClick={copy}>Salin untuk WhatsApp</button>}
      </PageHead>

      <div className="card pad" style={{ marginBottom: 14 }}>
        <div className="row wrap" style={{ gap: 18 }}>
          <div className="field">
            <label>Belanja setiap</label>
            <Segmented label="Belanja setiap" value={cycle} onChange={(v) => update({ cycle_days: v })}
                       options={[{ value: 1, label: "Hari" }, { value: 2, label: "2 hari" }, { value: 3, label: "3 hari" }, { value: 7, label: "Minggu" }]} />
          </div>
          <div className="field">
            <label>Seberapa aman</label>
            <Segmented label="Tingkat aman" value={service} onChange={(v) => update({ service_level: v })}
                       options={[{ value: 0.8, label: "Hemat" }, { value: 0.9, label: "Biasa" }, { value: 0.95, label: "Aman" }]} />
          </div>
          <div className="grow small muted" style={{ minWidth: 220 }}>
            "{service >= 0.95 ? "Aman" : service >= 0.9 ? "Biasa" : "Hemat"}" berarti bahan cukup di sekitar {pct(service)} kemungkinan sampai belanja berikutnya.
            Lebih aman berarti modal tertahan lebih banyak.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div><h2>Perlu dibeli</h2><p className="muted small">{toBuy.length} bahan · perkiraan {rupiah(p.total_cost)}</p></div>
        </div>
        <div className="list">
          {toBuy.length === 0 && <div className="empty">Semua bahan cukup sampai belanja berikutnya.</div>}
          {toBuy.map((x) => (
            <div key={x.id} className="list-item" style={{ flexWrap: "wrap" }}>
              <div className="grow" style={{ minWidth: 200 }}>
                <div className="row wrap" style={{ gap: 6 }}>
                  <strong>{x.name}</strong>
                  {x.risk >= 0.5 && <span className="badge bad">Segera</span>}
                  {x.capped && <span className="badge warn">Cepat basi</span>}
                </div>
                <div className="small muted">
                  Ada {amount(x.on_hand, x.unit)} · butuh ± {amount(x.need, x.unit)} sampai barang berikutnya datang
                </div>
                <div className="small">{x.reason}</div>
              </div>
              <div className="right">
                <div style={{ fontWeight: 700 }} className="num">{buyText(x)}</div>
                <div className="small muted num">{rupiah(x.cost)}</div>
              </div>
              <button className="btn small primary" onClick={() => setBuying(x)}>Sudah dibeli</button>
            </div>
          ))}
        </div>
      </div>

      {ok.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-head">
            <h2>Stok cukup ({ok.length})</h2>
            <button className="btn small ghost" onClick={() => setShowOk(!showOk)} aria-expanded={showOk}>{showOk ? "Sembunyikan" : "Lihat"}</button>
          </div>
          {showOk && <div className="list">{ok.map((x) => (
            <div key={x.id} className="list-item"><span className="grow">{x.name}</span>
              <span className="small muted num">ada {amount(x.on_hand, x.unit)}{x.days_left !== null && ` · ± ${Math.round(x.days_left)} hari`}</span></div>
          ))}</div>}
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
