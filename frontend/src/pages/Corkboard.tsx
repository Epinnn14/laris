// The notes board as sticky notes on cork: the owner drags each note wherever it should sit,
// picks its colour, pins the important ones. A smaller strip of it shows on the dashboard.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { api, type Note } from "../api";
import { t } from "../i18n";
import { corkTile } from "../cork";
import { ErrorBox, Icon, Loading, toast, useApi } from "../ui";

export const NOTE_COLORS = [
  { value: "#fff27a", name: "Kuning" }, { value: "#ffcb80", name: "Oranye" }, { value: "#ffb3c7", name: "Merah muda" },
  { value: "#d7c2ff", name: "Ungu" }, { value: "#a8dcff", name: "Biru" }, { value: "#b9f2a1", name: "Hijau" },
];
const DEFAULT_COLOR = NOTE_COLORS[0].value;
const W = 210, H = 190, GAP = 28, PAD = 28, MIN_W = 640;

/** A small, steady tilt per note, so the board looks hand-pinned without moving on every reload. */
const tilt = (id: number) => ((((id * 37) % 7) + 7) % 7 - 3) * 0.9;
const corkBg = (): CSSProperties => { const tile = corkTile(); return tile ? { backgroundImage: `url(${tile})` } : {}; };

type Placed = Note & { px: number; py: number };

/** Notes that were never moved go into the first free spots, left to right, top to bottom. */
function layout(notes: Note[], width: number): Placed[] {
  const cols = Math.max(1, Math.floor((width - PAD) / (W + GAP)));
  const taken = notes.filter((n) => n.x !== null && n.y !== null).map((n) => ({ x: n.x!, y: n.y! }));
  const free = (x: number, y: number) => taken.every((r) => Math.abs(r.x - x) >= W + 8 || Math.abs(r.y - y) >= H + 8);
  let slot = 0;
  return notes.map((n) => {
    if (n.x !== null && n.y !== null) return { ...n, px: n.x, py: n.y };
    for (;; slot++) {
      const x = PAD + (slot % cols) * (W + GAP), y = PAD + Math.floor(slot / cols) * (H + GAP);
      if (free(x, y)) { taken.push({ x, y }); slot++; return { ...n, px: x, py: y }; }
    }
  });
}

function Pin() {
  return (
    <svg className="pin" viewBox="0 0 40 40" aria-hidden="true">
      <defs><radialGradient id="laris-pin" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.9" /><stop offset="25%" stopColor="#ff6b6b" /><stop offset="100%" stopColor="#b3141c" />
      </radialGradient></defs>
      <ellipse cx="24" cy="27" rx="10" ry="6" fill="rgba(0,0,0,0.28)" />
      <circle cx="20" cy="19" r="11" fill="url(#laris-pin)" />
      <circle cx="20" cy="19" r="11" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
    </svg>
  );
}

/** Pinned notes get a red push pin, the rest a strip of paper tape. */
const Fastener = ({ pinned }: { pinned: boolean }) => pinned ? <Pin /> : <span className="tape" aria-hidden="true" />;

function ColorDots({ value, onPick, size = 22 }: { value: string; onPick: (c: string) => void; size?: number }) {
  return (
    <div className="dots" role="group" aria-label={t("Warna kertas")}>
      {NOTE_COLORS.map((c) => (
        <button key={c.value} type="button" className="dot" aria-pressed={c.value === value} aria-label={t(c.name)} title={t(c.name)}
                style={{ background: c.value, width: size, height: size }} onClick={() => onPick(c.value)} />
      ))}
    </div>
  );
}

function Composer({ onAdd, busy }: { onAdd: (text: string, color: string) => Promise<boolean>; busy: boolean }) {
  const [draft, setDraft] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const add = async () => { if (draft.trim() && await onAdd(draft.trim(), color)) setDraft(""); };
  return (
    <div className="composer">
      <textarea className="input" rows={2} maxLength={2000} value={draft} aria-label={t("Catatan baru")}
                placeholder={t("Tulis catatan…")} style={{ background: color, color: "#2b2620" }}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) add(); }} />
      <div className="row wrap" style={{ gap: 10 }}>
        <ColorDots value={color} onPick={setColor} />
        <button className="btn primary" onClick={add} disabled={busy || !draft.trim()}>{t("Tempel")}</button>
      </div>
    </div>
  );
}

