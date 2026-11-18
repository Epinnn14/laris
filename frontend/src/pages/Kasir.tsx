// The till: tap items as the customer orders, take the money, save. Each order adds to the
// day's totals, so stock, the dashboard and the forecast stay up to date without typing totals.
import { useMemo, useState } from "react";
import { api, type MenuItem, type Order } from "../api";
import { t, useLang } from "../i18n";
import { CATEGORIES, catLabel, num, rupiah, rupiahShort } from "../format";
import { RupiahField } from "../profile";
import { Dialog, ErrorBox, Loading, PageHead, Segmented, toast, useApi } from "../ui";

type Method = Order["method"];
type Cart = Map<number, number>;

const METHOD_LABEL: Record<Method, string> = { tunai: "Tunai", qris: "QRIS", transfer: "Transfer" };

export default function Kasir() {
  useLang();
  const menu = useApi<MenuItem[]>("/menu");
  const orders = useApi<Order[]>("/orders?limit=100");
  const [cart, setCart] = useState<Cart>(new Map());
  const [method, setMethod] = useState<Method>("tunai");
  const [cash, setCash] = useState(0);
  const [query, setQuery] = useState("");
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);

  const items = useMemo(() => new Map((menu.data ?? []).map((m) => [m.id, m])), [menu.data]);
  const lines = [...cart.entries()].filter(([id, q]) => q > 0 && items.has(id));
  const total = lines.reduce((a, [id, q]) => a + q * (items.get(id)?.price ?? 0), 0);
  const count = lines.reduce((a, [, q]) => a + q, 0);

  const add = (id: number, d: number) => setCart((c) => {
    const n = new Map(c);
    const q = Math.max(0, (n.get(id) ?? 0) + d);
    if (q) n.set(id, q); else n.delete(id);
    return n;
  });
  const clear = () => { setCart(new Map()); setCash(0); setMethod("tunai"); };

  const save = async () => {
    if (!lines.length) return;
    setBusy(true);
    try {
      const o = await api.post<Order>("/orders", {
        lines: lines.map(([item_id, qty]) => ({ item_id, qty })), method, cash: method === "tunai" && cash > 0 ? cash : null,
      });
      const change = method === "tunai" && cash > 0 ? cash - o.total : 0;
      toast(change > 0 ? t("Orderan #{n} tersimpan · kembalian {rp}", { n: o.number, rp: rupiah(change) })
                       : t("Orderan #{n} tersimpan", { n: o.number }));
      clear();
      setPaying(false);
      orders.reload();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  const voidOrder = async (o: Order) => {
    if (!confirm(t("Batalkan orderan #{n} ({rp})? Porsinya dikurangi dari penjualan hari ini.", { n: o.number, rp: rupiah(o.total) }))) return;
    try { await api.post(`/orders/${o.id}/void`); toast(t("Orderan #{n} dibatalkan", { n: o.number })); orders.reload(); }
    catch (e) { toast((e as Error).message); }
  };

  if (menu.error) return <ErrorBox message={menu.error} retry={menu.reload} />;
  if (!menu.data) return <Loading />;
  if (!menu.data.length) return <><PageHead title={t("Kasir")} /><div className="card pad empty">{t("Belum ada menu.")} <a href="#/menu">{t("Tambahkan menu dulu")}</a>.</div></>;

  const q = query.trim().toLowerCase();
  const shown = menu.data.filter((m) => !q || m.name.toLowerCase().includes(q));
  const groups = CATEGORIES.map((c) => [c, shown.filter((m) => m.category === c)] as const).filter(([, ms]) => ms.length);
  const live = (orders.data ?? []).filter((o) => !o.void);
  const panel = <CartPanel lines={lines} items={items} total={total} method={method} setMethod={setMethod} cash={cash}
                           setCash={setCash} add={add} clear={clear} save={save} busy={busy} />;

  return (
    <>
      <PageHead title={t("Kasir")} sub={t("Ketuk menu yang dipesan, terima uang, lalu simpan. Penjualan hari ini dan stok ikut terisi.")} />
      <div className="till">
        <section aria-label={t("Menu")}>
          {menu.data.length > 12 && (
            <input className="input" type="search" placeholder={t("Cari menu…")} aria-label={t("Cari menu…")}
                   value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 12 }} />
          )}
          {groups.map(([c, ms]) => (
            <div key={c} style={{ marginBottom: 14 }}>
              <h3 className="muted" style={{ marginBottom: 6 }}>{catLabel(c)}</h3>
              <div className="till-grid">
                {ms.map((m) => {
                  const n = cart.get(m.id) ?? 0;
                  return (
                    <button key={m.id} type="button" className="till-item" aria-pressed={n > 0} onClick={() => add(m.id, 1)}
                            aria-label={t("{name}, {rp}, di keranjang {n}", { name: m.name, rp: rupiah(m.price), n })}>
                      <span className="name">{m.name}</span>
                      <span className="price num">{rupiah(m.price)}</span>
                      {n > 0 && <span className="count num" aria-hidden="true">{n}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {shown.length === 0 && <p className="muted">{t("Tidak ada menu dengan nama itu.")}</p>}
        </section>
        <aside className="till-cart card" aria-label={t("Keranjang")}>{panel}</aside>
      </div>

      <div className="till-bar">
        <div className="grow"><div className="fig" style={{ fontSize: 20 }}>{rupiah(total)}</div>
          <div className="small muted">{t("{n} item", { n: count })}</div></div>
        <button className="btn primary" disabled={!count} onClick={() => setPaying(true)}>{t("Bayar")}</button>
      </div>
      {paying && <Dialog title={t("Bayar")} onClose={() => setPaying(false)}>{panel}</Dialog>}

      <section className="card" style={{ marginTop: 16 }} aria-labelledby="today-h">
        <div className="card-head">
          <div>
            <h2 id="today-h">{t("Orderan hari ini")}</h2>
            <p className="small muted">{t("{n} orderan · {rp}", { n: live.length, rp: rupiah(live.reduce((a, o) => a + o.total, 0)) })}</p>
          </div>
        </div>
        <div className="card-body">
          {orders.error ? <ErrorBox message={orders.error} retry={orders.reload} /> : !orders.data ? <Loading /> :
            orders.data.length === 0 ? <p className="muted">{t("Belum ada orderan hari ini. Orderan yang disimpan muncul di sini.")}</p> : (
            <>
              <ul className="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {(all ? orders.data : orders.data.slice(0, 20)).map((o) => (
                  <li key={o.id} className="row" style={{ gap: 12, padding: "10px 0", borderBottom: "1px solid var(--rule)", opacity: o.void ? 0.55 : 1 }}>
                    <span className="num" style={{ width: 44, fontWeight: 700 }}>#{o.number}</span>
                    <span className="grow">
                      <span className="row wrap" style={{ gap: 8 }}>
                        <strong className="num">{rupiah(o.total)}</strong>
                        <span className="small muted num">{o.time} · {t(METHOD_LABEL[o.method])}</span>
                        {o.void && <span className="badge bad">{t("dibatalkan")}</span>}
                      </span>
                      <span className="small" style={{ display: "block" }}>{o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</span>
                    </span>
                    {!o.void && <button className="btn small ghost" onClick={() => voidOrder(o)}>{t("Batalkan")}</button>}
                  </li>
                ))}
              </ul>
              {orders.data.length > 20 && (
                <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => setAll(!all)} aria-expanded={all}>
                  {all ? t("Tampilkan lebih sedikit") : t("Tampilkan semua ({n})", { n: orders.data.length })}
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}

function CartPanel({ lines, items, total, method, setMethod, cash, setCash, add, clear, save, busy }: {
  lines: [number, number][]; items: Map<number, MenuItem>; total: number; method: Method; setMethod: (m: Method) => void;
  cash: number; setCash: (n: number) => void; add: (id: number, d: number) => void; clear: () => void; save: () => void; busy: boolean;
}) {
  const change = cash - total;
  const quick = [...new Set([total, Math.ceil(total / 10000) * 10000, Math.ceil(total / 50000) * 50000, 100000].filter((v) => v >= total && v > 0))].slice(0, 4);
  const short = method === "tunai" && cash > 0 && cash < total;
  return (
    <div className="stack" style={{ gap: 14, padding: 16 }}>
      <div className="row between"><h2>{t("Keranjang")}</h2>
        {lines.length > 0 && <button className="btn small ghost" onClick={clear}>{t("Kosongkan")}</button>}</div>
      {lines.length === 0 ? <p className="muted">{t("Ketuk menu untuk menambahkan.")}</p> : (
        <div className="stack" style={{ gap: 8 }}>
          {lines.map(([id, q]) => {
            const m = items.get(id)!;
            return (
              <div key={id} className="row" style={{ gap: 10 }}>
                <span className="grow"><strong>{m.name}</strong><span className="small muted" style={{ display: "block" }}>{rupiah(m.price * q)}</span></span>
                <div className="stepper" role="group" aria-label={t("Jumlah {name}", { name: m.name })}>
                  <button type="button" onClick={() => add(id, -1)} aria-label={t("Kurangi")}>−</button>
                  <input type="number" value={q} readOnly aria-label={t("Jumlah {name}", { name: m.name })} tabIndex={-1} />
                  <button type="button" onClick={() => add(id, 1)} aria-label={t("Tambah")}>+</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <hr className="rule" />
      <div className="row between"><span>{t("Total")}</span><span className="fig total" style={{ fontSize: 26 }}>{rupiah(total)}</span></div>
      <Segmented label={t("Cara bayar")} value={method} onChange={setMethod}
                 options={(["tunai", "qris", "transfer"] as Method[]).map((m) => ({ value: m, label: t(METHOD_LABEL[m]) }))} />
      {method === "tunai" && total > 0 && (
        <>
          <RupiahField id="cash" label={t("Uang diterima")} value={cash} onChange={setCash} />
          <div className="chips">
            {quick.map((v) => <button key={v} type="button" className="chip" onClick={() => setCash(v)}>{v === total ? t("Uang pas") : rupiahShort(v)}</button>)}
          </div>
          {cash > 0 && (short
            ? <span className="err" role="alert">{t("Uang kurang {rp}", { rp: rupiah(-change) })}</span>
            : <div className="row between"><span>{t("Kembalian")}</span><strong className="fig" style={{ fontSize: 22 }}>{rupiah(change)}</strong></div>)}
        </>
      )}
      <button className="btn primary block" disabled={!lines.length || busy || short} onClick={save}>
        {busy ? t("Menyimpan…") : t("Simpan orderan")}
      </button>
      {lines.length > 0 && <span className="tiny muted">{t("{n} porsi", { n: num(lines.reduce((a, [, q]) => a + q, 0)) })}</span>}
    </div>
  );
}
