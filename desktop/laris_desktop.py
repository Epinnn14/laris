"""Laris for a shop laptop: one icon, no Docker, no terminal.

Double-clicking starts the Laris server on this laptop, opens it in the browser, and shows a
small window with the address phones on the same WiFi can use (also as a QR code), the state
of the daily backups, and a button to stop. Data lives in the user's folder and is kept when
Laris is updated or uninstalled.

    Laris.exe                 normal start (window + browser)
    Laris.exe --minimized     start with the window minimised (used at Windows sign-in)
    Laris.exe --headless      server only, no window (testing)
    Laris.exe --selftest      start, check the API and a backup, then exit 0 or 1 (CI)
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

APP = "Laris"
PORTS = range(8000, 8011)


# ---------------------------------------------------------------- places on disk

def resources() -> Path:
    """Bundled web app and model: next to this file in development, inside the bundle when frozen."""
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent.parent


def web_dir() -> Path:
    return resources() / ("web" if getattr(sys, "frozen", False) else "frontend/dist")


def model_dir() -> Path:
    return resources() / ("model" if getattr(sys, "frozen", False) else "models/larisnet")


def home() -> Path:
    """Where the shop's data lives. Survives reinstalling and uninstalling."""
    if os.environ.get("LARIS_HOME"):
        return Path(os.environ["LARIS_HOME"])
    if sys.platform == "win32":
        return Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / APP
    return Path.home() / ".laris"


def documents() -> Path:
    if sys.platform == "win32":
        try:  # the real Documents folder, also when it was moved to OneDrive or another drive
            import ctypes
            from ctypes import wintypes
            buf = ctypes.create_unicode_buffer(wintypes.MAX_PATH)
            ctypes.windll.shell32.SHGetFolderPathW(None, 5, None, 0, buf)
            if buf.value:
                return Path(buf.value)
        except Exception:
            pass
    return Path.home() / "Documents"


class Config:
    def __init__(self, path: Path):
        self.path = path
        try:
            self.data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self.data = {}

    def get(self, key, default=None):
        return self.data.get(key, default)

    def set(self, key, value) -> None:
        self.data[key] = value
        self.path.write_text(json.dumps(self.data, indent=2), encoding="utf-8")


def backup_folders(cfg: Config) -> list[Path]:
    main = documents() / "Laris Cadangan"
    extra = cfg.get("extra_backup")
    return [main] + ([Path(extra)] if extra else [])


# ---------------------------------------------------------------- network