/** The whole board: free placement, drag with mouse or finger, arrow keys for the keyboard. */
export function CorkBoard() {
  const notes = useApi<Note[]>("/notes");
  const [list, setList] = useState<Note[]>([]);
  useEffect(() => { if (notes.data) setList(notes.data); }, [notes.data]);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const on = () => setWidth(Math.max(MIN_W, el.clientWidth));
    on();
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => ro.disconnect();
  }, [!notes.data]);

  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [palette, setPalette] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ id: number; ox: number; oy: number; sx: number; sy: number; moved: boolean; z: number | null } | null>(null);
  const keySave = useRef<Record<number, number>>({});

  const placed = useMemo(() => layout(list, width), [list, width]);
  const height = Math.max(520, ...placed.map((p) => p.py + H + 140));
  // notes placed on a wider screen stay reachable on a narrower one: the cork grows and scrolls
  const boardW = Math.max(width, ...placed.map((p) => p.px + W + PAD));
  const topZ = Math.max(0, ...list.map((n) => n.z));
  const update = (id: number, patch: Partial<Note>) => setList((l) => l.map((n) => n.id === id ? { ...n, ...patch } : n));
  const send = (id: number, body: Record<string, unknown>) =>
    api.patch(`/notes/${id}`, body).catch((e) => toast((e as Error).message));

  const add = async (txt: string, color: string) => {
    setBusy(true);
    try {
      const all = layout([...list, { id: -1, text: "", pinned: false, updated: "", x: null, y: null, z: 0, color }], width);
      const spot = all[all.length - 1];
      await api.post("/notes", { text: txt, color, x: spot.px, y: spot.py });
      notes.reload();
      return true;
    } catch (e) { toast((e as Error).message); return false; } finally { setBusy(false); }
  };

  const down = (e: PointerEvent<HTMLDivElement>, p: Placed) => {
    if (e.button !== 0 || editing === p.id || (e.target as HTMLElement).closest("button, textarea")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    const raise = p.z < topZ ? topZ + 1 : null;  // the touched note comes on top of the others
    drag.current = { id: p.id, ox: e.clientX - p.px, oy: e.clientY - p.py, sx: e.clientX, sy: e.clientY, moved: false, z: raise };
    setSelected(p.id);
    if (raise !== null) update(p.id, { z: raise });
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
    d.moved = true;
    update(d.id, { x: Math.round(Math.min(boardW - W, Math.max(0, e.clientX - d.ox))), y: Math.round(Math.max(0, e.clientY - d.oy)) });
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const n = list.find((x) => x.id === d.id);
    if (!n) return;
    if (d.moved && n.x !== null && n.y !== null) send(d.id, { x: n.x, y: n.y, ...(d.z !== null ? { z: d.z } : {}) });
    else if (d.z !== null) send(d.id, { z: d.z });
  };
  const keys = (e: KeyboardEvent<HTMLDivElement>, p: Placed) => {
    if (editing === p.id || (e.target as HTMLElement) !== e.currentTarget) return;
    if (e.key === "Enter") { e.preventDefault(); startEdit(p); return; }
    const step = e.shiftKey ? 40 : 10;
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    const x = Math.min(boardW - W, Math.max(0, p.px + dx)), y = Math.max(0, p.py + dy);
    update(p.id, { x, y });
    window.clearTimeout(keySave.current[p.id]);
    keySave.current[p.id] = window.setTimeout(() => send(p.id, { x, y }), 400);
  };

  const startEdit = (n: Note) => { setEditing(n.id); setText(n.text); setSelected(n.id); };
  const saveText = async (n: Note) => {
    if (!text.trim()) return;
    try { await api.put(`/notes/${n.id}`, { text: text.trim(), pinned: n.pinned }); setEditing(null); update(n.id, { text: text.trim() }); }
    catch (e) { toast((e as Error).message); }
  };
  const remove = async (n: Note) => {
    if (!confirm(t("Hapus catatan ini?"))) return;
    try { await api.del(`/notes/${n.id}`); setList((l) => l.filter((x) => x.id !== n.id)); }
    catch (e) { toast((e as Error).message); }
  };

  if (notes.error) return <ErrorBox message={notes.error} retry={notes.reload} />;
  if (!notes.data) return <Loading />;

  return (
    <section aria-labelledby="board-h">
      <h2 id="board-h" className="sr">{t("Papan catatan")}</h2>
      <Composer onAdd={add} busy={busy} />
      <p className="small muted" style={{ margin: "10px 0" }}>
        {t("Geser catatan ke mana saja. Ketuk catatan untuk mengubah, mengganti warna, menyematkan, atau menghapus.")}</p>
      <div className="cork-frame">
        <div className="cork-scroll" ref={wrap}>
          <div className="cork" style={{ ...corkBg(), width: boardW, height }}
               onPointerDown={(e) => { if (e.target === e.currentTarget) { setSelected(null); setPalette(null); } }}>
            {placed.length === 0 && <p className="cork-empty">{t("Papan masih kosong.")}</p>}
            {placed.map((p) => {
              const color = p.color ?? DEFAULT_COLOR;
              const on = selected === p.id;
              return (
                <div key={p.id} role="group" tabIndex={0}
                     aria-label={`${p.pinned ? t("Disematkan") + ": " : ""}${p.text}`}
                     className={`sticky ${on ? "on" : ""} ${drag.current?.id === p.id && drag.current.moved ? "dragging" : ""}`}
                     style={{ left: p.px, top: p.py, zIndex: p.z + (on ? 1000 : 0), "--paper": color, "--tilt": `${tilt(p.id)}deg` } as CSSProperties}
                     onPointerDown={(e) => down(e, p)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                     onKeyDown={(e) => keys(e, p)} onFocus={() => setSelected(p.id)}
                     onDoubleClick={() => startEdit(p)}>
                  <Fastener pinned={p.pinned} />
                  {editing === p.id ? (
                    <textarea className="ink" autoFocus value={text} maxLength={2000} aria-label={t("Ubah catatan")}
                              onChange={(e) => setText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") setEditing(null);
                                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveText(p);
                              }} />
                  ) : <div className="ink">{p.text}</div>}
                  <div className="tools">
                    {editing === p.id ? <>
                      <button className="btn small ghost" onClick={() => setEditing(null)}>{t("Batal")}</button>
                      <button className="btn small" onClick={() => saveText(p)}>{t("Simpan")}</button>
                    </> : palette === p.id ? (
                      <ColorDots value={color} size={20} onPick={(c) => { update(p.id, { color: c }); send(p.id, { color: c }); setPalette(null); }} />
                    ) : <>
                      <button className="icon-btn" aria-pressed={p.pinned} aria-label={p.pinned ? t("Lepas") : t("Sematkan")} title={p.pinned ? t("Lepas") : t("Sematkan")}
                              onClick={() => { update(p.id, { pinned: !p.pinned }); send(p.id, { pinned: !p.pinned }); }}><Icon.pin size={18} /></button>
                      <button className="icon-btn" aria-label={t("Ubah")} title={t("Ubah")} onClick={() => startEdit(p)}><Icon.pencil size={18} /></button>
                      <button className="icon-btn" aria-label={t("Ganti warna")} title={t("Ganti warna")} onClick={() => setPalette(p.id)}><Icon.palette size={18} /></button>
                      <button className="icon-btn" aria-label={t("Hapus")} title={t("Hapus")} onClick={() => remove(p)}><Icon.trash size={18} /></button>
                    </>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/** The dashboard's view of the board: a quick note and the latest stickies, pinned ones first. */
export function NotesPreview() {
  const notes = useApi<Note[]>("/notes");
  const [busy, setBusy] = useState(false);
  const add = async (text: string, color: string) => {
    setBusy(true);
    try { await api.post("/notes", { text, color }); notes.reload(); return true; }
    catch (e) { toast((e as Error).message); return false; } finally { setBusy(false); }
  };
  const shown = (notes.data ?? []).slice(0, 6);
  const more = (notes.data?.length ?? 0) - shown.length;
  return (
    <section className="card" aria-labelledby="board-h">
      <div className="card-head">
        <div><h2 id="board-h">{t("Papan catatan")}</h2>
          <p className="small muted">{t("Tulis apa saja: nomor pemasok, rencana menu baru, siapa yang masih utang.")}</p></div>
        <a className="small" href="#/catatan">{t("Buka papan")}</a>
      </div>
      <div className="card-body stack" style={{ gap: 12 }}>
        <Composer onAdd={add} busy={busy} />
        {notes.error ? <ErrorBox message={notes.error} retry={notes.reload} /> : !notes.data ? <Loading /> : (
          <div className="cork-frame">
            <div className="cork strip" style={corkBg()}>
              {shown.length === 0 ? <p className="cork-empty small-empty">{t("Papan masih kosong.")}</p> : shown.map((n) => (
                <a key={n.id} href="#/catatan" className="sticky mini"
                   style={{ "--paper": n.color ?? DEFAULT_COLOR, "--tilt": `${tilt(n.id)}deg` } as CSSProperties}>
                  <Fastener pinned={n.pinned} />
                  <span className="ink">{n.text}</span>
                </a>
              ))}
              {more > 0 && <a className="cork-more" href="#/catatan">{t("+{n} lainnya", { n: more })}</a>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
