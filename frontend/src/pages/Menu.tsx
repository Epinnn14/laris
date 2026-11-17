import { useState } from "react";
import { api, type Business, type Category, type Ingredient, type MenuItem, type Settings } from "../api";
import { amount, catLabel, pct, rupiah, unitLabel } from "../format";
import { t, useLang } from "../i18n";

const CATS: Category[] = ["makanan", "camilan", "minuman_dingin", "minuman_panas"];
const suggest = (cost: number, margin: number) => (cost > 0 ? Math.ceil(cost / (1 - margin) / 500) * 500 : null);
import { Dialog, ErrorBox, Loading, PageHead, Segmented, toast, useApi } from "../ui";

export default function Menu({ business }: { business: Business }) {
  useLang();
  const settings = useApi<Settings>("/settings");
  const margin = settings.data?.target_margin ?? 0.6;
  const [tab, setTab] = useState<"menu" | "bahan">("menu");
  const menu = useApi<MenuItem[]>("/menu?all=true");
  const ings = useApi<Ingredient[]>("/ingredients?all=true");
  const [editItem, setEditItem] = useState<MenuItem | "new" | null>(null);
  const [editIng, setEditIng] = useState<Ingredient | "new" | null>(null);
  const [catalog, setCatalog] = useState(false);
  const reload = () => { menu.reload(); ings.reload(); };

  if (menu.error) return <ErrorBox message={menu.error} retry={menu.reload} />;
  if (!menu.data || !ings.data) return <Loading />;

  return (
    <>
      <PageHead title={t("Menu & resep")} sub={t("Resep dipakai untuk menghitung modal per porsi, mengurangi stok, dan menyusun daftar belanja.")}>
        <Segmented label={t("Bagian")} value={tab} onChange={setTab} options={[{ value: "menu", label: t("Menu") }, { value: "bahan", label: t("Bahan") }]} />
      </PageHead>

      {tab === "menu" ? (
        <div className="card">
          <div className="card-head">
            <div><h2>{t("{n} menu aktif", { n: menu.data.filter((m) => m.active).length })}</h2>
              <p className="small muted">{t("Saran harga memakai target untung {p} dari Pengaturan.", { p: pct(margin) })}</p></div>
            <div className="row">
              <button className="btn small" onClick={() => setCatalog(true)}>{t("Tambah dari contoh")}</button>
              <button className="btn small primary" onClick={() => setEditItem("new")}>{t("Menu baru")}</button>
            </div>
          </div>
          <div className="card-body table-wrap">
            {menu.data.length === 0 ? <div className="empty">{t("Belum ada menu. Mulai dari contoh menu warung atau kafe.")}</div> : (
              <table>
                <thead><tr><th>{t("Menu")}</th><th className="num">{t("Harga jual")}</th><th className="num">{t("Modal bahan")}</th><th className="num">{t("Untung per porsi")}</th><th className="num">{t("Saran harga")}</th><th /></tr></thead>
                <tbody>{menu.data.map((m) => (
                  <tr key={m.id} style={{ opacity: m.active ? 1 : 0.55 }}>
                    <td><strong>{m.name}</strong><div className="small muted">{catLabel(m.category)}{!m.active && ` · ${t("tidak dijual")}`}
                      {m.recipe.length === 0 && <span className="badge warn" style={{ marginLeft: 6 }}>{t("belum ada resep")}</span>}</div></td>
                    <td className="num">{rupiah(m.price)}</td>
                    <td className="num">{rupiah(m.unit_cost)}</td>
                    <td className="num"><span className={`badge ${m.margin !== null && m.margin < 0.4 ? "warn" : "good"}`}>{pct(m.margin)}</span></td>
                    <td className="num">{(() => { const sp = suggest(m.unit_cost, margin); return sp === null ? "–" : sp > m.price
                      ? <span title={t("Harga sekarang di bawah target untung")}><strong>{rupiah(sp)}</strong> <span className="badge warn">{t("naikkan")}</span></span>
                      : <span className="muted">{t("sudah pas")}</span>; })()}</td>
                    <td className="right"><button className="btn small" onClick={() => setEditItem(m)}>{t("Ubah")}</button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-head"><h2>{t("{n} bahan", { n: ings.data.length })}</h2>
            <button className="btn small primary" onClick={() => setEditIng("new")}>{t("Bahan baru")}</button></div>
          <div className="card-body table-wrap">
            <table>
              <thead><tr><th>{t("Bahan")}</th><th className="num">{t("Harga kemasan")}</th><th className="num">{t("Tahan")}</th><th className="num">{t("Datang")}</th><th className="num">{t("Stok")}</th><th /></tr></thead>
              <tbody>{ings.data.map((g) => (
                <tr key={g.id} style={{ opacity: g.active ? 1 : 0.55 }}>
                  <td><strong>{g.name}</strong><div className="small muted">{g.pack_name || amount(g.pack_size, g.unit)}</div></td>
                  <td className="num">{rupiah(g.cost_per_unit * g.pack_size)}</td>
                  <td className="num">{t("{n} hari", { n: g.shelf_life_days })}</td>
                  <td className="num">{g.lead_time_days === 0 ? t("langsung") : t("{n} hari", { n: g.lead_time_days })}</td>
                  <td className="num">{amount(Math.max(0, g.on_hand), g.unit)}</td>
                  <td className="right"><button className="btn small" onClick={() => setEditIng(g)}>{t("Ubah")}</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {editItem && <ItemDialog item={editItem === "new" ? null : editItem} ings={ings.data} margin={margin} onClose={() => setEditItem(null)} onDone={reload} />}
      {editIng && <IngredientDialog ing={editIng === "new" ? null : editIng} onClose={() => setEditIng(null)} onDone={reload} />}
      {catalog && <CatalogDialog business={business} onClose={() => setCatalog(false)} onDone={reload} />}
    </>
  );
}

function ItemDialog({ item, ings, margin, onClose, onDone }: { item: MenuItem | null; ings: Ingredient[]; margin: number; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<Category>(item?.category ?? "makanan");
  const [price, setPrice] = useState(String(item?.price ?? ""));
  const [active, setActive] = useState(item?.active ?? true);
  const [recipe, setRecipe] = useState(item?.recipe.map((r) => ({ ingredient_id: r.ingredient_id, amount: String(r.amount) })) ?? []);
  const [busy, setBusy] = useState(false);
  const byId = new Map(ings.map((g) => [g.id, g]));
  const cost = recipe.reduce((a, r) => a + (byId.get(r.ingredient_id)?.cost_per_unit ?? 0) * (parseFloat(r.amount.replace(",", ".")) || 0), 0);

  const save = async () => {
    setBusy(true);
    const body = { name, category, price: Number(price || 0), active,
      recipe: recipe.filter((r) => r.ingredient_id && parseFloat(r.amount.replace(",", ".")) > 0)
        .map((r) => ({ ingredient_id: r.ingredient_id, amount: parseFloat(r.amount.replace(",", ".")) })) };
    try {
      if (item) await api.put(`/menu/${item.id}`, body); else await api.post("/menu", body);
      toast(t("Menu disimpan"));
      onDone();
      onClose();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Dialog title={item ? t("Ubah {name}", { name: item.name }) : t("Menu baru")} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>{t("Batal")}</button>
      <button className="btn primary" onClick={save} disabled={busy || !name || !price}>{t("Simpan")}</button></>}>
      <div className="field"><label htmlFor="mn">{t("Nama menu")}</label><input id="mn" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="grid halves" style={{ gap: 10 }}>
        <div className="field"><label htmlFor="mc">{t("Kategori")}</label>
          <select id="mc" className="input" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATS.map((k) => <option key={k} value={k}>{catLabel(k)}</option>)}</select></div>
        <div className="field"><label htmlFor="mp">{t("Harga jual (Rp)")}</label>
          <input id="mp" className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} /></div>
      </div>
      <div className="field">
        <span className="label">{t("Resep per porsi")}</span>
        {recipe.map((r, i) => {
          const g = byId.get(r.ingredient_id);
          return (
            <div key={i} className="row">
              <select className="input grow" value={r.ingredient_id || ""} aria-label={t("Bahan")}
                      onChange={(e) => setRecipe(recipe.map((x, j) => (j === i ? { ...x, ingredient_id: Number(e.target.value) } : x)))}>
                <option value="">{t("Pilih bahan…")}</option>
                {ings.filter((g2) => g2.active).map((g2) => <option key={g2.id} value={g2.id}>{g2.name}</option>)}
              </select>
              <input className="input" style={{ width: 90 }} inputMode="decimal" value={r.amount} aria-label={t("Jumlah")}
                     onChange={(e) => setRecipe(recipe.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              <span className="small muted" style={{ width: 44 }}>{g ? unitLabel(g.unit) : ""}</span>
              <button className="btn small ghost" onClick={() => setRecipe(recipe.filter((_, j) => j !== i))} aria-label={t("Hapus bahan")}>✕</button>
            </div>
          );
        })}
        <button className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => setRecipe([...recipe, { ingredient_id: 0, amount: "" }])}>{t("+ Bahan")}</button>
        <span className="hint">{t("Modal bahan per porsi ≈ {rp}", { rp: rupiah(cost) })}{Number(price) > 0 && ` · ${t("untung {p} per porsi", { p: pct(1 - cost / Number(price)) })}`}</span>
        {suggest(cost, margin) !== null && (
          <div className="row wrap small">
            <span>{t("Saran harga untuk untung {p}: {rp}", { p: pct(margin), rp: rupiah(suggest(cost, margin)!) })}</span>
            {String(suggest(cost, margin)) !== price && <button type="button" className="btn small" onClick={() => setPrice(String(suggest(cost, margin)))}>{t("Pakai harga ini")}</button>}
          </div>
        )}
      </div>
      <label className="check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />{t("Masih dijual")}</label>
    </Dialog>
  );
}

function IngredientDialog({ ing, onClose, onDone }: { ing: Ingredient | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(ing?.name ?? "");
  const [unit, setUnit] = useState<Ingredient["unit"]>(ing?.unit ?? "g");
  const [packSize, setPackSize] = useState(String(ing?.pack_size ?? 1000));
  const [packName, setPackName] = useState(ing?.pack_name ?? "");
  const [packPrice, setPackPrice] = useState(String(ing ? Math.round(ing.cost_per_unit * ing.pack_size) : ""));
  const [shelf, setShelf] = useState(String(ing?.shelf_life_days ?? 7));
  const [lead, setLead] = useState(String(ing?.lead_time_days ?? 1));
  const [active, setActive] = useState(ing?.active ?? true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const size = parseFloat(packSize.replace(",", ".")) || 1;
    const body = { name, unit, pack_size: size, pack_name: packName, cost_per_unit: Number(packPrice || 0) / size,
      shelf_life_days: Number(shelf || 1), lead_time_days: Number(lead || 0), active };
    try {
      if (ing) await api.put(`/ingredients/${ing.id}`, body); else await api.post("/ingredients", body);
      toast(t("Bahan disimpan"));
      onDone();
      onClose();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Dialog title={ing ? t("Ubah {name}", { name: ing.name }) : t("Bahan baru")} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>{t("Batal")}</button>
      <button className="btn primary" onClick={save} disabled={busy || !name}>{t("Simpan")}</button></>}>
      <div className="field"><label htmlFor="gn">{t("Nama bahan")}</label><input id="gn" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><span className="label">{t("Satuan resep")}</span>
        <Segmented label={t("Satuan resep")} value={unit} onChange={setUnit} options={[{ value: "g", label: t("gram") }, { value: "ml", label: "ml" }, { value: "pcs", label: t("buah") }]} /></div>
      <div className="grid halves" style={{ gap: 10 }}>
        <div className="field"><label htmlFor="ps">{t("Isi satu kemasan ({u})", { u: unitLabel(unit) })}</label>
          <input id="ps" className="input" inputMode="decimal" value={packSize} onChange={(e) => setPackSize(e.target.value)} /></div>
        <div className="field"><label htmlFor="pn">{t("Nama kemasan")}</label>
          <input id="pn" className="input" value={packName} onChange={(e) => setPackName(e.target.value)} placeholder={t("karung 5 kg, kg, dus…")} /></div>
        <div className="field"><label htmlFor="pp">{t("Harga satu kemasan (Rp)")}</label>
          <input id="pp" className="input" inputMode="numeric" value={packPrice} onChange={(e) => setPackPrice(e.target.value.replace(/\D/g, ""))} /></div>
        <div className="field"><label htmlFor="sl">{t("Tahan berapa hari")}</label>
          <input id="sl" className="input" inputMode="numeric" value={shelf} onChange={(e) => setShelf(e.target.value.replace(/\D/g, ""))} /></div>
        <div className="field"><label htmlFor="lt">{t("Dipesan, datang setelah (hari)")}</label>
          <input id="lt" className="input" inputMode="numeric" value={lead} onChange={(e) => setLead(e.target.value.replace(/\D/g, ""))} />
          <span className="hint">{t("0 kalau bisa dibeli langsung di warung sebelah")}</span></div>
      </div>
      <label className="check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />{t("Masih dipakai")}</label>
    </Dialog>
  );
}

interface CatalogItem { key: string; name: string; category: Category; price: number; recipe: { ingredient: string; unit: string; amount: number }[] }

function CatalogDialog({ business, onClose, onDone }: { business: Business; onClose: () => void; onDone: () => void }) {
  const [biz, setBiz] = useState<Business>(business);
  const cat = useApi<{ items: CatalogItem[] }>(`/catalog?business=${biz}`, [biz]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const toggle = (k: string) => { const s = new Set(picked); if (s.has(k)) s.delete(k); else s.add(k); setPicked(s); };
  const save = async () => {
    setBusy(true);
    try { const r = await api.post<{ added: number }>("/catalog/apply", { items: [...picked] }); toast(t("{n} menu ditambahkan", { n: r.added })); onDone(); onClose(); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Dialog title={t("Tambah dari contoh menu")} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>{t("Batal")}</button>
      <button className="btn primary" onClick={save} disabled={busy || picked.size === 0}>{t("Tambah {n} menu", { n: picked.size || "" })}</button></>}>
      <Segmented label={t("Jenis usaha")} value={biz} onChange={setBiz} options={[{ value: "warung_makan", label: t("Warung makan") }, { value: "kafe", label: t("Kafe") }]} />
      <span className="small muted">{t("Harga dan resep bisa diubah setelah ditambahkan. Bahan yang dibutuhkan ikut dibuat.")}</span>
      {!cat.data ? <Loading /> : cat.data.items.map((it) => (
        <label key={it.key} className="check" style={{ alignItems: "flex-start" }}>
          <input type="checkbox" checked={picked.has(it.key)} onChange={() => toggle(it.key)} style={{ marginTop: 3 }} />
          <span><strong>{it.name}</strong> <span className="muted small">{rupiah(it.price)}</span><br />
            <span className="small muted">{it.recipe.map((r) => r.ingredient).join(", ")}</span></span>
        </label>
      ))}
    </Dialog>
  );
}
