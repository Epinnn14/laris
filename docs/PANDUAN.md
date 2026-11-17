# Panduan Laris untuk pemilik usaha

Laris membantu warung makan dan kafe menjawab tiga pertanyaan harian:

1. **Bagaimana jualan saya?** Lihat omzet, laba kotor, menu terlaris, dan hari ramai atau sepi.
2. **Besok dan minggu depan kira-kira laku berapa?** Lihat prediksi per menu dan total omzet.
3. **Saya harus belanja apa, berapa banyak?** Lihat daftar belanja dari prediksi, resep, dan stok.

Semua angka dihitung di komputer atau server Anda sendiri. Tidak ada data yang dikirim ke pihak lain.

## 1. Mulai

1. Buka Laris dan isi **nama usaha**, **jenis usaha** (warung makan atau kafe), dan **kata sandi**.
2. Kalau ingin mencoba dulu, centang **"Isi dengan data contoh setahun"**. Data contoh bisa diganti kapan saja di Pengaturan.
3. Kalau langsung memakai data sendiri, buka **Menu & resep** → **Tambah dari contoh menu**. Pilih menu yang mirip, lalu sesuaikan harga dan resepnya.

## 2. Menu, resep, dan bahan

- **Resep per porsi** artinya berapa gram, ml, atau buah bahan untuk satu porsi. Contoh: Nasi Goreng = beras 150 g, ayam 50 g, telur 1 buah.
- Dari resep, Laris menghitung **modal bahan per porsi** dan **margin**. Menu dengan margin di bawah 40% ditandai kuning.
- Setiap bahan punya isian berikut:
  - **Isi dan harga satu kemasan**, misalnya karung 5 kg seharga Rp70.000.
  - **Tahan berapa hari**. Ayam segar 2 hari, beras 180 hari.
  - **Datang setelah berapa hari**. Isi 0 kalau bisa dibeli langsung; isi 3 kalau biji kopi dipesan online.

## 3. Catat penjualan setiap hari

Buka **Catat**, isi jumlah porsi tiap menu dengan tombol − dan +, lalu tekan **Simpan**.

- **Stok bahan berkurang otomatis** sesuai resep. Kalau angka penjualan diubah, stok ikut dihitung ulang.
- Centang **"Habis duluan"** kalau menu itu habis sebelum toko tutup. Dengan begitu Laris tahu permintaan sebenarnya lebih tinggi.
- Centang **"Promo"** kalau menu sedang dipromosikan.
- Centang **"Tutup hari ini"** kalau tidak buka. Hari tutup tidak dianggap hari sepi.
- Hari yang terlewat muncul sebagai pengingat **"Belum dicatat"** di Beranda dan di halaman Catat.

## 4. Stok bahan

- **Beli**: catat saat belanja. Tombol cepat "1 × karung 5 kg" mengisi jumlah dan perkiraan harga.
- **Hitung stok**: isi jumlah yang benar-benar ada di dapur. Laris menyesuaikan catatannya. Sebaiknya lakukan seminggu sekali.
- **Buang**: catat bahan yang basi atau rusak. Totalnya muncul di Beranda sebagai "bahan terbuang".
- Warna stok: **merah** artinya akan habis sebelum barang baru datang, **kuning** artinya menipis, **hijau** artinya aman.

## 5. Prediksi

Prediksi muncul setelah sekitar **7 hari** penjualan tercatat, dan makin akurat setelah 8 minggu.
Model LarisNet membaca pola berikut:

- hari dalam seminggu (warung dekat kantor sepi hari Minggu, kafe ramai akhir pekan),
- tanggal gajian dan tanggal tua,
- **Ramadan, Lebaran, dan minggu-minggu setelahnya** (tanggal bergeser setiap tahun, dan Laris menghitungnya sendiri),
- libur nasional dan libur panjang,
- menu baru yang sedang naik daun,
- promo dan hari tutup yang Anda rencanakan.

**Cara membaca grafik:** garis menunjukkan perkiraan tengah. Area berwarna adalah kisaran yang hampir pasti, sebab 8 dari 10 hari jatuh di sini. Kotak biru di atas grafik menunjukkan seberapa meleset prediksi 4 minggu lalu dibanding yang terjadi.

**Rencana tutup dan promo** (bagian bawah halaman Prediksi): isi tanggal mudik, libur, atau promo. Prediksi dan daftar belanja langsung menyesuaikan.

## 6. Daftar belanja

Laris menghitung berapa bahan yang terpakai sampai barang berikutnya datang, dibandingkan dengan stok yang ada.

- **Belanja setiap**: pilih seberapa sering Anda belanja, misalnya setiap hari ke pasar atau seminggu sekali ke grosir.
- **Seberapa aman**:
  - **Hemat** artinya modal lebih sedikit, tapi kadang bahan habis.
  - **Aman** artinya jarang kehabisan, tapi lebih banyak uang tertahan di stok.
- Bahan yang **cepat basi** tidak disarankan lebih banyak dari yang akan terpakai sebelum rusak.
- **Salin untuk WhatsApp**: daftar siap dikirim ke pemasok atau ke orang yang belanja.
- Tekan **Sudah dibeli** setelah belanja, supaya stok bertambah.

## 7. Memakai dari HP

Kalau Laris jalan di laptop toko, HP yang tersambung ke WiFi yang sama bisa membuka `http://<alamat-IP-laptop>:8000`.
Kalau Laris dipasang online (lihat [DEPLOY.md](DEPLOY.md)), cukup buka alamatnya dari mana saja dan masuk dengan kata sandi.

## 8. Data Anda

- **Pengaturan → Unduh semua penjualan (CSV)** bisa dibuka di Excel atau Google Sheets.
- Di laptop, data tersimpan di volume Docker `laris-data`. Online, data tersimpan di database Postgres milik Anda.
