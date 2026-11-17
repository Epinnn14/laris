# Menjalankan Laris

Ada tiga cara: di laptop atau PC toko, di HP lewat laptop tersebut, atau online di server gratis.

## A. Di laptop atau PC toko (paling mudah)

Yang dibutuhkan: [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
git clone https://github.com/Epinnn14/laris.git
cd laris
docker compose up -d
```

Buka **http://localhost:8000**. Data tersimpan di volume Docker `laris-data`, jadi tetap aman walau komputer dimatikan atau Laris diperbarui.

- **Memperbarui:** `git pull && docker compose up -d --build`
- **Mematikan:** `docker compose down` (data tidak hilang)
- **Dari HP di WiFi yang sama:** buka `http://<IP-laptop>:8000`. Cari IP-nya dengan `ipconfig` di Windows atau `ipconfig getifaddr en0` di macOS. Kalau tidak terbuka, izinkan Docker di Windows Firewall dan atur WiFi sebagai jaringan **Private**.

## B. Online gratis: Render + Neon

Render menjalankan aplikasinya, Neon menyimpan datanya dalam database Postgres.
Disk gratis Render terhapus setiap kali server dimulai ulang, jadi data **harus** disimpan di Neon.
Database Postgres gratis milik Render juga tidak cocok, karena kedaluwarsa setelah 30 hari.

1. **Neon:** daftar di neon.com, buat project (region **Singapore** paling dekat ke Indonesia), lalu salin *connection string*-nya. Bentuknya `postgresql://user:pass@ep-....neon.tech/neondb?sslmode=require`.
2. **Render:** daftar di render.com, lalu pilih **New → Blueprint** dan arahkan ke repo Laris Anda (fork dari repo ini). Render membaca file `render.yaml`.
3. Saat diminta `LARIS_DATABASE_URL`, tempel connection string dari Neon.
4. Tunggu build selesai, buka alamat `https://laris-xxxx.onrender.com`, lalu buat toko.

Catatan paket gratis (per November 2026, bisa berubah):

- Render free tidur setelah 15 menit tanpa pengunjung. Kunjungan pertama setelah itu butuh sekitar 1 menit.
- Neon free memberi 1 GB penyimpanan per project. Itu cukup untuk penjualan bertahun-tahun.

## C. Server sendiri (VPS)

```bash
docker build -t laris .
docker run -d --name laris -p 8000:8000 -v laris-data:/data -e LARIS_SECURE_COOKIE=1 laris
```

Pasang reverse proxy dengan HTTPS (Caddy atau Nginx) di depannya. Untuk Postgres, tambahkan `-e LARIS_DATABASE_URL=postgresql://...`.

## Pengaturan lewat environment

| Variabel | Default | Fungsi |
|---|---|---|
| `LARIS_DATABASE_URL` | `sqlite:///data/laris.db` (`/data/laris.db` di Docker) | SQLite atau `postgresql://...` |
| `LARIS_MODEL_DIR` | `models/larisnet` | folder `model.onnx` + `meta.json` |
| `LARIS_SECURE_COOKIE` | kosong | `1` kalau situs memakai HTTPS |
| `LARIS_DEMO_MODE` | kosong | `1` menjadi demo publik: tanpa kata sandi, berisi data contoh |
| `LARIS_SECRET` | dibuat otomatis | kunci tanda tangan sesi |
| `PORT` | `8000` | port server di Docker |
