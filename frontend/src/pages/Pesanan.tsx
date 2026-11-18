// Special orders outside the daily trade: boxed meals for an event, an office lunch, a cake.
// They have a customer, a due date, a down payment, and a status the owner moves along.
import { useState } from "react";
import { api, type MenuItem, type PreOrder, type PreOrderLine, type PreStatus } from "../api";
import { t, useLang } from "../i18n";
import { addDays, dayShort, dayWithName, num, rupiah } from "../format";
import { RupiahField } from "../profile";
import { Dialog, ErrorBox, Loading, PageHead, Segmented, toast, useApi } from "../ui";

export const STATUS_LABEL: Record<PreStatus, string> = { baru: "Baru", proses: "Dikerjakan", selesai: "Sudah selesai", batal: "Dibatalkan" };
const STATUS_CLASS: Record<PreStatus, string> = { baru: "accent", proses: "warn", selesai: "good", batal: "" };

/** 0812-3456 -> 628123456, for a WhatsApp link the owner taps. */
const waNumber = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("0") ? `62${d.slice(1)}` : d;
};

export function whenLabel(due: string, today: string): string {
  if (due === today) return t("Hari ini");
  if (due === addDays(today, 1)) return t("Besok");
  if (due < today) return t("Terlambat");
  return dayWithName(due);
}

export default function Pesanan({ today }: { today: string }) {
  useLang();
  const [tab, setTab] = useState<"open" | "done">("open");
  const list = useApi<PreOrder[]>(`/preorders?when=${tab}`, [tab]);
  const menu = useApi<MenuItem[]>("/menu");
  const [edit, setEdit] = useState<PreOrder | "new" | null>(null);

  const move = async (p: PreOrder, status: PreStatus) => {
    if (status === "batal" && !confirm(t("Batalkan pesanan {name}?", { name: p.customer }))) return;
    try {
      await api.post(`/preorders/${p.id}/status`, { status });
      toast(t("Pesanan {name}: {s}", { name: p.customer, s: t(STATUS_LABEL[status]).toLowerCase() }));
      list.reload();
    } catch (e) { toast((e as Error).message); }
  };

  const rows = list.data ?? [];
  const openTotal = tab === "open" ? rows.reduce((a, p) => a + p.rest, 0) : 0;

  return (
    <>
      <PageHead title={t("Pesanan")} sub={t("Pesanan di luar jualan harian: nasi kotak, katering, acara. Bahannya otomatis masuk daftar belanja sebelum hari H.")}>
        <Segmented label={t("Tampilkan")} value={tab} onChange={setTab}
                   options={[{ value: "open", label: t("Belum selesai") }, { value: "done", label: t("Selesai & batal") }]} />
        <button className="btn primary" onClick={() => setEdit("new")}>{t("Pesanan baru")}</button>
      </PageHead>

      <section className="card" aria-label={t("Daftar pesanan")}>
        {tab === "open" && rows.length > 0 && (
          <div className="card-head"><p className="small muted">{t("{n} pesanan · sisa yang belum dibayar {rp}", { n: rows.length, rp: rupiah(openTotal) })}</p></div>
        )}
        {list.error ? <div className="card-body"><ErrorBox message={list.error} retry={list.reload} /></div> : !list.data ? <Loading /> :
          rows.length === 0 ? (
            <div className="empty">
              <p>{tab === "open" ? t("Belum ada pesanan. Catat pesanan yang masuk lewat WhatsApp atau telepon supaya tidak lupa.") : t("Belum ada pesanan yang selesai atau batal.")}</p>
              {tab === "open" && <button className="btn primary" style={{ marginTop: 12 }} onClick={() => setEdit("new")}>{t("Catat pesanan pertama")}</button>}
            </div>
          ) : rows.map((p) => (
            <article key={p.id} className="po" aria-label={p.customer}>
              <div className="when">
                <strong className={p.due < today && tab === "open" ? "down" : ""}>{whenLabel(p.due, today)}</strong>
                <span className="small muted">{[whenLabel(p.due, today) !== dayWithName(p.due) ? dayShort(p.due) : "", p.due_time].filter(Boolean).join(" · ")}</span>
              </div>
              <div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <strong style={{ fontSize: 16 }}>{p.customer}</strong>
                  <span className={`badge ${STATUS_CLASS[p.status]}`}>{t(STATUS_LABEL[p.status])}</span>
                  {p.phone && <a className="small" href={`https://wa.me/${waNumber(p.phone)}`} target="_blank" rel="noreferrer">{t("WhatsApp {phone}", { phone: p.phone })}</a>}
                </div>
                <div className="small" style={{ marginTop: 4 }}>{p.lines.map((l) => `${num(l.qty)}× ${l.name}`).join(", ")}</div>
                {p.note && <div className="small muted" style={{ marginTop: 2 }}>{p.note}</div>}
                <div className="small num" style={{ marginTop: 4 }}>
                  {t("Total {rp}", { rp: rupiah(p.total) })} · {t("DP {rp}", { rp: rupiah(p.dp) })} · {p.rest > 0 ? <strong>{t("sisa {rp}", { rp: rupiah(p.rest) })}</strong> : <span className="up">{t("lunas")}</span>}
                </div>
              </div>
              <div className="row wrap" style={{ justifyContent: "flex-end" }}>
                {p.status === "baru" && <button className="btn small" onClick={() => move(p, "proses")}>{t("Mulai dikerjakan")}</button>}
                {(p.status === "baru" || p.status === "proses") && <button className="btn small primary" onClick={() => move(p, "selesai")}>{t("Selesai")}</button>}
                {p.status === "selesai" && <button className="btn small" onClick={() => move(p, "proses")}>{t("Buka lagi")}</button>}
                <button className="btn small ghost" onClick={() => setEdit(p)}>{t("Ubah")}</button>
                {(p.status === "baru" || p.status === "proses") && <button className="btn small ghost" onClick={() => move(p, "batal")}>{t("Batalkan")}</button>}
              </div>
            </article>
          ))}
      </section>

      {edit && menu.data && <PreOrderDialog p={edit === "new" ? null : edit} menu={menu.data} today={today}
                                            onClose={() => setEdit(null)} onDone={list.reload} />}
    </>
  );
}

