import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "./api";

// ---------- data loading

export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<T>(path));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

// ---------- small pieces

export function Loading({ label = "Memuat…" }: { label?: string }) {
  return (
    <div className="center" role="status" aria-live="polite">
      <div className="row"><div className="spinner" /> <span className="muted">{label}</span></div>
    </div>
  );
}

export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="alert bad" role="alert">
      <div className="grow">{message}</div>
      {retry && <button className="btn small" onClick={retry}>Coba lagi</button>}
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="row wrap">{children}</div>}
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({ title, onClose, children, footer }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, select, textarea, button:not(.close)");
    first?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="btn ghost small close" onClick={onClose} aria-label="Tutup">✕</button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}

let toastTimer: number | undefined;
export function toast(msg: string) {
  window.dispatchEvent(new CustomEvent("laris:toast", { detail: msg }));
}
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail);
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => setMsg(null), 2600);
    };
    window.addEventListener("laris:toast", on);
    return () => window.removeEventListener("laris:toast", on);
  }, []);
  return msg ? <div className="toast" role="status" aria-live="polite">{msg}</div> : null;
}

// ---------- icons (24px stroke icons, drawn for this app)

const I = (d: ReactNode) => (p: { size?: number }) => (
  <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
export const Icon = {
  home: I(<><path d="M4 11l8-6 8 6" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></>),
  pencil: I(<><path d="M4 20h4l10-10-4-4L4 16v4z" /><path d="M13 7l4 4" /></>),
  box: I(<><path d="M4 8l8-4 8 4-8 4-8-4z" /><path d="M4 8v8l8 4 8-4V8" /><path d="M12 12v8" /></>),
  chart: I(<><path d="M4 19h16" /><path d="M5 15l4-4 3 3 6-7" /><path d="M15 7h3v3" /></>),
  cart: I(<><path d="M3 4h2l2 11h11l2-8H7" /><circle cx="9" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></>),
  bowl: I(<><path d="M3 11h18a9 9 0 0 1-18 0z" /><path d="M8 7c0-1 1-1 1-2M12 7c0-1 1-1 1-2M16 7c0-1 1-1 1-2" /></>),
  gear: I(<><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></>),
  logo: I(<path d="M5 17l5-6 4 3 5-7" stroke="#fff" strokeWidth="2.6" />),
};