def lan_ip() -> str | None:
    """This laptop's address on the WiFi (no packet is sent)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        return None if ip.startswith("127.") else ip
    except OSError:
        return None
    finally:
        s.close()


def app_url(port: int) -> str:
    """*.localhost always points at this laptop in Edge and Chrome, so the address reads "laris"."""
    return f"http://laris.localhost:{port}"


def app_browser() -> str | None:
    """Edge (on every Windows 10/11) or Chrome, which can show Laris as its own window."""
    if sys.platform == "win32":
        roots = [os.environ.get(k, "") for k in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA")]
        names = [r"Microsoft\Edge\Application\msedge.exe", r"Google\Chrome\Application\chrome.exe"]
        for name in names:
            for root in roots:
                path = Path(root) / name
                if root and path.exists():
                    return str(path)
        return None
    for name in ("microsoft-edge", "google-chrome", "chromium", "chromium-browser"):
        found = shutil.which(name)
        if found:
            return found
    return None


def open_app(port: int) -> None:
    """Open Laris in a window of its own: no address bar, titled "Laris" with its icon.
    Falls back to a normal browser tab when neither Edge nor Chrome is installed."""
    browser = app_browser()
    if browser:
        try:
            subprocess.Popen([browser, f"--app={app_url(port)}", "--window-size=1280,860"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return
        except OSError:
            pass
    webbrowser.open(f"http://localhost:{port}")


def laris_running(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1.5) as r:
            return b'"model"' in r.read()
    except OSError:
        return False


def free_port() -> int | None:
    for p in PORTS:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("0.0.0.0", p))
                return p
            except OSError:
                continue
    return None


# ---------------------------------------------------------------- server

class Server:
    def __init__(self, port: int, data: Path, cfg: Config):
        self.port, self.data, self.cfg = port, data, cfg
        data.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault("LARIS_DATABASE_URL", f"sqlite:///{(data / 'laris.db').as_posix()}")
        os.environ.setdefault("LARIS_STATIC_DIR", str(web_dir()))
        os.environ.setdefault("LARIS_MODEL_DIR", str(model_dir()))
        os.environ["LARIS_NO_AUTOAPP"] = "1"
        import uvicorn
        from laris_api import backup
        from laris_api.main import create_app
        backup.configure(backup_folders(cfg))
        self.backup = backup
        self.app = create_app()
        self.server = uvicorn.Server(uvicorn.Config(self.app, host="0.0.0.0", port=port, log_config=None,
                                                    access_log=False, lifespan="off"))
        self.thread = threading.Thread(target=self.server.run, name="laris-server", daemon=True)

    def start(self, timeout: float = 30) -> bool:
        self.thread.start()
        end = time.time() + timeout
        while time.time() < end:
            if self.server.started:
                return True
            if not self.thread.is_alive():
                return False
            time.sleep(0.05)
        return False

    def stop(self) -> None:
        self.server.should_exit = True
        self.thread.join(timeout=10)
        if getattr(self.app.state, "backup_stop", None):
            self.app.state.backup_stop.set()
        self.app.state.db.engine.dispose()

    def backup_now(self) -> list[Path]:
        return self.backup.make(self.app.state.db.engine)

    def backup_status(self) -> dict:
        return self.backup.status(self.app.state.db.engine)

    def set_password(self, pw: str) -> None:
        """Whoever sits at the shop laptop is the owner: they may set a new password here."""
        from laris_api import auth, store
        with self.app.state.db.Session() as s:
            store.put(s, "password", auth.hash_password(pw))
            store.put(s, "secret", auth.new_secret())  # signs everyone out
            s.commit()


def restore(srv: Server, src: Path) -> Server:
    """Put a backup copy back as the shop's data (moving to a new laptop, or undoing a mistake).
    The current data is copied first, so a restore can itself be undone."""
    db = Path(srv.app.state.db.engine.url.database)
    srv.backup.make(srv.app.state.db.engine, label="sebelum-pulih-" + time.strftime("%Y-%m-%d_%H%M%S"))
    port, data, cfg = srv.port, srv.data, srv.cfg
    srv.stop()
    for extra in (db.with_name(db.name + "-wal"), db.with_name(db.name + "-shm")):
        extra.unlink(missing_ok=True)
    shutil.copyfile(src, db)
    new = Server(port, data, cfg)
    if not new.start():
        raise RuntimeError("Laris tidak bisa menyala lagi setelah memulihkan")
    return new


# ---------------------------------------------------------------- window

def open_folder(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    if sys.platform == "win32":
        os.startfile(path)  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path)])


def qr_png(url: str) -> str:
    import segno
    uri = segno.make(url, error="m").png_data_uri(scale=5, border=2, dark="#231c16", light="#fffcf6")
    return uri.split(",", 1)[1]


def window(first: Server, cfg: Config, minimized: bool) -> None:
    import tkinter as tk
    from tkinter import filedialog, font, messagebox, simpledialog

    PAPER, SHEET, INK, MUTED, ACCENT, RULE = "#f6f0e4", "#fffcf6", "#231c16", "#6b5f53", "#b4441b", "#e3d8c6"
    holder = {"srv": first}
    srv_ = lambda: holder["srv"]  # noqa: E731  (the server is replaced after a restore)
    srv = first
    ip = lan_ip()
    phone = f"http://{ip}:{srv.port}" if ip else None

    root = tk.Tk()
    root.title("Laris")
    root.configure(bg=PAPER)
    root.resizable(False, False)
    ico = resources() / ("laris.ico" if getattr(sys, "frozen", False) else "desktop/laris.ico")
    if sys.platform == "win32" and ico.exists():
        try:
            root.iconbitmap(default=str(ico))
        except tk.TclError:
            pass
    base = font.nametofont("TkDefaultFont")
    base.configure(size=11)
    big = font.Font(family=("Georgia" if sys.platform == "win32" else "serif"), size=17, weight="bold")
    bold = font.Font(family=base.actual("family"), size=11, weight="bold")
    small = font.Font(family=base.actual("family"), size=9)

    def label(parent, text, f=base, fg=INK, **kw):
        w = tk.Label(parent, text=text, font=f, fg=fg, bg=parent["bg"], justify="left", anchor="w", **kw)
        w.pack(fill="x", anchor="w")
        return w

    def button(parent, text, cmd, primary=False):
        b = tk.Button(parent, text=text, command=cmd, font=bold, cursor="hand2", relief="flat", bd=0, padx=14, pady=8,
                      bg=ACCENT if primary else SHEET, fg="#ffffff" if primary else INK,
                      activebackground="#963613" if primary else RULE, activeforeground="#ffffff" if primary else INK,
                      highlightthickness=1, highlightbackground=ACCENT if primary else "#cdbfa8")
        return b

    outer = tk.Frame(root, bg=PAPER, padx=20, pady=18)
    outer.pack(fill="both", expand=True)
    label(outer, "Laris menyala", big)
    label(outer, "Biarkan jendela ini terbuka (boleh diperkecil) selama toko buka.", small, MUTED, wraplength=380)

    card = tk.Frame(outer, bg=SHEET, padx=16, pady=14, highlightthickness=1, highlightbackground=RULE)
    card.pack(fill="x", pady=(14, 10))
    label(card, "Di laptop ini", bold)
    label(card, "Laris terbuka di jendelanya sendiri. Tertutup? Tekan tombol ini.", small, MUTED, wraplength=360)
    button(card, "Buka Laris", lambda: open_app(srv.port), primary=True).pack(anchor="w", pady=(8, 2))

    card2 = tk.Frame(outer, bg=SHEET, padx=16, pady=14, highlightthickness=1, highlightbackground=RULE)
    card2.pack(fill="x", pady=(0, 10))
    label(card2, "Dari HP kasir (WiFi yang sama)", bold)
    if phone:
        label(card2, f"Scan kode ini dengan kamera HP, atau ketik {phone}", small, MUTED, wraplength=360)
        img = tk.PhotoImage(data=qr_png(phone))
        q = tk.Label(card2, image=img, bg=SHEET)
        q.image = img
        q.pack(anchor="w", pady=(8, 0))
        label(card2, "Kalau Windows menanyakan izin jaringan, pilih Izinkan (Allow).", small, MUTED, wraplength=360)
    else:
        label(card2, "Laptop belum tersambung ke WiFi. Sambungkan, lalu buka ulang Laris.", small, MUTED, wraplength=360)

    card3 = tk.Frame(outer, bg=SHEET, padx=16, pady=14, highlightthickness=1, highlightbackground=RULE)
    card3.pack(fill="x", pady=(0, 10))
    label(card3, "Cadangan data", bold)
    state = label(card3, "", small, MUTED, wraplength=360)
    extra = label(card3, "", small, MUTED, wraplength=360)

    def refresh():
        st = srv_().backup_status()
        state.configure(text=f"Otomatis sekali sehari. Terakhir: {st['last'].replace('T', ' ') if st['last'] else 'belum ada'}"
                             f" · {st['count']} salinan")
        e = cfg.get("extra_backup")
        extra.configure(text=f"Juga disalin ke: {e}" if e else "Folder kedua: belum dipilih (flashdisk atau Google Drive).")

    def backup_now():
        made = srv_().backup_now()
        refresh()
        if made:
            messagebox.showinfo("Laris", "Cadangan dibuat di:\n" + "\n".join(str(p.parent) for p in made))
        else:
            messagebox.showwarning("Laris", "Cadangan gagal. Coba lagi, atau pilih folder lain.")

    def choose_extra():
        d = filedialog.askdirectory(title="Pilih folder cadangan kedua (flashdisk atau Google Drive)")
        if d:
            cfg.set("extra_backup", d)
            srv_().backup.configure(backup_folders(cfg))
            backup_now()

    row = tk.Frame(card3, bg=SHEET)
    row.pack(fill="x", pady=(8, 0))
    button(row, "Cadangkan sekarang", backup_now).pack(side="left")
    button(row, "Buka folder", lambda: open_folder(backup_folders(cfg)[0])).pack(side="left", padx=6)
    def restore_from():
        f = filedialog.askopenfilename(title="Pilih file cadangan Laris", initialdir=str(backup_folders(cfg)[0]),
                                       filetypes=[("Cadangan Laris", "laris-*.db"), ("Semua file", "*.*")])
        if not f:
            return
        if not messagebox.askyesno("Pulihkan data?", "Data Laris sekarang akan diganti dengan isi cadangan ini.\n"
                                   "Data sekarang disalin dulu ke folder cadangan, jadi bisa dikembalikan.\n\nLanjutkan?"):
            return
        try:
            holder["srv"] = restore(srv_(), Path(f))
            refresh()
            messagebox.showinfo("Laris", "Data sudah dipulihkan. Muat ulang halaman Laris di browser dan HP.")
        except Exception as e:
            messagebox.showerror("Laris", f"Gagal memulihkan: {e}")

    row2 = tk.Frame(card3, bg=SHEET)
    row2.pack(fill="x", pady=(6, 0))
    button(row2, "Pilih folder kedua…", choose_extra).pack(side="left")
    button(row2, "Pulihkan…", restore_from).pack(side="left", padx=6)
    refresh()

    def quit_():
        if messagebox.askyesno("Matikan Laris?", "HP kasir tidak bisa mencatat sampai Laris dinyalakan lagi. Matikan?"):
            srv_().backup_now()
            srv_().stop()
            root.destroy()

    def new_password():
        pw = simpledialog.askstring("Kata sandi baru", "Kata sandi baru untuk Laris (minimal 6 karakter):", show="*", parent=root)
        if pw is None:
            return
        if len(pw) < 6:
            messagebox.showwarning("Laris", "Kata sandi minimal 6 karakter.")
            return
        srv_().set_password(pw)
        messagebox.showinfo("Laris", "Kata sandi diganti. Semua HP perlu masuk lagi dengan kata sandi baru.")

    bottom = tk.Frame(outer, bg=PAPER)
    bottom.pack(fill="x", pady=(4, 0))
    button(bottom, "Matikan Laris", quit_).pack(side="left")
    button(bottom, "Lupa kata sandi?", new_password).pack(side="left", padx=6)
    root.protocol("WM_DELETE_WINDOW", quit_)
    if minimized:
        root.iconify()
    root.mainloop()


# ---------------------------------------------------------------- main

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="Laris")
    ap.add_argument("--minimized", action="store_true")
    ap.add_argument("--headless", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args(argv)

    data = home() / "data"
    data.mkdir(parents=True, exist_ok=True)
    if getattr(sys, "frozen", False) and sys.stdout is None:  # windowed build: keep a log instead of a console
        log = open(data / "laris.log", "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stderr = log
    cfg = Config(data / "laris-desktop.json")

    if a.selftest:
        return selftest()
    if not a.headless:
        for p in PORTS:  # already running: just show it
            if laris_running(p):
                open_app(p)
                return 0
    port = free_port()
    if port is None:
        print("Tidak ada port kosong untuk Laris (8000-8010).")
        return 1
    srv = Server(port, data, cfg)
    if not srv.start():
        print("Laris gagal menyala. Lihat laris.log.")
        return 1
    if not (a.no_browser or a.minimized or a.headless):
        open_app(port)
    if a.headless:
        print(f"Laris: http://localhost:{port}" + (f"  (HP: http://{lan_ip()}:{port})" if lan_ip() else ""), flush=True)
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            srv.stop()
            return 0
    window(srv, cfg, a.minimized)
    return 0


def selftest() -> int:
    """Start on a spare port with a throwaway data folder, check the API and a backup."""
    import tempfile
    tmp = Path(tempfile.mkdtemp(prefix="laris-selftest-"))
    os.environ["LARIS_HOME"] = str(tmp)
    os.environ["LARIS_DATABASE_URL"] = f"sqlite:///{(tmp / 'laris.db').as_posix()}"
    port = free_port()
    cfg = Config(tmp / "cfg.json")
    cfg.set("extra_backup", str(tmp / "extra"))
    srv = Server(port, tmp, cfg)
    srv.backup.configure([tmp / "backup", tmp / "extra"])
    ok = srv.start()
    checks = {"server": ok}
    try:
        base = f"http://127.0.0.1:{port}"
        with urllib.request.urlopen(f"{base}/api/health", timeout=10) as r:
            health = json.loads(r.read())
        checks["model"] = bool(health["model"]["available"])
        with urllib.request.urlopen(f"{base}/", timeout=10) as r:
            checks["web app"] = b'id="root"' in r.read()
        req = urllib.request.Request(f"{base}/api/setup", method="POST", headers={"Content-Type": "application/json"},
                                     data=json.dumps({"shop_name": "Uji", "password": "rahasia1", "start": "demo"}).encode())
        with urllib.request.urlopen(req, timeout=120) as r:
            checks["setup with demo"] = r.status == 200
        cookie = r.headers.get("set-cookie", "").split(";")[0]
        req = urllib.request.Request(f"{base}/api/forecast", headers={"Cookie": cookie})
        with urllib.request.urlopen(req, timeout=120) as r:
            checks["forecast by the model"] = json.loads(r.read())["method"] == "larisnet"
        made = srv.backup_now()
        checks["backup in two folders"] = len(made) == 2
        # restore: change the name, put the backup back, the old name returns
        req = urllib.request.Request(f"{base}/api/settings", method="PUT", data=json.dumps({"shop_name": "Diubah"}).encode(),
                                     headers={"Content-Type": "application/json", "Cookie": cookie})
        urllib.request.urlopen(req, timeout=30).close()
        srv = restore(srv, made[0])
        with urllib.request.urlopen(f"{base}/api/state", timeout=30) as r:
            checks["restore from a backup"] = json.loads(r.read())["shop_name"] == "Uji"
        checks["QR code"] = len(qr_png("http://192.168.1.2:8000")) > 100
        srv.set_password("barubaru")
        req = urllib.request.Request(f"{base}/api/login", method="POST", headers={"Content-Type": "application/json"},
                                     data=json.dumps({"password": "barubaru"}).encode())
        with urllib.request.urlopen(req, timeout=30) as r:
            checks["reset password at the laptop"] = r.status == 200
    except Exception as e:  # report, do not hide
        checks[f"error: {e!r}"] = False
    finally:
        srv.stop()
    for k, v in checks.items():
        print(f"{'ok  ' if v else 'FAIL'} {k}", flush=True)
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
