import { useMemo, useState } from "react";
import { api, type Ingredient, type Plan, type StockMove } from "../api";
import { amount, dayWithName, dec, rupiah, rupiahShort, unitLabel } from "../format";
import { t, useLang } from "../i18n";
import { Dialog, ErrorBox, Loading, PageHead, Segmented, toast, useApi } from "../ui";
import { IngredientDialog } from "./Menu";

type Kind = "beli" | "buang" | "opname";
const KIND_LABEL: Record<string, string> = { beli: "Beli", buang: "Buang", opname: "Hitung stok", pakai: "Pakai" };
const kindLabel = (k: string) => t(KIND_LABEL[k] ?? k);

function status(days: number | null | undefined, lead: number): { label: string; cls: string; fill: number } {
  if (days === null || days === undefined) return { label: t("Tidak dipakai"), cls: "", fill: 0 };
  if (days < lead + 1) return { label: days < 0.5 ? t("Habis") : t("± {n} hari", { n: dec(days) }), cls: "bad", fill: Math.min(1, days / 7) };
  if (days < lead + 3) return { label: t("± {n} hari", { n: Math.round(days) }), cls: "warn", fill: Math.min(1, days / 7) };
  return { label: t("± {n} hari", { n: Math.round(days) }), cls: "good", fill: Math.min(1, days / 7) };
}