type LineDraft = { item_id: number | null; name: string; qty: string; price: number };

function PreOrderDialog({ p, menu, today, onClose, onDone }: {
  p: PreOrder | null; menu: MenuItem[]; today: string; onClose: () => void; onDone: () => void;
}) {
  const [customer, setCustomer] = useState(p?.customer ?? "");
  const [phone, setPhone] = useState(p?.phone ?? "");
  const [due, setDue] = useState(p?.due ?? addDays(today, 1));
  const [time, setTime] = useState(p?.due_time ?? "");
  const [dp, setDp] = useState(p?.dp ?? 0);
  const [note, setNote] = useState(p?.note ?? "");
  const [lines, setLines] = useState<LineDraft[]>(p?.lines.map((l: PreOrderLine) => ({ ...l, qty: String(l.qty) }))
    ?? [{ item_id: menu[0]?.id ?? null, name: "", qty: "", price: menu[0]?.price ?? 0 }]);
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<LineDraft>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const valid = lines.filter((l) => Number(l.qty) > 0 && (l.item_id || l.name.trim()));
  const total = valid.reduce((a, l) => a + Number(l.qty) * l.price, 0);

  const save = async () => {
    setBusy(true);
    const body = { customer: customer.trim(), phone, due, due_time: time, dp, note, status: p?.status ?? "baru",
      lines: valid.map((l) => ({ item_id: l.item_id, name: l.name, qty: Number(l.qty), price: l.price })) };
    try {
      if (p) await api.put(`/preorders/${p.id}`, body); else await api.post("/preorders", body);
      toast(t("Pesanan {name} disimpan", { name: body.customer }));
      onDone();
      onClose();
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Dialog title={p ? t("Ubah pesanan") : t("Pesanan baru")} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>{t("Batal")}</button>
      <button className="btn primary" onClick={save} disabled={busy || !customer.trim() || !due || valid.length === 0}>{busy ? t("Menyimpan…") : t("Simpan")}</button></>}>
      <div className="grid halves" style={{ gap: 10 }}>
        <div className="field"><label htmlFor="pc">{t("Nama pemesan")}</label>
          <input id="pc" className="input" value={customer} maxLength={120} onChange={(e) => setCustomer(e.target.value)} placeholder={t("Contoh: Bu Ani, arisan RT 05")} /></div>
        <div className="field"><label htmlFor="pp">{t("No. HP / WhatsApp")} <span className="muted">({t("boleh dikosongkan")})</span></label>
          <input id="pp" className="input" inputMode="tel" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className="field"><label htmlFor="pd">{t("Tanggal diambil / diantar")}</label>
          <input id="pd" className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        <div className="field"><label htmlFor="pt">{t("Jam")} <span className="muted">({t("boleh dikosongkan")})</span></label>
          <input id="pt" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 6, padding: 0 }}>{t("Isi pesanan")}</legend>
        {lines.map((l, i) => (
          <div key={i} className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
            <select className="input grow" style={{ minWidth: 160 }} aria-label={t("Menu")} value={l.item_id ?? ""}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      const m = menu.find((x) => x.id === id);
                      set(i, { item_id: id, price: m ? m.price : l.price, name: m ? "" : l.name });
                    }}>
              {menu.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              <option value="">{t("Lainnya (tulis sendiri)")}</option>
            </select>
            {l.item_id === null && <input className="input grow" style={{ minWidth: 140 }} aria-label={t("Nama barang")} placeholder={t("Nama barang")}
                                          value={l.name} onChange={(e) => set(i, { name: e.target.value })} />}
            <input className="input" style={{ width: 80 }} inputMode="numeric" aria-label={t("Jumlah")} placeholder={t("Jumlah")}
                   value={l.qty} onChange={(e) => set(i, { qty: e.target.value.replace(/\D/g, "") })} />
            <input className="input" style={{ width: 110 }} inputMode="numeric" aria-label={t("Harga satuan (Rp)")}
                   value={l.price ? num(l.price) : ""} placeholder={t("Harga")}
                   onChange={(e) => set(i, { price: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            {lines.length > 1 && <button className="btn small ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label={t("Hapus baris")}>✕</button>}
          </div>
        ))}
        <button className="btn small" style={{ alignSelf: "flex-start" }}
                onClick={() => setLines([...lines, { item_id: menu[0]?.id ?? null, name: "", qty: "", price: menu[0]?.price ?? 0 }])}>{t("+ Baris")}</button>
        <span className="hint">{t("Harga boleh berbeda dari harga biasa, misalnya harga paket.")}</span>
      </fieldset>
      <div className="grid halves" style={{ gap: 10 }}>
        <RupiahField id="dp" label={t("Uang muka (DP)")} value={dp} onChange={setDp} />
        <div className="field"><span className="label">{t("Total")}</span>
          <div className="fig" style={{ fontSize: 22, paddingTop: 6 }}>{rupiah(total)}</div>
          <span className="hint">{dp > 0 && dp <= total ? t("sisa {rp}", { rp: rupiah(total - dp) }) : dp > total ? t("DP lebih besar dari total") : ""}</span></div>
      </div>
      <div className="field"><label htmlFor="pn">{t("Catatan")} <span className="muted">({t("boleh dikosongkan")})</span></label>
        <textarea id="pn" className="input" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder={t("Contoh: tanpa sambal, antar ke balai RW")} /></div>
    </Dialog>
  );
}
