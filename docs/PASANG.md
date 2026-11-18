# Memasang Laris di laptop toko (Windows)

Untuk pemilik usaha yang ingin langsung pakai: tidak perlu Docker, tidak perlu internet, tidak perlu mengetik perintah.

## Yang dibutuhkan

- Laptop atau komputer Windows 10/11 yang menyala selama toko buka.
- WiFi di toko, kalau kasir mencatat dari HP. Internet tidak diperlukan, cukup WiFi yang sama.
- Flashdisk atau folder Google Drive untuk cadangan kedua (disarankan).

## Pasang

1. Buka halaman **Releases** di GitHub Laris, lalu unduh **Laris-Setup-x.y.z.exe**.
2. Klik dua kali file itu. Kalau Windows menampilkan "Windows protected your PC", pilih **More info**, lalu **Run anyway**. Peringatan ini muncul karena aplikasinya belum ditandatangani.
3. Centang dua pilihan berikut, lalu tekan **Install**:
   - **Buat ikon Laris di desktop**
   - **Nyalakan Laris otomatis setiap laptop dinyalakan**
4. Laris terbuka di browser. Isi data usaha dan buat kata sandi.

Pemasangan tidak meminta hak admin dan tidak mengubah pengaturan Windows.

## Menyambungkan HP kasir

Saat Laris menyala, muncul jendela kecil **"Laris menyala"**. Isinya:

- alamat untuk laptop ini,
- **kode QR untuk HP**: buka kamera HP, arahkan ke kode itu, lalu ketuk tautannya,
- kalau QR tidak bisa dipakai, ketik alamat yang tertulis di bawahnya, misalnya `http://192.168.1.5:8000`.

HP harus tersambung ke **WiFi yang sama** dengan laptop.

Pertama kali, Windows mungkin bertanya apakah Laris boleh memakai jaringan. Pilih **Izinkan (Allow)** untuk jaringan **Private**. Kalau terlanjur ditolak, buka *Windows Security → Firewall → Allow an app through firewall*, lalu centang Laris.

Biarkan jendela "Laris menyala" terbuka selama toko buka. Boleh diperkecil, tapi jangan ditutup. Menutupnya berarti mematikan Laris.

## Data dan cadangan

- Data toko tersimpan di laptop, di `%LOCALAPPDATA%\Laris\data`.
- Data tetap ada walaupun Laris diperbarui atau dihapus.
- **Cadangan otomatis** dibuat sekali sehari ke folder **Dokumen → Laris Cadangan**. Laris menyimpan 30 salinan terakhir.
- Di jendela Laris, tekan **Pilih folder kedua…** lalu pilih flashdisk atau folder Google Drive. Setiap cadangan ikut disalin ke sana. Kalau laptop rusak atau hilang, datanya masih ada.
- **Cadangkan sekarang** membuat salinan saat itu juga. Laris juga membuat salinan setiap kali dimatikan lewat tombol **Matikan Laris**.

## Pindah ke laptop baru, atau mengembalikan data

1. Pasang Laris di laptop baru.
2. Di jendela Laris, tekan **Pulihkan…**, lalu pilih file cadangan terbaru (`laris-tanggal.db`) dari flashdisk atau Google Drive.
3. Muat ulang halaman Laris di browser dan HP.

Data yang ada sebelum dipulihkan ikut disalin dulu ke folder cadangan, dengan nama yang berawalan `laris-sebelum-pulih`, jadi pemulihan bisa dibatalkan.

## Memperbarui Laris

Unduh dan jalankan Laris-Setup versi baru. Data dan cadangan tidak berubah.

## Seberapa banyak yang bisa ditampung

Laris sudah diuji di laptop biasa dengan sekitar **100.000 orderan dalam sebulan** (3.400 sehari), lewat skrip `backend/scripts/loadtest.py`. Hasilnya:

| | Hasil |
|---|---|
| Menyimpan satu orderan dari kasir | sekitar 6 ms |
| 4 HP kasir menyimpan bersamaan | rata-rata 21 ms per orderan, 127 orderan per detik, tidak ada yang gagal |
| Membuka Beranda (30 atau 90 hari) | sekitar 12 ms |
| Ukuran data sebulan | sekitar 20 MB, atau sekitar 230 MB setahun |

Artinya 1.000 orderan sehari, atau 100.000 sebulan, masih jauh di bawah batas. Angka di laptop toko bisa sedikit berbeda, tergantung kecepatan laptopnya.

## Kalau ada masalah

- **HP tidak bisa membuka alamatnya:** pastikan HP di WiFi yang sama, Laris diizinkan di firewall, dan jendela Laris masih terbuka.
- **Laris tidak mau menyala:** lihat file `laris.log` di `%LOCALAPPDATA%\Laris\data`.
- **Lupa kata sandi:** di jendela Laris di laptop, tekan **Lupa kata sandi?** lalu buat yang baru. Hanya orang yang memegang laptop toko yang bisa melakukannya. Semua HP perlu masuk lagi dengan kata sandi baru.
