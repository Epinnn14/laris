import { useState } from "react";
import { api, type Business, type Category, type Ingredient, type MenuItem } from "../api";
import { CATEGORY_LABEL, amount, pct, rupiah, unitLabel } from "../format";
import { Dialog, ErrorBox, Loading, PageHead, Segmented, toast, useApi } from "../ui";

export default function Menu({ business }: { business: Business }) {
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
      <PageHead title="Menu & resep" sub="Resep dipakai untuk menghitung modal per porsi, mengurangi stok, dan menyusun daftar belanja.">
        <Segmented label="Bagian" value={tab} onChange={setTab} options={[{ value: "menu", label: "Menu" }, { value: "bahan", label: "Bahan" }]} />
      </PageHead>

      {tab === "menu" ? (
        <div className="card">
          <div className="card-head">
            <h2>{menu.data.filter((m) => m.active).length} menu aktif</h2>
            <div className="row">
              <button className="btn small" onClick={() => setCatalog(true)}>Tambah dari contoh</button>
              <button className="btn small primary" onClick={() => setEditItem("new")}>Menu baru</button>
            </div>
          </div>
          <div className="card-body table-wrap">
            {menu.data.length === 0 ? <div className="empty">Belum ada menu. Mulai dari contoh menu warung atau kafe.</div> : (
              <table>
                <thead><tr><th>Menu</th><th className="num">Harga</th><th className="num">Modal bahan</th><th className="num">Margin</th><th /></tr></thead>
                <tbody>{menu.data.map((m) => (
                  <tr key={m.id} style={{ opacity: m.active ? 1 : 0.55 }}>
                    <td><strong>{m.name}</strong><div className="small muted">{CATEGORY_LABEL[m.category]}{!m.active && " · tidak dijual"}
                      {m.recipe.length === 0 && <span className="badge warn" style={{ marginLeft: 6 }}>belum ada resep</span>}</div></td>
                    <td className="num">{rupiah(m.price)}</td>
                    <td className="num">{rupiah(m.unit_cost)}</td>
                    <td className="num"><span className={`badge ${m.margin !== null && m.margin < 0.4 ? "warn" : "good"}`}>{pct(m.margin)}</span></td>
                    <td className="right"><button className="btn small" onClick={() => setEditItem(m)}>Ubah</button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-head"><h2>{ings.data.length} bahan</h2>
            <button className="btn small primary" onClick={() => setEditIng("new")}>Bahan baru</button></div>
          <div className="card-body table-wrap">
            <table>
              <thead><tr><th>Bahan</th><th className="num">Harga kemasan</th><th className="num">Tahan</th><th className="num">Datang</th><th className="num">Stok</th><th /></tr></thead>
              <tbody>{ings.data.map((g) => (
                <tr key={g.id} style={{ opacity: g.active ? 1 : 0.55 }}>
                  <td><strong>{g.name}</strong><div className="small muted">{g.pack_name || amount(g.pack_size, g.unit)}</div></td>
                  <td className="num">{rupiah(g.cost_per_unit * g.pack_size)}</td>
                  <td className="num">{g.shelf_life_days} hari</td>
                  <td className="num">{g.lead_time_days === 0 ? "langsung" : `${g.lead_time_days} hari`}</td>
                  <td className="num">{amount(Math.max(0, g.on_hand), g.unit)}</td>
                  <td className="right"><button className="btn small" onClick={() => setEditIng(g)}>Ubah</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {editItem && <ItemDialog item={editItem === "new" ? null : editItem} ings={ings.data} onClose={() => setEditItem(null)} onDone={reload} />}
      {editIng && <IngredientDialog ing={editIng === "new" ? null : editIng} onClose={() => setEditIng(null)} onDone={reload} />}
      {catalog && <CatalogDialog business={business} onClose={() => setCatalog(false)} onDone={reload} />}
    </>
  );
}

function ItemDialog({ item, ings, onClose, onDone }: { item: MenuItem | null; ings: Ingredient[]; onClose: () => void; onDone: () => void }) {
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
      toast("Menu disimpan");
      onDone();
      onClose();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Dialog title={item ? `Ubah ${item.name}` : "Menu baru"} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Batal</button>
      <button className="btn primary" onClick={save} disabled={busy || !name || !price}>Simpan</button></>}>
      <div className="field"><label htmlFor="mn">Nama menu</label><input id="mn" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="grid halves" style={{ gap: 10 }}>
        <div className="field"><label htmlFor="mc">Kategori</label>
          <select id="mc" className="input" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="mp">Harga jual (Rp)</label>
          <input id="mp" className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} /></div>
      </div>
      <div className="field">
        <label>Resep per porsi</label>
        {recipe.map((r, i) => {
          const g = byId.get(r.ingredient_id);
          return (
            <div key={i} className="row">
              <select className="input grow" value={r.ingredient_id || ""} aria-label="Bahan"
                      onChange={(e) => setRecipe(recipe.map((x, j) => (j === i ? { ...x, ingredient_id: Number(e.target.value) } : x)))}>
                <option value="">Pilih bahan…</option>
                {ings.filter((g2) => g2.active).map((g2) => <option key={g2.id} value={g2.id}>{g2.name}</option>)}
              </select>
              <input className="input" style={{ width: 90 }} inputMode="decimal" value={r.amount} aria-label="Jumlah"
                     onChange={(e) => setRecipe(recipe.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              <span className="small muted" style={{ width: 44 }}>{g ? unitLabel(g.unit) : ""}</span>
              <button className="btn small ghost" onClick={() => setRecipe(recipe.filter((_, j) => j !== i))} aria-label="Hapus bahan">✕</button>
            </div>
          );
        })}
        <button className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => setRecipe([...recipe, { ingredient_id: 0, amount: "" }])}>+ Bahan</button>
        <span className="hint">Modal bahan per porsi ≈ {rupiah(cost)}{Number(price) > 0 && ` · margin ${pct(1 - cost / Number(price))}`}</span>
      </div>
      <label className="check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Masih dijual</label>
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
      toast("Bahan disimpan");
      onDone();
      onClose();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Dialog title={ing ? `Ubah ${ing.name}` : "Bahan baru"} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Batal</button>
      <button className="btn primary" onClick={save} disabled={busy || !name}>Simpan</button></>}>
      <div className="field"><label htmlFor="gn">Nama bahan</label><input id="gn" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label>Satuan resep</label>
        <Segmented label="Satuan" value={unit} onChange={setUnit} options={[{ value: "g", label: "gram" }, { value: "ml", label: "ml" }, { value: "pcs", label: "buah" }]} /></div>
      <div className="grid halves" style={{ gap: 10 }}>
        <div className="field"><label htmlFor="ps">Isi satu kemasan ({unitLabel(unit)})</label>
          <input id="ps" className="input" inputMode="decimal" value={packSize} onChange={(e) => setPackSize(e.target.value)} /></div>
        <div className="field"><label htmlFor="pn">Nama kemasan</label>
          <input id="pn" className="input" value={packName} onChange={(e) => setPackName(e.target.value)} placeholder="karung 5 kg, kg, dus…" /></div>
        <div className="field"><label htmlFor="pp">Harga satu kemasan (Rp)</label>
          <input id="pp" className="input" inputMode="numeric" value={packPrice} onChange={(e) => setPackPrice(e.target.value.replace(/\D/g, ""))} /></div>
        <div className="field"><label htmlFor="sl">Tahan berapa hari</label>
          <input id="sl" className="input" inputMode="numeric" value={shelf} onChange={(e) => setShelf(e.target.value.replace(/\D/g, ""))} /></div>
        <div className="field"><label htmlFor="lt">Dipesan, datang setelah (hari)</label>
          <input id="lt" className="input" inputMode="numeric" value={lead} onChange={(e) => setLead(e.target.value.replace(/\D/g, ""))} />
          <span className="hint">0 kalau bisa dibeli langsung di warung sebelah</span></div>
      </div>
      <label className="check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Masih dipakai</label>
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
    try { const r = await api.post<{ added: number }>("/catalog/apply", { items: [...picked] }); toast(`${r.added} menu ditambahkan`); onDone(); onClose(); }
    catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Dialog title="Tambah dari contoh menu" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Batal</button>
      <button className="btn primary" onClick={save} disabled={busy || picked.size === 0}>Tambah {picked.size || ""} menu</button></>}>
      <Segmented label="Jenis usaha" value={biz} onChange={setBiz} options={[{ value: "warung_makan", label: "Warung makan" }, { value: "kafe", label: "Kafe" }]} />
      <span className="small muted">Harga dan resep bisa diubah setelah ditambahkan. Bahan yang dibutuhkan ikut dibuat.</span>
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