export default function Stok({ today }: { today: string }) {
  useLang();
  const ings = useApi<Ingredient[]>("/ingredients?all=true");
  const plan = useApi<Plan>("/plan");
  const moves = useApi<StockMove[]>("/stock/moves?limit=30");
  const [active, setActive] = useState<{ ing: Ingredient; kind: Kind } | null>(null);
  const [filter, setFilter] = useState<"semua" | "menipis" | "lama">("semua");
  const [edit, setEdit] = useState<Ingredient | "new" | null>(null);

  const byId = useMemo(() => new Map((plan.data?.items ?? []).map((p) => [p.id, p])), [plan.data]);
  if (ings.error) return <ErrorBox message={ings.error} retry={ings.reload} />;
  if (!ings.data) return <Loading />;
  const rows = ings.data
    .map((g) => ({ g, p: byId.get(g.id), s: !g.active ? { label: t("Tidak dipakai"), cls: "", fill: 0 }
      : g.used_in.length === 0 ? { label: t("Belum ada di resep"), cls: "", fill: 0 }
      : status(byId.get(g.id)?.days_left, g.lead_time_days) }))
    .filter((r) => filter === "lama" ? !r.g.active
      : r.g.active && (filter === "semua" || r.s.cls === "bad" || r.s.cls === "warn"))
    .sort((a, b) => (a.p?.days_left ?? 1e9) - (b.p?.days_left ?? 1e9));

  const done = () => { ings.reload(); plan.reload(); moves.reload(); };
  const hidden = ings.data.filter((g) => !g.active).length;
  const reuse = async (g: Ingredient) => {
    const { on_hand: _o, used_in: _u, id: _i, ...body } = g;
    try { await api.put(`/ingredients/${g.id}`, { ...body, active: true }); toast(t("{name} dipakai lagi", { name: g.name })); done(); }
    catch (e) { toast((e as Error).message); }
  };

  return (
    <>
      <PageHead title={t("Stok bahan")} sub={t("Berkurang otomatis dari penjualan. Catat di sini saat beli, ada yang basi, atau setelah menghitung stok.")}>
        <Segmented label={t("Tampilkan")} value={filter} onChange={setFilter}
                   options={[{ value: "semua", label: t("Semua") }, { value: "menipis", label: t("Menipis") },
                             ...(hidden ? [{ value: "lama" as const, label: t("Tidak dipakai ({n})", { n: hidden }) }] : [])]} />
        <button className="btn primary" onClick={() => setEdit("new")}>{t("Bahan baru")}</button>
      </PageHead>

      <div className="card">
        <div className="list">
          {rows.length === 0 && <div className="empty">{filter === "menipis" ? t("Tidak ada bahan yang menipis.")
            : filter === "lama" ? t("Semua bahan masih dipakai.") : t("Belum ada bahan. Tekan Bahan baru untuk menambahkan.")}</div>}
          {rows.map(({ g, p, s }) => (
            <div key={g.id} className="list-item" style={{ flexWrap: "wrap" }}>
              <div className="grow" style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 600 }}>{g.name}</div>
                <div className="small muted num">
                  {t("Ada {a}", { a: amount(Math.max(0, g.on_hand), g.unit) })}{p && p.daily > 0 && ` · ${t("terpakai ± {a}/hari", { a: amount(p.daily, g.unit) })}`}
                </div>
                <div className={`track ${s.cls}`} style={{ marginTop: 6, maxWidth: 280, height: 8 }} aria-hidden="true"><i style={{ width: `${s.fill * 100}%` }} /></div>
              </div>
              <span className={`badge ${s.cls}`} title={t("Perkiraan stok cukup untuk berapa hari")}>{s.label}</span>
              {g.active ? <div className="row wrap">
                <button className="btn small primary" onClick={() => setActive({ ing: g, kind: "beli" })}>{t("Beli")}</button>
                <button className="btn small" onClick={() => setActive({ ing: g, kind: "opname" })}>{t("Hitung")}</button>
                <button className="btn small" onClick={() => setActive({ ing: g, kind: "buang" })}>{t("Buang")}</button>
                <button className="btn small ghost" onClick={() => setEdit(g)} aria-label={t("Ubah {name}", { name: g.name })}>{t("Ubah")}</button>
              </div> : <div className="row wrap">
                <button className="btn small" onClick={() => reuse(g)}>{t("Pakai lagi")}</button>
                <button className="btn small ghost" onClick={() => setEdit(g)} aria-label={t("Ubah {name}", { name: g.name })}>{t("Ubah")}</button>
              </div>}
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h2>{t("Catatan stok terakhir")}</h2></div>
        <div className="card-body table-wrap">
          {!moves.data ? <Loading /> : moves.data.length === 0 ? <div className="empty">{t("Belum ada catatan. Catatan muncul setelah kamu membeli, menghitung, atau membuang bahan.")}</div> : (
            <table>
              <thead><tr><th>{t("Tanggal")}</th><th>{t("Bahan")}</th><th>{t("Jenis")}</th><th className="num">{t("Jumlah")}</th><th className="num">{t("Biaya")}</th></tr></thead>
              <tbody>{moves.data.map((m) => (
                <tr key={m.id}><td>{dayWithName(m.day)}</td><td>{m.ingredient}{m.note && <div className="small muted">{m.note.startsWith("pesanan #") ? `${t("pesanan")} ${m.note.slice(8)}` : t(m.note)}</div>}</td>
                  <td><span className={`badge ${m.kind === "beli" ? "good" : m.kind === "buang" ? "bad" : ""}`}>{kindLabel(m.kind)}</span></td>
                  <td className="num">{m.qty > 0 ? "+" : ""}{amount(m.qty, m.unit)}</td><td className="num">{m.cost ? rupiahShort(m.cost) : "–"}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>

      {edit && <IngredientDialog ing={edit === "new" ? null : edit} onClose={() => setEdit(null)} onDone={done} />}
      {active && <StockDialog ing={active.ing} kind={active.kind} today={today} onClose={() => setActive(null)} onDone={done} />}
    </>
  );
}

export function StockDialog({ ing, kind: initial, today, onClose, onDone, suggest }: {
  ing: Ingredient; kind: Kind; today: string; onClose: () => void; onDone: () => void; suggest?: { qty: number; cost: number };
}) {
  const [kind, setKind] = useState<Kind>(initial);
  const big = ing.unit === "g" || ing.unit === "ml";
  const factor = big ? 1000 : 1;
  const bigUnit = ing.unit === "g" ? "kg" : ing.unit === "ml" ? t("liter") : t("buah");
  const [qty, setQty] = useState(suggest ? String(suggest.qty / factor).replace(".", ",") : "");
  const [cost, setCost] = useState(suggest ? String(Math.round(suggest.cost)) : "");
  const [day, setDay] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const value = parseFloat(qty.replace(",", ".")) * factor;
  const valid = Number.isFinite(value) && value >= 0 && (kind === "opname" || value > 0);

  const save = async () => {
    setBusy(true);
    try {
      await api.post("/stock", { ingredient_id: ing.id, kind, qty: value, cost: kind === "beli" ? Number(cost || 0) : 0, day, note });
      toast(t("{k} {name} dicatat", { k: kindLabel(kind), name: ing.name }));
      onDone();
      onClose();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={ing.name} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>{t("Batal")}</button>
      <button className="btn primary" onClick={save} disabled={!valid || busy}>{busy ? t("Menyimpan…") : t("Simpan")}</button>
    </>}>
      <Segmented label={t("Jenis catatan")} value={kind} onChange={setKind}
                 options={[{ value: "beli", label: t("Beli") }, { value: "opname", label: t("Hitung stok") }, { value: "buang", label: t("Buang") }]} />
      <div className="small muted">{t("Sekarang tercatat {a}.", { a: amount(Math.max(0, ing.on_hand), ing.unit) })}</div>
      <div className="field">
        <label htmlFor="qty">{kind === "opname" ? t("Jumlah yang ada sekarang ({u})", { u: bigUnit }) : t("Jumlah ({u})", { u: bigUnit })}</label>
        <input id="qty" className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
        {kind === "beli" && ing.pack_size > 0 && (
          <div className="chips">
            {[1, 2, 3, 5].map((n) => (
              <button key={n} type="button" className="chip" onClick={() => {
                setQty(String((n * ing.pack_size) / factor).replace(".", ","));
                setCost(String(Math.round(n * ing.pack_size * ing.cost_per_unit)));
              }}>{n} × {ing.pack_name || `${ing.pack_size} ${unitLabel(ing.unit)}`}</button>
            ))}
          </div>
        )}
      </div>
      {kind === "beli" && (
        <div className="field">
          <label htmlFor="cost">{t("Total harga (Rp)")}</label>
          <input id="cost" className="input" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value.replace(/\D/g, ""))} />
          {value > 0 && Number(cost) > 0 && <span className="hint">≈ {t("{rp} per {u}", { rp: rupiah((Number(cost) / value) * (big ? 1000 : 1)), u: bigUnit })}</span>}
        </div>
      )}
      <div className="halves grid" style={{ gap: 10 }}>
        <div className="field"><label htmlFor="d">{t("Tanggal")}</label>
          <input id="d" className="input" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} /></div>
        <div className="field"><label htmlFor="n">{t("Catatan")}</label>
          <input id="n" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "buang" ? t("basi, jatuh…") : ""} /></div>
      </div>
    </Dialog>
  );
}
